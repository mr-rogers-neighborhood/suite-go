import { LoroDoc } from "loro-crdt";

/**
 * The reference module's document: one text, in a real Loro snapshot.
 *
 * This file exists for three reasons, in order of importance. It proves Loro's WASM
 * loads and persists inside an Android WebView, which is the assumption most likely
 * to sink the Capacitor choice. It proves a module can round-trip bytes through the
 * container's opaque `DocumentStore`. And it gives the teardown test something real
 * to release.
 *
 * When a real domain arrives, this file is deleted.
 */

const BODY = "body";

/** A replica must not keep the peer id baked into a snapshot, or its first edit collides. */
function randomPeerId(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let id = 0n;
  for (const byte of bytes) id = (id << 8n) | BigInt(byte);
  return id;
}

export interface NoteDocument {
  text(): string;
  /** Replace the whole note. Used by the editor, which owns the caret. */
  setText(value: string): void;
  /** Add a capture on its own line. */
  append(body: string): void;
  snapshot(): Uint8Array;
  /** Fires after any local edit, so the controller knows to save. */
  onChange(listener: () => void): () => void;
}

export function createNote(): NoteDocument {
  return wrap(new LoroDoc());
}

export function openNote(snapshot: Uint8Array): NoteDocument {
  const parsed = LoroDoc.fromSnapshot(snapshot);
  parsed.setPeerId(randomPeerId());
  return wrap(parsed);
}

function wrap(doc: LoroDoc): NoteDocument {
  const body = () => doc.getText(BODY);

  return {
    text: () => body().toString(),

    setText(value) {
      const current = body();
      current.delete(0, current.length);
      current.insert(0, value);
      doc.commit();
    },

    append(value) {
      const current = body();
      const existing = current.toString();
      const insert = existing.length > 0 ? `\n${value}` : value;
      current.insert(existing.length, insert);
      doc.commit();
    },

    snapshot() {
      doc.commit();
      return doc.export({ mode: "snapshot" });
    },

    onChange(listener) {
      const subscription = doc.subscribe(() => listener());
      return () => subscription();
    },
  };
}
