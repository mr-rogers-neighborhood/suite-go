import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ModuleHeader } from "./ModuleHeader.js";

describe("ModuleHeader (Host Navigation Anchor and Capsule)", () => {
  it("renders the back button, title, and host capsule controls", () => {
    const html = renderToString(
      <ModuleHeader title="Scratchpad" moduleName="Scratch" onClose={vi.fn()} />,
    );

    // Back affordance to Suite Go
    expect(html).toContain("Back to Suite Go");
    expect(html).toContain("Suite Go");

    // Title
    expect(html).toContain("Scratchpad");

    // Host capsule toolbar
    expect(html).toContain('role="toolbar"');
    expect(html).toContain('aria-label="Host controls"');
    expect(html).toContain("Options for Scratch");
    expect(html).toContain("Close Scratch");

    // Touch targets meet 44px floor (class 'touch')
    expect(html).toContain("touch");
  });

  it("renders the contextual takeover slot when provided", () => {
    const html = renderToString(
      <ModuleHeader
        title="Workspace"
        moduleName="Planner"
        onClose={vi.fn()}
        takeoverSlot={<span data-testid="today-pill">Today</span>}
      />,
    );

    expect(html).toContain('data-testid="today-pill"');
    expect(html).toContain("Today");
  });
});
