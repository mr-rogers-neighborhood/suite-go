import { App as NativeApp } from "@capacitor/app";
import type { CaptureIntent, ModuleHost } from "@suite/go";
import { createModuleRegistry } from "@suite/go";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createDocumentStore } from "../host/documents.js";
import { createFileService } from "../host/files.js";
import { createPins, orderModules } from "../host/pins.js";
import { createRecents, type RecentEntry } from "../host/recents.js";
import { createKeyValueStore } from "../host/storage.js";
import { applyDensity, resolveTheme } from "../host/theme.js";
import { canvasModule } from "../modules/canvas/index.js";
import { scratchModule } from "../modules/scratch/index.js";
import { Home } from "./Home.js";
import { MountedModule } from "./MountedModule.js";

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
const registry = createModuleRegistry([scratchModule, canvasModule]);
const documents = createDocumentStore();
const shellStorage = createKeyValueStore("shell");
const pins = createPins(shellStorage);
const recents = createRecents(shellStorage);
const files = createFileService();
const theme = resolveTheme();

type Route =
  | { readonly kind: "home" }
  | { readonly kind: "module"; readonly moduleId: string; readonly intent?: CaptureIntent };

export function App() {
  const [route, setRoute] = useState<Route>({ kind: "home" });
  const [pinned, setPinned] = useState<readonly string[]>([]);
  const [recent, setRecent] = useState<readonly RecentEntry[]>([]);

  useEffect(() => {
    applyDensity(theme.density);
  }, []);

  const refreshRecents = useCallback(async () => {
    setRecent(await recents.list());
  }, []);

  const refresh = useCallback(async () => {
    setPinned(await pins.list());
    await refreshRecents();
  }, [refreshRecents]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Android's back button belongs to the container, not to a module: from a module
  // it returns home, and from home it leaves the app.
  useEffect(() => {
    const subscription = NativeApp.addListener("backButton", () => {
      if (route.kind === "module") setRoute({ kind: "home" });
      else void NativeApp.exitApp();
    });
    return () => {
      void subscription.then((handle) => handle.remove());
    };
  }, [route.kind]);

  const openModule = useCallback((moduleId: string, intent?: CaptureIntent) => {
    setRoute(intent ? { kind: "module", moduleId, intent } : { kind: "module", moduleId });
  }, []);

  const closeModule = useCallback(() => {
    setRoute({ kind: "home" });
    void refresh();
  }, [refresh]);

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
        close: closeModule,
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

  const ordered = orderModules(registry.modules, pinned);
  const captureTarget = ordered.find((module) => module.capabilities.includes("capture"));

  if (route.kind === "module" && host) {
    const module = registry.find(route.moduleId);
    if (module) {
      return (
        <MountedModule
          module={module}
          host={host}
          {...(route.intent ? { intent: route.intent } : {})}
          onClose={closeModule}
        />
      );
    }
  }

  return (
    <Home
      modules={ordered}
      pinned={pinned}
      recents={recent}
      onOpen={(moduleId) => openModule(moduleId)}
      onCapture={(body) => {
        if (!captureTarget) return;
        openModule(captureTarget.id, { kind: "text", body, source: "shell.capture" });
      }}
      onTogglePin={togglePin}
    />
  );
}
