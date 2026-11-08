# Domain packs

How a domain arrives on a phone. This is the WeChat mini-program model with a signature: a small host,
and functional packages that are installed and removed on demand.

## The pipeline, proven on a device

| Step                                | Where                                           | Verified                                                    |
| ----------------------------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| Build a directory of files          | `scripts/pack.mjs --dir`                        | 3 files, 0.3 KiB                                            |
| Hash every file, canonicalise, sign | `pack.mjs` + `canonicalManifestBytes`           | Ed25519 over the manifest, SHA-256 per file                 |
| Install from bytes                  | `apps/go/src/host/packs.ts`                     | Signature checked, files written to `packs/<id>/<version>/` |
| Import the installed entry          | `import(entryUrl)`                              | `probe-pack-loaded` exported and read back                  |
| Its relative assets resolve         | `fetch(new URL('./assets/note.txt', entryUrl))` | `hello from a pack asset`                                   |
| Its WASM instantiates               | `WebAssembly.instantiate` on a relative `.wasm` | 8 bytes, instantiated                                       |
| Uninstall returns the space         | `Filesystem.rmdir` on `packs/<id>`              | 38 KiB → 4 KiB                                              |
| An untrusted signer is refused      | `verifyPackSignature`                           | `reason: "unsigned"`                                        |
| A tampered file is refused          | `verifyPackFiles`                               | `reason: "hash"`                                            |

## Why `/_capacitor_file_/` is the whole trick

A pack's code, WASM and fonts have to resolve against the pack's own directory, or every domain would
need its own server or its own origin. Capacitor's local server proxies `/_capacitor_file_/<absolute
path>` to the real filesystem (`WebViewLocalServer.java:682`), so an installed pack is served from
`https://localhost` like the shell's own bundle. `import.meta.url` inside a pack is the pack's URL, so a
relative `./assets/x.wasm` resolves to the pack. No second server, no custom scheme, no `blob:` origin.

## Three things that will bite later

**1. ESM caches modules by URL.** Reinstalling a pack at the same path serves the old module — the
dynamic `import()` returns the cached instance. Found by hitting it: an updated `index.js` at an
unchanged URL kept returning the previous exports. Version directories handle upgrades, but a
same-version reinstall needs a cache-busting query built from the manifest hash. The loader should use
`?v=<short-hash>` rather than relying on the path alone.

**2. Two Reacts would break every hook.** A pack that bundles its own React, mounted in the shell's
document, is two React instances and an "invalid hook call" at the first `useState`. There are two honest
answers and they are the same fork as the isolation question:

- **Import map.** The shell publishes React and ReactDOM at stable URLs; packs mark both external. One
  React, and packs stay in the shell's document.
- **Own WebView per pack.** Each pack gets its own document and its own React. This is closer to what
  WeChat does — it gives each mini program its own thread and its own copy of the runtime — and it also
  removes the Tailwind preflight collision, the shared-heap out-of-memory risk and the CSS bleed, at the
  cost of a page life per switch.

The second is the shape Canvas needs, and it is why the isolation spike is not optional. **Not decided
here**, because it changes how every pack is built.

**3. The key is the trust boundary.** `PACK_PUBLIC_KEY` is pinned in the app and never fetched: a feed
that could hand over a new key has handed over the app. The value in the repository today is a
**development key** that exists so the pipeline could be exercised before there is a release process. The
release key replaces it in the same change that signs packs in CI, and its private half never enters this
repository.

## What a pack may not do

- Name a file outside itself. `.`/`..`, absolute paths, backslashes and control characters are refused
  by `isSafePackPath`, and an `entry` the manifest does not list is refused too.
- Claim a contract the host does not implement. `contractVersion` and `minimumHostVersion` produce a
  sentence a person can act on, not a crash at the first missing method.
- Arrive without a signature. An unsigned or damaged pack is refused whole; the installed version stays.

## Still open

| Item               | Why it is open                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------ |
| React sharing      | import map or per-pack WebView — decided with the isolation spike                          |
| Pack updates       | async download, apply on next open, fall back to the installed version                     |
| Preload            | prefetch on long-press, wifi-only                                                          |
| Cross-pack imports | the packer should fail the build when one pack imports another                             |
| Install screen     | available, installed, size on disk, remove — with "show in app list" kept visibly separate |
