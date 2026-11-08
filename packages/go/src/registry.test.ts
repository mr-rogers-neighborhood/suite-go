import { describe, expect, it, vi } from "vitest";
import type { CaptureIntent } from "./capture.js";
import type { SuiteGoModule } from "./module.js";
import { createModuleRegistry, disposeAll } from "./registry.js";

function moduleStub(id: string, overrides: Partial<SuiteGoModule> = {}): SuiteGoModule {
  return {
    id,
    name: id,
    icon: "square",
    capabilities: ["documents"],
    accepts: [],
    register: () => ({ view: () => null, dispose() {} }),
    ...overrides,
  };
}

const textIntent: CaptureIntent = { kind: "text", body: "call the plumber" };
const urlIntent: CaptureIntent = { kind: "url", body: "https://example.com" };

describe("createModuleRegistry", () => {
  it("holds a declaration without mounting it", () => {
    const register = vi.fn(() => ({ view: () => null, dispose() {} }));
    const registry = createModuleRegistry([moduleStub("planner", { register })]);

    expect(registry.modules.map((module) => module.id)).toEqual(["planner"]);
    expect(register).not.toHaveBeenCalled();
  });

  it("refuses a duplicate id and leaves the registry as it was", () => {
    const registry = createModuleRegistry([moduleStub("budget")]);
    const outcome = registry.register(moduleStub("budget", { name: "Budget again" }));

    expect(outcome).toEqual({ ok: false, reason: "duplicate-id", moduleId: "budget" });
    expect(registry.modules).toHaveLength(1);
    expect(registry.find("budget")?.name).toBe("budget");
  });

  it("refuses an id that is not lower kebab-case", () => {
    const registry = createModuleRegistry();
    expect(registry.register(moduleStub("Planner"))).toEqual({
      ok: false,
      reason: "invalid-id",
      moduleId: "Planner",
    });
  });

  it("refuses capture claimed without any accepted kind", () => {
    const registry = createModuleRegistry();
    const outcome = registry.register(
      moduleStub("void", { capabilities: ["capture"], accepts: [] }),
    );

    expect(outcome).toEqual({
      ok: false,
      reason: "capture-without-accepts",
      moduleId: "void",
    });
  });

  it("refuses accepted kinds without the capture capability", () => {
    const registry = createModuleRegistry();
    const outcome = registry.register(
      moduleStub("sneaky", { capabilities: ["documents"], accepts: ["text"] }),
    );

    expect(outcome).toEqual({
      ok: false,
      reason: "accepts-without-capture",
      moduleId: "sneaky",
    });
  });

  it("hands a getter copy, so a caller cannot mutate the registry", () => {
    const registry = createModuleRegistry([moduleStub("planner")]);
    const view = registry.modules as SuiteGoModule[];
    view.pop();

    expect(registry.modules).toHaveLength(1);
  });

  it("filters by capability", () => {
    const registry = createModuleRegistry([
      moduleStub("planner", { capabilities: ["capture", "documents"], accepts: ["text"] }),
      moduleStub("notes", { capabilities: ["documents"] }),
    ]);

    expect(registry.capable("capture").map((module) => module.id)).toEqual(["planner"]);
    expect(registry.capable("documents").map((module) => module.id)).toEqual(["planner", "notes"]);
  });
});

describe("resolveCapture", () => {
  it("routes to the only module that accepts the kind", () => {
    const registry = createModuleRegistry([
      moduleStub("planner", { capabilities: ["capture"], accepts: ["text"] }),
      moduleStub("notes", { capabilities: ["capture"], accepts: ["url"] }),
    ]);

    const resolution = registry.resolveCapture(textIntent);
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.module.id).toBe("planner");
  });

  it("reports nothing capable rather than throwing, and says how many were asked", () => {
    const registry = createModuleRegistry([
      moduleStub("planner", { capabilities: ["capture"], accepts: ["text"] }),
    ]);

    expect(registry.resolveCapture(urlIntent)).toEqual({
      ok: false,
      reason: "no-capable-module",
      intentKind: "url",
      considered: 1,
    });
  });

  it("reports ambiguity with every candidate instead of picking one", () => {
    const registry = createModuleRegistry([
      moduleStub("planner", { capabilities: ["capture"], accepts: ["text"] }),
      moduleStub("notes", { capabilities: ["capture"], accepts: ["text"] }),
    ]);

    const resolution = registry.resolveCapture(textIntent);
    expect(resolution.ok).toBe(false);
    if (resolution.ok || resolution.reason !== "ambiguous") return;
    expect(resolution.candidates.map((module) => module.id)).toEqual(["planner", "notes"]);
  });
});

describe("disposeAll", () => {
  it("disposes every module even when one throws", async () => {
    const second = vi.fn();
    const fourth = vi.fn();

    const report = await disposeAll([
      { moduleId: "planner", dispose: () => undefined },
      {
        moduleId: "budget",
        dispose: () => {
          throw new Error("listener already gone");
        },
      },
      { moduleId: "notes", dispose: second },
      { moduleId: "canvas", dispose: fourth },
    ]);

    expect(report.disposed).toEqual(["planner", "notes", "canvas"]);
    expect(report.failed).toEqual([{ moduleId: "budget", message: "listener already gone" }]);
    expect(second).toHaveBeenCalledOnce();
    expect(fourth).toHaveBeenCalledOnce();
  });

  it("awaits an async dispose before moving on", async () => {
    const order: string[] = [];

    await disposeAll([
      {
        moduleId: "slow",
        dispose: async () => {
          await Promise.resolve();
          order.push("slow");
        },
      },
      { moduleId: "fast", dispose: () => void order.push("fast") },
    ]);

    expect(order).toEqual(["slow", "fast"]);
  });
});
