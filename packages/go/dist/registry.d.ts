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
/**
 * Why a declaration was refused.
 *
 * Every one of these is a programming mistake in a module, caught at registration
 * rather than at the moment a person shares a link and nothing happens.
 */
export type RegistrationRejection = "invalid-id" | "duplicate-id"
/** Claims `capture` but declared no kinds, so it can never be chosen. */
 | "capture-without-accepts"
/** Declares kinds without claiming `capture`, so the container would hide it. */
 | "accepts-without-capture";
export type RegistrationOutcome = {
    readonly ok: true;
    readonly module: SuiteGoModule;
} | {
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
export type CaptureResolution = {
    readonly ok: true;
    readonly module: SuiteGoModule;
} | {
    readonly ok: false;
    readonly reason: "no-capable-module";
    readonly intentKind: CaptureKind;
    /** How many modules were asked, so the shell can say something better than "failed". */
    readonly considered: number;
} | {
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
    readonly failed: readonly {
        readonly moduleId: SuiteGoModuleId;
        readonly message: string;
    }[];
}
export declare function createModuleRegistry(initial?: readonly SuiteGoModule[]): ModuleRegistry;
/**
 * Release every mounted module, and keep going when one throws.
 *
 * A module's `dispose` runs code that was written by a domain, and a domain with a
 * bug must not be able to keep the container from releasing the others — that would
 * turn one bad module into a leak across the whole app.
 */
export declare function disposeAll(entries: readonly DisposeEntry[]): Promise<DisposeReport>;
//# sourceMappingURL=registry.d.ts.map