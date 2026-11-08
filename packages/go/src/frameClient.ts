/**
 * The pack's half of the frame bridge.
 *
 * A domain calls `host.documents.save(...)` exactly as it would in the shell's document; this
 * turns that into a request and awaits the answer. The vocabulary is `ModuleHost`'s on purpose —
 * a pack that had a different shape in each mode would be two integrations, not one.
 *
 * Requests are serialised through one promise chain rather than fired in parallel, because the
 * shell answers in order and a save that overtook the create it depends on would fail in a way
 * that reads like a storage bug.
 */

import {
  FRAME_PROTOCOL,
  type FrameReply,
  type FrameRequest,
  type FrameTheme,
  isFrameReply,
} from "./frame.js";
import type { DocumentRecord, ModuleHost, ThemeTokens } from "./host.js";

interface ReplyValue {
  readonly bytes?: string;
  readonly [key: string]: unknown;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export interface FrameHostOptions {
  readonly moduleId: string;
  /** The shell's window. Defaults to `window.parent`, which is why this only works in a frame. */
  readonly parent?: Window;
}

export function createFrameHost(
  options: FrameHostOptions,
): ModuleHost & { currentTheme(): Promise<ThemeTokens>; dispose(): void } {
  const parent = options.parent ?? globalThis.parent;
  const pending = new Map<number, (reply: FrameReply) => void>();
  let nextId = 1;
  let queue: Promise<unknown> = Promise.resolve();

  const listener = (event: MessageEvent) => {
    if (!isFrameReply(event.data)) return;
    const resolve = pending.get(event.data.id);
    if (!resolve) return;
    pending.delete(event.data.id);
    resolve(event.data);
  };
  globalThis.addEventListener("message", listener);

  const send = (request: FrameRequest, payload?: string): Promise<ReplyValue> => {
    const run = async (): Promise<ReplyValue> => {
      const id = nextId++;
      const answer = new Promise<FrameReply>((resolve) => pending.set(id, resolve));
      parent.postMessage(
        { protocol: FRAME_PROTOCOL, id, request, ...(payload === undefined ? {} : { payload }) },
        "*",
      );
      const reply = await answer;
      if (!reply.ok) throw new Error(reply.message);
      return (reply.value ?? {}) as ReplyValue;
    };
    // Serialised: one request in flight, in order.
    queue = queue.then(run, run);
    return queue as Promise<ReplyValue>;
  };

  const documents = {
    async list() {
      const value = await send({ method: "documents.list" });
      return (value as unknown as readonly DocumentRecord[]) ?? [];
    },
    async create(input: { name: string }) {
      const value = await send({ method: "documents.create", name: input.name });
      return { ...value, bytes: fromBase64(value.bytes ?? "") } as unknown as DocumentRecord;
    },
    async open(id: string) {
      const value = await send({ method: "documents.open", id });
      if (Object.keys(value).length === 0) return null;
      return { ...value, bytes: fromBase64(value.bytes ?? "") } as unknown as DocumentRecord;
    },
    async save(id: string, input: { title?: string; bytes: Uint8Array }) {
      const value = await send(
        {
          method: "documents.save",
          id,
          ...(input.title === undefined ? {} : { title: input.title }),
        },
        toBase64(input.bytes),
      );
      return value as never;
    },
    async remove(id: string) {
      await send({ method: "documents.remove", id });
    },
  };

  return {
    moduleId: options.moduleId,
    documents,
    storage: {
      async get(key) {
        const value = await send({ method: "storage.get", key });
        return typeof value === "string" ? value : null;
      },
      async set(key, value) {
        await send({ method: "storage.set", key, value });
      },
      async delete(key) {
        await send({ method: "storage.delete", key });
      },
      async keys() {
        return [];
      },
    },
    navigation: {
      setTitle: () => undefined,
      close: () => undefined,
    },
    recents: {
      remember: (documentId, title) => {
        void send({ method: "recents.remember", documentId, title });
      },
      forget: () => undefined,
    },
    files: {
      // Nothing in the frame bridge carries a file yet. Answering `null` and a refusal is
      // honest; silently succeeding would be worse than a disabled control.
      pickOpen: async () => null,
      write: async () => {
        throw new Error("Files are not available inside a frame yet.");
      },
      share: async () => ({
        ok: false,
        reason: "failed",
        message: "Files are not available inside a frame yet.",
      }),
    },
    // The painted values live in the shell; `currentTheme()` asks for them. This static copy is
    // what a domain reads after awaiting it, so nothing has to remember to refresh.
    theme: { scheme: "light", density: "comfortable", cssVariables: {} },
    async currentTheme() {
      const value = (await send({ method: "theme" })) as unknown as FrameTheme;
      return { scheme: value.scheme, density: value.density, cssVariables: value.variables };
    },
    dispose() {
      globalThis.removeEventListener("message", listener);
      pending.clear();
    },
  };
}
