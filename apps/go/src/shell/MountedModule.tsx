import type { CaptureIntent, ModuleHost, SuiteGoModule } from "@suite/go";
import { useEffect, useState } from "react";

/**
 * A module, mounted, with a frame the container owns.
 *
 * The container supplies the back affordance and the module's name; the module
 * supplies everything inside. Disposal is an effect cleanup, so leaving by any route
 * — back button, hardware back, a future deep link — runs it exactly once.
 *
 * Registration happens once per mount, deliberately. A domain's `register` is where
 * it opens its document, so caching a registration across mounts would reuse a
 * disposed one.
 */
export function MountedModule({
  module,
  host,
  intent,
  onClose,
}: {
  readonly module: SuiteGoModule;
  readonly host: ModuleHost;
  readonly intent?: CaptureIntent;
  readonly onClose: () => void;
}) {
  const [registration] = useState(() => module.register(host));

  useEffect(() => {
    return () => {
      void registration.dispose();
    };
  }, [registration]);

  useEffect(() => {
    if (!intent) return;
    void registration.capture?.(intent);
  }, [registration, intent]);

  const View = registration.view;

  return (
    <div className="module">
      <header className="module-header">
        <button type="button" className="module-back" onClick={onClose}>
          Suite Go
        </button>
        <span className="module-title">{module.name}</span>
      </header>
      <div className="module-body">
        <View host={host} />
      </div>
    </div>
  );
}
