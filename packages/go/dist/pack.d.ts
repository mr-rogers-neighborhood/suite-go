export declare const PACK_FORMAT = "suite.pack";
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
 * `network` is the one capability a pack can be held to today without an origin boundary. The host
 * cannot stop a same-origin pack from calling `fetch`, but a pack that does not declare `network`
 * must ship a Content-Security-Policy that forbids egress, and the install refuses it otherwise
 * (`checkNetworkPolicy`). The browser enforces the policy; the host enforces that it is present.
 *
 * The other four are enforced per request by the frame bridge, which is a capability boundary
 * rather than a sandbox: a pack can still reach the shell's DOM (ADR-0002).
 */
export declare const PACK_CAPABILITIES: readonly ["documents", "storage", "files", "recents", "network"];
export type PackCapability = (typeof PACK_CAPABILITIES)[number];
export declare function isPackCapability(value: unknown): value is PackCapability;
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
export type PackParse = {
    readonly ok: true;
    readonly value: PackManifest;
} | {
    readonly ok: false;
    readonly issues: readonly PackIssue[];
};
/**
 * A pack path must stay inside the pack.
 *
 * Rejecting `.` and `..` segments, absolute paths, backslashes and control characters is
 * what stops a manifest from naming a file outside the directory it is installed into.
 * The same three checks the suite's deep-link parser makes, for the same reason: the input
 * is attacker-controlled, and the failure is silent without them.
 */
export declare function isSafePackPath(path: string): boolean;
export declare function parsePackManifest(value: unknown): PackParse;
/**
 * The exact bytes a signature covers.
 *
 * Built field by field in a fixed order rather than by `JSON.stringify(manifest)`, because
 * JSON key order follows insertion and two encoders can differ. A signature over "whatever
 * JSON.stringify produced" verifies only on the machine that produced it.
 */
export declare function canonicalManifestBytes(manifest: PackManifestCore): Uint8Array;
export declare function bytesToBase64(bytes: Uint8Array): string;
export declare function sha256Hex(bytes: Uint8Array): Promise<string>;
/**
 * Does this manifest carry a signature from the key we pinned?
 *
 * `publicKey` is raw 32-byte Ed25519, base64. An import or a signature that cannot be
 * parsed is `false`, never an exception: a malformed pack is a rejected pack, not a crash.
 */
export declare function verifyPackSignature(manifest: PackManifest, publicKeyBase64: string): Promise<boolean>;
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
export declare function verifyPackFiles(manifest: PackManifest, read: (path: string) => Promise<Uint8Array | null>): Promise<readonly PackFileMismatch[]>;
/**
 * Can this host run this pack?
 *
 * Mirrors the desktop's `manifestFitsHub`: a pack built for a newer contract is refused
 * with a sentence a person can act on, rather than failing at the first missing host method.
 */
export type HostFit = {
    readonly ok: true;
} | {
    readonly ok: false;
    readonly reason: "contract" | "host";
    readonly message: string;
};
/**
 * May this pack make this request?
 *
 * `ready` and `theme` are always allowed: a pack that cannot ask what it is or how it looks
 * cannot render at all, and neither reveals anything the pack does not already have.
 */
export declare function packAllows(manifest: PackManifest, capability: PackCapability): boolean;
/**
 * Does this document forbid itself the network?
 *
 * `network` used to be described here as advisory, on the grounds that the host cannot stop a
 * same-origin pack from calling `fetch`. That was wrong in one specific and useful way: a pack's
 * **own** Content-Security-Policy is enforced by the browser for that document, whatever origin it
 * shares. So the host cannot block the request, but it can refuse to install a pack that has not
 * blocked it for itself — and because every file in a pack is hash-verified against the manifest,
 * what was checked at install is what runs later.
 *
 * Two directives are required, not one:
 *
 * - `connect-src 'none'` **or** `connect-src 'self'` — the first closes every fetch channel; the
 *   second is what a pack with WebAssembly actually needs, because wasm-bindgen loads its `.wasm`
 *   with `fetch()` and that request is same-origin. `'self'` cannot reach a remote origin, so the
 *   exfiltration channel that matters stays closed. **Measured:** `'none'` produces a blank frame
 *   for a pack that uses Loro, which is how this distinction was found.
 * - `default-src 'self'` (or `'none'`) — because `img-src`, `script-src` and the rest fall back to
 *   it. Without this, `<img src="https://elsewhere/?d=…">` is an exfiltration channel that
 *   `connect-src` does not close.
 *
 * Only a literal `'self'` or `'none'` is accepted for `default-src`. A policy naming any origin,
 * scheme or wildcard is refused rather than interpreted: the point is a rule a person can audit in
 * one line, not a CSP parser.
 *
 * The `content` attribute must be double-quoted, because a single-quoted one cannot contain
 * `'self'` — HTML would end the attribute at the first inner quote. Entities are not decoded, so a
 * templating system that writes `&#39;self&#39;` produces a policy this refuses, loudly, rather
 * than one it misreads.
 */
export declare function packDocumentSealsNetwork(html: string): boolean;
export type NetworkPolicyCheck = {
    readonly ok: true;
} | {
    readonly ok: false;
    readonly message: string;
};
/**
 * Does this pack honour the capability it did not declare?
 *
 * A pack that declares `network` may do as it likes; it asked, and a person installing it can be
 * told so. A pack that does not declare it has to prove it cannot reach the network, because the
 * alternative is a capability model where one of the five words means nothing.
 */
export declare function checkNetworkPolicy(manifest: PackManifest, files: Readonly<Record<string, Uint8Array>>): NetworkPolicyCheck;
export declare function packFitsHost(manifest: PackManifest, host: {
    readonly contractVersion: number;
    readonly hostVersion: number;
}): HostFit;
//# sourceMappingURL=pack.d.ts.map