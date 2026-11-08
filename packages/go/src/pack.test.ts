import { beforeEach, describe, expect, it } from "vitest";
import {
  bytesToBase64,
  canonicalManifestBytes,
  isSafePackPath,
  type PackManifest,
  packFitsHost,
  parsePackManifest,
  sha256Hex,
  verifyPackFiles,
  verifyPackSignature,
} from "./pack.js";

/** A keypair per test run; nothing here ships with a key baked in. */
let privateKey: CryptoKey;
let publicKeyBase64: string;

const encoder = new TextEncoder();

async function sign(manifest: Omit<PackManifest, "signature">): Promise<string> {
  const signature = await crypto.subtle.sign(
    { name: "Ed25519" },
    privateKey,
    canonicalManifestBytes(manifest) as BufferSource,
  );
  return bytesToBase64(new Uint8Array(signature));
}

async function makeManifest(overrides: Partial<PackManifest> = {}): Promise<PackManifest> {
  const body = encoder.encode("export const x = 1;\n");
  const core = {
    format: "suite.pack" as const,
    id: "probe",
    name: "Probe",
    version: "1.0.0",
    entry: "index.js",
    contractVersion: 1,
    independent: false,
    isolation: "shared" as const,
    files: [{ path: "index.js", sha256: await sha256Hex(body), bytes: body.byteLength }],
    ...overrides,
  };
  const signature = await sign(core);
  return { ...core, signature, ...(overrides.signature ? { signature: overrides.signature } : {}) };
}

beforeEach(async () => {
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  privateKey = pair.privateKey;
  const raw = await crypto.subtle.exportKey("raw", pair.publicKey);
  publicKeyBase64 = bytesToBase64(new Uint8Array(raw));
});

describe("isSafePackPath", () => {
  it.each(["index.js", "assets/app.js", "assets/fonts/a.woff2"])("accepts %s", (path) => {
    expect(isSafePackPath(path)).toBe(true);
  });

  it.each([
    "",
    "/etc/passwd",
    "../outside.js",
    "assets/../../outside.js",
    "./index.js",
    "assets//app.js",
    "a\\b.js",
    "with\u0000nul.js",
  ])("refuses %j", (path) => {
    expect(isSafePackPath(path)).toBe(false);
  });
});

describe("parsePackManifest", () => {
  it("accepts a well-formed manifest", async () => {
    const parsed = parsePackManifest(await makeManifest());
    expect(parsed.ok).toBe(true);
  });

  it("refuses an entry the manifest does not list", async () => {
    const parsed = parsePackManifest(await makeManifest({ entry: "missing.js" }));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.issues.some((issue) => issue.path === "entry")).toBe(true);
  });

  it("refuses an unsafe file path", async () => {
    const parsed = parsePackManifest(
      await makeManifest({ files: [{ path: "../escape.js", sha256: "a".repeat(64), bytes: 1 }] }),
    );
    expect(parsed.ok).toBe(false);
  });

  it("refuses a duplicate file path", async () => {
    const file = { path: "index.js", sha256: "a".repeat(64), bytes: 1 };
    const parsed = parsePackManifest(await makeManifest({ files: [file, file] }));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.issues.some((issue) => issue.message.includes("duplicate"))).toBe(true);
  });

  it("refuses a manifest with no signature", async () => {
    const { signature: _drop, ...unsigned } = await makeManifest();
    expect(unsigned).toBeDefined();
    expect(parsePackManifest(unsigned).ok).toBe(false);
  });
});

describe("isolation", () => {
  it("defaults to shared when the manifest does not say", async () => {
    const { isolation: _drop, ...without } = await makeManifest();
    const parsed = parsePackManifest(without);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.isolation).toBe("shared");
  });

  it("refuses an isolated pack whose entry is not an HTML document", async () => {
    const parsed = parsePackManifest(await makeManifest({ isolation: "isolated" }));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.issues.some((issue) => issue.path === "entry")).toBe(true);
  });

  it("accepts an isolated pack whose entry is a page", async () => {
    const html = encoder.encode("<!doctype html><title>pack</title>");
    const parsed = parsePackManifest(
      await makeManifest({
        isolation: "isolated",
        entry: "index.html",
        files: [{ path: "index.html", sha256: await sha256Hex(html), bytes: html.byteLength }],
      }),
    );
    expect(parsed.ok).toBe(true);
  });

  it("refuses a shared pack whose entry is a page", async () => {
    const html = encoder.encode("<!doctype html>");
    const parsed = parsePackManifest(
      await makeManifest({
        entry: "index.html",
        files: [{ path: "index.html", sha256: await sha256Hex(html), bytes: html.byteLength }],
      }),
    );
    expect(parsed.ok).toBe(false);
  });

  it("refuses a mode it does not know", async () => {
    const parsed = parsePackManifest({
      ...(await makeManifest()),
      isolation: "sandboxed",
    } as unknown as ReturnType<typeof makeManifest>);
    expect(parsed.ok).toBe(false);
  });

  it("is covered by the signature, so a mode cannot be swapped after signing", async () => {
    const manifest = await makeManifest();
    const swapped: PackManifest = { ...manifest, isolation: "isolated" };
    expect(await verifyPackSignature(swapped, publicKeyBase64)).toBe(false);
  });
});

describe("canonicalManifestBytes", () => {
  it("does not depend on the order the fields were written in", async () => {
    const manifest = await makeManifest();
    const reordered = {
      isolation: manifest.isolation,
      independent: manifest.independent,
      files: manifest.files,
      contractVersion: manifest.contractVersion,
      entry: manifest.entry,
      version: manifest.version,
      name: manifest.name,
      id: manifest.id,
      format: manifest.format,
    } as unknown as PackManifest;

    expect([...canonicalManifestBytes(reordered)]).toEqual([...canonicalManifestBytes(manifest)]);
  });
});

describe("verifyPackSignature", () => {
  it("accepts a pack signed by the pinned key", async () => {
    const manifest = await makeManifest();
    expect(await verifyPackSignature(manifest, publicKeyBase64)).toBe(true);
  });

  it("refuses a manifest that was edited after signing", async () => {
    const manifest = await makeManifest();
    const tampered: PackManifest = { ...manifest, name: "Something Else" };
    expect(await verifyPackSignature(tampered, publicKeyBase64)).toBe(false);
  });

  it("refuses a pack signed by a different key", async () => {
    const manifest = await makeManifest();
    const other = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
    const raw = await crypto.subtle.exportKey("raw", other.publicKey);
    expect(await verifyPackSignature(manifest, bytesToBase64(new Uint8Array(raw)))).toBe(false);
  });

  it("answers false rather than throwing on a junk key", async () => {
    const manifest = await makeManifest();
    expect(await verifyPackSignature(manifest, "not base64")).toBe(false);
  });
});

describe("verifyPackFiles", () => {
  const body = encoder.encode("export const x = 1;\n");

  it("passes when the bytes match", async () => {
    const manifest = await makeManifest();
    expect(await verifyPackFiles(manifest, async () => body)).toEqual([]);
  });

  it("reports a missing file", async () => {
    const manifest = await makeManifest();
    expect(await verifyPackFiles(manifest, async () => null)).toEqual([
      { path: "index.js", reason: "missing" },
    ]);
  });

  it("reports a size mismatch before hashing", async () => {
    const manifest = await makeManifest();
    // Deliberately a different length, so this exercises the size check rather than the hash.
    const wrong = encoder.encode("export const x = 1;");
    expect(await verifyPackFiles(manifest, async () => wrong)).toEqual([
      { path: "index.js", reason: "size" },
    ]);
  });

  it("reports a hash mismatch when the size matches", async () => {
    const manifest = await makeManifest();
    // Same length, different bytes.
    const swapped = new Uint8Array(body);
    swapped[0] = 0x61;
    expect(await verifyPackFiles(manifest, async () => swapped)).toEqual([
      { path: "index.js", reason: "hash" },
    ]);
  });
});

describe("packFitsHost", () => {
  it("accepts a pack built for this contract", async () => {
    expect(packFitsHost(await makeManifest(), { contractVersion: 1, hostVersion: 1 })).toEqual({
      ok: true,
    });
  });

  it("names an update when the pack wants a newer contract", async () => {
    const fit = packFitsHost(await makeManifest({ contractVersion: 9 }), {
      contractVersion: 1,
      hostVersion: 1,
    });
    expect(fit.ok).toBe(false);
    if (fit.ok) return;
    expect(fit.reason).toBe("contract");
    expect(fit.message).toContain("Update the app");
  });

  it("names a version when the pack needs a newer host", async () => {
    const fit = packFitsHost(await makeManifest({ minimumHostVersion: 3 }), {
      contractVersion: 1,
      hostVersion: 2,
    });
    expect(fit.ok).toBe(false);
    if (fit.ok) return;
    expect(fit.reason).toBe("host");
    expect(fit.message).toContain("3 or later");
  });
});
