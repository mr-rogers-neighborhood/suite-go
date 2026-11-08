#!/usr/bin/env node
/**
 * Ask the running app a question.
 *
 * `pnpm android:eval "document.body.innerText"` evaluates an expression inside the
 * WebView and prints the result. It exists because the alternative ways to check a
 * device are bad: screenshot diffing guesses, and WebView content is not exposed to
 * `uiautomator`, so a text assertion has nowhere else to go.
 *
 * A release build has no DevTools socket. A debug build does, which is what this
 * connects to.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import config from "../apps/go/app.config.json" with { type: "json" };
import { resolveSdkRoot } from "./preflight.mjs";

const { appId } = config;

function adb() {
  const sdkRoot = resolveSdkRoot();
  if (!sdkRoot) return null;
  const binary = join(sdkRoot, "platform-tools", "adb");
  return existsSync(binary) ? binary : null;
}

function run(binary, args) {
  return new Promise((resolve, reject) => {
    let output = "";
    const child = spawn(binary, args);
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += String(chunk);
    });
    child.on("error", reject);
    child.on("close", () => resolve(output));
  });
}

const binary = adb();
if (!binary) {
  console.error("No adb found. Run `pnpm doctor`.");
  process.exit(1);
}

// Pull `--device <serial>` out first: leaving the serial in the expression turns
// every evaluation into a syntax error that reports as `undefined`.
const args = process.argv.slice(2);
const deviceFlag = args.indexOf("--device");
const device = deviceFlag === -1 ? null : args[deviceFlag + 1];
const expression = (
  deviceFlag === -1
    ? args
    : args.filter((_arg, index) => index !== deviceFlag && index !== deviceFlag + 1)
).join(" ");

if (!expression) {
  console.error('Usage: pnpm android:eval "document.body.innerText" [--device <serial>]');
  process.exit(1);
}

const scope = device ? ["-s", device] : [];
const pid = (await run(binary, [...scope, "shell", "pidof", appId])).trim();
if (!pid) {
  console.error(`${appId} is not running. Start it with \`pnpm android:install\`.`);
  process.exit(1);
}

const sockets = await run(binary, [...scope, "shell", "cat", "/proc/net/unix"]);
const socket = /webview_devtools_remote_\d+/u.exec(sockets)?.[0];
if (!socket) {
  console.error("No DevTools socket. The WebView only exposes one in a debug build.");
  process.exit(1);
}

// A fixed port collides with a forward left over from an earlier app process, and
// that stale forward points at a socket nobody is listening on. Clear it, then bind.
const port = 9300 + Math.floor(Math.random() * 400);
await run(binary, [...scope, "forward", `tcp:${port}`, `localabstract:${socket}`]);

const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = pages.find((candidate) => candidate.type === "page");
if (!page) {
  console.error("No page in the WebView.");
  process.exit(1);
}

const socketConnection = new WebSocket(page.webSocketDebuggerUrl);

const evaluate = (source) =>
  new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e6);
    const onMessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      socketConnection.removeEventListener("message", onMessage);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result?.result?.value);
    };
    socketConnection.addEventListener("message", onMessage);
    socketConnection.send(
      JSON.stringify({
        id,
        method: "Runtime.evaluate",
        params: { expression: source, returnByValue: true, awaitPromise: true },
      }),
    );
  });

await new Promise((resolve) => socketConnection.addEventListener("open", resolve));

try {
  const value = await evaluate(expression);
  console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));
} finally {
  socketConnection.close();
  await run(binary, [...scope, "forward", "--remove", `tcp:${port}`]);
}
