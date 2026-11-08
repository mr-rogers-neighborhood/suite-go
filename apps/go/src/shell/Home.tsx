import type { SuiteGoModule } from "@suite/go";
import { useState } from "react";
import type { RecentEntry } from "../host/recents.js";

/**
 * One surface, three bands: capture, domains, recents.
 *
 * The capture bar doubles as the target picker — it names the module that will take
 * what you type, and that module is the same one a share would route to, resolved by
 * the registry rather than by this component.
 */
export function Home({
  modules,
  pinned,
  recents,
  onOpen,
  onCapture,
  onTogglePin,
}: {
  readonly modules: readonly SuiteGoModule[];
  readonly pinned: readonly string[];
  readonly recents: readonly RecentEntry[];
  readonly onOpen: (moduleId: string) => void;
  readonly onCapture: (body: string) => void;
  readonly onTogglePin: (moduleId: string) => void;
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

  return (
    <main className="home">
      <header className="home-header">
        <h1 className="wordmark">Suite Go</h1>
      </header>

      <section className="capture" aria-label="Quick capture">
        <div className="capture-bar">
          <input
            className="capture-input"
            type="text"
            placeholder={target ? `Capture to ${target.name}…` : "Capture to…"}
            aria-label={target ? `Capture to ${target.name}` : "Capture to a domain"}
            value={draft}
            disabled={!target}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
            enterKeyHint="done"
          />
          <span className="capture-target" title="Which domain receives this">
            {target ? target.name : "No domain"}
          </span>
        </div>
        {target ? null : (
          <p className="capture-hint">A domain will take this once one is installed.</p>
        )}
      </section>

      <section className="band" aria-label="Domains">
        <h2 className="band-title">Domains</h2>
        {modules.length === 0 ? (
          <div className="empty">
            <p className="empty-headline">Domains you add will live here.</p>
            <p className="empty-detail">Pin the ones you use to keep them at the top.</p>
          </div>
        ) : (
          <ul className="tiles">
            {modules.map((module) => {
              const isPinned = pinned.includes(module.id);
              return (
                <li key={module.id} className="tile">
                  <button type="button" className="tile-open" onClick={() => onOpen(module.id)}>
                    {module.name}
                  </button>
                  <button
                    type="button"
                    className="tile-pin"
                    aria-pressed={isPinned}
                    aria-label={isPinned ? `Unpin ${module.name}` : `Pin ${module.name}`}
                    onClick={() => onTogglePin(module.id)}
                  >
                    {isPinned ? "★" : "☆"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="band" aria-label="Recents">
        <h2 className="band-title">Recents</h2>
        {recents.length === 0 ? (
          <div className="empty">
            <p className="empty-headline">Nothing opened yet.</p>
            <p className="empty-detail">The last thing you opened shows up here.</p>
          </div>
        ) : (
          <ul className="recents">
            {recents.map((entry) => {
              const available = known.has(entry.moduleId);
              return (
                <li key={entry.documentId} className="recent">
                  <button
                    type="button"
                    className="recent-open"
                    disabled={!available}
                    onClick={() => onOpen(entry.moduleId)}
                  >
                    <span className="recent-title">{entry.title}</span>
                    <span className="recent-meta">
                      {available ? relative(entry.openedAt) : `${entry.moduleId} is not installed`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
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
