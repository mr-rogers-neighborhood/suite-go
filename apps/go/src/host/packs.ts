import { Directory, Filesystem } from "@capacitor/filesystem";
import {
  bytesToBase64,
  type PackManifest,
  packFitsHost,
  parsePackManifest,
  sha256Hex,
  verifyPackFiles,
  verifyPackSignature,
} from "@suite/go";
import { unzipSync, zipSync } from "fflate";

/**
 * Installed domain packs.
 *
 * Three things this deliberately does not do: parse a domain's data, import a pack's code
 * to ask what it is, or keep a pack that failed verification. The first two are the container
 * learning a domain; the third is the whole point of the signature.
 *
 * Storage layout is `packs/<id>/<version>/`, so two versions can exist at once and an
 * upgrade can fall back to the one that worked.
 */

/** Where packs live, relative to the app's data directory. */
const ROOT = "packs";

/**
 * The key that signs packs.
 *
 * Pinned at build time and never fetched, because a feed that could hand over a new key has
 * handed over the app. An empty value refuses every pack, which is the correct default for a
 * build with no key: an unverified pack is never better than no pack.
 *
 * **This is a development key.** It exists so the pipeline can be exercised end to end while
 * there is no release process. The release key replaces it in the same commit that adds
 * signing to CI, and the private half is a release secret that never enters this repository.
 */
export const PACK_PUBLIC_KEY = "0suFTmk5Jwx6zx+tLckcug1nZzFIRgkiflBSwuUCr8A=";

/** What this build implements. Bumped when the host services a pack may call change. */
export const HOST_CONTRACT_VERSION = 1;
export const HOST_VERSION = 1;

export interface InstalledPack {
  readonly manifest: PackManifest;
  /** Where the pack's entry lives, as a URL the WebView can import. */
  readonly entryUrl: string;
  readonly installedAt: number;
  readonly bytes: number;
}

export type InstallOutcome =
  | { readonly ok: true; readonly pack: InstalledPack }
  | {
      readonly ok: false;
      readonly reason:
        | "unreadable"
        | "invalid"
        | "unsigned"
        | "untrusted"
        | "files"
        | "host"
        | "failed";
      readonly message: string;
    };

/**
 * The URL a pack file is served from.
 *
 * Capacitor proxies `/_capacitor_file_/` to the real filesystem from its own origin, so a
 * pack's relative imports, `.wasm` and fonts resolve exactly as they would from `dist/`.
 * Verified on a device: an `import()` of this shape runs, and a `WebAssembly.instantiate`
 * of a relative `.wasm` inside it succeeds.
 */
export function packFileUrl(absoluteDir: string, relativePath: string): string {
  // Normalised here rather than at every call site: `getUri` hands back `file:///data/...`,
  // and naively prefixing that produced `/_capacitor_file_//data/...`, which resolves on
  // this WebView but is not a URL worth relying on.
  const dir = absoluteDir.replace(/^file:\/\//u, "").replace(/\/+$/u, "");
  const relative = relativePath.replace(/^\/+/u, "");
  const rooted = dir.startsWith("/") ? dir : `/${dir}`;
  return `https://localhost/_capacitor_file_${rooted}/${relative}`;
}

interface ManifestEnvelope {
  readonly manifest: PackManifest;
  readonly files: Readonly<Record<string, Uint8Array>>;
}

function readEnvelope(bytes: Uint8Array): ManifestEnvelope | null {
  try {
    const entries = unzipSync(bytes);
    const manifestBytes = entries["manifest.json"];
    if (!manifestBytes) return null;

    const parsed = parsePackManifest(JSON.parse(new TextDecoder().decode(manifestBytes)));
    if (!parsed.ok) return null;

    const files: Record<string, Uint8Array> = {};
    for (const [path, content] of Object.entries(entries)) {
      if (path === "manifest.json") continue;
      files[path] = content;
    }
    return { manifest: parsed.value, files };
  } catch {
    return null;
  }
}

/**
 * Text through the filesystem plugin, base64 on both sides.
 *
 * `writeFile` rejects a plain string as invalid input — it wants base64 or a Blob — and a plain
 * write would have "worked" only by accident on a platform that accepted it. Writing and reading
 * the same way means the manifest on disk round-trips regardless.
 */
async function readTextFile(path: string): Promise<string> {
  const file = await Filesystem.readFile({ path, directory: Directory.Data });
  const base64 = typeof file.data === "string" ? file.data : "";
  return new TextDecoder().decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
}

async function writeTextFile(path: string, text: string): Promise<void> {
  await Filesystem.writeFile({
    path,
    data: bytesToBase64(new TextEncoder().encode(text)),
    directory: Directory.Data,
    recursive: true,
  });
}

async function ensureDir(path: string): Promise<void> {
  await Filesystem.mkdir({ path, directory: Directory.Data, recursive: true }).catch(
    () => undefined,
  );
}

export interface PackStore {
  /**
   * What is on disk.
   *
   * Read from storage rather than remembered, because a store that only knew what it installed
   * this session would lose every pack on a restart — and "installed" has to survive the app
   * being killed, which is the normal way it ends.
   */
  discover(): Promise<readonly InstalledPack[]>;
  list(): Promise<readonly InstalledPack[]>;
  install(bytes: Uint8Array): Promise<InstallOutcome>;
  uninstall(id: string): Promise<void>;
  /** The directory a pack is installed in, for a launch URL. Kept for `uninstall` and tests. */
  directoryOf(id: string): Promise<string>;
}

export function createPackStore(
  options: {
    readonly publicKey?: string;
    readonly contractVersion?: number;
    readonly hostVersion?: number;
  } = {},
): PackStore {
  const publicKey = options.publicKey ?? PACK_PUBLIC_KEY;
  const host = {
    contractVersion: options.contractVersion ?? HOST_CONTRACT_VERSION,
    hostVersion: options.hostVersion ?? HOST_VERSION,
  };

  const installed: Map<string, InstalledPack> = new Map();

  const absoluteDir = async (id: string): Promise<string> => {
    // `Filesystem.getUri` is the only supported way to learn the real path, and the
    // `_capacitor_file_` proxy needs a real path rather than a directory-relative one.
    const uri = await Filesystem.getUri({
      path: `${ROOT}/${id}`,
      directory: Directory.Data,
    });
    return uri.uri;
  };

  return {
    async discover() {
      const found: InstalledPack[] = [];
      let ids: readonly string[] = [];
      try {
        const listing = await Filesystem.readdir({ path: ROOT, directory: Directory.Data });
        ids = listing.files.map((entry) => entry.name);
      } catch {
        return found;
      }

      for (const id of ids) {
        let versions: readonly string[] = [];
        try {
          const listing = await Filesystem.readdir({
            path: `${ROOT}/${id}`,
            directory: Directory.Data,
          });
          versions = listing.files.map((entry) => entry.name);
        } catch {
          continue;
        }

        // The newest version that still verifies. A directory left behind by a half-finished
        // install is skipped rather than offered as a module that will fail to open.
        for (const version of [...versions].sort().reverse()) {
          const dir = `${ROOT}/${id}/${version}`;
          try {
            const text = await readTextFile(`${dir}/manifest.json`);
            const parsed = parsePackManifest(JSON.parse(text));
            if (!parsed.ok) continue;
            if (!(await verifyPackSignature(parsed.value, publicKey))) continue;

            const baseDir = await absoluteDir(`${id}/${version}`);
            found.push({
              manifest: parsed.value,
              entryUrl: packFileUrl(baseDir, parsed.value.entry),
              installedAt: 0,
              bytes: parsed.value.files.reduce((total, file) => total + file.bytes, 0),
            });
            installed.set(id, found[found.length - 1] as InstalledPack);
            break;
          } catch {}
        }
      }

      return found;
    },

    async list() {
      return [...installed.values()];
    },

    async directoryOf(id) {
      return absoluteDir(id);
    },

    async install(bytes) {
      if (publicKey.length === 0) {
        return {
          ok: false,
          reason: "untrusted",
          message: "This build has no pack signing key, so it cannot trust any pack yet.",
        };
      }

      const envelope = readEnvelope(bytes);
      if (!envelope) {
        return {
          ok: false,
          reason: "invalid",
          message: "That file is not a Suite pack, or its manifest is not one this build reads.",
        };
      }

      const { manifest, files } = envelope;

      if (!(await verifyPackSignature(manifest, publicKey))) {
        return {
          ok: false,
          reason: "unsigned",
          message: "That pack's signature does not match. It may be damaged or not from Suite.",
        };
      }

      const mismatches = await verifyPackFiles(manifest, async (path) => files[path] ?? null);
      if (mismatches.length > 0) {
        const first = mismatches[0];
        return {
          ok: false,
          reason: "files",
          message: `That pack is damaged: ${first?.path ?? "a file"} does not match its manifest.`,
        };
      }

      const fit = packFitsHost(manifest, host);
      if (!fit.ok) return { ok: false, reason: "host", message: fit.message };

      try {
        const dir = `${ROOT}/${manifest.id}/${manifest.version}`;
        await ensureDir(dir);
        // The manifest is written too, not just the payload. Discovery reads it to decide what
        // is installed, and an install that left it behind would vanish on the next launch.
        await writeTextFile(`${dir}/manifest.json`, JSON.stringify(manifest));
        for (const [path, content] of Object.entries(files)) {
          await Filesystem.writeFile({
            path: `${dir}/${path}`,
            data: bytesToBase64(content),
            directory: Directory.Data,
            recursive: true,
          });
        }

        const baseDir = await absoluteDir(`${manifest.id}/${manifest.version}`);
        const pack: InstalledPack = {
          manifest,
          entryUrl: packFileUrl(baseDir, manifest.entry),
          installedAt: Date.now(),
          bytes: manifest.files.reduce((total, file) => total + file.bytes, 0),
        };
        installed.set(manifest.id, pack);
        return { ok: true, pack };
      } catch (error) {
        return {
          ok: false,
          reason: "failed",
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },

    async uninstall(id) {
      installed.delete(id);
      // Remove the whole pack directory, every version of it, so the space actually returns.
      await Filesystem.rmdir({
        path: `${ROOT}/${id}`,
        directory: Directory.Data,
        recursive: true,
      }).catch(() => undefined);
    },
  };
}

/**
 * Build a pack file. Used by `scripts/pack.mjs` and by tests, never by the app at runtime.
 *
 * Kept here rather than in the script so the writer and the reader cannot drift: the same
 * `PackManifest` type, the same canonical bytes, one implementation of the format.
 */
export function packArchive(
  manifest: PackManifest,
  files: Readonly<Record<string, Uint8Array>>,
): Uint8Array {
  const entries: Record<string, Uint8Array> = {
    "manifest.json": new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
  };
  for (const [path, content] of Object.entries(files)) entries[path] = content;
  return zipSync(entries, { level: 6 });
}

/** Hash a set of files the way `files[]` in a manifest expects. */
export async function manifestFiles(
  files: Readonly<Record<string, Uint8Array>>,
): Promise<PackManifest["files"]> {
  const out: PackManifest["files"][number][] = [];
  for (const path of Object.keys(files).sort()) {
    const content = files[path];
    if (!content) continue;
    out.push({ path, sha256: await sha256Hex(content), bytes: content.byteLength });
  }
  return out;
}
