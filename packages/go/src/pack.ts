/**
 * A domain pack: what arrives when a person installs a domain.
 *
 * The shape is deliberately small, and every field earns its place:
 *
 * - `id` and `version` because a pack is a thing that can be installed twice and upgraded.
 * - `entry` because the host has to know which file to import, and guessing is not a policy.
 * - `contractVersion` and `minimumHostVersion` because a pack built for a host it does not
 *   have must be refused with a reason rather than crashing on a missing method.
 * - `independent` because a pack that can open on its own, with no hub in the path, behaves
 *   differently when it is launched: there is no shell state to inherit.
 * - `files` with a hash each, because the signature covers the manifest and the manifest
 *   covers the bytes.
 *
 * Verification is two steps and both are required. The signature proves the manifest came
 * from whoever holds the key; the per-file hashes prove the files on disk are the ones that
 * manifest describes. A pack that passes only one is not safe to run.
 *
 * Everything here is pure and uses `globalThis.crypto`, which is the WebCrypto API in a
 * WebView and in Node 22+. That is why the same code verifies a pack in a test and on a phone.
 */
import { hashes, verify as nobleVerify } from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { isSuiteGoModuleId } from "./module.js";

/**
 * Ed25519 hashing, supplied explicitly rather than taken from WebCrypto.
 *
 * Verification used to call `crypto.subtle` and read as a clean design until it ran on a second
 * device: a WebView without Ed25519 throws `Unrecognized name`, the old code caught that and
 * answered `false`, and the app told the person their pack's "signature does not match" — a lie
 * that blames the pack for the host's shortcoming.
 *
 * A pure implementation has no such gap. It is also the same family the suite's sync protocol
 * already depends on, so this adds no new trust surface.
 */
hashes.sha512 = sha512;

export const PACK_FORMAT = "suite.pack";

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const SHA256_HEX = /^[0-9a-f]{64}$/u;

/**
 * Which document a pack renders in.
 *
 * `isolated` is the only mode: its own document, its own CSS scope, its own React (ADR-0003).
 * `shared` would have rendered inside the shell's document against the shell's React, and it is
 * refused rather than honoured — the import-map route it depended on is not supported by the
 * toolchain, and a mode that half-works is worse than one that says so.
 *
 * What `isolated` does **not** buy is a separate process, or a security boundary (ADR-0002): an
 * iframe is a new document and a new JS realm in the same renderer, same origin. The JS heap is
 * separate — measured — so a runaway allocation exhausts its own isolate. The shell's DOM is not
 * protected; capabilities are what protect the data.
 */
export type PackIsolation = "shared" | "isolated";

/**
 * What a pack may ask the host for.
 *
 * Coarse on purpose — four words a person can reason about without reading code. Deny by default:
 * a manifest with no capabilities renders and does nothing else, which is the correct starting
 * point for something that arrived over the network.
 *
 * `network` is declared but **advisory**: the host cannot stop a pack from calling `fetch` while
 * the pack shares the shell's origin (ADR-0002). It becomes enforceable with the origin boundary,
 * and saying so here is better than implying a check that does not exist.
 */
export const PACK_CAPABILITIES = ["documents", "storage", "files", "recents", "network"] as const;

export type PackCapability = (typeof PACK_CAPABILITIES)[number];

export function isPackCapability(value: unknown): value is PackCapability {
  return typeof value === "string" && (PACK_CAPABILITIES as readonly string[]).includes(value);
}

/** One file inside a pack. `path` is relative to the pack root and slash-separated. */
export interface PackFile {
  readonly path: string;
  /** Lower-case hex. */
  readonly sha256: string;
  readonly bytes: number;
}

/** The part a signature covers. No signature field, and no host-specific fields. */
export interface PackManifestCore {
  readonly format: typeof PACK_FORMAT;
  readonly id: string;
  readonly name: string;
  readonly version: string;
  /** The module file to import, relative to the pack root. */
  readonly entry: string;
  readonly contractVersion: number;
  readonly minimumHostVersion?: number;
  /** True when the pack opens on its own, without the hub. */
  readonly independent: boolean;
  /** Which document the pack renders in. Absent means `shared`. */
  readonly isolation: PackIsolation;
  /** What it may ask the host for. Empty means it may render and nothing else. */
  readonly capabilities: readonly PackCapability[];
  readonly files: readonly PackFile[];
}

export interface PackManifest extends PackManifestCore {
  /** Base64 Ed25519 signature over `canonicalManifestBytes(manifest)`. */
  readonly signature: string;
}

export interface PackIssue {
  readonly path: string;
  readonly message: string;
}

export type PackParse =
  | { readonly ok: true; readonly value: PackManifest }
  | { readonly ok: false; readonly issues: readonly PackIssue[] };

/**
 * A pack path must stay inside the pack.
 *
 * Rejecting `.` and `..` segments, absolute paths, backslashes and control characters is
 * what stops a manifest from naming a file outside the directory it is installed into.
 * The same three checks the suite's deep-link parser makes, for the same reason: the input
 * is attacker-controlled, and the failure is silent without them.
 */
export function isSafePackPath(path: string): boolean {
  if (path.length === 0 || path.length > 512) return false;
  if (path.startsWith("/")) return false;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the control characters are what this rejects.
  if (/[\\\u0000-\u001f\u007f]/u.test(path)) return false;
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

export function parsePackManifest(value: unknown): PackParse {
  const issues: PackIssue[] = [];

  if (typeof value !== "object" || value === null) {
    return { ok: false, issues: [{ path: "", message: "a manifest is an object" }] };
  }

  const raw = value as Record<string, unknown>;
  const fail = (path: string, message: string) => issues.push({ path, message });

  if (raw.format !== PACK_FORMAT) fail("format", `expected "${PACK_FORMAT}"`);

  const id = typeof raw.id === "string" ? raw.id : "";
  if (!isSuiteGoModuleId(id)) fail("id", "lower kebab-case, at most 32 characters");

  const name = typeof raw.name === "string" ? raw.name : "";
  if (name.length === 0 || name.length > 64) fail("name", "one to 64 characters");

  const version = typeof raw.version === "string" ? raw.version : "";
  if (!SEMVER.test(version)) fail("version", "semver");

  const entry = typeof raw.entry === "string" ? raw.entry : "";
  if (!isSafePackPath(entry)) fail("entry", "a relative path inside the pack");

  const contractVersion =
    typeof raw.contractVersion === "number" && Number.isInteger(raw.contractVersion)
      ? raw.contractVersion
      : Number.NaN;
  if (Number.isNaN(contractVersion)) fail("contractVersion", "an integer");

  if (raw.minimumHostVersion !== undefined) {
    if (typeof raw.minimumHostVersion !== "number" || !Number.isInteger(raw.minimumHostVersion)) {
      fail("minimumHostVersion", "an integer when present");
    }
  }

  if (typeof raw.independent !== "boolean") fail("independent", "true or false");

  // Defaults to `isolated`, and an explicit `shared` is refused with a reason (ADR-0003).
  const isolation: PackIsolation = raw.isolation === "shared" ? "shared" : "isolated";
  if (raw.isolation !== undefined && raw.isolation !== "shared" && raw.isolation !== "isolated") {
    fail("isolation", 'either "shared" or "isolated"');
  }
  if (raw.isolation === "shared") {
    fail(
      "isolation",
      'the "shared" hosting mode was withdrawn: rebuild the pack for its own document, or remove the field and it defaults to "isolated"',
    );
  }

  const files: PackFile[] = [];
  if (!Array.isArray(raw.files)) {
    fail("files", "an array");
  } else {
    const seen = new Set<string>();
    raw.files.forEach((candidate, index) => {
      const path = `files.${index}`;
      if (typeof candidate !== "object" || candidate === null) {
        fail(path, "an object");
        return;
      }
      const file = candidate as Record<string, unknown>;
      const filePath = typeof file.path === "string" ? file.path : "";
      if (!isSafePackPath(filePath)) fail(`${path}.path`, "a relative path inside the pack");
      else if (seen.has(filePath)) fail(`${path}.path`, `duplicate path ${filePath}`);
      else seen.add(filePath);

      const sha256 = typeof file.sha256 === "string" ? file.sha256 : "";
      if (!SHA256_HEX.test(sha256)) fail(`${path}.sha256`, "64 lower-case hex characters");

      if (typeof file.bytes !== "number" || !Number.isInteger(file.bytes) || file.bytes < 0) {
        fail(`${path}.bytes`, "a non-negative integer");
      }

      files.push({
        path: filePath,
        sha256,
        bytes: typeof file.bytes === "number" ? file.bytes : 0,
      });
    });

    if (files.length === 0) fail("files", "at least one file");
    if (!files.some((file) => file.path === entry)) {
      fail("entry", "must name a file the manifest lists");
    }
  }

  const signature = typeof raw.signature === "string" ? raw.signature : "";
  if (signature.length === 0) fail("signature", "base64 Ed25519 signature");

  const capabilities: PackCapability[] = [];
  if (raw.capabilities !== undefined) {
    if (!Array.isArray(raw.capabilities)) {
      fail("capabilities", "an array of capability names");
    } else {
      const seen = new Set<string>();
      raw.capabilities.forEach((candidate, index) => {
        if (!isPackCapability(candidate)) {
          fail(`capabilities.${index}`, `one of ${PACK_CAPABILITIES.join(", ")}`);
          return;
        }
        if (seen.has(candidate)) {
          fail(`capabilities.${index}`, `duplicate ${candidate}`);
          return;
        }
        seen.add(candidate);
        capabilities.push(candidate);
      });
    }
  }

  // The entry has to match the mode: an isolated pack owns a page, a shared pack is a module
  // imported into one. Getting this wrong produces a blank frame or an import of an HTML
  // file, neither of which names the mistake.
  if (isolation === "isolated" && !entry.endsWith(".html")) {
    fail("entry", "an isolated pack's entry is an HTML document");
  }
  if (isolation === "shared" && entry.endsWith(".html")) {
    fail("entry", 'a shared pack\'s entry is a module; declare isolation "isolated" for a page');
  }

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    value: {
      format: PACK_FORMAT,
      id,
      name,
      version,
      entry,
      contractVersion,
      ...(raw.minimumHostVersion === undefined
        ? {}
        : { minimumHostVersion: raw.minimumHostVersion as number }),
      independent: raw.independent as boolean,
      isolation,
      capabilities,
      files,
      signature,
    },
  };
}

/**
 * The exact bytes a signature covers.
 *
 * Built field by field in a fixed order rather than by `JSON.stringify(manifest)`, because
 * JSON key order follows insertion and two encoders can differ. A signature over "whatever
 * JSON.stringify produced" verifies only on the machine that produced it.
 */
export function canonicalManifestBytes(manifest: PackManifestCore): Uint8Array {
  const canonical = {
    format: manifest.format,
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    entry: manifest.entry,
    contractVersion: manifest.contractVersion,
    minimumHostVersion: manifest.minimumHostVersion ?? null,
    independent: manifest.independent,
    isolation: manifest.isolation,
    capabilities: manifest.capabilities,
    files: manifest.files.map((file) => ({
      path: file.path,
      sha256: file.sha256,
      bytes: file.bytes,
    })),
  };
  return new TextEncoder().encode(JSON.stringify(canonical));
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function sha256Hex(bytes: Uint8Array): Promise<string> {
  return crypto.subtle
    .digest("SHA-256", bytes as BufferSource)
    .then((digest) =>
      [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
    );
}

/**
 * Does this manifest carry a signature from the key we pinned?
 *
 * `publicKey` is raw 32-byte Ed25519, base64. An import or a signature that cannot be
 * parsed is `false`, never an exception: a malformed pack is a rejected pack, not a crash.
 */
export async function verifyPackSignature(
  manifest: PackManifest,
  publicKeyBase64: string,
): Promise<boolean> {
  try {
    return nobleVerify(
      base64ToBytes(manifest.signature),
      canonicalManifestBytes(manifest),
      base64ToBytes(publicKeyBase64),
    );
  } catch {
    return false;
  }
}

export interface PackFileMismatch {
  readonly path: string;
  readonly reason: "missing" | "hash" | "size";
}

/**
 * Do the bytes on disk match the files the manifest lists?
 *
 * `read` returns the file's bytes, or `null` when it is not there. The size is checked
 * before the hash because it is free, and a size mismatch means the hash cannot match.
 */
export async function verifyPackFiles(
  manifest: PackManifest,
  read: (path: string) => Promise<Uint8Array | null>,
): Promise<readonly PackFileMismatch[]> {
  const mismatches: PackFileMismatch[] = [];
  for (const file of manifest.files) {
    const bytes = await read(file.path);
    if (bytes === null) {
      mismatches.push({ path: file.path, reason: "missing" });
      continue;
    }
    if (bytes.byteLength !== file.bytes) {
      mismatches.push({ path: file.path, reason: "size" });
      continue;
    }
    if ((await sha256Hex(bytes)) !== file.sha256) {
      mismatches.push({ path: file.path, reason: "hash" });
    }
  }
  return mismatches;
}

/**
 * Can this host run this pack?
 *
 * Mirrors the desktop's `manifestFitsHub`: a pack built for a newer contract is refused
 * with a sentence a person can act on, rather than failing at the first missing host method.
 */
export type HostFit =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "contract" | "host"; readonly message: string };

/**
 * May this pack make this request?
 *
 * `ready` and `theme` are always allowed: a pack that cannot ask what it is or how it looks
 * cannot render at all, and neither reveals anything the pack does not already have.
 */
export function packAllows(manifest: PackManifest, capability: PackCapability): boolean {
  return manifest.capabilities.includes(capability);
}

export function packFitsHost(
  manifest: PackManifest,
  host: { readonly contractVersion: number; readonly hostVersion: number },
): HostFit {
  if (manifest.contractVersion > host.contractVersion) {
    return {
      ok: false,
      reason: "contract",
      message: `${manifest.name} needs a newer version of Suite Go. Update the app to open it.`,
    };
  }
  if (manifest.minimumHostVersion !== undefined && host.hostVersion < manifest.minimumHostVersion) {
    return {
      ok: false,
      reason: "host",
      message: `${manifest.name} needs Suite Go ${manifest.minimumHostVersion} or later.`,
    };
  }
  return { ok: true };
}
