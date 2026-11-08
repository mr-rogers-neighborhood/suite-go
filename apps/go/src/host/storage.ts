import type { KeyValueStore } from "@suite/go";

/**
 * Persisted values for one module, with the shell owning the namespace.
 *
 * `localStorage` rather than Capacitor Preferences: the data is small, it is not a
 * secret, and a synchronous API keeps the controller readable. A module cannot
 * escape its namespace because it never sees the prefix.
 */
export function createKeyValueStore(namespace: string): KeyValueStore {
  const prefix = `suite-go:${namespace}:`;

  return {
    async get(key) {
      return localStorage.getItem(prefix + key);
    },
    async set(key, value) {
      localStorage.setItem(prefix + key, value);
    },
    async delete(key) {
      localStorage.removeItem(prefix + key);
    },
    async keys() {
      const found: string[] = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key?.startsWith(prefix)) found.push(key.slice(prefix.length));
      }
      return found;
    },
  };
}
