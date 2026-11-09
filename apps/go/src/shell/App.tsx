import { App as NativeApp } from "@capacitor/app";
import type { CaptureIntent, ModuleHost, ModuleViewProps, SuiteGoModule } from "@suite/go";
import { createModuleRegistry } from "@suite/go";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createDocumentStore } from "../host/documents.js";
import { createFileService, mimeFor } from "../host/files.js";
import { createPackStore, type InstalledPack } from "../host/packs.js";
import { createPins, orderModules } from "../host/pins.js";
import { createRecents, type RecentEntry } from "../host/recents.js";
import { createKeyValueStore } from "../host/storage.js";
import { paintTheme, resolveTheme, watchColorScheme } from "../host/theme.js";
import { canvasModule } from "../modules/canvas/index.js";
import { scratchModule } from "../modules/scratch/index.js";
import { Home } from "./Home.js";
import { IsolatedModule } from "./IsolatedModule.js";
import { MountedModule } from "./MountedModule.js";
import { QuickCaptureSheet } from "./QuickCaptureSheet.js";

/**
 * The container.
 *
 * It holds a registry of declarations, one document store, and a route. It imports
 * exactly one module because the suite currently has exactly one reference module;
 * adding a domain is a line here and nothing else.
 *
 * There is no branch on a domain id anywhere in this file. If one appears, the
 * container has started learning a domain.
 */
/**
 * A pack, as the container sees it.
 *
 * The container still knows nothing about what the pack does: it has an id, a name and an
 * entry URL. Every pack renders in its own document — the manifest refuses any other mode
 * (ADR-0003) — so there is no branch here to get wrong.
 */
function packAsModule(
  pack: InstalledPack,
  onQuickCapture?: () => void,
  onExport?: (moduleId: string) => void,
): SuiteGoModule {
  const { id, name } = pack.manifest;
  return {
    id,
    name,
    icon: "box",
    capabilities: ["documents"],
    accepts: [],
    register: () => ({
      view: ({ host }: ModuleViewProps) => (
        <IsolatedModule
          host={host}
          entryUrl={pack.entryUrl}
          title={name}
          manifest={pack.manifest}
          {...(onQuickCapture ? { onQuickCapture } : {})}
          {...(onExport ? { onExport: () => onExport(id) } : {})}
        />
      ),
      dispose: () => undefined,
    }),
  };
}
const documents = createDocumentStore();
const shellStorage = createKeyValueStore("shell");
const pins = createPins(shellStorage);
const recents = createRecents(shellStorage);
const files = createFileService();
const packs = createPackStore();

/**
 * Dev handles, for `pnpm android:eval`.
 *
 * The install pipeline has no screen yet, and a pipeline nobody has run is a design. This
 * exposes the store so it can be exercised on a device; it holds no secret, and it goes away
 * with the install screen that replaces it.
 */
/** Set by the App once mounted; the dev hook lives at module scope and cannot see a callback. */
let reloadPacksFromDev: () => void = () => undefined;

Object.assign(globalThis, {
  __suiteGoDev: {
    reload: () => reloadPacksFromDev(),
    install: (base64: string) => {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1)
        bytes[index] = binary.charCodeAt(index);
      return packs.install(bytes);
    },
    list: () => packs.list(),
    setIdleRelease: (ms: number) => {
      IDLE_RELEASE_MS = ms;
    },
    uninstall: (id: string) => packs.uninstall(id),
  },
});
// Painted before the first render, so no frame flashes the browser's default palette.
paintTheme();
const theme = resolveTheme();

/**
 * How long a backgrounded module stays mounted before it is released and its edit flushed.
 *
 * A `let` so that `__suiteGoDev.setIdleRelease` can shorten it for a test; five minutes is
 * too long to verify by hand and an unverified timer is a timer that silently does nothing.
 */
let IDLE_RELEASE_MS = 5 * 60_000;

type Route =
  | { readonly kind: "home" }
  | { readonly kind: "module"; readonly moduleId: string; readonly intent?: CaptureIntent };

export function App() {
  const [route, setRoute] = useState<Route>({ kind: "home" });
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const [installed, setInstalled] = useState<readonly InstalledPack[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [pinned, setPinned] = useState<readonly string[]>([]);
  const [recent, setRecent] = useState<readonly RecentEntry[]>([]);
  const pendingCleanup = useRef<(() => Promise<void>) | null>(null);
  const pendingFlush = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => watchColorScheme(() => undefined), []);

  const refreshRecents = useCallback(async () => {
    setRecent(await recents.list());
  }, []);

  const refresh = useCallback(async () => {
    setPinned(await pins.list());
    await refreshRecents();
    setInstalled(await packs.discover());
  }, [refreshRecents]);

  // A pack installed this session has to appear without a restart.
  const reloadPacks = useCallback(async () => {
    setInstalled(await packs.discover());
  }, []);

  useEffect(() => {
    reloadPacksFromDev = () => void reloadPacks();
  }, [reloadPacks]);

  /**
   * Install a pack from a file the person chooses.
   *
   * Every failure keeps its reason on screen rather than in a console: a pack that will not
   * install has a specific cause — a signature, a contract version, a damaged file — and
   * "something went wrong" would hide the one sentence that tells them what to do.
   */
  const installFromFile = useCallback(async () => {
    setNotice(null);
    try {
      const picked = await files.pickOpen([{ name: "Suite pack", extensions: ["pack"] }]);
      if (!picked) return;
      const outcome = await packs.install(picked.bytes);
      if (!outcome.ok) {
        setNotice(outcome.message);
        return;
      }
      await reloadPacks();
      setNotice(`${outcome.pack.manifest.name} ${outcome.pack.manifest.version} installed.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }, [reloadPacks]);

  const removeDomain = useCallback(
    async (moduleId: string) => {
      await packs.uninstall(moduleId);
      await reloadPacks();
      setRoute({ kind: "home" });
      setNotice("Removed. Its files are gone from this device.");
    },
    [reloadPacks],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Leave a module only once its teardown has finished.
   *
   * A module's `dispose` flushes its last edit. Unmounting and routing home in the
   * same tick would let the next module mount while that write was still in flight,
   * so a heavy app could read a document that was halfway saved. Awaiting is the
   * whole point of exposing the cleanup.
   */
  const closeModule = useCallback(async () => {
    const cleanup = pendingCleanup.current;
    pendingCleanup.current = null;
    pendingFlush.current = null;
    await cleanup?.();
    setRoute({ kind: "home" });
    await refresh();
  }, [refresh]);

  const openModule = useCallback((moduleId: string, intent?: CaptureIntent) => {
    setRoute(intent ? { kind: "module", moduleId, intent } : { kind: "module", moduleId });
  }, []);

  /**
   * Background discipline.
   *
   * Leaving a module flushes it, because `dispose` saves. So the way to make backgrounding
   * safe is to release the module after the person has been gone long enough to be done —
   * not immediately, which would throw away a scroll position someone expects to return to.
   *
   * Five minutes is a deliberate middle: WeChat suspends a mini program's JS thread after
   * five seconds and destroys it after thirty minutes, and we can afford neither the first
   * (this module is the only thing holding an unsaved edit) nor the last (it shares a heap
   * with everything else). The release path is the same `closeModule`, so there is one
   * teardown rather than two that could disagree.
   */
  const idleRelease = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const subscription = NativeApp.addListener("appStateChange", ({ isActive }) => {
      if (idleRelease.current) {
        clearTimeout(idleRelease.current);
        idleRelease.current = null;
      }
      if (!isActive && route.kind === "module") {
        // Flush at the boundary rather than waiting for the release: a phone gives no warning
        // before it kills a process, and the debounce leaves a window (ADR-0005).
        void pendingFlush.current?.();
        idleRelease.current = setTimeout(() => {
          idleRelease.current = null;
          void closeModule();
        }, IDLE_RELEASE_MS);
      }
    });
    return () => {
      if (idleRelease.current) clearTimeout(idleRelease.current);
      void subscription.then((handle) => handle.remove());
    };
  }, [route.kind, closeModule]);

  // Android's back button belongs to the container, not to a module: from a module
  // it returns home, and from home it leaves the app.
  useEffect(() => {
    const subscription = NativeApp.addListener("backButton", () => {
      if (route.kind === "module") void closeModule();
      else void NativeApp.exitApp();
    });
    return () => {
      void subscription.then((handle) => handle.remove());
    };
  }, [route.kind, closeModule]);

  const togglePin = useCallback((moduleId: string) => {
    setPinned((current) => {
      const next = current.includes(moduleId)
        ? current.filter((id) => id !== moduleId)
        : [moduleId, ...current];
      void pins.set(next);
      return next;
    });
  }, []);

  const host = useMemo<ModuleHost | null>(() => {
    if (route.kind !== "module") return null;
    const moduleId = route.moduleId;
    return {
      moduleId,
      documents,
      storage: createKeyValueStore(moduleId),
      navigation: {
        setTitle: () => {
          // The frame shows the module's declared name. A module renaming itself is
          // not a v0 need, and accepting it would mean the container tracking state
          // nothing reads.
        },
        close: () => void closeModule(),
      },
      files,
      recents: {
        remember: (documentId, title) => {
          // Update the list when the write lands, not when the route changes.
          // Leaving a module disposes it asynchronously, so a refresh triggered by
          // the route change can read the recents list before the final save has
          // written to it — and the entry would be missing until the next visit.
          void recents.remember({ documentId, moduleId, title }).then(refreshRecents);
        },
        forget: (documentId) => {
          void recents.forget(documentId);
        },
      },
      theme,
    };
  }, [route, closeModule, refreshRecents]);

  const modules = [
    ...createModuleRegistry([scratchModule, canvasModule]).modules,
    ...installed.map((pack) =>
      packAsModule(
        pack,
        () => setQuickCaptureOpen(true),
        (id) => void exportActiveDocument(id),
      ),
    ),
  ];
  const ordered = orderModules(modules, pinned);
  const captureTarget = ordered.find((module) => module.capabilities.includes("capture"));
  const captureTargets = ordered.filter((module) => module.capabilities.includes("capture"));

  const exportActiveDocument = useCallback(async (moduleId: string) => {
    try {
      const docs = await documents.list(moduleId);
      const firstDoc = docs[0];
      if (!firstDoc) {
        setNotice("No saved document found to export.");
        return;
      }
      const record = await documents.open(firstDoc.id);
      if (!record) {
        setNotice("Document could not be opened.");
        return;
      }
      const fileName = record.name.includes(".") ? record.name : `${record.name}.json`;
      const outcome = await files.share({
        name: fileName,
        mimeType: mimeFor(fileName),
        bytes: record.bytes,
      });
      if (!outcome.ok && outcome.reason !== "cancelled") {
        setNotice(`Export failed: ${outcome.message ?? "unknown error"}`);
      }
    } catch (error) {
      setNotice(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, []);

  const handleCapture = useCallback(
    (body: string, targetModuleId?: string) => {
      const targetId = targetModuleId || captureTarget?.id;
      if (!targetId) return;
      openModule(targetId, { kind: "text", body, source: "shell.capture" });
    },
    [captureTarget, openModule],
  );

  return (
    <>
      {route.kind === "module" && host ? (
        (() => {
          const module = modules.find((candidate) => candidate.id === route.moduleId);
          if (!module) return null;
          return (
            <MountedModule
              module={module}
              host={host}
              {...(route.intent ? { intent: route.intent } : {})}
              onClose={() => void closeModule()}
              onQuickCapture={() => setQuickCaptureOpen(true)}
              onExport={() => void exportActiveDocument(route.moduleId)}
              onCleanupReady={(cleanup) => {
                pendingCleanup.current = cleanup;
              }}
              onFlushReady={(flush) => {
                pendingFlush.current = flush;
              }}
            />
          );
        })()
      ) : (
        <Home
          modules={ordered}
          pinned={pinned}
          recents={recent}
          onOpen={(moduleId) => openModule(moduleId)}
          onCapture={(body) => handleCapture(body)}
          onTogglePin={togglePin}
          onInstall={() => void installFromFile()}
          onRemove={(moduleId) => void removeDomain(moduleId)}
          removable={new Set(installed.map((pack) => pack.manifest.id))}
          notice={notice}
        />
      )}

      <QuickCaptureSheet
        open={quickCaptureOpen}
        onClose={() => setQuickCaptureOpen(false)}
        onCapture={handleCapture}
        targets={captureTargets.map((m) => ({ id: m.id, name: m.name }))}
        defaultTargetId={route.kind === "module" ? route.moduleId : captureTarget?.id}
      />
    </>
  );
}
