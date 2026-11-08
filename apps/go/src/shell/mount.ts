import type { ModuleHost, SuiteGoModule, SuiteGoModuleRegistration } from "@suite/go";

/**
 * Mounting a module: register, install its bridge, and hand back one cleanup.
 *
 * Lifted out of the React component so the part that can genuinely go wrong is
 * testable without a renderer. Three failures are worth naming because each looks
 * like a different bug from the outside:
 *
 * - `register` throws: the domain has a bug before it ever renders.
 * - `install` throws: the renderer would boot without its bridge and fail later in a
 *   way that reads like a data bug.
 * - cleanup runs twice: React's StrictMode mounts, unmounts and remounts in
 *   development, so an unguarded cleanup closes an already-closed document.
 */

export type MountOutcome =
  | {
      readonly ok: true;
      readonly registration: SuiteGoModuleRegistration;
      /** Idempotent. Runs the install cleanup, then `dispose`. */
      readonly cleanup: () => Promise<void>;
    }
  | { readonly ok: false; readonly stage: "register" | "install"; readonly message: string };

export function mountModule(module: SuiteGoModule, host: ModuleHost): MountOutcome {
  let registration: SuiteGoModuleRegistration;
  try {
    registration = module.register(host);
  } catch (error) {
    return { ok: false, stage: "register", message: messageOf(error) };
  }

  let uninstall: (() => void) | undefined;
  if (registration.install) {
    try {
      uninstall = registration.install(host);
    } catch (error) {
      // The registration exists but was never usable. Dispose it so a half-built
      // domain does not hold a document open behind a view nobody will see.
      void registration.dispose();
      return { ok: false, stage: "install", message: messageOf(error) };
    }
  }

  let cleaned = false;
  return {
    ok: true,
    registration,
    cleanup: async () => {
      if (cleaned) return;
      cleaned = true;
      if (typeof uninstall === "function") {
        try {
          uninstall();
        } catch {
          // An uninstall that throws must not keep `dispose` from running.
        }
      }
      await registration.dispose();
    },
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
