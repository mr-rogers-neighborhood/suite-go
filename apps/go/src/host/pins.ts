import type { KeyValueStore, SuiteGoModuleId } from "@suite/go";

/**
 * A person's own order for the domain tiles.
 *
 * Pinning is a shell concern, not a module one: the container decides what the home
 * screen shows first, and a module that could pin itself would be reaching into the
 * container's layout — the entanglement the whole design avoids.
 *
 * An id that no longer matches a registered module is kept rather than dropped. A
 * domain removed and re-added should return to where it was, and a stale entry
 * costs one filtered comparison.
 */

const KEY = "order";

export interface Pins {
  /** Ids in the person's order. Modules not listed here follow, in registry order. */
  list(): Promise<readonly SuiteGoModuleId[]>;
  set(ids: readonly SuiteGoModuleId[]): Promise<void>;
}

export function createPins(store: KeyValueStore): Pins {
  return {
    async list() {
      const raw = await store.get(KEY);
      if (!raw) return [];
      try {
        const value: unknown = JSON.parse(raw);
        return Array.isArray(value)
          ? value.filter((id): id is string => typeof id === "string")
          : [];
      } catch {
        return [];
      }
    },
    async set(ids) {
      await store.set(KEY, JSON.stringify(ids));
    },
  };
}

/**
 * The order the home screen renders: pinned first, in the person's order, then the
 * rest in registry order.
 */
export function orderModules<T extends { readonly id: string }>(
  modules: readonly T[],
  pinned: readonly string[],
): readonly T[] {
  const byId = new Map(modules.map((module) => [module.id, module]));
  const ordered: T[] = [];
  for (const id of pinned) {
    const module = byId.get(id);
    if (module) {
      ordered.push(module);
      byId.delete(id);
    }
  }
  return [...ordered, ...modules.filter((module) => byId.has(module.id))];
}
