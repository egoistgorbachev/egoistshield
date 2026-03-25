import { builtinModules } from "node:module";
import { defineConfig } from "vite";
import pkg from "./package.json";

// Electron main process: экстернализируем ВСЁ
// 1. Node.js built-in модули (fs, path, crypto...)
// 2. Electron
// 3. ВСЕ npm dependencies (electron-log, yaml, zod...)
const nodeExternals = [
  "electron",
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {})
];

export default defineConfig({
  // Forge Vite plugin определяет эти переменные автоматически в dev-режиме.
  // Для standalone build (electron-builder) нужно задать вручную:
  // - MAIN_WINDOW_VITE_DEV_SERVER_URL = undefined (не dev-сервер)
  // - MAIN_WINDOW_VITE_NAME = "main_window" (subdir в .vite/renderer/)
  define: {
    MAIN_WINDOW_VITE_DEV_SERVER_URL: "undefined",
    MAIN_WINDOW_VITE_NAME: JSON.stringify("main_window")
  },
  build: {
    sourcemap: true,
    outDir: ".vite/build",
    emptyOutDir: false,
    target: "node20",
    lib: {
      entry: "electron/main.ts",
      formats: ["cjs"],
      fileName: () => "main.js"
    },
    rollupOptions: {
      external: nodeExternals
    }
  }
});
