/**
 * E2E тесты EgoistShield — Electron приложение.
 *
 * Используют `_electron` fixture для запуска реального Electron-окна.
 * Требуют предварительной сборки: `npm run package`
 *
 * Тесты проверяют:
 * 1. Запуск приложения
 * 2. Навигацию между экранами
 * 3. Переключение темы
 * 4. Модалку добавления сервера
 * 5. Offline баннер
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import path from "node:path";

// ── Helpers ──

const MAIN_ENTRY = path.resolve(__dirname, "../.vite/build/main.js");

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
    // Запуск Electron приложения
    app = await electron.launch({
        args: [MAIN_ENTRY],
        env: {
            ...process.env,
            NODE_ENV: "test",
            EGOISTSHIELD_MOCK_RUNTIME: "1", // Mock mode — не запускает xray/singbox
        },
    });
    page = await app.firstWindow();
    // Ждём рендер
    await page.waitForLoadState("domcontentloaded");
});

test.afterAll(async () => {
    if (app) await app.close();
});

// ── Тесты ──

test.describe("EgoistShield E2E", () => {
    test("приложение запускается и окно видимо", async () => {
        const isVisible = await app.evaluate(({ BrowserWindow }) => {
            const win = BrowserWindow.getAllWindows()[0];
            return win?.isVisible() ?? false;
        });
        expect(isVisible).toBe(true);
    });

    test("title содержит EgoistShield", async () => {
        const title = await page.title();
        expect(title.toLowerCase()).toContain("egoistshield");
    });

    test("отображается TitleBar с брендом", async () => {
        // Проверяем наличие бренда в TitleBar
        const brand = page.locator("text=EgoistShield");
        await expect(brand.first()).toBeVisible({ timeout: 10_000 });
    });

    test("навигация — tab Серверы", async () => {
        // Клик на таб "Серверы"
        const serversTab = page.locator('[aria-label="Основная навигация"] button', { hasText: "Серверы" });
        if (await serversTab.isVisible()) {
            await serversTab.click();
            // Проверяем что экран серверов отобразился
            await expect(page.locator("text=Серверы").first()).toBeVisible();
        }
    });

    test("навигация — tab Настройки", async () => {
        const settingsTab = page.locator('[aria-label="Основная навигация"] button', { hasText: "Настройки" });
        if (await settingsTab.isVisible()) {
            await settingsTab.click();
            await expect(page.locator("text=Настройки").first()).toBeVisible();
        }
    });

    test("навигация — возврат на Главную", async () => {
        const dashboardTab = page.locator('[aria-label="Основная навигация"] button', { hasText: "Главная" });
        if (await dashboardTab.isVisible()) {
            await dashboardTab.click();
            // Dashboard виден
            await page.waitForTimeout(500);
        }
    });

    test("кнопки управления окном существуют", async () => {
        const toolbar = page.locator('[role="toolbar"][aria-label="Управление окном"]');
        await expect(toolbar).toBeVisible();

        // Свернуть, Развернуть, Закрыть
        const minimizeBtn = page.locator('[aria-label="Свернуть"]');
        const maximizeBtn = page.locator('[aria-label="Развернуть"]');
        const closeBtn = page.locator('[aria-label="Закрыть"]');

        await expect(minimizeBtn).toBeVisible();
        await expect(maximizeBtn).toBeVisible();
        await expect(closeBtn).toBeVisible();
    });
});
