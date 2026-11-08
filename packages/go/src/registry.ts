/**
 * The container's one piece of real logic: hold module declarations, route an
 * intent to the module that claimed it, and survive a module that misbehaves.
 *
 * Kept pure so it can be tested without a phone, a WebView or React. The shell in
 * `apps/go` supplies the mutable things — documents, storage, theme — and this file
 * never touches them.
 */
import type { CaptureIntent, CaptureKind } from "./capture.js";
import type { SuiteGoCapability, SuiteGoModule, SuiteGoModuleId } from "./module.js";
import { isSuiteGoModuleId } from "./module.js";

/**
 * Why a declaration was refused.
 *
 * Every one of these is a programming mistake in a module, caught at registration
 * rather than at the moment a person shares a link and nothing happens.
 */
export type RegistrationRejection =
  | "invalid-id"
  | "duplicate-id"
  /** Claims `capture` but declared no kinds, so it can never be chosen. */
  | "capture-without-accepts"
  /** Declares kinds without claiming `capture`, so the container would hide it. */
  | "accepts-without-capture";

export type RegistrationOutcome =
  | { readonly ok: true; readonly module: SuiteGoModule }
  | {
      readonly ok: false;
      readonly reason: RegistrationRejection;
      readonly moduleId: SuiteGoModuleId;
    };

/**
 * Where an intent goes.
 *
 * `ambiguous` is a `ok: false` on purpose. Two modules claiming the same kind is
 * a situation the person resolves by choosing, not one the container resolves by
 * picking — silently preferring the first registered module is how a share to the
 * wrong domain becomes a bug report nobody can reproduce.
 */
export type CaptureResolution =
  | { readonly ok: true; readonly module: SuiteGoModule }
  | {
      readonly ok: false;
      readonly reason: "no-capable-module";
      readonly intentKind: CaptureKind;
      /** How many modules were asked, so the shell can say something better than "failed". */
      readonly considered: number;
    }
  | {
      readonly ok: false;
      readonly reason: "ambiguous";
      readonly intentKind: CaptureKind;
      readonly candidates: readonly SuiteGoModule[];
    };

export interface ModuleRegistry {
  /** Declarations only. Nothing here has been mounted. */
  readonly modules: readonly SuiteGoModule[];
  register(module: SuiteGoModule): RegistrationOutcome;
  find(id: SuiteGoModuleId): SuiteGoModule | undefined;
  capable(capability: SuiteGoCapability): readonly SuiteGoModule[];
  resolveCapture(intent: CaptureIntent): CaptureResolution;
}

export interface DisposeEntry {
  readonly moduleId: SuiteGoModuleId;
  dispose(): void | Promise<void>;
}

export interface DisposeReport {
  readonly disposed: readonly SuiteGoModuleId[];
  readonly failed: readonly { readonly moduleId: SuiteGoModuleId; readonly message: string }[];
}

function rejection(moduleId: SuiteGoModuleId, reason: RegistrationRejection): RegistrationOutcome {
  return { ok: false, reason, moduleId };
}

function acceptsCapture(module: SuiteGoModule): boolean {
  return module.accepts.length > 0;
}

function claimsCapture(module: SuiteGoModule): boolean {
  return module.capabilities.includes("capture");
}

export function createModuleRegistry(initial: readonly SuiteGoModule[] = []): ModuleRegistry {
  const declared: SuiteGoModule[] = [];

  const registry: ModuleRegistry = {
    get modules() {
      return [...declared];
    },

    register(module) {
      if (!isSuiteGoModuleId(module.id)) return rejection(module.id, "invalid-id");
      if (declared.some((existing) => existing.id === module.id)) {
        return rejection(module.id, "duplicate-id");
      }
      if (claimsCapture(module) && !acceptsCapture(module)) {
        return rejection(module.id, "capture-without-accepts");
      }
      if (acceptsCapture(module) && !claimsCapture(module)) {
        return rejection(module.id, "accepts-without-capture");
      }
      declared.push(module);
      return { ok: true, module };
    },

    find(id) {
      return declared.find((module) => module.id === id);
    },

    capable(capability) {
      return declared.filter((module) => module.capabilities.includes(capability));
    },

    resolveCapture(intent) {
      const candidates = declared.filter((module) => module.accepts.includes(intent.kind));
      const [only, ...rest] = candidates;
      if (only && rest.length === 0) return { ok: true, module: only };
      if (!only) {
        return {
          ok: false,
          reason: "no-capable-module",
          intentKind: intent.kind,
          considered: declared.length,
        };
      }
      return { ok: false, reason: "ambiguous", intentKind: intent.kind, candidates };
    },
  };

  for (const module of initial) registry.register(module);
  return registry;
}

/**
 * Release every mounted module, and keep going when one throws.
 *
 * A module's `dispose` runs code that was written by a domain, and a domain with a
 * bug must not be able to keep the container from releasing the others — that would
 * turn one bad module into a leak across the whole app.
 */
export async function disposeAll(entries: readonly DisposeEntry[]): Promise<DisposeReport> {
  const disposed: SuiteGoModuleId[] = [];
  const failed: { moduleId: SuiteGoModuleId; message: string }[] = [];

  for (const entry of entries) {
    try {
      await entry.dispose();
      disposed.push(entry.moduleId);
    } catch (error) {
      failed.push({
        moduleId: entry.moduleId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { disposed, failed };
}
