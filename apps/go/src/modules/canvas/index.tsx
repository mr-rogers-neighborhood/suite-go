import type { SuiteGoModule } from "@suite/go";

/**
 * Canvas, present but honest.
 *
 * Canvas is the reason the first real user wants this app, and it is also the hardest
 * surface in the suite: boards in the thousands of cards, custom types and templates,
 * sketches, and a tablet layout that has not been designed yet. So it registers here,
 * says plainly what is missing, and does not pretend to be a viewer — a read-only
 * Canvas on a tablet would be worse than no Canvas, because it would look finished.
 *
 * The stub exists to unblock the shell and to prove the launcher can host a module
 * with no working surface. It is time-boxed, not a deferral.
 */
export const canvasModule: SuiteGoModule = {
  id: "canvas",
  name: "Canvas",
  icon: "layout-dashboard",
  capabilities: ["documents"],
  accepts: [],
  register: () => ({
    view: CanvasPlaceholder,
    dispose: () => undefined,
  }),
};

function CanvasPlaceholder() {
  return (
    <div className="scratch">
      <p className="empty-headline">Canvas needs a tablet layout.</p>
      <p className="empty-detail">
        Boards, types and templates are designed for a large screen with a pointer. The tablet
        layout is next; this build does not include it yet.
      </p>
    </div>
  );
}
