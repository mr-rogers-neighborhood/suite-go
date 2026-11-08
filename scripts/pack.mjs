#!/usr/bin/env node
/**
 * Build and sign a domain pack.
 *
 *   node scripts/pack.mjs --dir path/to/built --id canvas --name Canvas \
 *     --version 0.1.0 --entry index.js --key <private-key-base64> --out Canvas.pack
 *
 * The private key is never in this repository. `pnpm pack:keygen` prints a pair once;
 * the public half goes into `PACK_PUBLIC_KEY` in `apps/go/src/host/packs.ts` and the
 * private half is kept wherever release secrets live.
 *
 * The manifest is built from the files actually present, so a pack cannot claim a hash for
 * content that is not in it. The signature goes over the canonical manifest bytes the
 * contract defines — the same function the app verifies with, imported from `dist/` so
 * there is one implementation rather than two.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { zipSync } from "fflate";
import { bytesToBase64, canonicalManifestBytes, sha256Hex } from "../packages/go/dist/pack.js";

const args = process.argv.slice(2);
const arg = (name) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};

const dir = arg("dir");
const id = arg("id");
const name = arg("name");
const version = arg("version");
const entry = arg("entry") ?? "index.js";
const keyBase64 = arg("key") ?? process.env.SUITE_PACK_KEY;
const out = arg("out") ?? `${id}.pack`;
const contractVersion = Number(arg("contract") ?? 1);
const minimumHostVersion = arg("min-host");
const independent = args.includes("--independent");

if (!dir || !id || !name || !version) {
  console.error(
    "Usage: pack.mjs --dir <dir> --id <id> --name <name> --version <version> [--key <base64>]",
  );
  process.exit(1);
}

/** Every file under `dir`, as slash-separated pack paths. */
function walk(base, current = base, found = {}) {
  for (const name of readdirSync(current)) {
    const full = join(current, name);
    if (statSync(full).isDirectory()) walk(base, full, found);
    else found[relative(base, full).split(sep).join("/")] = new Uint8Array(readFileSync(full));
  }
  return found;
}

const files = walk(dir);
if (!files[entry]) {
  console.error(`Entry ${entry} is not in ${dir}. Files: ${Object.keys(files).join(", ")}`);
  process.exit(1);
}

const manifestFiles = [];
for (const path of Object.keys(files).sort()) {
  manifestFiles.push({ path, sha256: await sha256Hex(files[path]), bytes: files[path].byteLength });
}

const core = {
  format: "suite.pack",
  id,
  name,
  version,
  entry,
  contractVersion,
  ...(minimumHostVersion === undefined ? {} : { minimumHostVersion: Number(minimumHostVersion) }),
  independent,
  files: manifestFiles,
};

if (!keyBase64) {
  console.error(
    "No signing key. Set --key <base64> or SUITE_PACK_KEY.\n" +
      "Generate one with `pnpm pack:keygen`. A pack that is not signed is not installable, by design.",
  );
  process.exit(1);
}

const rawKey = Uint8Array.from(Buffer.from(keyBase64, "base64"));
const privateKey = await crypto.subtle.importKey("pkcs8", rawKey, { name: "Ed25519" }, false, [
  "sign",
]);
const signature = await crypto.subtle.sign(
  { name: "Ed25519" },
  privateKey,
  canonicalManifestBytes(core),
);

const manifest = { ...core, signature: bytesToBase64(new Uint8Array(signature)) };

const archive = zipSync(
  {
    "manifest.json": new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
    ...files,
  },
  { level: 6 },
);

writeFileSync(out, archive);
const total = manifestFiles.reduce((sum, file) => sum + file.bytes, 0);
console.log(
  `${out}  ${manifestFiles.length} files  ${(total / 1024).toFixed(1)} KiB  id=${id} v${version}`,
);
