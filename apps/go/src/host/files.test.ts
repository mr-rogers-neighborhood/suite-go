import { describe, expect, it, vi } from "vitest";
import { acceptAttribute, createFileService, mimeFor } from "./files.js";

// Mock Capacitor plugins
vi.mock("@capacitor/filesystem", () => ({
  Directory: { Documents: "DOCUMENTS" },
  Filesystem: {
    writeFile: vi.fn().mockResolvedValue({ uri: "file:///documents/test.planner" }),
  },
}));

vi.mock("@capacitor/share", () => ({
  Share: {
    share: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("files service and helpers", () => {
  describe("mimeFor", () => {
    it("resolves suite document types", () => {
      expect(mimeFor("workspace.planner")).toBe("application/json");
      expect(mimeFor("budget.budget")).toBe("application/json");
      expect(mimeFor("notes.canvas")).toBe("application/json");
    });

    it("resolves common interchange formats", () => {
      expect(mimeFor("data.json")).toBe("application/json");
      expect(mimeFor("export.csv")).toBe("text/csv");
      expect(mimeFor("readme.md")).toBe("text/markdown");
      expect(mimeFor("log.txt")).toBe("text/plain");
    });

    it("falls back to octet-stream for unknown types", () => {
      expect(mimeFor("unknown.xyz")).toBe("application/octet-stream");
      expect(mimeFor("noextension")).toBe("application/octet-stream");
    });
  });

  describe("acceptAttribute", () => {
    it("formats extensions into comma-separated accept list", () => {
      const filters = [
        { name: "Suite Files", extensions: ["planner", "budget"] },
        { name: "Canvas", extensions: ["canvas"] },
      ];
      expect(acceptAttribute(filters)).toBe(".planner,.budget,.canvas");
    });

    it("handles empty filters", () => {
      expect(acceptAttribute([])).toBe("");
    });
  });

  describe("createFileService", () => {
    it("writes to the sandboxed Documents directory", async () => {
      const service = createFileService();
      const outcome = await service.write({
        name: "test.planner",
        mimeType: "application/json",
        bytes: new Uint8Array([1, 2, 3]),
      });
      expect(outcome.ok).toBe(true);
      expect(outcome.uri).toBe("file:///documents/test.planner");
    });

    it("shares written file through native share sheet", async () => {
      const service = createFileService();
      const outcome = await service.share({
        name: "test.planner",
        mimeType: "application/json",
        bytes: new Uint8Array([1, 2, 3]),
      });
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.name).toBe("test.planner");
      }
    });

    it("handles share cancellation gracefully", async () => {
      const { Share } = await import("@capacitor/share");
      vi.mocked(Share.share).mockRejectedValueOnce(new Error("User cancelled share"));

      const service = createFileService();
      const outcome = await service.share({
        name: "test.planner",
        mimeType: "application/json",
        bytes: new Uint8Array([1, 2, 3]),
      });
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.reason).toBe("cancelled");
      }
    });

    it("reports share failure with message", async () => {
      const { Share } = await import("@capacitor/share");
      vi.mocked(Share.share).mockRejectedValueOnce(new Error("Storage unavailable"));

      const service = createFileService();
      const outcome = await service.share({
        name: "test.planner",
        mimeType: "application/json",
        bytes: new Uint8Array([1, 2, 3]),
      });
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.reason).toBe("failed");
        expect(outcome.message).toBe("Storage unavailable");
      }
    });
  });
});
