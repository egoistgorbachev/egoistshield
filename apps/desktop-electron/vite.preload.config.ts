import { builtinModules } from "node:module";
import { defineConfig } from "vite";

// Preload: экстернализируем Node.js + Electron
const nodeExternals = ["electron", ...builtinModules, ...builtinModules.map((m) => `node:${m}`)];

export default defineConfig({
  build: {
    sourcemap: true,
    outDir: ".vite/build",
    emptyOutDir: false,
    target: "node20",
    lib: {
      entry: "electron/preload.ts",
      formats: ["cjs"],
      fileName: () => "preload.js"
    },
    rollupOptions: {
      external: nodeExternals
    }
  }
});
