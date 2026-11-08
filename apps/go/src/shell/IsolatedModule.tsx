import type { ModuleHost } from "@suite/go";
import { useEffect, useRef } from "react";
import { resolveTheme } from "../host/theme.js";
import { serveFrame } from "./frameBridge.js";

/**
 * A pack that renders in its own document.
 *
 * The frame is same-origin on purpose. Packs are ours and audited, and a cross-origin frame
 * would buy a security boundary we do not need at the price of losing the `/_capacitor_file_/`
 * proxy that makes a pack's own assets resolve. What keeps a domain out of the shell is the
 * narrow message surface, not the browser.
 *
 * What this does buy: a separate document (so a pack's Tailwind preflight cannot restyle the
 * launcher), a separate JS realm (so two Reacts never meet), and a page life that ends when the
 * person leaves. What it does **not** buy is a separate process — an out-of-memory in the frame
 * still takes the shell down, which is why the measurement exists.
 */
export function IsolatedModule({
  host,
  entryUrl,
  title,
}: {
  readonly host: ModuleHost;
  readonly entryUrl: string;
  readonly title: string;
}) {
  const frame = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const stop = serveFrame({
      host,
      theme: () => {
        const tokens = resolveTheme();
        return { scheme: tokens.scheme, density: tokens.density, variables: tokens.cssVariables };
      },
      target: () => frame.current?.contentWindow ?? null,
    });
    return stop;
  }, [host]);

  return (
    <div className="module">
      <header className="module-header">
        <button type="button" className="module-back" onClick={() => host.navigation.close()}>
          Suite Go
        </button>
        <span className="module-title">{title}</span>
      </header>
      <div className="module-body">
        {/*
          No sandbox attribute: a sandboxed frame without `allow-same-origin` cannot fetch the
          pack's own wasm through the file proxy, and one with it is not a boundary anyway. The
          contract, not the browser, is what limits a pack.
        */}
        <iframe
          ref={frame}
          src={entryUrl}
          title={title}
          className="h-full w-full border-0"
          data-suite-frame={host.moduleId}
        />
      </div>
    </div>
  );
}
