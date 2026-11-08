export declare const PACK_FORMAT = "suite.pack";
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
export declare function packFitsHost(manifest: PackManifest, host: {
    readonly contractVersion: number;
    readonly hostVersion: number;
}): HostFit;
//# sourceMappingURL=pack.d.ts.map