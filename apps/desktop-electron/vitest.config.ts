import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.spec.ts"],
    typecheck: {
      tsconfig: "./tsconfig.json",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["electron/**/*.ts", "renderer/src/**/*.ts", "renderer/src/**/*.tsx"],
      exclude: ["**/node_modules/**", "tests/**", "**/*.d.ts"],
      thresholds: {
        statements: 60,
        branches: 55,
      }
    }
  }
});
