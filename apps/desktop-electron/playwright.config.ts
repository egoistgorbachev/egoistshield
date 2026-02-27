import { defineConfig } from "@playwright/test";

/**
 * Конфигурация Playwright для E2E тестов EgoistShield (Electron).
 *
 * Для Electron-приложений используется `_electron` fixture
 * вместо стандартного browser launch.
 *
 * Запуск: npx playwright test
 */
export default defineConfig({
    testDir: "./e2e",
    timeout: 30_000,
    expect: { timeout: 5_000 },
    retries: 1,
    reporter: [["list"]],
    use: {
        trace: "on-first-retry",
        screenshot: "only-on-failure",
    },
});
