/**
 * What wakes a device that is behind.
 *
 * One implementation ships and it does nothing clever: it answers "now", because the only moment
 * a device can be relied on to sync is when the app is in the foreground (ADR-0004, ADR-0006).
 *
 * The interface exists so that adding a real channel later is a second implementation rather than
 * a rewrite — and so that no caller assumes a doorbell exists. A push channel must arrive here and
 * nowhere else, because where it arrives is what decides whether the relay stays blind.
 */
export type SyncTriggerKind = "foreground" | "push";

export interface SyncTrigger {
  readonly kind: SyncTriggerKind;
  /**
   * Resolves the next time this device should attempt a sync.
   *
   * "Should" rather than "must": a trigger is a hint, and a sync that finds nothing is a cheap
   * no-op. Callers must never treat a fired trigger as proof there is anything to exchange.
   */
  next(): Promise<void>;
  /** Stop listening. Called when the shell unmounts. */
  dispose(): void;
}

/**
 * The only trigger this build has.
 *
 * Deliberately not a timer. A periodic poll would be a background sync in disguise, which is what
 * the platform will not allow and what ADR-0004 refuses; the honest trigger is the person opening
 * the app.
 */
export function createForegroundTrigger(): SyncTrigger {
  let resolveNext: (() => void) | null = null;
  let disposed = false;

  const fire = () => {
    const resolve = resolveNext;
    resolveNext = null;
    resolve?.();
  };

  const onVisible = () => {
    if (document.visibilityState === "visible") fire();
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisible);
  }

  return {
    kind: "foreground",
    next() {
      if (disposed) return Promise.reject(new Error("trigger disposed"));
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        resolveNext = resolve;
      });
    },
    dispose() {
      disposed = true;
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisible);
      }
      resolveNext = null;
    },
  };
}
