import { isSuiteGoModuleId } from "./module.js";
function rejection(moduleId, reason) {
    return { ok: false, reason, moduleId };
}
function acceptsCapture(module) {
    return module.accepts.length > 0;
}
function claimsCapture(module) {
    return module.capabilities.includes("capture");
}
export function createModuleRegistry(initial = []) {
    const declared = [];
    const registry = {
        get modules() {
            return [...declared];
        },
        register(module) {
            if (!isSuiteGoModuleId(module.id))
                return rejection(module.id, "invalid-id");
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
            if (only && rest.length === 0)
                return { ok: true, module: only };
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
    for (const module of initial)
        registry.register(module);
    return registry;
}
/**
 * Release every mounted module, and keep going when one throws.
 *
 * A module's `dispose` runs code that was written by a domain, and a domain with a
 * bug must not be able to keep the container from releasing the others — that would
 * turn one bad module into a leak across the whole app.
 */
export async function disposeAll(entries) {
    const disposed = [];
    const failed = [];
    for (const entry of entries) {
        try {
            await entry.dispose();
            disposed.push(entry.moduleId);
        }
        catch (error) {
            failed.push({
                moduleId: entry.moduleId,
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }
    return { disposed, failed };
}
//# sourceMappingURL=registry.js.map