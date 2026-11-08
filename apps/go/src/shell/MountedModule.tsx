import type { CaptureIntent, ModuleHost, SuiteGoModule } from "@suite/go";
import { useEffect, useRef, useState } from "react";
import { mountModule } from "./mount.js";

/**
 * A module, mounted, with a frame the container owns.
 *
 * The container supplies the back affordance and the module's name; the module
 * supplies everything inside. Mounting goes through `mountModule`, which registers,
 * installs the app's bridge and hands back one idempotent cleanup — so leaving by any
 * route, and StrictMode's double mount in development, both settle to one teardown.
 */
export function MountedModule({
  module,
  host,
  intent,
  onClose,
  onCleanupReady,
  onFlushReady,
}: {
  readonly module: SuiteGoModule;
  readonly host: ModuleHost;
  readonly intent?: CaptureIntent;
  readonly onClose: () => void;
  /** Lets the container await this module's teardown before mounting the next one. */
  readonly onCleanupReady?: (cleanup: () => Promise<void>) => void;
  /** Lets the container flush this module when the app leaves the foreground. */
  readonly onFlushReady?: (flush: () => Promise<void>) => void;
}) {
  const [outcome] = useState(() => mountModule(module, host));
  const [ready, setReady] = useState(false);
  const cleanup = useRef(outcome.ok ? outcome.cleanup : null);
  const disposed = useRef(false);

  useEffect(() => {
    if (cleanup.current) onCleanupReady?.(cleanup.current);
    if (outcome.ok) {
      const registration = outcome.registration;
      onFlushReady?.(async () => {
        await registration.flush?.();
      });
    }
    setReady(true);
    return () => {
      if (disposed.current) return;
      disposed.current = true;
      void cleanup.current?.();
    };
  }, [onCleanupReady, onFlushReady, outcome]);

  useEffect(() => {
    if (!ready || !outcome.ok || !intent) return;
    void outcome.registration.capture?.(intent);
  }, [outcome, intent, ready]);

  if (!outcome.ok) {
    return (
      <ShellFrame module={module} onClose={onClose}>
        <div className="scratch">
          <p className="empty-headline">{module.name} could not start.</p>
          <p className="empty-detail">
            {outcome.stage === "install" ? "Its bridge refused to load. " : ""}
            {outcome.message}
          </p>
        </div>
      </ShellFrame>
    );
  }

  const View = outcome.registration.view;

  return (
    <ShellFrame module={module} onClose={onClose}>
      <View host={host} />
    </ShellFrame>
  );
}

function ShellFrame({
  module,
  onClose,
  children,
}: {
  readonly module: SuiteGoModule;
  readonly onClose: () => void;
  readonly children?: React.ReactNode;
}) {
  return (
    <div className="module">
      <header className="module-header">
        <button type="button" className="module-back" onClick={onClose}>
          Suite Go
        </button>
        <span className="module-title">{module.name}</span>
      </header>
      <div className="module-body">{children}</div>
    </div>
  );
}
