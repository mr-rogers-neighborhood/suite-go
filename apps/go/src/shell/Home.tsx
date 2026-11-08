import type { SuiteGoModule } from "@suite/go";
import { EmptyState, IconButton, Launch, type LaunchRecent, PrivacyLine } from "@suite/ui";
import { useState } from "react";
import type { RecentEntry } from "../host/recents.js";

/**
 * The start screen.
 *
 * This is `Launch` from `@suite/ui` — the same component Canvas, Planner and Budget land on
 * when no document is open — with the suite's own concerns in the slots it leaves: capture,
 * the domain tiles, and recents that span them. A person who has used one app in the suite has
 * already learned this screen, which is what WCAG 3.2.3 asks for and what a lookalike would
 * only imitate.
 */
export function Home({
  modules,
  pinned,
  recents,
  onOpen,
  onCapture,
  onTogglePin,
  onInstall,
  onRemove,
  removable,
  notice,
}: {
  readonly modules: readonly SuiteGoModule[];
  readonly pinned: readonly string[];
  readonly recents: readonly RecentEntry[];
  readonly onOpen: (moduleId: string) => void;
  readonly onCapture: (body: string) => void;
  readonly onTogglePin: (moduleId: string) => void;
  readonly onInstall: () => void;
  readonly onRemove: (moduleId: string) => void;
  /** Installed packs, which can be removed — as distinct from the domains that ship in the app. */
  readonly removable: ReadonlySet<string>;
  readonly notice: string | null;
}) {
  const [draft, setDraft] = useState("");
  const target = modules.find((module) => module.capabilities.includes("capture"));
  const known = new Set(modules.map((module) => module.id));

  const submit = () => {
    const body = draft.trim();
    if (!body || !target) return;
    onCapture(body);
    setDraft("");
  };

  const launchRecents: readonly LaunchRecent[] = recents.map((entry) => ({
    id: entry.documentId,
    name: entry.title,
    detail: known.has(entry.moduleId)
      ? `${moduleName(modules, entry.moduleId)} · ${relative(entry.openedAt)}`
      : `${entry.moduleId} is not installed`,
    action: null,
  }));

  return (
    <main className="screen">
      {notice === null ? null : (
        <p
          role="status"
          className="mb-4 rounded-xl border border-[var(--hairline)] bg-[var(--surface-sunk)] px-4 py-3 text-[14px] text-[var(--ink)]"
        >
          {notice}
        </p>
      )}
      <Launch
        title="Suite Go"
        tagline="One place to start. Open a domain, or capture something without opening one."
        hint={
          target
            ? `Capture goes to ${target.name} today.`
            : "Capture turns on when a domain that accepts it is installed."
        }
        recents={launchRecents}
        onOpenRecent={(documentId) => {
          const entry = recents.find((candidate) => candidate.documentId === documentId);
          if (entry && known.has(entry.moduleId)) onOpen(entry.moduleId);
        }}
        actions={
          <button
            type="button"
            className="touch rounded-xl border border-[var(--hairline)] px-4 text-[15px] font-medium text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none"
            onClick={onInstall}
          >
            Install a domain…
          </button>
        }
        recentEmpty={
          <EmptyState title="Nothing opened yet">
            The last thing you opened shows up here, from any domain.
          </EmptyState>
        }
        footer={<PrivacyLine sentence />}
      >
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          {/*
            The name is on the field itself, not on an `sr-only` label beside it. The label
            association did not survive into the WebView's accessibility tree: the field
            arrived as an unnamed EditText, so TalkBack would announce "edit box" and nothing
            else. `aria-label` is announced by every version regardless of that mapping.
          */}
          <input
            id="capture"
            type="text"
            aria-label={target ? `Capture to ${target.name}` : "Capture to a domain"}
            className="touch min-w-0 flex-1 rounded-xl border border-[var(--hairline)] bg-[var(--surface-sunk)] px-4 text-[16px] text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none"
            placeholder={target ? `Capture to ${target.name}…` : "Capture to…"}
            value={draft}
            disabled={!target}
            onChange={(event) => setDraft(event.target.value)}
            enterKeyHint="done"
          />
          <button
            type="submit"
            className="touch rounded-xl bg-[var(--accent)] px-4 text-[15px] font-medium text-[var(--on-accent)] focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none disabled:opacity-50"
            disabled={!target || draft.trim().length === 0}
          >
            Capture
          </button>
        </form>

        <section aria-labelledby="domains-heading" className="flex flex-col gap-2">
          <h2 id="domains-heading" className="text-[13px] font-medium text-[var(--ink-muted)]">
            Domains
          </h2>
          {modules.length === 0 ? (
            <EmptyState title="Domains you add will live here">
              Pin the ones you use to keep them at the top.
            </EmptyState>
          ) : (
            <ul className="flex flex-col gap-2">
              {modules.map((module) => {
                const isPinned = pinned.includes(module.id);
                return (
                  <li
                    key={module.id}
                    className="flex items-center gap-2 rounded-xl border border-[var(--hairline)] px-2"
                  >
                    <button
                      type="button"
                      className="touch min-w-0 flex-1 text-left text-[16px] font-medium focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none"
                      onClick={() => onOpen(module.id)}
                    >
                      {module.name}
                    </button>
                    <IconButton
                      className="touch"
                      label={isPinned ? `Unpin ${module.name}` : `Pin ${module.name}`}
                      aria-pressed={isPinned}
                      onClick={() => onTogglePin(module.id)}
                    >
                      <span aria-hidden="true">{isPinned ? "★" : "☆"}</span>
                    </IconButton>
                    {removable.has(module.id) ? (
                      <IconButton
                        className="touch"
                        label={`Remove ${module.name}`}
                        onClick={() => onRemove(module.id)}
                      >
                        <span aria-hidden="true">×</span>
                      </IconButton>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </Launch>
    </main>
  );
}

function moduleName(modules: readonly SuiteGoModule[], id: string): string {
  return modules.find((module) => module.id === id)?.name ?? id;
}

/** Short and human; a phone does not have room for a timestamp and does not need one. */
function relative(at: number): string {
  const minutes = Math.round((Date.now() - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
