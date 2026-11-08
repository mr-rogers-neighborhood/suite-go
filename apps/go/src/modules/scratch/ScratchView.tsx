import { useEffect, useSyncExternalStore } from "react";
import type { ScratchController } from "./controller.js";

/**
 * Scratch's screen: one text area over a Loro document.
 *
 * The component owns nothing durable. It asks the controller for state, tells it
 * about edits, and starts it once; the effect returns a disposal so leaving the
 * module releases the subscription it made.
 */
export function ScratchView({ controller }: { readonly controller: ScratchController }) {
  useEffect(() => {
    void controller.start();
  }, [controller]);

  const state = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.state(),
  );

  if (state.status === "failed") {
    return (
      <div className="scratch">
        <p className="empty-headline">This note could not be opened.</p>
        <p className="empty-detail">{state.error}</p>
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="scratch">
        <p className="empty-detail">Opening…</p>
      </div>
    );
  }

  return (
    <div className="scratch">
      <textarea
        className="scratch-input"
        value={state.text}
        onChange={(event) => controller.setText(event.target.value)}
        placeholder="Write something. Captures from other apps land here."
        aria-label="Scratch note"
        spellCheck={false}
      />
    </div>
  );
}
