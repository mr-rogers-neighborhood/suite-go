import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { QuickCaptureSheet } from "./QuickCaptureSheet.js";

describe("QuickCaptureSheet", () => {
  it("renders nothing when open is false", () => {
    const html = renderToString(
      <QuickCaptureSheet
        open={false}
        onClose={vi.fn()}
        onCapture={vi.fn()}
        targets={[{ id: "scratch", name: "Scratch" }]}
      />,
    );
    expect(html).toBe("");
  });

  it("renders the capture dialog, textarea, and action buttons when open", () => {
    const html = renderToString(
      <QuickCaptureSheet
        open={true}
        onClose={vi.fn()}
        onCapture={vi.fn()}
        targets={[
          { id: "scratch", name: "Scratchpad" },
          { id: "planner", name: "Planner" },
        ]}
        defaultTargetId="scratch"
      />,
    );

    // Dialog structure and ARIA
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="Quick capture"');

    // Title and close button
    expect(html).toContain("Quick Capture");
    expect(html).toContain("Close quick capture");

    // Multiple target options
    expect(html).toContain("Scratchpad");
    expect(html).toContain("Planner");

    // Textarea
    expect(html).toContain('aria-label="Capture content"');

    // Action buttons
    expect(html).toContain("Cancel");
    expect(html).toContain("Capture");
  });
});
