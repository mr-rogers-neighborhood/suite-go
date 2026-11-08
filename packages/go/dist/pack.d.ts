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
 * `network` is declared but **advisory**: the host cannot stop a pack from calling `fetch` while
 * the pack shares the shell's origin (ADR-0002). It becomes enforceable with the origin boundary,
 * and saying so here is better than implying a check that does not exist.
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
export declare function packFitsHost(manifest: PackManifest, host: {
    readonly contractVersion: number;
    readonly hostVersion: number;
}): HostFit;
//# sourceMappingURL=pack.d.ts.map