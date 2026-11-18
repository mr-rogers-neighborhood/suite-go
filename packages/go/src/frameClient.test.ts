import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FRAME_PROTOCOL, type FrameEnvelope } from "./frame.js";
import { createFrameHost } from "./frameClient.js";

/**
 * What a pack actually asks the shell for.
 *
 * These tests exist because of a shipped bug: `documents.list()` took a `moduleId` and dropped it
 * on the way to the wire, so a pack asking for its own documents received every domain's. A caller
 * then opened the first one and got somebody else's file. The type was right; the wire was not, and
 * neither the pack nor the shell could see it from their own side.
 */

type Listener = (event: { data: unknown }) => void;

let listeners: Set<Listener>;
let sent: FrameEnvelope[];

beforeEach(() => {
  listeners = new Set();
  sent = [];
  // Node has no `globalThis.addEventListener`, and the client installs its reply listener there.
  (globalThis as unknown as { addEventListener: unknown }).addEventListener = (
    _type: string,
    listener: Listener,
  ) => listeners.add(listener);
  (globalThis as unknown as { removeEventListener: unknown }).removeEventListener = (
    _type: string,
    listener: Listener,
  ) => listeners.delete(listener);
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "addEventListener");
  Reflect.deleteProperty(globalThis, "removeEventListener");
});

/** Answer the next request the way the shell would. */
function answerWith(value: unknown): void {
  const last = sent.at(-1);
  if (last === undefined) throw new Error("nothing was sent");
  const reply = { protocol: FRAME_PROTOCOL, id: last.id, ok: true, value };
  // Delivered on the next turn, as a real `postMessage` would be.
  queueMicrotask(() => {
    for (const listener of listeners) listener({ data: reply });
  });
}

function frameHost(requestTimeoutMs?: number) {
  const parent = {
    postMessage: (envelope: FrameEnvelope) => {
      sent.push(envelope);
    },
  } as unknown as Window;
  return createFrameHost({
    moduleId: "planner",
    parent,
    ...(requestTimeoutMs === undefined ? {} : { requestTimeoutMs }),
  });
}

describe("the pack's half of the frame bridge", () => {
  it("carries the module id when a pack asks for one domain's documents", async () => {
    const host = frameHost();
    const pending = host.documents.list("planner");
    await Promise.resolve();
    answerWith([]);
    await pending;

    expect(sent.at(-1)?.request).toEqual({ method: "documents.list", moduleId: "planner" });
  });

  it("omits the module id for the recents query, which spans domains", async () => {
    const host = frameHost();
    const pending = host.documents.list();
    await Promise.resolve();
    answerWith([]);
    await pending;

    expect(sent.at(-1)?.request).toEqual({ method: "documents.list" });
  });

  it("decodes a document's bytes from base64 rather than handing back a string", async () => {
    // A string that reached `LoroDoc.fromSnapshot` was the visible symptom: "Invalid import data".
    const host = frameHost();
    const pending = host.documents.open("doc-1");
    await Promise.resolve();
    answerWith({ id: "doc-1", moduleId: "planner", bytes: "aGVsbG8=" });
    const record = await pending;

    expect(record?.bytes).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(record?.bytes)).toBe("hello");
  });
});

describe("a request the shell never answers", () => {
  it("is rejected, rather than waiting forever", async () => {
    // Requests are serialised through one chain, so an unanswered one used to stall every later
    // request including the debounced save. A reply is dropped when the frame's window is gone,
    // which makes this reachable rather than theoretical.
    const host = frameHost(20);
    await expect(host.documents.list("planner")).rejects.toThrow(/did not answer documents\.list/u);
  });

  it("names the method, so a log says which call hung", async () => {
    const host = frameHost(20);
    // `moduleId` is in the type because the host surface carries it, and the bridge drops it on the
    // way out: the shell already knows which module it is serving.
    await expect(
      host.documents.create({ moduleId: "planner", name: "Planner.planner" }),
    ).rejects.toThrow(/documents\.create/u);
  });

  it("lets the queue continue after one request fails", async () => {
    const host = frameHost(20);
    const stalled = host.documents.list("planner");
    // Answer the *second* request while the first is still waiting, then let the first expire.
    const recovered = host.storage.get("k").then(
      (value) => `resolved:${String(value)}`,
      (error: Error) => `rejected:${error.message}`,
    );
    await expect(stalled).rejects.toThrow(/did not answer/u);
    await Promise.resolve();
    const next = sent.at(-1);
    if (next === undefined) throw new Error("nothing was sent");
    queueMicrotask(() => {
      for (const listener of listeners) {
        listener({ data: { protocol: FRAME_PROTOCOL, id: next.id, ok: true, value: "v" } });
      }
    });
    // The chain recovers: the next request is answered normally.
    expect(await recovered).toBe("resolved:v");
  });

  it("rejects everything pending when the module is released", async () => {
    const host = frameHost(10_000);
    const pendingCall = host.documents.list("planner");
    await Promise.resolve();
    host.dispose();
    await expect(pendingCall).rejects.toThrow(/released this module/u);
  });
});
