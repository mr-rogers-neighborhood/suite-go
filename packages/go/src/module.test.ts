import { describe, expect, it } from "vitest";
import { isSuiteGoModuleId } from "./module.js";

describe("isSuiteGoModuleId", () => {
  it.each(["planner", "budget", "canvas", "scratch", "a", "notes-2"])("accepts %s", (id) => {
    expect(isSuiteGoModuleId(id)).toBe(true);
  });

  it.each(["", "Planner", "plan_ner", "-notes", "notes space", "a".repeat(33)])(
    "refuses %j",
    (id) => {
      expect(isSuiteGoModuleId(id)).toBe(false);
    },
  );

  it("accepts an id of exactly the maximum length", () => {
    expect(isSuiteGoModuleId("a".repeat(32))).toBe(true);
  });

  it("stays exactly as permissive as a suite app id, so an id can carry over", () => {
    // `suiteAppIdSchema` in @suite/contracts permits a trailing hyphen, so a stricter
    // rule here would make a legal suite app id an illegal module id. The awkward
    // cases are the price of the promise in module.ts.
    expect(isSuiteGoModuleId("notes-")).toBe(true);
  });
});
