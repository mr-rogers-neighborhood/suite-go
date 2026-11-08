#!/usr/bin/env node
/**
 * Build an APK, put it on a phone, and start it — then keep doing that on save.
 *
 * The loop this exists for: edit a file, look at the phone. `watch` rebuilds the
 * web bundle, syncs it into the Android project, runs an incremental Gradle build
 * and reinstalls over USB. It is deliberately a real APK rather than a live-reload
 * WebView, because the thing being developed is a container whose behaviour
 * depends on the actual binary — an intent filter, a WebView version, a cold start.
 *
 * Commands:
 *   devices                  list what adb can see
 *   install                  build, install, launch once
 *   watch                    install, then reinstall on every save
 *   emulator [--start NAME]  list AVDs, or boot one and wait for it
 *
 * Flags:
 *   --device <serial>        pick a target when more than one is attached
 *   --skip-build             install the APK already on disk
 */
import { spawn } from "node:child_process";
import { existsSync, watch } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import config from "../apps/go/app.config.json" with { type: "json" };
import { resolveJdk, resolveSdkRoot } from "./preflight.mjs";

const { appId } = config;

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const APP_DIR = join(ROOT, "apps", "go");
const ANDROID_DIR = join(APP_DIR, "android");
const APK = join(ANDROID_DIR, "app", "build", "outputs", "apk", "debug", "app-debug.apk");
/** Where a change means the bundle is stale. Everything else in `apps/go` is config or native. */
const WATCHED = [
  join(APP_DIR, "src"),
  join(APP_DIR, "index.html"),
  join(APP_DIR, "vite.config.ts"),
  join(ROOT, "packages", "go", "src"),
];

const DIM = "\u001b[2m";
const BOLD = "\u001b[1m";
const GREEN = "\u001b[32m";
const YELLOW = "\u001b[33m";
const RED = "\u001b[31m";
const RESET = "\u001b[0m";

function environment() {
  const sdkRoot = resolveSdkRoot();
  const jdk = resolveJdk();
  const env = { ...process.env };
  if (sdkRoot) {
    env.ANDROID_HOME = sdkRoot;
    env.ANDROID_SDK_ROOT = sdkRoot;
    env.PATH = `${join(sdkRoot, "platform-tools")}:${env.PATH ?? ""}`;
  }
  // Gradle reads JAVA_HOME, not `java` on PATH. A JDK newer than Gradle supports
  // fails with a message about the toolchain that never mentions the JDK.
  if (jdk) env.JAVA_HOME = jdk;
  return env;
}

function fail(message, remedy) {
  console.error(`${RED}${message}${RESET}`);
  if (remedy) console.error(`${DIM}${remedy}${RESET}`);
  process.exitCode = 1;
}

function command(name, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(name, args, {
      stdio: "inherit",
      env: environment(),
      cwd: options.cwd ?? ROOT,
      shell: false,
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${name} ${args.join(" ")} exited with ${code}`));
    });
  });
}

/**
 * A command whose output is both shown and kept.
 *
 * Gradle reports a missing SDK component in a stack trace whose useful sentence is
 * twenty lines in, and the failure a person actually hits is not obvious from it:
 * an SDK installed by pacman is root-owned, so Gradle cannot fetch what AGP asks
 * for. This keeps the output, and `explainBuildFailure` names the missing piece.
 */
async function commandTee(name, args, options = {}) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const child = spawn(name, args, {
      stdio: ["inherit", "pipe", "pipe"],
      env: environment(),
      cwd: options.cwd ?? ROOT,
      shell: false,
    });

    const forward = (target) => (chunk) => {
      buffer += String(chunk);
      target.write(chunk);
    };
    child.stdout.on("data", forward(process.stdout));
    child.stderr.on("data", forward(process.stderr));

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(Object.assign(new Error(`${name} exited with ${code}`), { output: buffer }));
    });
  });
}

/** Turn the two known SDK failures into the command that fixes them. */
function explainBuildFailure(error) {
  const output = typeof error?.output === "string" ? error.output : "";
  const missing = /Failed to install the following SDK components:\s*\n\s*(\S+)/u.exec(output);
  const notWritable = output.includes("SDK directory is not writable");
  const sdkRoot = resolveSdkRoot() ?? "<sdk>";

  if (missing?.[1]) {
    const component = missing[1];
    const remedy = notWritable
      ? `The SDK is root-owned, so Gradle cannot fetch it. Install it once:\n     sudo JAVA_HOME=/usr/lib/jvm/java-21-openjdk ${join(sdkRoot, "cmdline-tools", "latest", "bin", "sdkmanager")} --sdk_root=${sdkRoot} "${component}"`
      : `sdkmanager --sdk_root=${sdkRoot} "${component}"`;
    return { message: `Gradle needs SDK component ${component}, which is not installed.`, remedy };
  }
  if (notWritable) {
    return {
      message: "Gradle tried to write to a read-only SDK.",
      remedy: `Install the component by hand with sudo, or point ANDROID_HOME at a directory you own.`,
    };
  }
  return { message: error instanceof Error ? error.message : String(error) };
}

async function capture(name, args) {
  return new Promise((resolve, reject) => {
    let output = "";
    const child = spawn(name, args, { env: environment(), cwd: ROOT });
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += String(chunk);
    });
    child.on("error", reject);
    // `close`, not `exit`: for a fast-exiting process, buffered stdout can arrive
    // after `exit` fires, which reads as "no devices attached" when a device is
    // attached and adb simply answered quickly.
    child.on("close", () => resolve(output));
  });
}

function adbPath() {
  const sdkRoot = resolveSdkRoot();
  if (!sdkRoot) return null;
  const adb = join(sdkRoot, "platform-tools", "adb");
  return existsSync(adb) ? adb : null;
}

async function listDevices() {
  const adb = adbPath();
  if (!adb) return [];
  const output = await capture(adb, ["devices", "-l"]);
  return output
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial, state] = line.split(/\s+/u);
      const model = /model:(\S+)/u.exec(line)?.[1] ?? "";
      return { serial, state, model, line };
    });
}

/**
 * Which device to install on.
 *
 * A physical phone wins over an emulator when both are attached, because the point
 * of the loop is the real thing. An explicit `--device` always wins, and more than
 * one phone is an error rather than a guess.
 */
async function pickDevice(requested) {
  const devices = await listDevices();
  const ready = devices.filter((device) => device.state === "device");

  if (requested) {
    const match = ready.find((device) => device.serial === requested);
    if (match) return match;
    fail(
      `No authorised device with serial ${requested}.`,
      `Attached: ${ready.map((device) => device.serial).join(", ") || "none"}`,
    );
    return null;
  }

  if (ready.length === 0) {
    const unauthorised = devices.filter((device) => device.state === "unauthorized");
    fail(
      "No authorised device attached.",
      unauthorised.length > 0
        ? "The phone is attached but not authorised: unlock it and accept the USB debugging prompt."
        : "Plug in the phone with USB debugging on, or run `pnpm android:emulator --start <name>`.",
    );
    return null;
  }

  const physical = ready.filter((device) => !device.serial.startsWith("emulator-"));
  const candidates = physical.length > 0 ? physical : ready;
  const [only, ...rest] = candidates;
  if (only && rest.length > 0) {
    fail(
      "More than one device attached.",
      `Pick one with --device <serial>: ${candidates.map((device) => device.serial).join(", ")}`,
    );
    return null;
  }
  return only ?? null;
}

async function buildAndInstall(device, skipBuild = false) {
  if (!existsSync(ANDROID_DIR)) {
    fail(
      "apps/go/android does not exist yet.",
      "Generate it once with `pnpm --filter @suite/go-app exec cap add android`.",
    );
    return false;
  }

  const started = Date.now();
  const adb = adbPath();
  if (!adb) {
    fail(
      "adb is missing from the SDK.",
      "pacman -S android-sdk-platform-tools, or set ANDROID_HOME.",
    );
    return false;
  }

  if (!skipBuild) {
    await command("pnpm", ["--filter", "@suite/go-app", "build"]);
    await command("pnpm", ["exec", "cap", "sync", "android"], { cwd: APP_DIR });
    await commandTee("./gradlew", ["assembleDebug", "-q"], { cwd: ANDROID_DIR });
  }

  if (!existsSync(APK)) {
    fail(`No APK at ${APK}.`, "Drop --skip-build, or build one first.");
    return false;
  }

  await command(adb, ["-s", device.serial, "install", "-r", "-t", APK]);
  // `am start` over `monkey`: it names the activity, so a failure says why.
  await command(adb, ["-s", device.serial, "shell", "am", "start", "-n", `${appId}/.MainActivity`]);

  console.log(
    `${GREEN}installed${RESET} ${DIM}${((Date.now() - started) / 1000).toFixed(1)}s -> ${device.serial}${RESET}`,
  );
  return true;
}

async function install(options) {
  const device = await pickDevice(options.device);
  if (!device) return;
  console.log(`${DIM}target ${device.serial} ${device.model}${RESET}`);
  try {
    await buildAndInstall(device, options.skipBuild);
  } catch (error) {
    const explained = explainBuildFailure(error);
    fail(explained.message, explained.remedy);
  }
}

/**
 * Reinstall on save.
 *
 * Serialised on purpose: a save during a build marks the tree dirty and rebuilds
 * once the current run finishes, rather than starting a second Gradle build that
 * would fight the first over the same output directory.
 */
async function watchLoop(options) {
  const device = await pickDevice(options.device);
  if (!device) return;
  console.log(`${DIM}target ${device.serial} ${device.model}${RESET}`);

  let building = false;
  let dirty = false;

  const rebuild = async () => {
    if (building) {
      dirty = true;
      return;
    }
    building = true;
    try {
      await buildAndInstall(device);
    } catch (error) {
      const explained = explainBuildFailure(error);
      fail(explained.message, explained.remedy);
      // Reset the exit code: the watch loop is still alive and a failed build is an
      // expected event, not a reason for the process to report failure when stopped.
      process.exitCode = 0;
    } finally {
      building = false;
      if (dirty) {
        dirty = false;
        await rebuild();
      }
    }
  };

  console.log(`${BOLD}watching${RESET} ${DIM}${WATCHED.join("\n         ")}${RESET}`);
  console.log(`${DIM}ctrl-c to stop${RESET}\n`);

  await rebuild();

  let timer = null;
  for (const path of WATCHED) {
    if (!existsSync(path)) continue;
    watch(path, { recursive: true }, (_event, filename) => {
      // Gradle's own output lands under android/, which is not watched, so anything
      // arriving here that is not source is noise from an editor's atomic rename.
      if (filename && !/\.(ts|tsx|css|html|json)$/u.test(String(filename))) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        console.log(`${DIM}change${filename ? `: ${filename}` : ""}${RESET}`);
        void rebuild();
      }, 350);
    });
  }

  await new Promise(() => {});
}

async function listEmulators() {
  const sdkRoot = resolveSdkRoot();
  const emulator = sdkRoot ? join(sdkRoot, "emulator", "emulator") : null;
  if (!emulator || !existsSync(emulator)) {
    fail("No emulator binary in the SDK.", "pacman -S android-emulator");
    return [];
  }
  const output = await capture(emulator, ["-list-avds"]);
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

async function emulatorCommand(options) {
  const avds = await listEmulators();
  if (avds.length === 0) {
    fail(
      "No AVDs exist, so there is nothing to boot.",
      'sdkmanager --sdk_root=<sdk> "system-images;android-36;aosp_atd;x86_64" then avdmanager create avd -n suite-go-atd -k ...',
    );
    return;
  }

  if (!options.start) {
    console.log(`${BOLD}avds${RESET}`);
    for (const avd of avds) console.log(`  ${avd}`);
    console.log(`${DIM}start one with --start <name>${RESET}`);
    return;
  }

  if (!avds.includes(options.start)) {
    fail(`No AVD named ${options.start}.`, `Available: ${avds.join(", ")}`);
    return;
  }

  const sdkRoot = resolveSdkRoot();
  const emulator = join(sdkRoot, "emulator", "emulator");
  console.log(`${DIM}booting ${options.start}${RESET}`);

  // Detached on purpose: the emulator outlives this command, and the caller wants
  // the terminal back so it can run `install` against the booted device.
  const child = spawn(emulator, ["-avd", options.start, "-no-snapshot-load"], {
    env: environment(),
    stdio: "ignore",
    detached: true,
  });
  child.unref();

  const adb = adbPath();
  const serial = `emulator-${options.start}`;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const booted = (
      await capture(adb, ["-s", serial, "shell", "getprop", "sys.boot_completed"])
    ).trim();
    if (booted === "1") {
      console.log(`${GREEN}booted${RESET} ${serial}`);
      console.log(`${DIM}pnpm android:install --device ${serial}${RESET}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  fail(`${options.start} did not finish booting within four minutes.`);
}

async function devicesCommand() {
  const devices = await listDevices();
  if (devices.length === 0) {
    console.log(
      `${YELLOW}no devices${RESET} ${DIM}plug in the phone, or start an emulator${RESET}`,
    );
    return;
  }
  for (const device of devices) {
    const mark = device.state === "device" ? `${GREEN}✓${RESET}` : `${YELLOW}!${RESET}`;
    console.log(`${mark} ${device.serial}  ${device.state}  ${device.model}`);
  }
}

function parseArgs(argv) {
  const options = { device: undefined, skipBuild: false, start: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--device") options.device = argv[index + 1];
    else if (arg === "--skip-build") options.skipBuild = true;
    else if (arg === "--start") options.start = argv[index + 1];
  }
  return options;
}

const [subcommand = "devices", ...rest] = process.argv.slice(2);
const options = parseArgs(rest);

switch (subcommand) {
  case "devices":
    await devicesCommand();
    break;
  case "install":
    await install(options);
    break;
  case "watch":
    await watchLoop(options);
    break;
  case "emulator":
    await emulatorCommand(options);
    break;
  default:
    fail(`Unknown command ${subcommand}.`, "devices | install | watch | emulator");
}
