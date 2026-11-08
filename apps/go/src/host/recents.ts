import type { KeyValueStore, SuiteGoModuleId } from "@suite/go";

/**
 * What a person opened last, across modules.
 *
 * This belongs to the shell rather than to any module because "the thing I opened
 * last" spans domains — the same reason Suite Start keeps its own recents list
 * beside each app's. The title was supplied by the module that saved the document;
 * the shell cannot derive one from bytes and must not try.
 */
export interface RecentEntry {
  readonly documentId: string;
  readonly moduleId: SuiteGoModuleId;
  readonly title: string;
  readonly openedAt: number;
}

/** Enough to see a week of work, short enough to scan on a phone. */
export const RECENT_LIMIT = 12;

const KEY = "list";

export interface Recents {
  list(): Promise<readonly RecentEntry[]>;
  remember(entry: Omit<RecentEntry, "openedAt">): Promise<void>;
  forget(documentId: string): Promise<void>;
}

function parse(raw: string | null): RecentEntry[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter(isEntry);
  } catch {
    // A recents list that will not parse is an empty list, never an error: a home
    // screen that refuses to start over its own history is worse than one that
    // has forgotten it.
    return [];
  }
}

function isEntry(value: unknown): value is RecentEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.documentId === "string" &&
    typeof entry.moduleId === "string" &&
    typeof entry.title === "string" &&
    typeof entry.openedAt === "number"
  );
}

export function createRecents(store: KeyValueStore): Recents {
  return {
    async list() {
      const entries = parse(await store.get(KEY));
      return entries.sort((left, right) => right.openedAt - left.openedAt).slice(0, RECENT_LIMIT);
    },

    async remember(entry) {
      const existing = parse(await store.get(KEY)).filter(
        (candidate) => candidate.documentId !== entry.documentId,
      );
      const next = [{ ...entry, openedAt: Date.now() }, ...existing].slice(0, RECENT_LIMIT);
      await store.set(KEY, JSON.stringify(next));
    },

    async forget(documentId) {
      const remaining = parse(await store.get(KEY)).filter(
        (candidate) => candidate.documentId !== documentId,
      );
      await store.set(KEY, JSON.stringify(remaining));
    },
  };
}
