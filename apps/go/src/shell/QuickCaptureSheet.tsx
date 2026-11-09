import { useEffect, useRef, useState } from "react";

export interface QuickCaptureSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onCapture: (body: string, targetModuleId?: string) => void;
  readonly targets: readonly { readonly id: string; readonly name: string }[];
  readonly defaultTargetId?: string | undefined;
}

/**
 * Bottom-sheet Quick Capture drawer.
 *
 * Provides a non-disruptive, accessible capture surface from anywhere in the shell:
 * - Can be triggered without leaving the current context
 * - Supports routing to the designated target module or active document
 * - Adheres strictly to the 44px touch floor and WCAG keyboard/screen-reader rules
 */
export function QuickCaptureSheet({
  open,
  onClose,
  onCapture,
  targets,
  defaultTargetId,
}: QuickCaptureSheetProps) {
  const [body, setBody] = useState("");
  const [selectedTarget, setSelectedTarget] = useState<string>(() => {
    return defaultTargetId ?? targets[0]?.id ?? "";
  });

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (open) {
      setBody("");
      setSelectedTarget(defaultTargetId ?? targets[0]?.id ?? "");
      // Focus textarea on open
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [open, defaultTargetId, targets]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    onCapture(trimmed, selectedTarget);
    onClose();
  };

  const currentTargetName =
    targets.find((t) => t.id === selectedTarget)?.name ?? targets[0]?.name ?? "App";

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close quick capture backdrop"
        className="fixed inset-0 bg-black/40 backdrop-blur-xs"
        onClick={onClose}
      />

      {/* Slide-up Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quick capture"
        className="relative z-10 flex max-h-[85vh] flex-col gap-3 rounded-t-2xl border-t border-[var(--hairline)] bg-[var(--canvas)] p-5 shadow-2xl"
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-[var(--hairline)]" aria-hidden="true" />

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[17px] font-semibold text-[var(--ink)]">Quick Capture</h2>
            <p className="text-[13px] text-[var(--ink-muted)]">
              Capture a thought or task to {currentTargetName}
            </p>
          </div>
          <button
            type="button"
            className="touch flex items-center justify-center rounded-xl p-2 text-[var(--ink-muted)] hover:text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none"
            onClick={onClose}
            aria-label="Close quick capture"
          >
            ✕
          </button>
        </div>

        {targets.length > 1 ? (
          <div className="flex items-center gap-1.5 overflow-x-auto py-1">
            <span className="text-[13px] font-medium text-[var(--ink-muted)] pr-1">Target:</span>
            {targets.map((target) => {
              const active = target.id === selectedTarget;
              return (
                <button
                  key={target.id}
                  type="button"
                  aria-pressed={active}
                  className={`touch rounded-full px-3 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none ${
                    active
                      ? "bg-[var(--accent)] text-[var(--on-accent)]"
                      : "border border-[var(--hairline)] bg-[var(--surface-sunk)] text-[var(--ink)] hover:bg-[var(--surface-hover)]"
                  }`}
                  onClick={() => setSelectedTarget(target.id)}
                >
                  {target.name}
                </button>
              );
            })}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <textarea
            ref={textareaRef}
            aria-label="Capture content"
            className="w-full min-h-[110px] rounded-xl border border-[var(--hairline)] bg-[var(--surface-sunk)] p-3 text-[16px] text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none resize-none"
            placeholder="Write a thought, note, or quick task..."
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              className="touch rounded-xl border border-[var(--hairline)] px-4 text-[15px] font-medium text-[var(--ink-muted)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="touch rounded-xl bg-[var(--accent)] px-5 text-[15px] font-medium text-[var(--on-accent)] disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none"
              disabled={body.trim().length === 0}
            >
              Capture
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
