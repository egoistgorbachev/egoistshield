import path from "node:path";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";
import pkg from "./package.json";

const shouldAnalyzeBundle = process.env.EGOISTSHIELD_ANALYZE === "1";
const NODE_MODULES_SEGMENT = "/node_modules/";
const VENDOR_CHUNK_GROUPS = [
  {
    name: "vendor-react",
    patterns: ["/react/", "/react-dom/", "/zustand/", "/sonner/"]
  },
  {
    name: "vendor-motion",
    patterns: ["/framer-motion/"]
  },
  {
    name: "vendor-icons",
    patterns: ["/lucide-react/", "/react-circle-flags/"]
  },
  {
    name: "vendor-three-core",
    patterns: ["/three/build/", "/three/src/"]
  },
  {
    name: "vendor-three-fiber",
    patterns: ["/@react-three/fiber/"]
  },
  {
    name: "vendor-three-drei",
    patterns: ["/@react-three/drei/"]
  },
  {
    name: "vendor-geo",
    patterns: ["/topojson-client/", "/world-atlas/"]
  }
] as const;

function getManualChunk(id: string): string | undefined {
  const normalizedId = id.replaceAll("\\", "/");

  if (!normalizedId.includes(NODE_MODULES_SEGMENT)) {
    return undefined;
  }

  for (const chunk of VENDOR_CHUNK_GROUPS) {
    if (chunk.patterns.some((pattern) => normalizedId.includes(pattern))) {
      return chunk.name;
    }
  }

  return undefined;
}

export default defineConfig({
  plugins: [
    react(),
    ...(shouldAnalyzeBundle
      ? [
          visualizer({
            filename: "stats.html",
            gzipSize: true,
            brotliSize: true,
            open: false
          })
        ]
      : [])
  ],
  root: path.resolve(__dirname, "renderer"),
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  build: {
    outDir: path.resolve(__dirname, ".vite/renderer/main_window"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: getManualChunk
      }
    }
  }
});
