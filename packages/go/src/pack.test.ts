import { beforeEach, describe, expect, it } from "vitest";
import {
  bytesToBase64,
  canonicalManifestBytes,
  checkNetworkPolicy,
  isSafePackPath,
  type PackManifest,
  packAllows,
  packDocumentSealsNetwork,
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
  const body = encoder.encode("<!doctype html><title>pack</title>\n");
  const core = {
    format: "suite.pack" as const,
    id: "probe",
    name: "Probe",
    version: "1.0.0",
    entry: "index.html",
    contractVersion: 1,
    independent: false,
    isolation: "isolated" as const,
    capabilities: [] as const,
    files: [{ path: "index.html", sha256: await sha256Hex(body), bytes: body.byteLength }],
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
    const file = { path: "index.html", sha256: "a".repeat(64), bytes: 1 };
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
  it("defaults to isolated when the manifest does not say", async () => {
    const { isolation: _drop, ...without } = await makeManifest();
    const parsed = parsePackManifest(without);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.isolation).toBe("isolated");
  });

  it("refuses the withdrawn shared mode and says what to do", async () => {
    const parsed = parsePackManifest(await makeManifest({ isolation: "shared" }));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    const issue = parsed.issues.find((candidate) => candidate.path === "isolation");
    expect(issue?.message).toContain("withdrawn");
    expect(issue?.message).toContain("own document");
  });

  it("refuses an isolated pack whose entry is not an HTML document", async () => {
    const js = encoder.encode("export const x = 1;\n");
    const parsed = parsePackManifest(
      await makeManifest({
        entry: "index.js",
        files: [{ path: "index.js", sha256: await sha256Hex(js), bytes: js.byteLength }],
      }),
    );
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

  it("refuses a mode it does not know", async () => {
    const parsed = parsePackManifest({
      ...(await makeManifest()),
      isolation: "sandboxed",
    } as unknown as ReturnType<typeof makeManifest>);
    expect(parsed.ok).toBe(false);
  });

  it("is covered by the signature, so a mode cannot be swapped after signing", async () => {
    const manifest = await makeManifest();
    const swapped: PackManifest = { ...manifest, isolation: "shared" };
    expect(await verifyPackSignature(swapped, publicKeyBase64)).toBe(false);
  });
});

describe("capabilities", () => {
  it("grants nothing when the manifest does not say", async () => {
    const { capabilities: _drop, ...without } = await makeManifest();
    const parsed = parsePackManifest(without);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.capabilities).toEqual([]);
    expect(packAllows(parsed.value, "documents")).toBe(false);
  });

  it("accepts known capabilities and grants exactly those", async () => {
    const parsed = parsePackManifest(
      await makeManifest({ capabilities: ["documents", "storage"] as const }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(packAllows(parsed.value, "documents")).toBe(true);
    expect(packAllows(parsed.value, "storage")).toBe(true);
    expect(packAllows(parsed.value, "files")).toBe(false);
  });

  it("refuses a capability the host does not know", async () => {
    const parsed = parsePackManifest(await makeManifest({ capabilities: ["root"] as never }));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.issues.some((issue) => issue.path.startsWith("capabilities"))).toBe(true);
  });

  it("refuses a duplicate capability", async () => {
    const parsed = parsePackManifest(
      await makeManifest({ capabilities: ["documents", "documents"] as const }),
    );
    expect(parsed.ok).toBe(false);
  });

  it("is covered by the signature, so a capability cannot be added after signing", async () => {
    const manifest = await makeManifest({ capabilities: ["documents"] as const });
    const escalated: PackManifest = {
      ...manifest,
      capabilities: ["documents", "files"] as const,
    };
    expect(await verifyPackSignature(escalated, publicKeyBase64)).toBe(false);
  });
});

describe("canonicalManifestBytes", () => {
  it("does not depend on the order the fields were written in", async () => {
    const manifest = await makeManifest();
    const reordered = {
      isolation: manifest.isolation,
      capabilities: manifest.capabilities,
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
  const body = encoder.encode("<!doctype html><title>pack</title>\n");

  it("passes when the bytes match", async () => {
    const manifest = await makeManifest();
    expect(await verifyPackFiles(manifest, async () => body)).toEqual([]);
  });

  it("reports a missing file", async () => {
    const manifest = await makeManifest();
    expect(await verifyPackFiles(manifest, async () => null)).toEqual([
      { path: "index.html", reason: "missing" },
    ]);
  });

  it("reports a size mismatch before hashing", async () => {
    const manifest = await makeManifest();
    // Deliberately a different length, so this exercises the size check rather than the hash.
    const wrong = encoder.encode("<!doctype html>");
    expect(await verifyPackFiles(manifest, async () => wrong)).toEqual([
      { path: "index.html", reason: "size" },
    ]);
  });

  it("reports a hash mismatch when the size matches", async () => {
    const manifest = await makeManifest();
    // Same length, different bytes.
    const swapped = new Uint8Array(body);
    swapped[0] = 0x61;
    expect(await verifyPackFiles(manifest, async () => swapped)).toEqual([
      { path: "index.html", reason: "hash" },
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

describe("the network a pack did not ask for", () => {
  const sealed = `<!doctype html><head>
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'none'">
  </head></html>`;

  it("reads a policy that closes every fetch path", () => {
    expect(packDocumentSealsNetwork(sealed)).toBe(true);
  });

  it("accepts connect-src 'self', which a pack needs to load its own wasm", () => {
    // Measured on a device: with `connect-src 'none'` a Loro pack renders a blank frame, because
    // wasm-bindgen fetches its `.wasm` same-origin. 'self' still cannot reach a remote origin.
    expect(
      packDocumentSealsNetwork(
        `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self'">`,
      ),
    ).toBe(true);
  });

  it("refuses a connect-src that names a remote origin", () => {
    expect(
      packDocumentSealsNetwork(
        `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self' https://api.example">`,
      ),
    ).toBe(false);
  });

  it("refuses a policy with no connect-src, which leaves fetch open", () => {
    expect(
      packDocumentSealsNetwork(
        `<meta http-equiv="Content-Security-Policy" content="default-src 'self'">`,
      ),
    ).toBe(false);
  });

  it("refuses a policy with no default-src, because img-src would inherit nothing", () => {
    // The subtler half: `connect-src 'none'` closes fetch, but `<img src="https://elsewhere/">`
    // is governed by img-src, which falls back to default-src, which is absent here.
    expect(
      packDocumentSealsNetwork(
        `<meta http-equiv="Content-Security-Policy" content="connect-src 'none'">`,
      ),
    ).toBe(false);
  });

  it("refuses a permissive default-src rather than interpreting it", () => {
    for (const permissive of ["*", "'self' https://api.example", "https:", "'unsafe-inline'"]) {
      expect(
        packDocumentSealsNetwork(
          `<meta http-equiv="Content-Security-Policy" content="default-src ${permissive}; connect-src 'none'">`,
        ),
      ).toBe(false);
    }
  });

  it("finds the policy among other meta tags", () => {
    // A pack's head is not one tag; the policy is found wherever it sits.
    const html = [
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width">',
      `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'none'">`,
    ].join("");
    expect(packDocumentSealsNetwork(html)).toBe(true);
  });

  it("refuses a policy written with entities, rather than decoding it", () => {
    // `&#39;self&#39;` is what a template system emits when it escapes quotes. It is refused
    // rather than unescaped: the rule is a line a person can audit, and a checker that
    // decodes here is a checker with a second parser to get wrong.
    const escaped = `<meta http-equiv="Content-Security-Policy" content="default-src &#39;self&#39;; connect-src &#39;none&#39;">`;
    expect(packDocumentSealsNetwork(escaped)).toBe(false);
  });

  it("accepts a manifest that declares the capability, policy or not", async () => {
    const manifest = await makeManifest({ capabilities: ["documents", "network"] });
    expect(checkNetworkPolicy(manifest, {})).toEqual({ ok: true });
  });

  it("refuses an undeclared pack whose entry does not seal the network", async () => {
    const manifest = await makeManifest({ capabilities: ["documents"] });
    const result = checkNetworkPolicy(manifest, {
      "index.html": encoder.encode("<!doctype html><title>pack</title>"),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('does not declare the "network" capability');
      expect(result.message).toContain("connect-src 'none'");
    }
  });

  it("accepts an undeclared pack that seals it", async () => {
    const manifest = await makeManifest({ capabilities: ["documents"] });
    expect(checkNetworkPolicy(manifest, { "index.html": encoder.encode(sealed) })).toEqual({
      ok: true,
    });
  });

  it("refuses an undeclared pack whose entry is missing, rather than passing it", async () => {
    const manifest = await makeManifest({ capabilities: ["documents"] });
    expect(checkNetworkPolicy(manifest, {}).ok).toBe(false);
  });
});
