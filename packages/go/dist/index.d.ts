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
export { type CaptureHandler, type CaptureIntent, type CaptureKind, type CaptureOutcome, } from "./capture.js";
export { type ColorScheme, type CreateDocumentInput, type DocumentRecord, type DocumentStore, type DocumentSummary, type KeyValueStore, type ModuleHost, type ModuleNavigation, type SaveDocumentInput, type ThemeDensity, type ThemeTokens, } from "./host.js";
export { isSuiteGoModuleId, type ModuleViewProps, type SuiteGoCapability, type SuiteGoModule, type SuiteGoModuleId, type SuiteGoModuleRegistration, } from "./module.js";
export { type CaptureResolution, createModuleRegistry, type DisposeEntry, type DisposeReport, disposeAll, type ModuleRegistry, type RegistrationOutcome, type RegistrationRejection, } from "./registry.js";
//# sourceMappingURL=index.d.ts.map