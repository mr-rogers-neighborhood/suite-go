/**
 * What a domain is allowed to be, from the container's point of view.
 *
 * The shape here is the whole architecture in one file: a module *declares* what
 * it claims, and the container routes on that declaration without running the
 * module's code. Everything a module needs at runtime arrives through
 * `ModuleHost`, which is described in `host.ts` — and which deliberately cannot
 * read a document.
 */
import type { ComponentType } from "react";
import type { CaptureHandler, CaptureKind } from "./capture.js";
import type { ModuleHost } from "./host.js";

/** Lower kebab-case. The same rule Start uses for suite app ids, so an id can carry over. */
const MODULE_ID_PATTERN = /^[a-z][a-z0-9-]{0,31}$/u;

export type SuiteGoModuleId = string;

/** True when a string is a legal module id. The one check the container makes on a declaration. */
export function isSuiteGoModuleId(value: string): boolean {
  return MODULE_ID_PATTERN.test(value);
}

/**
 * What a module can do, stated positively.
 *
 * A capability is a promise the container can rely on *before* mounting, so it is
 * intentionally coarse: `capture` means "this module accepts something handed to
 * the phone", `documents` means "this module has files the person can open". Both
 * are deliberately not able to express what the domain is about. There is no
 * `planning` capability, and adding one would be the container learning a
 * domain.
 */
export type SuiteGoCapability = "capture" | "documents";

export interface SuiteGoModuleRegistration {
  /** The module's own root view. The container renders a frame around it, never a layout. */
  readonly view: ComponentType<ModuleViewProps>;
  /** Present when the module declared `capture`. Runs only after mount. */
  readonly capture?: CaptureHandler;

  /**
   * Put whatever this app's renderer expects into place, and return its removal.
   *
   * This is the seam a full application uses. Planner's renderer reads
   * `window.suitePlanner` and refuses to boot without it; the *Planer module* builds
   * that object out of the host and installs it here. The container never learns the
   * global's name, and there is no table of app ids anywhere in `apps/go`.
   *
   * Runs before the view renders, and the returned function runs exactly once on
   * leave. A module whose install throws is reported and not mounted, because a view
   * that boots without its bridge would fail in a way that looks like a domain bug.
   */
  readonly install?: (host: ModuleHost) => InstallCleanup;

  /**
   * Persist whatever is pending, without releasing anything.
   *
   * The container calls this when the app leaves the foreground, which is the boundary a phone
   * gives no warning about (ADR-0005). `dispose` also flushes, but reaching for it here would
   * throw away a scroll position the person expects to return to.
   *
   * Optional, and absent means "nothing pending" — a module that writes through on every edit
   * has nothing to do.
   */
  readonly flush?: () => void | Promise<void>;

  /** Called when the person leaves. Must release listeners, timers and document handles. */
  dispose(): void | Promise<void>;
}

/** What `install` returns: the removal for whatever it put in place, or nothing. */
export type InstallCleanup = (() => void) | undefined;

export interface ModuleViewProps {
  readonly host: ModuleHost;
}

/**
 * A domain, as the container sees it.
 *
 * `accepts` is declared rather than discovered on purpose. Asking a module
 * "could you take this?" by mounting it would mean the shell cannot show a picker
 * or route a share until every domain has loaded — which is the laziness the
 * whole design is for. So the container matches on the declaration and mounts
 * only the winner.
 */
export interface SuiteGoModule {
  readonly id: SuiteGoModuleId;
  readonly name: string;
  /** An icon key the shell resolves to its own artwork. The contract names no file or URL. */
  readonly icon: string;
  readonly capabilities: readonly SuiteGoCapability[];
  readonly accepts: readonly CaptureKind[];
  /** Called once, when the person opens this module. Never at registration. */
  register(host: ModuleHost): SuiteGoModuleRegistration;
}
