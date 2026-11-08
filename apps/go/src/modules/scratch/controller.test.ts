import type {
  DocumentRecord,
  DocumentStore,
  DocumentSummary,
  ModuleHost,
  SaveDocumentInput,
} from "@suite/go";
import { describe, expect, it, vi } from "vitest";
import { createScratchController } from "./controller.js";

/** A document store in a Map, so the lifecycle can be observed without IndexedDB. */
function memoryStore() {
  const documents = new Map<string, DocumentRecord>();
  const saves: SaveDocumentInput[] = [];

  const store: DocumentStore = {
    async list(moduleId) {
      return [...documents.values()]
        .filter((document) => (moduleId ? document.moduleId === moduleId : true))
        .map(({ bytes: _bytes, ...summary }) => summary);
    },
    async create(input) {
      const document: DocumentRecord = {
        id: `doc-${documents.size + 1}`,
        moduleId: input.moduleId,
        name: input.name,
        title: "Untitled",
        savedAt: Date.now(),
        bytes: new Uint8Array(0),
      };
      documents.set(document.id, document);
      return document;
    },
    async open(id) {
      return documents.get(id) ?? null;
    },
    async save(id, input) {
      const found = documents.get(id);
      if (!found) throw new Error("missing");
      saves.push(input);
      const next = { ...found, title: input.title ?? found.title, bytes: input.bytes };
      documents.set(id, next);
      return summary(next);
    },
    async remove(id) {
      documents.delete(id);
    },
  };

  return { store, documents, saves };
}

function summary(document: DocumentRecord): DocumentSummary {
  const { bytes: _bytes, ...rest } = document;
  return rest;
}

function hostWith(store: DocumentStore) {
  const remembered: string[] = [];
  const host: ModuleHost = {
    moduleId: "scratch",
    documents: store,
    storage: {
      get: async () => null,
      set: async () => undefined,
      delete: async () => undefined,
      keys: async () => [],
    },
    navigation: { setTitle: () => undefined, close: () => undefined },
    recents: {
      remember: (_documentId, title) => void remembered.push(title),
      forget: () => undefined,
    },
    theme: { scheme: "light", density: "comfortable", cssVariables: {} },
  };
  return { host, remembered };
}

describe("scratch controller", () => {
  it("creates a document on first start and reports ready", async () => {
    const { store, documents } = memoryStore();
    const { host } = hostWith(store);
    const controller = createScratchController(host);

    await controller.start();

    expect(controller.state().status).toBe("ready");
    expect(documents.size).toBe(1);
    expect(controller.state().documentId).toBe("doc-1");
  });

  it("loads the existing document rather than making a second one", async () => {
    const { store, documents } = memoryStore();
    const { host } = hostWith(store);
    const first = createScratchController(host);
    await first.start();
    first.setText("survives a remount");
    await first.dispose();

    const second = createScratchController(host);
    await second.start();

    expect(documents.size).toBe(1);
    expect(second.state().text).toBe("survives a remount");
  });

  it("saves the text with a title the container could not have derived", async () => {
    const { store, saves } = memoryStore();
    const { host, remembered } = hostWith(store);
    const controller = createScratchController(host);

    await controller.start();
    controller.setText("call the plumber\nbefore noon");
    await controller.flush();

    expect(saves.at(-1)?.title).toBe("call the plumber");
    expect(remembered.at(-1)).toBe("call the plumber");
  });

  it("accepts a capture that arrives before the view has started", async () => {
    const { store } = memoryStore();
    const { host } = hostWith(store);
    const controller = createScratchController(host);

    const outcome = await controller.capture("https://example.com");

    expect(outcome.ok).toBe(true);
    expect(controller.state().text).toBe("https://example.com");
  });

  it("stops saving after dispose, even if something still holds the controller", async () => {
    const { store, saves } = memoryStore();
    const { host } = hostWith(store);
    const controller = createScratchController(host);
    await controller.start();
    controller.setText("before");
    await controller.dispose();

    const afterDispose = saves.length;
    controller.setText("after");
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(saves.length).toBe(afterDispose);
  });

  it("reports a failure instead of throwing when the store is broken", async () => {
    const { store } = memoryStore();
    store.list = async () => {
      throw new Error("indexeddb is gone");
    };
    const { host } = hostWith(store);
    const controller = createScratchController(host);

    await controller.start();

    expect(controller.state().status).toBe("failed");
    expect(controller.state().error).toBe("indexeddb is gone");
  });

  it("unsubscribes from the document on dispose", async () => {
    const { store } = memoryStore();
    const { host } = hostWith(store);
    const controller = createScratchController(host);
    await controller.start();

    const listener = vi.fn();
    controller.subscribe(listener);
    await controller.dispose();
    controller.setText("nobody is listening");

    expect(listener).not.toHaveBeenCalled();
  });
});
