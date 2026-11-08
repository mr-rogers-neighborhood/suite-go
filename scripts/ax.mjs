#!/usr/bin/env node
/**
 * Assert the accessibility tree the WebView actually hands to Android.
 *
 * Why this exists, and why it is not `uiautomator`: `uiautomator dump` flattens a
 * WebView into `AccessibilityNodeInfo`, and that flattening loses things we care
 * about — a named `<input>` arrived as an `EditText` with an empty name and the label
 * only in `hint`, which reads as a defect that is not there. Chromium's own tree,
 * reached over DevTools, is the thing Android consumes; this asks Chromium.
 *
 * Two consequences worth knowing:
 *
 * 1. The tree only exists when a real accessibility service is bound. Chromium builds
 *    it lazily for the service that asks. With nothing bound, every WebView reports
 *    `NAF="true"` and no children, which is not a bug in the page.
 * 2. So this script reports whether a service is bound and says so, rather than
 *    quietly passing an empty tree.
 *
 * Usage:
 *   pnpm android:ax                 # print roles and names
 *   pnpm android:ax --assert        # fail on an interactive node with no name
 *   pnpm android:ax --assert --device <serial>
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import config from "../apps/go/app.config.json" with { type: "json" };
import { resolveSdkRoot } from "./preflight.mjs";

const { appId } = config;

/** Roles a person can operate. Each must have a name, or a screen reader says "button". */
const INTERACTIVE = new Set([
  "button",
  "link",
  "textbox",
  "searchbox",
  "checkbox",
  "radio",
  "switch",
  "combobox",
  "slider",
  "menuitem",
  "tab",
]);

const args = process.argv.slice(2);
const assertMode = args.includes("--assert");
const deviceFlag = args.indexOf("--device");
const device = deviceFlag === -1 ? null : args[deviceFlag + 1];
const scope = device ? ["-s", device] : [];

function adbPath() {
  const sdkRoot = resolveSdkRoot();
  if (!sdkRoot) return null;
  const binary = join(sdkRoot, "platform-tools", "adb");
  return existsSync(binary) ? binary : null;
}

function run(binary, argv) {
  return new Promise((resolve, reject) => {
    let output = "";
    const child = spawn(binary, argv);
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

const adb = adbPath();
if (!adb) {
  console.error("No adb found. Run `pnpm doctor`.");
  process.exit(1);
}

const pid = (await run(adb, [...scope, "shell", "pidof", appId])).trim();
if (!pid) {
  console.error(`${appId} is not running. Start it with \`pnpm android:install\`.`);
  process.exit(1);
}

const enabled = await run(adb, [
  ...scope,
  "shell",
  "settings",
  "get",
  "secure",
  "enabled_accessibility_services",
]);
if (!enabled.trim() || enabled.trim() === "null") {
  console.error(
    "No accessibility service is enabled, so Chromium has not built a tree.\n" +
      "That is not a failure of the page — it is how WebView works. Enable one, e.g.:\n\n" +
      "  adb shell settings put secure enabled_accessibility_services \\\n" +
      "    com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService\n" +
      "  adb shell settings put secure accessibility_enabled 1",
  );
  process.exit(2);
}

const sockets = await run(adb, [...scope, "shell", "cat", "/proc/net/unix"]);
const socket = /webview_devtools_remote_\d+/u.exec(sockets)?.[0];
if (!socket) {
  console.error("No DevTools socket. A debug build exposes one; a release build does not.");
  process.exit(1);
}

const port = 9500 + Math.floor(Math.random() * 400);
await run(adb, [...scope, "forward", `tcp:${port}`, `localabstract:${socket}`]);

const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = pages.find((candidate) => candidate.type === "page");
if (!page) {
  console.error("No page in the WebView.");
  process.exit(1);
}

const connection = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve) => connection.addEventListener("open", resolve));

let nextId = 0;
const call = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    const onMessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      connection.removeEventListener("message", onMessage);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    };
    connection.addEventListener("message", onMessage);
    connection.send(JSON.stringify({ id, method, params }));
  });

try {
  await call("Accessibility.enable");
  const { nodes } = await call("Accessibility.getFullAXTree");

  const rows = nodes
    .map((node) => ({
      role: node.role?.value ?? "",
      name: node.name?.value ?? "",
      ignored: node.ignored === true,
    }))
    .filter((row) => !row.ignored && row.role !== "generic" && row.role !== "none")
    .filter((row) => row.role !== "");

  const headings = rows.filter((row) => row.role === "heading");
  const interactive = rows.filter((row) => INTERACTIVE.has(row.role));

  if (!assertMode) {
    for (const row of rows) console.log(`${row.role.padEnd(12)} ${JSON.stringify(row.name)}`);
    console.log(
      `\n${rows.length} nodes, ${headings.length} headings, ${interactive.length} interactive`,
    );
  }

  const unnamed = interactive.filter((row) => row.name.trim().length === 0);
  const emptyHeadings = headings.filter((row) => row.name.trim().length === 0);

  if (assertMode) {
    if (unnamed.length > 0) {
      for (const row of unnamed) console.error(`unnamed ${row.role}`);
    }
    if (emptyHeadings.length > 0) console.error(`${emptyHeadings.length} heading(s) with no text`);
    if (interactive.length === 0)
      console.error("no interactive nodes at all — is the screen empty?");
  }

  const failed = unnamed.length > 0 || emptyHeadings.length > 0 || interactive.length === 0;
  console.log(
    failed && assertMode
      ? `FAIL: ${unnamed.length} unnamed interactive, ${emptyHeadings.length} empty headings, ${interactive.length} interactive`
      : `ok: ${interactive.length} interactive, ${headings.length} headings, all named`,
  );
  if (failed && assertMode) process.exitCode = 1;
} finally {
  connection.close();
  await run(adb, [...scope, "forward", "--remove", `tcp:${port}`]);
}
