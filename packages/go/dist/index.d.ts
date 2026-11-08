/**
 * `@suite/go` — the Suite Go module contract.
 *
 * Read `module.ts` first: a domain declares what it claims and the container routes
 * on that declaration without running domain code. `host.ts` is what a mounted
 * module is handed, and cannot read a document. `registry.ts` is the routing.
 *
 * There is no export from this package that mentions Planner, Budget or Canvas, and
 * there should never be one. If a future change needs to name a domain to work, the
 * change belongs in that domain's module instead.
 */
export type { CaptureHandler, CaptureIntent, CaptureKind, CaptureOutcome, } from "./capture.js";
export type { ColorScheme, CreateDocumentInput, DocumentRecord, DocumentStore, DocumentSummary, KeyValueStore, ModuleHost, ModuleNavigation, ModuleRecents, SaveDocumentInput, ThemeDensity, ThemeTokens, } from "./host.js";
export type { ModuleViewProps, SuiteGoCapability, SuiteGoModule, SuiteGoModuleId, SuiteGoModuleRegistration, } from "./module.js";
export { isSuiteGoModuleId } from "./module.js";
export type { CaptureResolution, DisposeEntry, DisposeReport, ModuleRegistry, RegistrationOutcome, RegistrationRejection, } from "./registry.js";
export { createModuleRegistry, disposeAll } from "./registry.js";
//# sourceMappingURL=index.d.ts.map