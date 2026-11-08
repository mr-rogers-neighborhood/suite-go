#!/usr/bin/env node
/**
 * What is present, what is missing, and the exact command that fixes it.
 *
 * Written because the failure mode without it is bad: `gradlew assembleDebug`
 * reports a missing platform in a stack trace forty lines long, and a phone that
 * is plugged in but unauthorised looks identical to one that is not plugged in.
 *
 * No dependencies. Run with `pnpm doctor`.
 */
import { execFile } from "node:child_process";
import { accessSync, constants, existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

const GREEN = "\u001b[32m";
const RED = "\u001b[31m";
const YELLOW = "\u001b[33m";
const DIM = "\u001b[2m";
const BOLD = "\u001b[1m";
const RESET = "\u001b[0m";

/** The SDK directory Gradle and adb will be pointed at. */
export function resolveSdkRoot() {
  const fromEnv = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  for (const candidate of [
    "/opt/android-sdk",
    join(homedir(), "Android", "Sdk"),
    join(homedir(), "android-sdk"),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * The JDK Gradle should use.
 *
 * A newer JDK than Gradle supports fails with a version message that never
 * mentions the JDK, so this prefers a version the Android toolchain has actually
 * been tested against and leaves the shell's `java` alone.
 */
export function resolveJdk() {
  const candidates = [
    process.env.SUITE_GO_JAVA_HOME,
    "/usr/lib/jvm/java-21-openjdk",
    "/usr/lib/jvm/java-17-openjdk",
  ];
  for (const candidate of candidates) {
    if (candidate && isJdk(candidate)) return candidate;
  }
  if (process.env.JAVA_HOME && isJdk(process.env.JAVA_HOME)) return process.env.JAVA_HOME;
  return null;
}

function isJdk(dir) {
  return existsSync(join(dir, "bin", "javac"));
}

function listDirs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => {
    try {
      return statSync(join(dir, name)).isDirectory();
    } catch {
      return false;
    }
  });
}

async function javaMajorOf(javaHome) {
  try {
    const { stderr, stdout } = await run(join(javaHome, "bin", "java"), ["-version"]);
    const text = `${stderr}${stdout}`;
    const match = /version "(\d+)/u.exec(text);
    return match?.[1] ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

async function adbDevices(adb) {
  if (!adb) return [];
  try {
    const { stdout } = await run(adb, ["devices", "-l"]);
    return stdout
      .split("\n")
      .slice(1)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [serial, state] = line.split(/\s+/u);
        return { serial, state, line };
      });
  } catch {
    return [];
  }
}

const findings = [];

function pass(label, detail) {
  findings.push({ level: "pass", label, detail });
}

function warn(label, detail, remedy) {
  findings.push({ level: "warn", label, detail, remedy });
}

function fail(label, detail, remedy) {
  findings.push({ level: "fail", label, detail, remedy });
}

async function main() {
  console.log(`${BOLD}Suite Go — Android preflight${RESET}\n`);

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor >= 22) pass("node", `v${process.versions.node}`);
  else fail("node", `v${process.versions.node}`, "The repository needs Node 22 or newer.");

  const sdkRoot = resolveSdkRoot();
  if (sdkRoot) pass("android sdk", sdkRoot);
  else fail("android sdk", "not found", "Install with pacman -S android-sdk, or set ANDROID_HOME.");

  const adb = sdkRoot ? join(sdkRoot, "platform-tools", "adb") : null;
  if (adb && existsSync(adb)) pass("adb", adb);
  else fail("adb", "missing", "pacman -S android-sdk-platform-tools");

  const sdkmanager = sdkRoot ? join(sdkRoot, "cmdline-tools", "latest", "bin", "sdkmanager") : null;
  if (sdkmanager && existsSync(sdkmanager)) pass("sdkmanager", sdkmanager);
  else
    warn(
      "sdkmanager",
      "modern cmdline-tools not installed",
      "The copy bundled with the android-sdk package predates the JAXB removal and cannot run. Fetch commandlinetools-linux-*_latest.zip from dl.google.com into <sdk>/cmdline-tools/latest.",
    );

  const platforms = sdkRoot ? listDirs(join(sdkRoot, "platforms")) : [];
  if (platforms.length > 0) pass("platforms", platforms.join(", "));
  else
    fail(
      "platforms",
      "none installed — Gradle has nothing to compile against",
      'sdkmanager --sdk_root=<sdk> "platforms;android-36"',
    );

  const buildTools = sdkRoot ? listDirs(join(sdkRoot, "build-tools")) : [];
  if (buildTools.length > 0) pass("build-tools", buildTools.join(", "));
  else warn("build-tools", "none installed", 'sdkmanager --sdk_root=<sdk> "build-tools;36.0.0"');

  const jdk = resolveJdk();
  const jdkMajor = jdk ? await javaMajorOf(jdk) : null;
  if (jdk) pass("jdk (gradle)", `${jdk} — Java ${jdkMajor ?? "?"}`);
  else
    fail(
      "jdk (gradle)",
      "no JDK 17 or 21 found",
      "pacman -S jdk21-openjdk. A newer JDK than Gradle supports fails with a message that never names the JDK.",
    );

  const systemImages = sdkRoot ? listDirs(join(sdkRoot, "system-images")) : [];
  const avdsDir = join(homedir(), ".android", "avd");
  const avds = existsSync(avdsDir)
    ? readdirSync(avdsDir)
        .filter((name) => name.endsWith(".ini"))
        .map((name) => name.replace(/\.ini$/u, ""))
    : [];

  if (systemImages.length > 0) pass("system images", systemImages.join(", "));
  else
    warn(
      "system images",
      "none — the emulator cannot boot an AVD",
      'sdkmanager --sdk_root=<sdk> "system-images;android-36;aosp_atd;x86_64"',
    );

  if (avds.length > 0) pass("avds", avds.join(", "));
  else
    warn(
      "avds",
      "none created",
      'avdmanager create avd -n suite-go-atd -k "system-images;android-36;aosp_atd;x86_64" -d pixel_7',
    );

  let kvm = false;
  try {
    accessSync("/dev/kvm", constants.R_OK | constants.W_OK);
    kvm = true;
  } catch {
    kvm = false;
  }
  if (kvm) pass("kvm", "/dev/kvm is readable and writable — emulator will run at native speed");
  else
    warn(
      "kvm",
      "/dev/kvm not accessible",
      "Enable virtualization in firmware and load kvm_intel or kvm_amd.",
    );

  const devices = await adbDevices(adb);
  const ready = devices.filter((device) => device.state === "device");
  const unauthorized = devices.filter((device) => device.state === "unauthorized");

  if (ready.length > 0) {
    for (const device of ready) pass("device", device.line.replace(/\s+usb:.*$/u, ""));
  } else if (unauthorized.length > 0) {
    warn(
      "device",
      "attached but not authorised",
      'Unlock the phone and accept the "Allow USB debugging" prompt. On GrapheneOS: Settings -> System -> Developer options -> USB debugging.',
    );
  } else {
    warn(
      "device",
      "no device attached",
      "Plug in the phone with USB debugging on, or start an emulator.",
    );
  }

  const pad = Math.max(...findings.map((finding) => finding.label.length));
  let blockers = 0;

  for (const finding of findings) {
    const mark =
      finding.level === "pass"
        ? `${GREEN}✓${RESET}`
        : finding.level === "warn"
          ? `${YELLOW}!${RESET}`
          : `${RED}✗${RESET}`;
    console.log(`${mark} ${finding.label.padEnd(pad)}  ${finding.detail}`);
    if (finding.remedy) console.log(`${DIM}    ${finding.remedy}${RESET}`);
    if (finding.level === "fail") blockers += 1;
  }

  console.log();
  if (blockers > 0) {
    console.log(`${RED}${blockers} blocker(s).${RESET} Fix those before \`pnpm android:install\`.`);
    process.exitCode = 1;
    return;
  }

  const warnings = findings.filter((finding) => finding.level === "warn").length;
  console.log(
    warnings > 0
      ? `${YELLOW}${warnings} warning(s), nothing blocking.${RESET} A physical install works now; the emulator needs an AVD.`
      : `${GREEN}Everything present.${RESET} \`pnpm android:install\` installs and launches on the attached device.`,
  );
}

// Only report when run directly: `android.mjs` imports the two resolvers above and
// must not trigger a full report, or set an exit code, as a side effect of that.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) await main();
