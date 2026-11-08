#!/usr/bin/env node
/**
 * Make a pack-signing keypair, once.
 *
 * Prints the public half for `PACK_PUBLIC_KEY` and the private half for wherever release
 * secrets live. Nothing here is stored: a key this script wrote to disk would be a key in a
 * repository, and this repository is public.
 *
 *   pnpm pack:keygen
 */
const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
const rawPublic = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
const b64 = (bytes) => Buffer.from(bytes).toString("base64");

console.log(`public  (PACK_PUBLIC_KEY): ${b64(rawPublic)}`);
console.log(`private (keep secret)    : ${b64(pkcs8)}`);
console.log(
  "\nThe private key is a release secret. Do not commit it, and do not paste it into an issue.",
);
