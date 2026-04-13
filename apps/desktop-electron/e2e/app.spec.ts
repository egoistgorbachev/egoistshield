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
import path from "node:path";
import { type ElectronApplication, type Page, _electron as electron, expect, test } from "@playwright/test";
import type { PersistedState } from "../shared/types";

// ── Helpers ──

const MAIN_ENTRY = path.resolve(__dirname, "../.vite/build/main.js");
const CUSTOM_DOH_URL = "https://dns.astronia.space:8443/dns-query/b4bb465a";
const CLEAN_STATE: PersistedState = {
  nodes: [],
  activeNodeId: null,
  subscriptions: [],
  processRules: [],
  domainRules: [],
  settings: {
    autoStart: false,
    startMinimized: false,
    autoUpdate: true,
    useTunMode: false,
    killSwitch: false,
    autoConnect: false,
    notifications: true,
    allowTelemetry: false,
    dnsMode: "auto",
    systemDnsServers: "",
    customDnsUrl: "",
    systemDohEnabled: false,
    systemDohUrl: "",
    systemDohLocalAddress: "",
    subscriptionUserAgent: "auto",
    runtimePath: "",
    routeMode: "global",
    zapretProfile: "General",
    zapretSuspendDuringVpn: true
  },
  usageHistory: []
};
const SAMPLE_NODE = {
  id: "node-sample-1",
  name: "QA Showcase NL",
  protocol: "vless" as const,
  server: "1.1.1.1",
  port: 443,
  uri: "vless://11111111-1111-1111-1111-111111111111@1.1.1.1:443?security=tls#QAShowcaseNL",
  metadata: {},
  countryCode: "nl"
};
const SECOND_SAMPLE_NODE = {
  id: "node-sample-2",
  name: "QA Showcase FI",
  protocol: "vless" as const,
  server: "8.8.8.8",
  port: 443,
  uri: "vless://22222222-2222-2222-2222-222222222222@8.8.8.8:443?security=tls#QAShowcaseFI",
  metadata: {},
  countryCode: "fi"
};
const STATE_WITH_SAMPLE_NODE: PersistedState = {
  ...CLEAN_STATE,
  nodes: [SAMPLE_NODE],
  activeNodeId: SAMPLE_NODE.id
};
const STATE_WITH_MULTIPLE_NODES: PersistedState = {
  ...CLEAN_STATE,
  nodes: [SAMPLE_NODE, SECOND_SAMPLE_NODE],
  activeNodeId: SAMPLE_NODE.id
};
const STATE_WITH_LARGE_NODE_SET: PersistedState = {
  ...CLEAN_STATE,
  nodes: Array.from({ length: 240 }, (_, index) => {
    const nodeNumber = String(index + 1).padStart(3, "0");
    const countryCode = index % 3 === 0 ? "nl" : index % 3 === 1 ? "fi" : "de";

    return {
      ...SAMPLE_NODE,
      id: `node-large-${index + 1}`,
      name: `Load Test ${nodeNumber}`,
      server: `10.${Math.floor(index / 200) + 10}.${Math.floor((index % 200) / 50) + 20}.${(index % 50) + 10}`,
      uri: `vless://11111111-1111-1111-1111-111111111111@10.${Math.floor(index / 200) + 10}.${Math.floor((index % 200) / 50) + 20}.${(index % 50) + 10}:443?security=tls#LoadTest${nodeNumber}`,
      countryCode
    };
  }),
  activeNodeId: "node-large-1"
};
const MAP_DENSE_COUNTRY_CODES = [
  "nl",
  "fi",
  "de",
  "gb",
  "fr",
  "se",
  "no",
  "dk",
  "pl",
  "cz",
  "at",
  "ch",
  "it",
  "es",
  "pt",
  "ie",
  "us",
  "ca",
  "jp",
  "sg"
] as const;
const STATE_WITH_DENSE_MAP_NODE_SET: PersistedState = {
  ...CLEAN_STATE,
  nodes: MAP_DENSE_COUNTRY_CODES.flatMap((countryCode, countryIndex) =>
    Array.from({ length: 2 }, (_, replicaIndex) => {
      const suffix = `${countryCode}-${replicaIndex + 1}`;
      return {
        ...SAMPLE_NODE,
        id: `node-map-${suffix}`,
        name: `Map Dense ${countryCode.toUpperCase()} ${replicaIndex + 1}`,
        server: `172.${countryIndex + 16}.${replicaIndex + 30}.${countryIndex + replicaIndex + 10}`,
        uri: `vless://11111111-1111-1111-1111-111111111111@172.${countryIndex + 16}.${replicaIndex + 30}.${countryIndex + replicaIndex + 10}:443?security=tls#MapDense${countryCode.toUpperCase()}${replicaIndex + 1}`,
        countryCode
      };
    })
  ),
  activeNodeId: "node-map-nl-1"
};

function assertBoundsAreStable(
  before: { x: number; y: number; width: number; height: number } | null,
  after: { x: number; y: number; width: number; height: number } | null,
  label: string
): void {
  expect(before, `${label}: initial bounds are unavailable`).not.toBeNull();
  expect(after, `${label}: next bounds are unavailable`).not.toBeNull();

  if (!before || !after) {
    throw new Error(`${label}: bounds are unavailable`);
  }

  expect(Math.abs(after.x - before.x), `${label}: x shifted`).toBeLessThanOrEqual(1);
  expect(Math.abs(after.y - before.y), `${label}: y shifted`).toBeLessThanOrEqual(4);
  expect(Math.abs(after.width - before.width), `${label}: width changed`).toBeLessThanOrEqual(1);
  expect(Math.abs(after.height - before.height), `${label}: height changed`).toBeLessThanOrEqual(1);
}

async function reloadCurrentPage(targetPage: Page): Promise<void> {
  try {
    await targetPage.goto(targetPage.url(), { waitUntil: "domcontentloaded" });
  } catch {
    // Electron может перевыдать window/page объект во время reload.
  }

  page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
}

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  // Запуск Electron приложения
  app = await electron.launch({
    args: [MAIN_ENTRY],
    env: {
      ...process.env,
      NODE_ENV: "test",
      EGOISTSHIELD_MOCK_RUNTIME: "1" // Mock mode — не запускает xray/singbox
    }
  });
  page = await app.firstWindow();
  // Ждём рендер
  await page.waitForLoadState("domcontentloaded");

  const shouldReloadIntoShell = await page.evaluate(async () => {
    if (!window.egoistAPI?.app) {
      return false;
    }

    const isFirstRun = await window.egoistAPI.app.isFirstRun();
    if (!isFirstRun) {
      return false;
    }

    await window.egoistAPI.app.markFirstRunDone();
    return true;
  });

  if (shouldReloadIntoShell) {
    await reloadCurrentPage(page);
  }

  await expect(page.locator('[aria-label="Основная навигация"]')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(async (nextState: PersistedState) => {
    await window.egoistAPI?.state.set(nextState);
  }, CLEAN_STATE);
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
    const serversTab = page.getByRole("button", { name: "Серверы" }).first();
    if (await serversTab.isVisible()) {
      await serversTab.click();
      // Проверяем что экран серверов отобразился
      await expect(page.locator("text=Серверы").first()).toBeVisible();
    }
  });

  test("навигация — tab Настройки", async () => {
    const settingsTab = page.getByRole("button", { name: "Настройки" }).first();
    if (await settingsTab.isVisible()) {
      await settingsTab.click();
      await expect(page.locator("text=Настройки").first()).toBeVisible();
    }
  });

  test("навигация — tab Zapret", async () => {
    const zapretTab = page.getByRole("button", { name: "Zapret" }).first();
    if (await zapretTab.isVisible()) {
      const waitForZapretScreen = async (timeout: number) => {
        try {
          await expect(page.locator('[data-screen="zapret"]')).toBeVisible({ timeout });
          return true;
        } catch {
          return false;
        }
      };

      await zapretTab.click();
      if (!(await waitForZapretScreen(2_500))) {
        await zapretTab.click();
      }
      await expect(page.locator('[data-screen="zapret"]')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("heading", { name: "Центр Zapret" })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(/Ядро (готово|недоступно)/)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("Error invoking remote method 'zapret:status'")).toHaveCount(0);
      await expect
        .poll(
          async () =>
            await page
              .locator("select")
              .first()
              .evaluate((element) => element.querySelectorAll("option").length),
          {
            timeout: 15_000
          }
        )
        .toBeGreaterThan(0);
      await expect
        .poll(async () => await page.locator("select").first().inputValue(), { timeout: 15_000 })
        .toMatch(/\S+/);

      const zapretStatus = await page.evaluate(async () => {
        return window.egoistAPI?.zapret.status();
      });

      expect(zapretStatus?.coreVersion).toBeTruthy();
      expect(zapretStatus?.coreVersion?.toLowerCase()).not.toContain("unknown");

      if (!zapretStatus?.coreVersion) {
        throw new Error("Zapret coreVersion is unavailable");
      }

      await expect(page.getByText(zapretStatus.coreVersion, { exact: false }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Классический обновлятор" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Сервисное меню" })).toHaveCount(0);

      const deprecatedWrappers = await page.evaluate(async () => {
        const api = window.egoistAPI?.zapret;
        if (!api) {
          return null;
        }

        const [updater, serviceMenu] = await Promise.all([api.runCoreUpdater(), api.openServiceMenu()]);
        return { updater, serviceMenu };
      });

      expect(deprecatedWrappers?.updater.opened).toBe(false);
      expect(deprecatedWrappers?.serviceMenu.opened).toBe(false);
      expect(deprecatedWrappers?.updater.message).toContain("встроенный блок Flowseal Core");
      expect(deprecatedWrappers?.serviceMenu.message).toContain(
        "Все действия со службой доступны прямо в центре Zapret"
      );
    }
  });

  test("hero верхних экранов держит теги в одной строке, а Серверы выравнивают кнопку Добавить с индикаторами", async () => {
    await page.evaluate(async (nextState: PersistedState) => {
      await window.egoistAPI?.state.set(nextState);
    }, STATE_WITH_MULTIPLE_NODES);

    await reloadCurrentPage(page);
    await expect(page.locator('[aria-label="Основная навигация"]')).toBeVisible({ timeout: 15_000 });

    const assertSingleLineHeroBadges = async (
      buttonName: string,
      readyBadgePattern: RegExp,
      withRailAction = false
    ) => {
      await page.getByRole("button", { name: buttonName }).first().click();
      await expect(page.getByText(readyBadgePattern).first()).toBeVisible({ timeout: 15_000 });

      const badges = page.locator('[data-testid="page-hero-badge"]');
      await expect(badges).toHaveCount(3);

      const firstBox = await badges.nth(0).boundingBox();
      const secondBox = await badges.nth(1).boundingBox();
      const thirdBox = await badges.nth(2).boundingBox();

      expect(firstBox).not.toBeNull();
      expect(secondBox).not.toBeNull();
      expect(thirdBox).not.toBeNull();

      if (!firstBox || !secondBox || !thirdBox) {
        throw new Error(`Hero badge bounds are unavailable for ${buttonName}`);
      }

      expect(Math.abs(firstBox.y - secondBox.y)).toBeLessThanOrEqual(3);
      expect(Math.abs(firstBox.y - thirdBox.y)).toBeLessThanOrEqual(3);

      if (withRailAction) {
        const actionBox = await page.locator('[data-testid="page-hero-rail-action"]').boundingBox();
        expect(actionBox).not.toBeNull();
        if (!actionBox) {
          throw new Error(`Hero rail action bounds are unavailable for ${buttonName}`);
        }
        expect(Math.abs(firstBox.y - actionBox.y)).toBeLessThanOrEqual(6);
      }
    };

    await assertSingleLineHeroBadges("Серверы", /узлов/i, true);
    await assertSingleLineHeroBadges("Zapret", /Ядро (готово|недоступно)/i);
    await assertSingleLineHeroBadges("Настройки", /Автопроверка обновлений/i);
  });

  test("навигация — возврат на Главную", async () => {
    const dashboardTab = page.getByRole("button", { name: "Главная" }).first();
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

    const isMaximizedBefore = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return win?.isMaximized() ?? false;
    });
    expect(isMaximizedBefore).toBe(false);

    await maximizeBtn.click();

    await expect
      .poll(async () => {
        return app.evaluate(({ BrowserWindow }) => {
          const win = BrowserWindow.getAllWindows()[0];
          return win?.isMaximized() ?? false;
        });
      })
      .toBe(true);

    const restoreBtn = page.locator('[aria-label="Восстановить"]');
    await expect(restoreBtn).toBeVisible();
    await restoreBtn.click();

    await expect
      .poll(async () => {
        return app.evaluate(({ BrowserWindow }) => {
          const win = BrowserWindow.getAllWindows()[0];
          return win?.isMaximized() ?? false;
        });
      })
      .toBe(false);
  });

  test("Ctrl+K открывает command palette", async () => {
    await page.locator("body").click();
    await page.keyboard.press("Control+K");

    const paletteInput = page.locator('input[placeholder*="Поиск серверов"]');
    await expect(paletteInput).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(paletteInput).toBeHidden();
  });

  test("Ctrl+V импортирует VPN URI вне input", async () => {
    await page.evaluate(async (nextState: PersistedState) => {
      await window.egoistAPI?.state.set(nextState);
    }, CLEAN_STATE);

    const stateBefore = await page.evaluate(async (): Promise<PersistedState | undefined> => {
      return window.egoistAPI?.state.get();
    });
    expect(stateBefore?.nodes).toHaveLength(0);

    await app.evaluate(({ clipboard }) => {
      clipboard.writeText("vless://11111111-1111-1111-1111-111111111111@1.1.1.1:443?security=tls#HotkeyImport");
    });

    await page.locator("body").click();
    await page.keyboard.press("Control+V");

    await expect
      .poll(async () => {
        const state = await page.evaluate(async (): Promise<PersistedState | undefined> => {
          return window.egoistAPI?.state.get();
        });
        return state?.nodes.find((node) => node.name === "HotkeyImport") ?? null;
      })
      .toMatchObject({
        name: "HotkeyImport",
        protocol: "vless",
        server: "1.1.1.1",
        port: 443
      });
  });

  test("системный DNS применяется и сбрасывается через настройки", async () => {
    await page.evaluate(async (nextState: PersistedState) => {
      await window.egoistAPI?.state.set(nextState);
    }, CLEAN_STATE);

    await reloadCurrentPage(page);
    await expect(page.locator('[aria-label="Основная навигация"]')).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "DNS" }).first().click();

    const dnsTextarea = page.locator("textarea").first();
    await expect(dnsTextarea).toBeVisible();
    await dnsTextarea.fill("1.1.1.1, 1.0.0.1");

    await page.getByRole("button", { name: "Установить DNS в системе" }).click();

    await expect
      .poll(async () => {
        const state = await page.evaluate(async (): Promise<PersistedState | undefined> => {
          return window.egoistAPI?.state.get();
        });
        return state?.settings.systemDnsServers ?? null;
      })
      .toBe("1.1.1.1, 1.0.0.1");

    await expect(dnsTextarea).toHaveValue("1.1.1.1, 1.0.0.1");

    await page.getByRole("button", { name: "Сбросить по умолчанию" }).click();

    await expect
      .poll(async () => {
        const state = await page.evaluate(async (): Promise<PersistedState | undefined> => {
          return window.egoistAPI?.state.get();
        });
        return state?.settings.systemDnsServers ?? null;
      })
      .toBe("");

    await expect(dnsTextarea).toHaveValue("");
  });

  test("custom DoH сохраняется, включает secure DNS и очищается до встроенного режима", async () => {
    await page.evaluate(async (nextState: PersistedState) => {
      await window.egoistAPI?.state.set(nextState);
    }, CLEAN_STATE);

    await reloadCurrentPage(page);
    await expect(page.locator('[aria-label="Основная навигация"]')).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Настройки" }).click();
    await page.getByRole("tab", { name: "Сеть" }).click();

    const customDnsTextarea = page.getByPlaceholder("https://dns.example.com/dns-query");
    await expect(customDnsTextarea).toBeVisible();
    await customDnsTextarea.fill(CUSTOM_DOH_URL);

    await page.getByRole("button", { name: /Сохранить/ }).click();

    await expect
      .poll(async () => {
        const state = await page.evaluate(async (): Promise<PersistedState | undefined> => {
          return window.egoistAPI?.state.get();
        });

        if (!state) {
          return null;
        }

        return {
          customDnsUrl: state.settings.customDnsUrl ?? "",
          dnsMode: state.settings.dnsMode
        };
      })
      .toEqual({
        customDnsUrl: CUSTOM_DOH_URL,
        dnsMode: "custom"
      });

    await expect(customDnsTextarea).toHaveValue(CUSTOM_DOH_URL);
    await expect(page.getByText("Сейчас активен ваш custom DoH.")).toBeVisible();

    await page.getByRole("button", { name: "Очистить custom DoH" }).click();

    await expect
      .poll(async () => {
        const state = await page.evaluate(async (): Promise<PersistedState | undefined> => {
          return window.egoistAPI?.state.get();
        });

        if (!state) {
          return null;
        }

        return {
          customDnsUrl: state.settings.customDnsUrl ?? "",
          dnsMode: state.settings.dnsMode
        };
      })
      .toEqual({
        customDnsUrl: "",
        dnsMode: "secure"
      });

    await expect(customDnsTextarea).toHaveValue("");
  });

  test("System DoH включается в DNS-центре и выключается без потери сохранённого URL", async () => {
    await page.evaluate(async (nextState: PersistedState) => {
      await window.egoistAPI?.state.set(nextState);
    }, CLEAN_STATE);

    await reloadCurrentPage(page);
    await expect(page.locator('[aria-label="Основная навигация"]')).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "DNS" }).first().click();

    const systemDohTextarea = page.locator("#system-doh-input");
    await expect(systemDohTextarea).toBeVisible();
    await systemDohTextarea.fill(CUSTOM_DOH_URL);

    await page.getByRole("button", { name: "Включить System DoH" }).click();

    await expect
      .poll(async () => {
        const state = await page.evaluate(async (): Promise<PersistedState | undefined> => {
          return window.egoistAPI?.state.get();
        });

        if (!state) {
          return null;
        }

        return {
          systemDohEnabled: state.settings.systemDohEnabled ?? false,
          systemDohUrl: state.settings.systemDohUrl ?? "",
          systemDohLocalAddress: state.settings.systemDohLocalAddress ?? ""
        };
      })
      .toEqual({
        systemDohEnabled: true,
        systemDohUrl: CUSTOM_DOH_URL,
        systemDohLocalAddress: "127.0.0.2"
      });

    await expect(page.getByText("System DoH активен").first()).toBeVisible();

    await page.getByRole("button", { name: "Отключить System DoH" }).click();

    await expect
      .poll(async () => {
        const state = await page.evaluate(async (): Promise<PersistedState | undefined> => {
          return window.egoistAPI?.state.get();
        });

        if (!state) {
          return null;
        }

        return {
          systemDohEnabled: state.settings.systemDohEnabled ?? false,
          systemDohUrl: state.settings.systemDohUrl ?? "",
          systemDohLocalAddress: state.settings.systemDohLocalAddress ?? ""
        };
      })
      .toEqual({
        systemDohEnabled: false,
        systemDohUrl: CUSTOM_DOH_URL,
        systemDohLocalAddress: ""
      });

    await expect(systemDohTextarea).toHaveValue(CUSTOM_DOH_URL);
  });

  test("DNS textarea стартует компактно и растёт только при длинном вводе", async () => {
    await page.evaluate(async (nextState: PersistedState) => {
      await window.egoistAPI?.state.set(nextState);
    }, CLEAN_STATE);

    await reloadCurrentPage(page);
    await expect(page.locator('[aria-label="Основная навигация"]')).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "DNS" }).first().click();

    const dnsTextarea = page.locator("#system-dns-input");
    await expect(dnsTextarea).toBeVisible();

    const initialHeight = await dnsTextarea.evaluate((element) => element.getBoundingClientRect().height);
    expect(initialHeight).toBeLessThanOrEqual(130);

    await dnsTextarea.fill(
      "1.1.1.1\n1.0.0.1\n8.8.8.8\n8.8.4.4\n9.9.9.9\n149.112.112.112\n94.140.14.14\n94.140.15.15\n77.88.8.8\n77.88.8.1\n208.67.222.222\n208.67.220.220"
    );

    const expandedState = await dnsTextarea.evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflowY: window.getComputedStyle(element).overflowY
    }));

    expect(expandedState.height).toBeGreaterThanOrEqual(initialHeight);
    expect(expandedState.height).toBeLessThanOrEqual(380);
    expect(
      expandedState.scrollHeight - expandedState.clientHeight <= 8 || expandedState.overflowY === "auto"
    ).toBeTruthy();
  });

  test("DNS экран показывает нижний блок с важными примечаниями без обрезания и overflow", async () => {
    await page.evaluate(async (nextState: PersistedState) => {
      await window.egoistAPI?.state.set(nextState);
    }, CLEAN_STATE);

    await reloadCurrentPage(page);
    await expect(page.locator('[aria-label="Основная навигация"]')).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "DNS" }).first().click();

    const importantHeading = page.getByText("Важно");
    await importantHeading.scrollIntoViewIfNeeded();
    await expect(importantHeading).toBeVisible();
    await expect(page.getByText("Активный набор")).toBeVisible();
    await expect(page.locator("p").filter({ hasText: "Используется системный DNS Windows." })).toBeVisible();
    await expect(page.getByText("Область действия")).toBeVisible();
    await expect(
      page.getByText("Системный DNS влияет на весь интернет-трафик Windows, а не только на VPN-сессию.")
    ).toBeVisible();

    const hasHorizontalOverflow = await page
      .locator("main")
      .first()
      .evaluate((element) => {
        return element.scrollWidth - element.clientWidth > 1;
      });
    expect(hasHorizontalOverflow).toBe(false);
  });

  test("tooltip режима подключения остаётся в кадре и не создаёт нижний overflow-артефакт", async () => {
    await page.evaluate(async (nextState: PersistedState) => {
      await window.egoistAPI?.state.set(nextState);
    }, STATE_WITH_SAMPLE_NODE);

    await reloadCurrentPage(page);
    await expect(page.locator('[aria-label="Основная навигация"]')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(4_200);

    const smartModeButton = page.getByRole("button", { name: "Умный" });
    const serverCard = page.getByText("QA Showcase NL");
    await expect(smartModeButton).toBeVisible();
    await smartModeButton.hover();

    const tooltipTitle = page.getByText("Умный режим");
    const tooltipDescription = page.getByText(
      "Автоматически выбирает сервер с лучшим пингом и обходит сбои подключения."
    );
    await expect(tooltipTitle).toBeVisible();
    await expect(tooltipDescription).toBeVisible();

    const tooltipBounds = await tooltipTitle.boundingBox();
    expect(tooltipBounds).not.toBeNull();

    if (!tooltipBounds) {
      throw new Error("Tooltip bounds are unavailable");
    }

    const serverBounds = await serverCard.boundingBox();
    expect(serverBounds).not.toBeNull();

    if (!serverBounds) {
      throw new Error("Server card bounds are unavailable");
    }

    const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));

    expect(tooltipBounds.x).toBeGreaterThanOrEqual(0);
    expect(tooltipBounds.x + tooltipBounds.width).toBeLessThanOrEqual(viewport.width);
    expect(tooltipBounds.y + tooltipBounds.height).toBeLessThanOrEqual(serverBounds.y);

    const hasHorizontalOverflow = await page.getByTestId("dashboard-scroll-area").evaluate((element) => {
      return element.scrollWidth - element.clientWidth > 1;
    });
    expect(hasHorizontalOverflow).toBe(false);
  });

  test("hover подсказок Умный и Точный не сдвигает dashboard layout", async () => {
    await page.evaluate(async (nextState: PersistedState) => {
      await window.egoistAPI?.state.set(nextState);
    }, STATE_WITH_SAMPLE_NODE);

    await reloadCurrentPage(page);
    await expect(page.locator('[aria-label="Основная навигация"]')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(4_200);

    const smartModeButton = page.getByRole("button", { name: "Умный" });
    const defaultModeButton = page.getByRole("button", { name: "Точный" });
    const serverCardTitle = page.getByText("QA Showcase NL");

    const smartBefore = await smartModeButton.boundingBox();
    const defaultBefore = await defaultModeButton.boundingBox();
    const serverBefore = await serverCardTitle.boundingBox();

    await smartModeButton.hover();
    await expect(page.getByText("Умный режим")).toBeVisible();
    const smartAfter = await smartModeButton.boundingBox();
    const defaultAfterSmartHover = await defaultModeButton.boundingBox();
    const serverAfterSmartHover = await serverCardTitle.boundingBox();

    assertBoundsAreStable(smartBefore, smartAfter, "smart toggle");
    assertBoundsAreStable(defaultBefore, defaultAfterSmartHover, "default toggle after smart hover");
    assertBoundsAreStable(serverBefore, serverAfterSmartHover, "server card after smart hover");

    await defaultModeButton.hover();
    await expect(page.getByText("Точный режим")).toBeVisible();
    const defaultAfter = await defaultModeButton.boundingBox();
    const smartAfterDefaultHover = await smartModeButton.boundingBox();
    const serverAfterDefaultHover = await serverCardTitle.boundingBox();

    assertBoundsAreStable(defaultBefore, defaultAfter, "default toggle");
    assertBoundsAreStable(smartBefore, smartAfterDefaultHover, "smart toggle after default hover");
    assertBoundsAreStable(serverBefore, serverAfterDefaultHover, "server card after default hover");
  });

  test("карточки dashboard имеют безопасный inset и не режут тени по краям", async () => {
    await page.evaluate(async (nextState: PersistedState) => {
      await window.egoistAPI?.state.set(nextState);
    }, STATE_WITH_SAMPLE_NODE);

    await reloadCurrentPage(page);
    await expect(page.locator('[aria-label="Основная навигация"]')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(4_200);

    const scrollArea = page.getByTestId("dashboard-scroll-area");
    const cardsGrid = page.getByTestId("dashboard-cards-grid");

    const scrollBounds = await scrollArea.boundingBox();
    const gridBounds = await cardsGrid.boundingBox();

    expect(scrollBounds).not.toBeNull();
    expect(gridBounds).not.toBeNull();

    if (!scrollBounds || !gridBounds) {
      throw new Error("Dashboard bounds are unavailable");
    }

    const leftInset = gridBounds.x - scrollBounds.x;
    const rightInset = scrollBounds.x + scrollBounds.width - (gridBounds.x + gridBounds.width);

    expect(leftInset).toBeGreaterThanOrEqual(18);
    expect(rightInset).toBeGreaterThanOrEqual(18);

    const hasHorizontalOverflow = await scrollArea.evaluate((element) => {
      return element.scrollWidth - element.clientWidth > 1;
    });
    expect(hasHorizontalOverflow).toBe(false);
  });

  test("подключение и отключение по кнопке меняет состояние и палитру power button", async () => {
    await page.evaluate(async (nextState: PersistedState) => {
      await window.egoistAPI?.state.set(nextState);
    }, STATE_WITH_SAMPLE_NODE);

    await reloadCurrentPage(page);
    await expect(page.locator('[aria-label="Основная навигация"]')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(4_200);

    const disconnectedButton = page.locator('[data-testid="dashboard-scroll-area"] button').first();
    await expect(disconnectedButton).toBeVisible();

    const disconnectedGradient = await disconnectedButton.evaluate((button) => {
      const gradientLayer = button.querySelector(":scope > div:nth-child(2)");
      return gradientLayer instanceof HTMLElement ? getComputedStyle(gradientLayer).backgroundImage : "";
    });
    expect(disconnectedGradient).toContain("rgb(224, 64, 30)");
    expect(disconnectedGradient).toContain("rgb(255, 76, 41)");

    await disconnectedButton.click({ force: true });

    await expect(page.getByText("ЗАЩИЩЕНО")).toBeVisible({ timeout: 15_000 });
    const connectedButton = page.locator('[data-testid="dashboard-scroll-area"] button').first();
    await expect(connectedButton).toBeVisible();
    await expect
      .poll(
        async () =>
          await connectedButton.evaluate((button) => {
            const gradientLayer = button.querySelector(":scope > div:nth-child(2)");
            return gradientLayer instanceof HTMLElement ? getComputedStyle(gradientLayer).backgroundImage : "";
          }),
        { timeout: 15_000 }
      )
      .toContain("rgb(4, 120, 87)");
    await expect
      .poll(
        async () =>
          await connectedButton.evaluate((button) => {
            const gradientLayer = button.querySelector(":scope > div:nth-child(2)");
            return gradientLayer instanceof HTMLElement ? getComputedStyle(gradientLayer).backgroundImage : "";
          }),
        { timeout: 15_000 }
      )
      .toContain("rgb(16, 185, 129)");

    await connectedButton.click({ force: true });
    await expect(page.getByText("ОТКЛЮЧЕНО")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Подключить VPN" })).toBeVisible();
  });

  test("ServerList tab navigation, search and add modal работают без обрезаний", async () => {
    await page.evaluate(async (nextState: PersistedState) => {
      await window.egoistAPI?.state.set(nextState);
    }, STATE_WITH_MULTIPLE_NODES);

    await reloadCurrentPage(page);
    await expect(page.locator('[aria-label="Основная навигация"]')).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Серверы" }).first().click();

    const nodesTab = page.getByRole("tab", { name: "Узлы" });
    const subscriptionsTab = page.getByRole("tab", { name: /Подписки/ });
    await expect(nodesTab).toHaveAttribute("aria-selected", "true");
    await expect(subscriptionsTab).toBeVisible();

    const search = page.getByPlaceholder("Поиск серверов...");
    await search.fill("FI");
    await expect(page.getByText("QA Showcase FI")).toBeVisible();
    await expect(page.getByText("QA Showcase NL")).toHaveCount(0);

    await search.clear();
    await page.getByTitle("Добавить конфигурацию").click();
    await expect(page.getByRole("heading", { name: "Добавить Сервер" })).toBeVisible();
    await expect(page.getByPlaceholder("vless://...")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Добавить Сервер" })).toBeHidden();
  });

  test("ServerList держит большой набор узлов и остаётся отзывчивым при поиске", async () => {
    await page.evaluate(async (nextState: PersistedState) => {
      await window.egoistAPI?.state.set(nextState);
    }, STATE_WITH_LARGE_NODE_SET);

    await reloadCurrentPage(page);
    await page.getByRole("button", { name: "Серверы" }).first().click();

    await expect(page.getByText(/240 узлов/i).first()).toBeVisible({ timeout: 5_000 });

    const searchInput = page.getByPlaceholder("Поиск серверов...");
    await searchInput.fill("Load Test 199");

    await expect(page.getByText("Load Test 199")).toBeVisible({ timeout: 2_000 });
    await expect(page.getByText("Load Test 001")).toHaveCount(0);
  });

  test("ServerList карта выдерживает плотный набор стран и повторное открытие без скачков layout", async () => {
    await page.evaluate(async (nextState: PersistedState) => {
      await window.egoistAPI?.state.set(nextState);
    }, STATE_WITH_DENSE_MAP_NODE_SET);

    await reloadCurrentPage(page);
    await page.getByRole("button", { name: "Серверы" }).first().click();

    await page.getByRole("tab", { name: "Карта" }).click();

    const mapPanel = page.locator('[data-testid="serverlist-map-tab-panel"]');
    const mapCanvas = mapPanel.locator("canvas");

    await expect(mapPanel).toBeVisible({ timeout: 10_000 });
    await expect(mapCanvas).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(800);

    const firstBounds = await mapCanvas.boundingBox();

    await page.getByRole("tab", { name: "Узлы" }).click();
    await expect(page.getByPlaceholder("Поиск серверов...")).toBeVisible({ timeout: 5_000 });

    await page.getByRole("tab", { name: "Карта" }).click();
    await expect(mapCanvas).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(400);

    const secondBounds = await mapCanvas.boundingBox();
    assertBoundsAreStable(firstBounds, secondBounds, "Dense map canvas");
  });

  test("Settings toggles и diagnostics modal работают и не ломают layout", async () => {
    await reloadCurrentPage(page);
    await expect(page.locator('[aria-label="Основная навигация"]')).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Настройки" }).first().click();

    const networkTab = page.getByRole("tab", { name: "Сеть" });
    const advancedTab = page.getByRole("tab", { name: "Расширенные" });
    await expect(networkTab).toBeVisible();

    await networkTab.click();
    const secureDnsSwitch = page.getByRole("switch", { name: "Защищённый DNS" });
    const secureDnsBefore = await secureDnsSwitch.getAttribute("aria-checked");
    await secureDnsSwitch.click();
    await expect(secureDnsSwitch).toHaveAttribute("aria-checked", secureDnsBefore === "true" ? "false" : "true");

    await advancedTab.click();
    const logsButton = page.getByRole("button", { name: /Открыть/ }).last();
    await logsButton.click();
    await expect(page.getByRole("heading", { name: "Журнал подключений" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Журнал подключений" })).toBeHidden();
  });

  test("Settings screen shortcuts открывают центр Zapret и прокси Telegram", async () => {
    await reloadCurrentPage(page);
    await expect(page.locator('[aria-label="Основная навигация"]')).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Настройки" }).first().click();
    await page.getByRole("tab", { name: "Сеть" }).click();

    await page.getByRole("button", { name: "Открыть DNS-центр" }).click();
    await expect(page.getByRole("heading", { name: "Управление DNS" })).toBeVisible();

    await page.getByRole("button", { name: "Настройки" }).first().click();
    await page.getByRole("tab", { name: "Сеть" }).click();

    await page.getByRole("button", { name: "Открыть центр Zapret" }).click();
    await expect(page.locator("text=Центр Zapret").first()).toBeVisible();

    await page.getByRole("button", { name: "Настройки" }).first().click();
    await page.getByRole("tab", { name: "Сеть" }).click();

    await page.getByRole("button", { name: "Открыть прокси Telegram" }).click();
    await expect(page.getByRole("heading", { name: "Прокси Telegram" })).toBeVisible();
  });

  test("Прокси Telegram показывает локализованный фоновый UX без старого tray-копирайта", async () => {
    await reloadCurrentPage(page);
    await expect(page.locator('[aria-label="Основная навигация"]')).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Прокси Telegram" }).first().click();

    await expect(page.getByRole("heading", { name: "Прокси Telegram" })).toBeVisible();
    await expect(page.getByText(/Фоновый `tg-ws-proxy`, которым полностью управляет EgoistShield/i)).toBeVisible();
    await expect(page.getByText(/скрытый фоновый процесс без отдельного окна в трее/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Встроенные обновления/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Применить обновление" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Установить обновление" })).toHaveCount(0);
    await expect(page.getByText(/sidecar/i)).toHaveCount(0);
    await expect(page.getByText(/Headless Managed Runtime|Runtime Ready|No Tray App/)).toHaveCount(0);
  });

  test("Прокси Telegram выполняет save/check/start/restart/stop на реальном фоне", async () => {
    await reloadCurrentPage(page);
    await expect(page.locator('[aria-label="Основная навигация"]')).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Прокси Telegram" }).first().click();
    await expect(page.getByRole("heading", { name: "Прокси Telegram" })).toBeVisible();

    const numberInputs = page.locator("input[type='number']");
    await numberInputs.first().fill("15455");
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();

    await expect(page.getByText("Конфигурация прокси Telegram сохранена.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/port=15455/)).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Проверить" }).last().click();
    await expect(page.getByText(/Прокси Telegram/).last()).toBeVisible();
    await expect(page.getByText(/GitHub HTTP 403/)).toHaveCount(0);

    await page.getByRole("button", { name: "Запустить", exact: true }).click();
    await expect(page.getByText(/Прокси Telegram запущен\./)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/^В фоне · PID \d+$/)).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Перезапустить", exact: true }).click();
    await expect(page.getByText(/Прокси Telegram перезапущен\./)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/^В фоне · PID \d+$/)).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Остановить", exact: true }).click();
    await expect(page.getByText(/Прокси Telegram остановлен\./)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Остановлен", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  });

  test("Прокси Telegram держит три кнопки ссылки в одной строке без переноса", async () => {
    await reloadCurrentPage(page);
    await expect(page.locator('[aria-label="Основная навигация"]')).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Прокси Telegram" }).first().click();
    await expect(page.getByRole("heading", { name: "Прокси Telegram" })).toBeVisible();

    const copyButton = page.getByRole("button", { name: "Копировать" });
    const openButton = page.getByRole("button", { name: "Открыть" });
    const logsButton = page.getByRole("button", { name: "Логи" }).first();

    const copyBounds = await copyButton.boundingBox();
    const openBounds = await openButton.boundingBox();
    const logsBounds = await logsButton.boundingBox();

    expect(copyBounds).not.toBeNull();
    expect(openBounds).not.toBeNull();
    expect(logsBounds).not.toBeNull();

    if (!copyBounds || !openBounds || !logsBounds) {
      throw new Error("Connection action bounds are unavailable");
    }

    expect(Math.abs(copyBounds.y - openBounds.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(copyBounds.y - logsBounds.y)).toBeLessThanOrEqual(1);
  });

  test("Прокси Telegram показывает путь к логу в одну строку с truncate без остаточных переносов", async () => {
    await reloadCurrentPage(page);
    await expect(page.locator('[aria-label="Основная навигация"]')).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Прокси Telegram" }).first().click();
    await expect(page.getByRole("heading", { name: "Прокси Telegram" })).toBeVisible();

    const logValue = page.getByText("Лог", { exact: true }).locator("xpath=..").locator("span").last();

    await expect(logValue).toBeVisible();

    const styles = await logValue.evaluate((element) => {
      const computed = window.getComputedStyle(element);
      return {
        whiteSpace: computed.whiteSpace,
        textOverflow: computed.textOverflow,
        overflowX: computed.overflowX
      };
    });

    expect(styles.whiteSpace).toBe("nowrap");
    expect(styles.textOverflow).toBe("ellipsis");
    expect(styles.overflowX).toBe("hidden");
  });

  test("Settings toggles persist в backend-state и переживают reload", async () => {
    await page.evaluate(async (nextState: PersistedState) => {
      await window.egoistAPI?.state.set(nextState);
    }, CLEAN_STATE);
    await page.evaluate(() => {
      const raw = localStorage.getItem("egoist-storage");
      const parsed = raw ? (JSON.parse(raw) as { state?: Record<string, unknown>; version?: number }) : {};
      localStorage.setItem(
        "egoist-storage",
        JSON.stringify({
          version: parsed.version ?? 0,
          state: {
            ...parsed.state,
            fakeDns: false,
            killSwitch: false,
            autoUpdate: true,
            autoConnect: false,
            notifications: true,
            autoStart: false,
            systemDnsServers: ""
          }
        })
      );
    });

    await reloadCurrentPage(page);
    await expect(page.locator('[aria-label="Основная навигация"]')).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Настройки" }).first().click();
    await page.waitForTimeout(250);

    const autoStartSwitch = page.getByRole("switch", { name: "Автозапуск" });
    const notificationsSwitch = page.getByRole("switch", { name: "Уведомления" });
    const autoUpdateSwitch = page.getByRole("switch", { name: "Автопроверка обновлений" });

    await expect(autoStartSwitch).toHaveAttribute("aria-checked", "false");
    await expect(notificationsSwitch).toHaveAttribute("aria-checked", "true");
    await expect(autoUpdateSwitch).toHaveAttribute("aria-checked", "true");

    await autoStartSwitch.click({ force: true });
    await expect(page.getByRole("switch", { name: "Автозапуск" })).toHaveAttribute("aria-checked", "true");

    await notificationsSwitch.click({ force: true });
    await expect(page.getByRole("switch", { name: "Уведомления" })).toHaveAttribute("aria-checked", "false");

    await autoUpdateSwitch.click({ force: true });
    await expect(page.getByRole("switch", { name: "Автопроверка обновлений" })).toHaveAttribute(
      "aria-checked",
      "false"
    );

    await page.getByRole("tab", { name: "Сеть" }).click();
    await page.waitForTimeout(250);

    const secureDnsSwitch = page.getByRole("switch", { name: "Защищённый DNS" });
    const killSwitch = page.getByRole("switch", { name: "Блокировка без VPN" });
    const autoConnectSwitch = page.getByRole("switch", { name: "Авто-подключение" });

    await expect(secureDnsSwitch).toHaveAttribute("aria-checked", "false");
    await expect(killSwitch).toHaveAttribute("aria-checked", "false");
    await expect(autoConnectSwitch).toHaveAttribute("aria-checked", "false");

    await secureDnsSwitch.click({ force: true });
    await expect(page.getByRole("switch", { name: "Защищённый DNS" })).toHaveAttribute("aria-checked", "true");

    await killSwitch.click({ force: true });
    await expect(page.getByRole("switch", { name: "Блокировка без VPN" })).toHaveAttribute("aria-checked", "true");

    await autoConnectSwitch.click({ force: true });
    await expect(page.getByRole("switch", { name: "Авто-подключение" })).toHaveAttribute("aria-checked", "true");

    await expect
      .poll(async () => {
        return page.evaluate(async () => {
          const state = await window.egoistAPI?.state.get();
          return state?.settings ?? null;
        });
      })
      .toMatchObject({
        autoStart: true,
        notifications: false,
        autoUpdate: false,
        killSwitch: true,
        autoConnect: true,
        dnsMode: "secure"
      });

    await reloadCurrentPage(page);
    await expect(page.locator('[aria-label="Основная навигация"]')).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Настройки" }).first().click();

    await expect(page.getByRole("switch", { name: "Автозапуск" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("switch", { name: "Уведомления" })).toHaveAttribute("aria-checked", "false");
    await expect(page.getByRole("switch", { name: "Автопроверка обновлений" })).toHaveAttribute(
      "aria-checked",
      "false"
    );

    await page.getByRole("tab", { name: "Сеть" }).click();
    await expect(page.getByRole("switch", { name: "Защищённый DNS" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("switch", { name: "Блокировка без VPN" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("switch", { name: "Авто-подключение" })).toHaveAttribute("aria-checked", "true");
  });

  test("Settings advanced screen открывает и закрывает reset modal без побочных эффектов", async () => {
    await page.evaluate(async (nextState: PersistedState) => {
      await window.egoistAPI?.state.set(nextState);
    }, CLEAN_STATE);

    await reloadCurrentPage(page);
    await expect(page.locator('[aria-label="Основная навигация"]')).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Настройки" }).first().click();
    await page.getByRole("tab", { name: "Расширенные" }).click();

    await page.getByRole("button", { name: "Сбросить" }).click();
    await expect(page.getByRole("heading", { name: "Сброс данных" })).toBeVisible();
    await page.getByRole("button", { name: "Отмена" }).click();
    await expect(page.getByRole("heading", { name: "Сброс данных" })).toBeHidden();

    const persistedSettings = await page.evaluate(async () => {
      const state = await window.egoistAPI?.state.get();
      return state?.settings ?? null;
    });

    expect(persistedSettings).toMatchObject({
      autoStart: false,
      autoUpdate: true,
      notifications: true
    });
  });

  test("ключевые экраны не создают горизонтальный overflow после UI polishing", async () => {
    await page.evaluate(async (nextState: PersistedState) => {
      await window.egoistAPI?.state.set(nextState);
    }, STATE_WITH_MULTIPLE_NODES);

    await reloadCurrentPage(page);
    await expect(page.locator('[aria-label="Основная навигация"]')).toBeVisible({ timeout: 15_000 });

    const screens: Array<{
      button: string;
      heading: string | RegExp;
    }> = [
      { button: "Серверы", heading: "Серверы" },
      { button: "DNS", heading: "Управление DNS" },
      { button: "Zapret", heading: "Центр Zapret" },
      { button: "Прокси Telegram", heading: "Прокси Telegram" },
      { button: "Настройки", heading: "Настройки" }
    ];

    for (const screen of screens) {
      await page.getByRole("button", { name: screen.button }).first().click();
      await expect(page.getByRole("heading", { name: screen.heading }).first()).toBeVisible();

      const hasHorizontalOverflow = await page
        .locator("main")
        .first()
        .evaluate((element) => element.scrollWidth - element.clientWidth > 1);

      expect(hasHorizontalOverflow, `${screen.button} screen should not overflow horizontally`).toBe(false);
    }
  });

  test("навигация по ключевым экранам проходит без renderer console errors", async () => {
    const consoleErrors: string[] = [];
    const listener = (message: import("@playwright/test").ConsoleMessage) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    };

    page.on("console", listener);

    try {
      await reloadCurrentPage(page);
      await expect(page.locator('[aria-label="Основная навигация"]')).toBeVisible({ timeout: 15_000 });

      const screens = [
        { button: "Главная", heading: /QA Showcase NL|ОТКЛЮЧЕНО|ЗАЩИЩЕНО/ },
        { button: "Серверы", heading: "Серверы" },
        { button: "DNS", heading: "Управление DNS" },
        { button: "Zapret", heading: "Центр Zapret" },
        { button: "Прокси Telegram", heading: "Прокси Telegram" },
        { button: "Настройки", heading: "Настройки" }
      ] as const;

      for (const screen of screens) {
        await page.getByRole("button", { name: screen.button }).first().click();
        if (screen.button === "Главная") {
          await expect(page.getByTestId("dashboard-scroll-area")).toBeVisible({ timeout: 15_000 });
        } else {
          await expect(page.getByRole("heading", { name: screen.heading }).first()).toBeVisible({ timeout: 15_000 });
        }
      }
    } finally {
      page.off("console", listener);
    }

    const meaningfulConsoleErrors = consoleErrors.filter(
      (entry) =>
        !entry.includes("Autocomplete blocklist request cancelled") &&
        !entry.includes("Autofill.enable") &&
        !entry.includes("favicon")
    );

    expect(meaningfulConsoleErrors).toEqual([]);
  });

  test("карточки серверов больше не показывают badge Рекомендуем", async () => {
    await page.evaluate(async (nextState: PersistedState) => {
      await window.egoistAPI?.state.set(nextState);
    }, STATE_WITH_SAMPLE_NODE);

    await reloadCurrentPage(page);
    await expect(page.locator('[aria-label="Основная навигация"]')).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Серверы" }).first().click();
    await expect(page.getByText("QA Showcase NL")).toBeVisible();
    await expect(page.getByText("Рекомендуем")).toHaveCount(0);
  });
});
