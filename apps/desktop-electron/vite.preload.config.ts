import { defineConfig } from "vite";

export default defineConfig({
  build: {
    sourcemap: true,
    outDir: ".vite/build",
    emptyOutDir: false,
    lib: {
      entry: "electron/preload.ts",
      formats: ["cjs"],
      fileName: () => "preload.js"
    },
    rollupOptions: {
      external: ["electron"]
    }
  }
});
