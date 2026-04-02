import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.spec.ts"],
    typecheck: {
      tsconfig: "./tsconfig.json"
    },
    coverage: {
      provider: "v8",
      all: false,
      reporter: ["text", "html", "lcov"],
      // Unit coverage is enforced for modules exercised by Vitest.
      // UI surfaces are validated by Playwright instead of V8 unit instrumentation.
      exclude: [
        "node_modules/**",
        "**/node_modules/**",
        "tests/**",
        "e2e/**",
        "**/*.d.ts",
        "renderer/src/store/**",
        "renderer/src/lib/api.ts",
        "electron/ipc/runtime-installer.ts"
      ],
      thresholds: {
        statements: 60,
        branches: 55
      }
    }
  }
});
