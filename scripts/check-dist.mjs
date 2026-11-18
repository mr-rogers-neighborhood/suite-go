#!/usr/bin/env node
/**
 * The committed `packages/go/dist` must match a fresh build.
 *
 * This package is installed from a git URL by every app that needs the module contract, so a tag
 * whose `dist` disagrees with its source hands out something nobody built from that source. The
 * failure is silent: the consumer resolves types from one file and runs another.
 *
 * Two environments have no usable git checkout — `scripts/ci.mjs --fresh` exports `HEAD` into a
 * temporary tree, and a container build can copy a tree without `.git`. In both, this check cannot
 * answer the question, so it says that out loud instead of passing quietly. A check that cannot run
 * and says nothing is how a gate stops meaning anything.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

function isWorkTree() {
  return run("git", ["rev-parse", "--is-inside-work-tree"])
    .then(({ stdout }) => stdout.trim() === "true")
    .catch(() => false);
}

await run("pnpm", ["-r", "run", "build"], { stdio: "inherit" });

if (!(await isWorkTree())) {
  process.stdout.write(
    "check-dist: skipped — no git work tree here, so the committed output cannot be compared\n",
  );
  process.exit(0);
}

try {
  await run("git", ["diff", "--exit-code", "--stat", "--", "packages"]);
  process.stdout.write("check-dist: committed output matches a fresh build\n");
} catch (error) {
  const detail =
    typeof error === "object" && error !== null && "stdout" in error ? String(error.stdout) : "";
  process.stderr.write(`check-dist: the build changed committed output\n${detail}`);
  process.exit(1);
}
