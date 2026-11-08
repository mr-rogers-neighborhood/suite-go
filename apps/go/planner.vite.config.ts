import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";

/**
 * Builds Planner's own renderer as a web bundle, without changing Planner.
 *
 * The renderer is already a plain Vite app — no Node builtins, no Electron import —
 * so it needs an entry point and the two aliases its desktop build uses. Everything
 * this writes stays inside suite-go: the output goes to `planner-dist` and the Vite
 * cache to `.vite-planner`, so building the mobile app never dirties the Planner
 * checkout.
 */
const planner = fileURLToPath(
  new URL("../../../suite-planner/apps/desktop/src/renderer", import.meta.url),
);
const rendererSrc = fileURLToPath(
  new URL("../../../suite-planner/apps/desktop/src/renderer/src", import.meta.url),
);
const core = fileURLToPath(
  new URL("../../../suite-planner/packages/core/src/index.ts", import.meta.url),
);

export default defineConfig({
  root: planner,
  base: "./",
  cacheDir: fileURLToPath(new URL("./.vite-planner", import.meta.url)),
  plugins: [react(), tailwindcss(), wasm()],
  resolve: {
    alias: {
      "@suite/planner-core": core,
      "@renderer": rendererSrc,
    },
  },
  optimizeDeps: {
    // Loro ships a wasm-bindgen entry; pre-bundling it breaks the wasm URL.
    exclude: ["loro-crdt"],
  },
  build: {
    outDir: fileURLToPath(new URL("./planner-dist", import.meta.url)),
    emptyOutDir: true,
    target: "es2022",
  },
});
