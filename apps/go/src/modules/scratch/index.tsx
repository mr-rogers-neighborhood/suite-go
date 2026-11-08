import type { ModuleHost, SuiteGoModule, SuiteGoModuleRegistration } from "@suite/go";
import { createScratchController } from "./controller.js";
import { ScratchView } from "./ScratchView.js";

export { SCRATCH_FILE_NAME } from "./controller.js";

/**
 * The reference module.
 *
 * It claims `capture` and `documents`, accepts text and URLs, and does nothing a
 * domain would recognise. It exists to prove the container: that a declaration is
 * enough to be routed to, that a document can round-trip as opaque bytes, and that
 * leaving releases everything it took.
 *
 * Delete this whole directory once a real domain is hosted here.
 */
export const scratchModule: SuiteGoModule = {
  id: "scratch",
  name: "Scratch",
  icon: "square-pen",
  capabilities: ["capture", "documents"],
  accepts: ["text", "url"],
  register: registerScratch,
};

function registerScratch(host: ModuleHost): SuiteGoModuleRegistration {
  // One controller per mount, shared by the view and the capture handler. Two would
  // mean a share and a keystroke editing different documents.
  const controller = createScratchController(host);

  return {
    view: () => <ScratchView controller={controller} />,
    // The 300 ms debounce is right for typing and wrong at a lifecycle boundary.
    flush: () => controller.flush(),
    capture: (intent) => controller.capture(intent.body),
    dispose: () => controller.dispose(),
  };
}
