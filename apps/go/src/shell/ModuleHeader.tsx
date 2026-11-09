import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

export interface ModuleHeaderProps {
  readonly title: string;
  readonly moduleName: string;
  readonly onClose: () => void;
  readonly onQuickCapture?: () => void;
  readonly onExport?: () => void;
  readonly takeoverSlot?: ReactNode;
}

/**
 * The Mobile Host Navigation Anchor and Capsule.
 *
 * Implements the host navigation pattern (ADR-0003):
 * 1. Left anchor: Back button ("‹ Suite Go") to safely exit to the launcher.
 * 2. Center: Module title with takeover slot for contextual actions/switchers.
 * 3. Right: Immutable host capsule pill with `···` (host menu) and `✕` (exit).
 *
 * Every interactive target strictly satisfies the 44px touch floor (WCAG 2.5.5).
 */
export function ModuleHeader({
  title,
  moduleName,
  onClose,
  onQuickCapture,
  onExport,
  takeoverSlot,
}: ModuleHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close menu on Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <>
      <header className="module-header flex items-center justify-between gap-2 border-b border-[var(--hairline)] bg-[var(--canvas)] px-2 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <button
            type="button"
            className="touch flex items-center gap-1 rounded-xl px-2 text-[15px] font-medium text-[var(--ink)] hover:bg-[var(--surface-sunk)] focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none"
            onClick={onClose}
            aria-label="Back to Suite Go"
          >
            <span aria-hidden="true" className="text-[18px] leading-none">
              ‹
            </span>
            <span className="truncate">Suite Go</span>
          </button>

          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            <span
              className="truncate text-[15px] font-semibold text-[var(--ink)]"
              title={moduleName}
            >
              {title}
            </span>
            {takeoverSlot ? <div className="flex items-center gap-1">{takeoverSlot}</div> : null}
          </div>
        </div>

        {/* The Capsule: immutable host anchor pill */}
        <div
          role="toolbar"
          aria-label="Host controls"
          className="flex items-center rounded-full border border-[var(--hairline)] bg-[var(--surface-sunk)]/90 backdrop-blur-xs shadow-xs"
        >
          <button
            type="button"
            aria-label={`Options for ${moduleName}`}
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            className="touch flex items-center justify-center rounded-l-full px-3 text-[16px] font-bold tracking-widest text-[var(--ink)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none"
            onClick={() => setMenuOpen((open) => !open)}
          >
            ···
          </button>
          <div className="h-4 w-px bg-[var(--hairline)]" aria-hidden="true" />
          <button
            type="button"
            aria-label={`Close ${moduleName}`}
            className="touch flex items-center justify-center rounded-r-full px-3 text-[15px] font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none"
            onClick={onClose}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      </header>

      {/* Host Menu Bottom Sheet */}
      {menuOpen ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <button
            type="button"
            aria-label="Close menu backdrop"
            className="fixed inset-0 bg-black/40 backdrop-blur-xs"
            onClick={() => setMenuOpen(false)}
          />
          <div
            ref={menuRef}
            role="dialog"
            aria-modal="true"
            aria-label={`${moduleName} options`}
            className="relative z-10 flex flex-col gap-3 rounded-t-2xl border-t border-[var(--hairline)] bg-[var(--canvas)] p-5 shadow-2xl"
          >
            <div
              className="mx-auto h-1 w-10 rounded-full bg-[var(--hairline)]"
              aria-hidden="true"
            />
            <div className="flex items-center justify-between pb-1">
              <div>
                <h3 className="text-[17px] font-semibold text-[var(--ink)]">{moduleName}</h3>
                <p className="text-[13px] text-[var(--ink-muted)]">Hosted domain module</p>
              </div>
              <button
                type="button"
                className="touch flex items-center justify-center rounded-xl p-2 text-[var(--ink-muted)] hover:text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              {onQuickCapture ? (
                <button
                  type="button"
                  className="touch flex w-full items-center gap-3 rounded-xl border border-[var(--hairline)] bg-[var(--surface-sunk)] px-4 py-3 text-left font-medium text-[var(--ink)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none"
                  onClick={() => {
                    setMenuOpen(false);
                    onQuickCapture();
                  }}
                >
                  <span className="text-[18px]" aria-hidden="true">
                    ⚡
                  </span>
                  <span>Quick Capture</span>
                </button>
              ) : null}

              {onExport ? (
                <button
                  type="button"
                  className="touch flex w-full items-center gap-3 rounded-xl border border-[var(--hairline)] bg-[var(--surface-sunk)] px-4 py-3 text-left font-medium text-[var(--ink)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none"
                  onClick={() => {
                    setMenuOpen(false);
                    onExport();
                  }}
                >
                  <span className="text-[18px]" aria-hidden="true">
                    ↗
                  </span>
                  <span>Export / Share Document</span>
                </button>
              ) : null}

              <button
                type="button"
                className="touch flex w-full items-center gap-3 rounded-xl border border-[var(--hairline)] px-4 py-3 text-left font-medium text-[var(--ink)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none"
                onClick={() => {
                  setMenuOpen(false);
                  onClose();
                }}
              >
                <span className="text-[18px]" aria-hidden="true">
                  ⨂
                </span>
                <span>Exit {moduleName}</span>
              </button>
            </div>

            <button
              type="button"
              className="touch mt-2 w-full rounded-xl border border-[var(--hairline)] px-4 py-3 text-center text-[15px] font-medium text-[var(--ink-muted)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none"
              onClick={() => setMenuOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
