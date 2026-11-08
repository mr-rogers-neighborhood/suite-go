import { describe, expect, it } from "vitest";
import { orderModules } from "./pins.js";

const modules = [{ id: "planner" }, { id: "budget" }, { id: "canvas" }];

describe("orderModules", () => {
  it("leaves registry order alone when nothing is pinned", () => {
    expect(orderModules(modules, []).map((module) => module.id)).toEqual([
      "planner",
      "budget",
      "canvas",
    ]);
  });

  it("puts pinned modules first, in the person's order", () => {
    expect(orderModules(modules, ["canvas", "planner"]).map((module) => module.id)).toEqual([
      "canvas",
      "planner",
      "budget",
    ]);
  });

  it("ignores a pinned id with no module behind it", () => {
    expect(orderModules(modules, ["ghost", "budget"]).map((module) => module.id)).toEqual([
      "budget",
      "planner",
      "canvas",
    ]);
  });

  it("does not duplicate a module pinned twice", () => {
    expect(orderModules(modules, ["budget", "budget"]).map((module) => module.id)).toEqual([
      "budget",
      "planner",
      "canvas",
    ]);
  });
});
