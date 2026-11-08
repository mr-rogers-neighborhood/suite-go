import type { ModuleHost, SuiteGoModule } from "@suite/go";
import { describe, expect, it, vi } from "vitest";
import { mountModule } from "./mount.js";

function host(): ModuleHost {
  return {
    moduleId: "any",
    documents: {
      list: async () => [],
      create: async () => {
        throw new Error("unused");
      },
      open: async () => null,
      save: async () => {
        throw new Error("unused");
      },
      remove: async () => undefined,
    },
    storage: {
      get: async () => null,
      set: async () => undefined,
      delete: async () => undefined,
      keys: async () => [],
    },
    navigation: { setTitle: () => undefined, close: () => undefined },
    recents: { remember: () => undefined, forget: () => undefined },
    files: {
      pickOpen: async () => null,
      write: async () => ({ ok: true, uri: "file:///documents/x" }),
      share: async () => ({ ok: false, reason: "cancelled" }),
    },
    theme: { scheme: "light", density: "comfortable", cssVariables: {} },
  };
}

function moduleWith(overrides: Partial<SuiteGoModule>): SuiteGoModule {
  return {
    id: "any",
    name: "Any",
    icon: "square",
    capabilities: ["documents"],
    accepts: [],
    register: () => ({ view: () => null, dispose() {} }),
    ...overrides,
  };
}

describe("mountModule", () => {
  it("installs before returning, so a view can never boot without its bridge", () => {
    const order: string[] = [];
    const outcome = mountModule(
      moduleWith({
        register: () => ({
          view: () => null,
          install: () => {
            order.push("install");
            return () => undefined;
          },
          dispose: () => void order.push("dispose"),
        }),
      }),
      host(),
    );

    expect(outcome.ok).toBe(true);
    expect(order).toEqual(["install"]);
  });

  it("reports a register that throws instead of propagating it", () => {
    const outcome = mountModule(
      moduleWith({
        register: () => {
          throw new Error("no document");
        },
      }),
      host(),
    );

    expect(outcome).toEqual({ ok: false, stage: "register", message: "no document" });
  });

  it("disposes a registration whose install throws, and does not mount it", () => {
    const dispose = vi.fn();
    const outcome = mountModule(
      moduleWith({
        register: () => ({
          view: () => null,
          install: () => {
            throw new Error("bridge refused");
          },
          dispose,
        }),
      }),
      host(),
    );

    expect(outcome).toEqual({ ok: false, stage: "install", message: "bridge refused" });
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("runs the uninstall and then dispose, in that order", async () => {
    const order: string[] = [];
    const outcome = mountModule(
      moduleWith({
        register: () => ({
          view: () => null,
          install: () => () => void order.push("uninstall"),
          dispose: () => void order.push("dispose"),
        }),
      }),
      host(),
    );

    if (!outcome.ok) throw new Error("expected a mount");
    await outcome.cleanup();
    expect(order).toEqual(["uninstall", "dispose"]);
  });

  it("cleans up only once, because StrictMode mounts twice", async () => {
    const uninstall = vi.fn();
    const dispose = vi.fn();
    const outcome = mountModule(
      moduleWith({
        register: () => ({
          view: () => null,
          install: () => uninstall,
          dispose,
        }),
      }),
      host(),
    );

    if (!outcome.ok) throw new Error("expected a mount");
    await Promise.all([outcome.cleanup(), outcome.cleanup()]);
    await outcome.cleanup();

    expect(uninstall).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("still disposes when the uninstall throws", async () => {
    const dispose = vi.fn();
    const outcome = mountModule(
      moduleWith({
        register: () => ({
          view: () => null,
          install: () => () => {
            throw new Error("listener already gone");
          },
          dispose,
        }),
      }),
      host(),
    );

    if (!outcome.ok) throw new Error("expected a mount");
    await outcome.cleanup();

    expect(dispose).toHaveBeenCalledOnce();
  });

  it("mounts a module with no install at all", async () => {
    const dispose = vi.fn();
    const outcome = mountModule(
      moduleWith({ register: () => ({ view: () => null, dispose }) }),
      host(),
    );

    if (!outcome.ok) throw new Error("expected a mount");
    await outcome.cleanup();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
