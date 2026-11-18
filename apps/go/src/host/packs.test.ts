import { bytesToBase64, canonicalManifestBytes, type PackManifest } from "@suite/go";
import { describe, expect, it, vi } from "vitest";

/**
 * A pack that does not declare `network` has to be refused or not offered.
 *
 * Two paths, and the second is the one that is easy to forget: `install` refuses an arriving pack, and
 * `discover` must not offer one that was installed before the rule existed. Testing only the first
 * would leave a pack on disk that the app happily lists forever.
 */

/** What is "on disk", in the shape the Filesystem plugin would hand back. */
const disk = new Map<string, Uint8Array>();

vi.mock("@capacitor/filesystem", () => ({
  Directory: { Data: "DATA" },
  Filesystem: {
    async readdir({ path }: { path: string }) {
      const prefix = `${path}/`;
      const names = new Set<string>();
      for (const key of disk.keys()) {
        if (!key.startsWith(prefix)) continue;
        names.add(key.slice(prefix.length).split("/")[0] as string);
      }
      if (names.size === 0) throw new Error("no such directory");
      return { files: [...names].map((name) => ({ name })) };
    },
    async readFile({ path }: { path: string }) {
      const bytes = disk.get(path);
      if (bytes === undefined) throw new Error(`no file ${path}`);
      return { data: bytesToBase64(bytes) };
    },
    async writeFile({ path, data }: { path: string; data: string }) {
      disk.set(
        path,
        Uint8Array.from(atob(data), (c) => c.charCodeAt(0)),
      );
    },
    async getUri({ path }: { path: string }) {
      return { uri: `file:///data/user/0/app/files/${path}` };
    },
    async mkdir() {},
    async rmdir({ path }: { path: string }) {
      for (const key of [...disk.keys()]) {
        if (key === path || key.startsWith(`${path}/`)) disk.delete(key);
      }
    },
  },
}));

// `packArchive` and `manifestFiles` are the writer half of the same store, which is the point: the
// test builds its packs with the app's own code rather than a second implementation of the format.
const { createPackStore, manifestFiles, packArchive } = await import("./packs.js");

const encoder = new TextEncoder();

/** A keypair for this file, so nothing depends on the key baked into the app. */
const pair = await (async () => {
  const keys = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", keys.publicKey));
  return { keys, publicKey: bytesToBase64(raw) };
})();

async function signedManifest(
  html: string,
  capabilities: PackManifest["capabilities"] = ["documents"],
): Promise<{ manifest: PackManifest; files: Record<string, Uint8Array> }> {
  const files = { "index.html": encoder.encode(html) };
  const core = {
    format: "suite.pack" as const,
    id: "probe",
    name: "Probe",
    version: "1.0.0",
    entry: "index.html",
    contractVersion: 1,
    independent: false,
    isolation: "isolated" as const,
    capabilities,
    files: await manifestFiles(files),
  };
  const signature = await crypto.subtle.sign(
    { name: "Ed25519" },
    pair.keys.privateKey,
    canonicalManifestBytes(core) as BufferSource,
  );
  return {
    manifest: { ...core, signature: bytesToBase64(new Uint8Array(signature)) },
    files,
  };
}

const sealed = `<!doctype html><meta http-equiv="Content-Security-Policy"
  content="default-src 'self'; connect-src 'self'"><div id="root"></div>`;
const unsealed = '<!doctype html><div id="root"></div>';

function store() {
  return createPackStore({ publicKey: pair.publicKey, contractVersion: 1, hostVersion: 1 });
}

describe("the network rule, through the pack store", () => {
  it("installs a pack that seals the network itself", async () => {
    disk.clear();
    const { manifest, files } = await signedManifest(sealed);
    const outcome = await store().install(packArchive(manifest, files));
    expect(outcome).toMatchObject({ ok: true });
  });

  it("refuses a pack that does not, and names what is missing", async () => {
    disk.clear();
    const { manifest, files } = await signedManifest(unsealed);
    const outcome = await store().install(packArchive(manifest, files));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("policy");
      expect(outcome.message).toContain("connect-src");
    }
    // Nothing was written, so the refusal is not a half-install.
    expect([...disk.keys()].some((key) => key.includes("packs/"))).toBe(false);
  });

  it("installs an unsealed pack that declares the capability", async () => {
    disk.clear();
    const { manifest, files } = await signedManifest(unsealed, ["documents", "network"]);
    expect(await store().install(packArchive(manifest, files))).toMatchObject({ ok: true });
  });

  it("does not offer a pack already on disk that fails the rule", async () => {
    // The case install-time checking cannot reach: installed by an older build, or left over from
    // before the rule existed. It has a valid signature and must still not appear.
    disk.clear();
    const { manifest, files } = await signedManifest(unsealed);
    const dir = `packs/probe/1.0.0`;
    disk.set(`${dir}/manifest.json`, encoder.encode(JSON.stringify(manifest)));
    for (const [path, bytes] of Object.entries(files)) disk.set(`${dir}/${path}`, bytes);

    const discovered = await store().discover();
    expect(discovered).toEqual([]);
  });

  it("offers a sealed pack already on disk", async () => {
    disk.clear();
    const { manifest, files } = await signedManifest(sealed);
    const dir = `packs/probe/1.0.0`;
    disk.set(`${dir}/manifest.json`, encoder.encode(JSON.stringify(manifest)));
    for (const [path, bytes] of Object.entries(files)) disk.set(`${dir}/${path}`, bytes);

    const discovered = await store().discover();
    expect(discovered).toHaveLength(1);
    expect(discovered[0]?.entryUrl).toContain("/packs/probe/1.0.0/index.html");
  });
});
