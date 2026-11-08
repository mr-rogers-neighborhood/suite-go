import type { DocumentSummary, FrameAnswer, FrameRequest, FrameTheme, ModuleHost } from "@suite/go";
import { FRAME_PROTOCOL, isFrameEnvelope } from "@suite/go";

/**
 * The shell's half of the frame bridge.
 *
 * One listener, one switch on `request.method`, one reply per envelope. Every branch answers
 * with the same `ModuleHost` call the shell's in-document modules use, so a domain gets the same
 * behaviour in either mode — and a method the shell has not implemented answers an honest
 * failure rather than `undefined`.
 */

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

export interface FrameBridgeOptions {
  readonly host: ModuleHost;
  readonly theme: () => FrameTheme;
  /** Where replies go. The iframe's `contentWindow`. */
  readonly target: () => Window | null;
}

export function serveFrame(options: FrameBridgeOptions): () => void {
  const handle = async (event: MessageEvent): Promise<void> => {
    if (!isFrameEnvelope(event.data)) return;
    const envelope = event.data;
    const reply = await answer(envelope.request, options, envelope.payload);
    const window = options.target();
    if (!window) return;
    window.postMessage({ ...reply, protocol: FRAME_PROTOCOL, id: envelope.id }, "*");
  };

  const listener = (event: MessageEvent) => {
    // Answers are asynchronous on purpose: a domain that awaits a save should not block its
    // own render, and the shell may be reading IndexedDB.
    void handle(event);
  };

  globalThis.addEventListener("message", listener);
  return () => globalThis.removeEventListener("message", listener);
}

async function answer(
  request: FrameRequest,
  options: FrameBridgeOptions,
  payload: string | undefined,
): Promise<FrameAnswer> {
  const { host } = options;

  try {
    switch (request.method) {
      case "ready":
        return { ok: true, value: { moduleId: host.moduleId } };

      case "theme":
        return { ok: true, value: options.theme() };

      case "documents.list": {
        const list: readonly DocumentSummary[] = await host.documents.list();
        return { ok: true, value: list };
      }

      case "documents.create": {
        const created = await host.documents.create({
          moduleId: host.moduleId,
          name: request.name,
        });
        return {
          ok: true,
          value: { ...created, bytes: toBase64(created.bytes) },
        };
      }

      case "documents.open": {
        const opened = await host.documents.open(request.id);
        if (!opened) return { ok: true, value: null };
        return { ok: true, value: { ...opened, bytes: toBase64(opened.bytes) } };
      }

      case "documents.save": {
        if (payload === undefined) {
          return { ok: false, message: "documents.save needs a payload" };
        }
        const saved = await host.documents.save(request.id, {
          bytes: fromBase64(payload),
          ...(request.title === undefined ? {} : { title: request.title }),
        });
        return { ok: true, value: saved };
      }

      case "documents.remove":
        await host.documents.remove(request.id);
        return { ok: true, value: null };

      case "storage.get":
        return { ok: true, value: await host.storage.get(request.key) };

      case "storage.set":
        await host.storage.set(request.key, request.value);
        return { ok: true, value: null };

      case "storage.delete":
        await host.storage.delete(request.key);
        return { ok: true, value: null };

      case "recents.remember":
        host.recents.remember(request.documentId, request.title);
        return { ok: true, value: null };

      default: {
        // A pack built against a newer protocol asks something this shell does not know.
        // Saying so beats answering `undefined` and letting the domain fail later.
        const unreachable: never = request;
        return { ok: false, message: `unknown method ${JSON.stringify(unreachable)}` };
      }
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
