import type { CaptureOutcome, ModuleHost } from "@suite/go";
import { createNote, type NoteDocument, openNote } from "./note.js";

/**
 * Everything Scratch does, without any React.
 *
 * Kept separate from the view so the lifecycle can be tested without a renderer:
 * loading, editing, the debounced save, a capture arriving before the note has
 * loaded, and — the one that matters — `dispose` actually stopping the timers and
 * subscriptions it started.
 */

/** Long enough to batch typing, short enough that a swipe away keeps the edit. */
const SAVE_DELAY_MS = 300;

export const SCRATCH_FILE_NAME = "Scratch.note";

export interface ScratchState {
  readonly status: "loading" | "ready" | "failed";
  readonly text: string;
  readonly documentId?: string;
  readonly error?: string;
}

export interface ScratchController {
  state(): ScratchState;
  /** Loads or creates the note. Memoized: two calls share one load. Constructing touches no storage. */
  start(): Promise<void>;
  subscribe(listener: () => void): () => void;
  /** Where the person is in the editor; the controller owns the document, not the caret. */
  setText(value: string): void;
  capture(body: string): Promise<CaptureOutcome>;
  /** Force the pending save now. Used on teardown and by tests. */
  flush(): Promise<void>;
  dispose(): Promise<void>;
}

export function createScratchController(host: ModuleHost): ScratchController {
  let state: ScratchState = { status: "loading", text: "" };
  let note: NoteDocument | null = null;
  let documentId: string | null = null;
  let unsubscribe: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;
  let disposed = false;
  let starting: Promise<void> | null = null;

  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const setState = (next: ScratchState) => {
    state = next;
    notify();
  };

  const save = async () => {
    if (!note || !documentId || disposed || !dirty) return;
    dirty = false;
    const bytes = note.snapshot();
    // The title comes from the module because the container cannot read a snapshot
    // to invent one — the point of an opaque document store.
    const text = note.text().trim();
    const title = text.length > 0 ? firstLine(text) : "Untitled";
    await host.documents.save(documentId, { title, bytes });
    // The container cannot derive a title from bytes, so the module reports it.
    host.recents.remember(documentId, title);
  };

  const flush = async () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    await save();
  };

  const schedule = () => {
    dirty = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void save();
    }, SAVE_DELAY_MS);
  };

  const start = () => {
    // StrictMode mounts twice in development, and a capture can arrive before the
    // view has rendered. One memoized load serves both.
    if (starting) return starting;
    starting = (async () => {
      try {
        const [existing] = await host.documents.list("scratch");
        let record = existing ? await host.documents.open(existing.id) : null;
        if (!record) {
          record = await host.documents.create({ moduleId: "scratch", name: SCRATCH_FILE_NAME });
        }
        if (disposed) return;

        documentId = record.id;
        note = record.bytes.length > 0 ? openNote(record.bytes) : createNote();
        unsubscribe = note.onChange(() => schedule());
        setState({ status: "ready", text: note.text(), documentId });
      } catch (error) {
        if (disposed) return;
        starting = null;
        setState({
          status: "failed",
          text: "",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
    return starting;
  };

  return {
    state: () => state,
    start,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    setText(value) {
      if (!note) return;
      note.setText(value);
      schedule();
      setState({ status: "ready", text: note.text(), ...(documentId ? { documentId } : {}) });
    },

    async capture(body) {
      // A share can land before the view has mounted, so wait for the load rather
      // than refusing the thing the person just did.
      await start();
      if (!note) {
        return { ok: false, reason: "failed", message: "The note could not be opened." };
      }
      note.append(body);
      schedule();
      setState({ status: "ready", text: note.text(), ...(documentId ? { documentId } : {}) });
      return documentId ? { ok: true, documentId } : { ok: true };
    },

    flush,

    async dispose() {
      // Save before marking disposed: the last edit should survive leaving, and
      // `save` refuses to run once disposed is set.
      await flush();
      disposed = true;
      unsubscribe?.();
      unsubscribe = null;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      listeners.clear();
    },
  };
}

function firstLine(text: string): string {
  const line = text.split("\n", 1)[0] ?? text;
  return line.length > 60 ? `${line.slice(0, 57)}…` : line;
}
