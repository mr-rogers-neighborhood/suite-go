import type {
  CreateDocumentInput,
  DocumentRecord,
  DocumentStore,
  DocumentSummary,
  SaveDocumentInput,
} from "@suite/go";

/**
 * Opaque document storage, in IndexedDB.
 *
 * The container stores bytes and a name and never looks inside, which is why this
 * file has no import from any domain. On a phone there is no user-visible folder to
 * write into yet — the app sandbox is the location — so IndexedDB stands in for the
 * file the desktop apps own. When export and Android's document picker arrive, this
 * is the only file that changes; `DocumentStore` is the seam.
 */

const DB_NAME = "suite-go";
const DB_VERSION = 1;
const STORE = "documents";

interface StoredDocument {
  readonly id: string;
  readonly moduleId: string;
  readonly name: string;
  readonly title: string;
  readonly bytes: Uint8Array;
  readonly savedAt: number;
}

function requestOf<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb request failed"));
  });
}

async function openDatabase(): Promise<IDBDatabase> {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(STORE)) {
      const store = database.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("moduleId", "moduleId");
      store.createIndex("savedAt", "savedAt");
    }
  };
  return requestOf(request);
}

function summaryOf(document: StoredDocument): DocumentSummary {
  const { bytes: _bytes, ...summary } = document;
  return summary;
}

export function createDocumentStore(): DocumentStore {
  let database: Promise<IDBDatabase> | null = null;

  const db = () => {
    database ??= openDatabase();
    return database;
  };

  const read = async (id: string): Promise<StoredDocument | null> => {
    const handle = await db();
    const transaction = handle.transaction(STORE, "readonly");
    const result = await requestOf<StoredDocument | undefined>(
      transaction.objectStore(STORE).get(id),
    );
    return result ?? null;
  };

  const write = async (document: StoredDocument): Promise<void> => {
    const handle = await db();
    const transaction = handle.transaction(STORE, "readwrite");
    await requestOf(transaction.objectStore(STORE).put(document));
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("transaction failed"));
    });
  };

  return {
    async list(moduleId) {
      const handle = await db();
      const transaction = handle.transaction(STORE, "readonly");
      const all = await requestOf<StoredDocument[]>(transaction.objectStore(STORE).getAll());
      return all
        .filter((document) => (moduleId ? document.moduleId === moduleId : true))
        .sort((left, right) => right.savedAt - left.savedAt)
        .map(summaryOf);
    },

    async create(input: CreateDocumentInput): Promise<DocumentRecord> {
      const document: StoredDocument = {
        id: crypto.randomUUID(),
        moduleId: input.moduleId,
        name: input.name,
        title: "Untitled",
        bytes: new Uint8Array(0),
        savedAt: Date.now(),
      };
      await write(document);
      return { ...summaryOf(document), bytes: document.bytes };
    },

    async open(id: string): Promise<DocumentRecord | null> {
      const found = await read(id);
      if (!found) return null;
      // A copy, so a module mutating its buffer cannot rewrite what is on disk.
      return { ...summaryOf(found), bytes: new Uint8Array(found.bytes) };
    },

    async save(id: string, input: SaveDocumentInput): Promise<DocumentSummary> {
      const found = await read(id);
      if (!found) throw new Error(`no document ${id}`);
      const next: StoredDocument = {
        ...found,
        title: input.title ?? found.title,
        bytes: input.bytes,
        savedAt: Date.now(),
      };
      await write(next);
      return summaryOf(next);
    },

    async remove(id: string): Promise<void> {
      const handle = await db();
      const transaction = handle.transaction(STORE, "readwrite");
      await requestOf(transaction.objectStore(STORE).delete(id));
    },
  };
}
