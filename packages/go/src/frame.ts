/**
 * The wire between the shell and a pack that renders in its own document.
 *
 * An `isolated` pack runs in an iframe: its own document, its own CSS scope, its own React.
 * It cannot call `ModuleHost` directly — the shell's objects are in another realm — so the same
 * surface goes over `postMessage`, one request at a time.
 *
 * The shape is deliberately the *same* `ModuleHost` vocabulary. A domain calls
 * `host.documents.save(...)` in either mode and does not know which one it is in; that is what
 * keeps a pack portable between them and what stops the contract from growing a second dialect.
 */
import type { ColorScheme, DocumentSummary, ThemeDensity } from "./host.js";

export const FRAME_PROTOCOL = "suite.frame.v1";

/** What a pack may ask the shell for. One name per `ModuleHost` operation it needs. */
export type FrameRequest =
  | { readonly method: "ready" }
  | { readonly method: "theme" }
  | { readonly method: "documents.list" }
  | { readonly method: "documents.create"; readonly name: string }
  | { readonly method: "documents.open"; readonly id: string }
  | { readonly method: "documents.save"; readonly id: string; readonly title?: string }
  | { readonly method: "documents.remove"; readonly id: string }
  | { readonly method: "storage.get"; readonly key: string }
  | { readonly method: "storage.set"; readonly key: string; readonly value: string }
  | { readonly method: "storage.delete"; readonly key: string }
  | { readonly method: "recents.remember"; readonly documentId: string; readonly title: string };

export interface FrameEnvelope {
  readonly protocol: typeof FRAME_PROTOCOL;
  readonly id: number;
  readonly request: FrameRequest;
  /** Present on document writes: base64, because bytes do not survive structured clone intact in every path. */
  readonly payload?: string;
}

/**
 * The answer body, before the envelope is attached.
 *
 * Declared separately because `Omit` over a discriminated union collapses to the keys both
 * branches share — which silently drops `value` and `message` and leaves every reply branch
 * unassignable.
 */
export type FrameAnswer =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly message: string };

export type FrameReply = FrameAnswer & {
  readonly protocol: typeof FRAME_PROTOCOL;
  readonly id: number;
};

export interface FrameTheme {
  readonly scheme: ColorScheme;
  readonly density: ThemeDensity;
  readonly variables: Readonly<Record<string, string>>;
}

/** What `documents.list` and `documents.open` answer with. `bytes` is base64 when present. */
export interface FrameDocument extends DocumentSummary {
  readonly bytes?: string;
}

/**
 * Is this message from the frame protocol at all?
 *
 * Checked before anything else touches a message: a page receives messages from anything that
 * holds a reference to it, and reading `request.method` off a stranger is how a typo becomes a
 * crash in a domain's mount.
 */
export function isFrameEnvelope(value: unknown): value is FrameEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.protocol !== FRAME_PROTOCOL) return false;
  if (typeof candidate.id !== "number") return false;
  if (typeof candidate.request !== "object" || candidate.request === null) return false;
  const request = candidate.request as Record<string, unknown>;
  return typeof request.method === "string";
}

export function isFrameReply(value: unknown): value is FrameReply {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.protocol === FRAME_PROTOCOL &&
    typeof candidate.id === "number" &&
    typeof candidate.ok === "boolean"
  );
}
