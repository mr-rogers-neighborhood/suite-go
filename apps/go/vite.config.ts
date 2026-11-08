import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";

export default defineConfig({
  // Loro is Rust compiled to WebAssembly. The plugin resolves its `.wasm` import as
  // a module; without it the bundle keeps an import the WebView cannot resolve from
  // `file://`, and the failure appears only on a device.
  plugins: [react(), wasm()],
  resolve: {
    alias: {
      // The contract is compiled from source here, not from `dist`. A stale build
      // would let the app run against yesterday's contract while the tests passed
      // against today's, which is a bug that only shows up on a device.
      "@suite/go": fileURLToPath(new URL("../../packages/go/src/index.ts", import.meta.url)),
    },
  },
  // The bundle is loaded from `file://` inside the WebView, so every asset URL must
  // be relative. An absolute `/assets/...` resolves against the filesystem root.
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // A phone WebView is the only target, so the modern baseline is safe and the
    // bundle stays small enough to cold-start quickly from local storage.
    target: "es2022",
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
