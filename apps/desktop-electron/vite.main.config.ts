import { defineConfig } from "vite";

export default defineConfig({
  build: {
    sourcemap: true,
    outDir: ".vite/build",
    emptyOutDir: false,
    lib: {
      entry: "electron/main.ts",
      formats: ["cjs"],
      fileName: () => "main.js"
    },
    rollupOptions: {
      external: ["electron"]
    }
  }
});
