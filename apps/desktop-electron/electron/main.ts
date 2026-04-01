import { exec, execFile, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { BrowserWindow, Menu, Notification, Tray, app, ipcMain, nativeImage } from "electron";

// ── electron-builder NSIS инсталлер ──
// Все install/update/uninstall операции (taskkill, cleanup, ярлыки)
// выполняются NSIS скриптом: packaging/nsis/installer.nsh
// Squirrel-код полностью удалён.

import { buildAppPathConfig, detectRuntimeEnvironment } from "./app-paths";
import { fullCleanup } from "./ipc/dns-cleanup";
import { registerIpcHandlers } from "./ipc/handlers";
import { syncWindowsLoginItemSettings } from "./ipc/login-item-settings";
import logger, { configureLoggerPaths } from "./ipc/logger";
import { StateStore } from "./ipc/state-store";
import { VpnRuntimeManager } from "./ipc/vpn-manager";
import { resolveWindowsExecutable } from "./ipc/windows-system-binaries";
import { ZapretManager } from "./ipc/zapret-manager";

export let globalStateStore: StateStore | null = null;

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

const runtimeEnvironment = detectRuntimeEnvironment({
  isPackaged: app.isPackaged,
  nodeEnv: process.env.NODE_ENV
});
const appPathConfig = buildAppPathConfig({
  defaultUserDataDir: app.getPath("userData"),
  environment: runtimeEnvironment,
  pid: process.pid
});

if (appPathConfig.userDataDir !== app.getPath("userData")) {
  app.setPath("userData", appPathConfig.userDataDir);
}

if (appPathConfig.sessionDataDir) {
  app.setPath("sessionData", appPathConfig.sessionDataDir);
}

configureLoggerPaths(appPathConfig.logsDir);

const USER_DATA_DIR = app.getPath("userData");

// ── IPC: Автообновление через GitHub Releases (Squirrel.Windows) ──
const GITHUB_OWNER = "egoistgorbachev";
const GITHUB_REPO = "egoistshield";

let autoUpdateEnabled = true;
let updateCheckInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Semver comparison: returns true if `remote` is strictly newer than `current`.
 * Supports standard X.Y.Z format. If parsing fails, falls back to string comparison.
 */
function isNewerVersion(remote: string, current: string): boolean {
  const parse = (v: string) => v.split(".").map((n) => Number.parseInt(n, 10));
  const r = parse(remote);
  const c = parse(current);
  const len = Math.max(r.length, c.length);
  for (let i = 0; i < len; i++) {
    const rv = r[i] ?? 0;
    const cv = c[i] ?? 0;
    if (rv > cv) return true;
    if (rv < cv) return false;
  }
  return false; // equal
}

// Проверка обновлений в обход API-лимитов GitHub (60 req/hr)
async function checkUpdateViaGitHubAPI(): Promise<{
  ok: boolean;
  version: string | null;
  downloadUrl?: string;
  error?: string;
}> {
  try {
    // HEAD запрос к latest URL всегда редиректит на актуальный тег (без расходования API-лимитов)
    const res = await fetch(`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`, {
      method: "HEAD",
      redirect: "follow",
      headers: { "User-Agent": `EgoistShield/${app.getVersion()}` },
      signal: AbortSignal.timeout(10_000)
    });

    if (!res.ok) return { ok: false, version: null, error: `GitHub HTTP: ${res.status}` };

    // Извлекаем версию из финального URL после редиректа (например, .../releases/tag/v1.9.1)
    const match = res.url.match(/\/releases\/tag\/(v?[\d\.]+)/);
    const latestTag = match?.[1]?.replace(/^v/, "") ?? null;

    if (!latestTag) return { ok: true, version: null };

    const current = app.getVersion();

    // Обновлять только если remote > current
    if (!isNewerVersion(latestTag, current)) {
      logger.info(`[updater] Текущая версия ${current} >= ${latestTag}, обновление не требуется`);
      return { ok: true, version: null };
    }

    // NSIS инсталлер имеет предсказуемое имя
    const downloadUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v${latestTag}/EgoistShield-${latestTag}-Setup.exe`;

    return {
      ok: true,
      version: latestTag,
      downloadUrl
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, version: null, error: msg };
  }
}

function setupAutoUpdater(): void {
  if (!app.isPackaged) {
    logger.info("[updater] Dev-режим: автообновление отключено");
    return;
  }

  // === NSIS installer: используем GitHub API вместо Squirrel ===
  // Squirrel autoUpdater несовместим с NSIS-инсталятором.
  const doCheck = async () => {
    if (!autoUpdateEnabled) return;
    try {
      const result = await checkUpdateViaGitHubAPI();
      if (result.version) {
        logger.info(`[updater] Доступна новая версия: ${result.version}`);
        mainWindow?.webContents.send("update-available", {
          version: result.version,
          downloadUrl: result.downloadUrl
        });

        if (Notification.isSupported()) {
          new Notification({
            title: "EgoistShield: Обновление",
            body: `Доступна версия ${result.version}`,
            silent: true
          }).show();
        }
      } else {
        logger.info("[updater] Текущая версия актуальна");
        mainWindow?.webContents.send("update-not-available");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn("[updater] Ошибка проверки:", msg);
    }
  };

  setTimeout(doCheck, 10_000);
  updateCheckInterval = setInterval(doCheck, 4 * 60 * 60 * 1000);
  logger.info(`[updater] Автообновление настроено (GitHub API), текущая: ${app.getVersion()}`);
}

ipcMain.handle("updater:install", async () => {
  if (!app.isPackaged) {
    logger.warn("[updater] Dev-режим: установка обновления невозможна");
    return;
  }
  // NSIS: открываем ссылку на скачивание в браузере
  try {
    const result = await checkUpdateViaGitHubAPI();
    if (result.downloadUrl) {
      const { shell } = require("electron") as typeof import("electron");
      await shell.openExternal(result.downloadUrl);
    }
  } catch (err) {
    logger.error("[updater] Ошибка открытия страницы обновления:", err);
  }
});

ipcMain.handle("updater:check", async () => {
  const result = await checkUpdateViaGitHubAPI();
  return { ok: result.ok, version: result.version, error: result.error };
});

ipcMain.handle("updater:set-auto", async (_event, enabled: boolean) => {
  autoUpdateEnabled = enabled;
  logger.info(`[updater] autoDownload set to ${enabled}`);

  if (globalStateStore) {
    try {
      await globalStateStore.patch({ settings: { autoUpdate: enabled } });
    } catch (error: unknown) {
      logger.warn("[updater] Failed to persist auto-update setting:", error);
    }
  }

  if (!enabled && updateCheckInterval) {
    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
  } else if (enabled && !updateCheckInterval && app.isPackaged) {
    const doCheck = async () => {
      try {
        await checkUpdateViaGitHubAPI();
      } catch (error: unknown) {
        logger.warn("[updater] Scheduled check failed:", error);
      }
    };
    updateCheckInterval = setInterval(doCheck, 4 * 60 * 60 * 1000);
  }

  return enabled;
});

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;
export let tray: Tray | null = null;
export let globalRuntimeManager: VpnRuntimeManager | null = null;
export let globalZapretManager: ZapretManager | null = null;
let trafficInterval: NodeJS.Timeout | null = null;
let isQuitting = false;

// ── Network config constants ──
const SINGBOX_TRAFFIC_URL = "http://127.0.0.1:9090/traffic";
const XRAY_API_PORT = 10085;

app.on("before-quit", () => {
  isQuitting = true;
  const persistedState = globalStateStore?.get();
  if (globalZapretManager && persistedState?.settings.zapretSuspendDuringVpn) {
    void globalZapretManager
      .restoreAfterVpnIfNeeded(
        persistedState.settings.zapretSuspendDuringVpn,
        persistedState.settings.zapretProfile
      )
      .catch((error: unknown) => {
        logger.warn("[zapret] Failed to restore service during app shutdown:", error);
      });
  }
  // Cleanup DNS/proxy and kill VPN processes on exit
  fullCleanup().catch((e) => logger.warn("[exit] cleanup failed:", e));
  if (tray) {
    tray.destroy();
    tray = null;
  }
});

// ── Force-kill safety net: synchronous DNS cleanup ──
// These fire when process is terminated externally (taskkill, SIGTERM)
function syncCleanup() {
  try {
    spawnSync(resolveWindowsExecutable("taskkill"), ["/F", "/IM", "xray.exe"], {
      windowsHide: true,
      timeout: 3000
    });
    spawnSync(resolveWindowsExecutable("taskkill"), ["/F", "/IM", "sing-box.exe"], {
      windowsHide: true,
      timeout: 3000
    });
    spawnSync(
      resolveWindowsExecutable("reg"),
      [
        "add",
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
        "/v",
        "ProxyEnable",
        "/t",
        "REG_DWORD",
        "/d",
        "0",
        "/f"
      ],
      { windowsHide: true, timeout: 3000 }
    );
    spawnSync(
      resolveWindowsExecutable("reg"),
      ["delete", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings", "/v", "ProxyServer", "/f"],
      { windowsHide: true, timeout: 3000 }
    );
    spawnSync(
      resolveWindowsExecutable("reg"),
      ["delete", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings", "/v", "AutoConfigURL", "/f"],
      { windowsHide: true, timeout: 3000 }
    );
    spawnSync(resolveWindowsExecutable("ipconfig"), ["/flushdns"], { windowsHide: true, timeout: 3000 });
  } catch (error: unknown) {
    logger.warn("[cleanup] sync cleanup failed:", error);
  }
}
process.on("exit", syncCleanup);
process.on("SIGTERM", () => {
  syncCleanup();
  process.exit(0);
});
process.on("SIGINT", () => {
  syncCleanup();
  process.exit(0);
});

let activeSingboxReq: http.ClientRequest | null = null;
let lastRx = 0;
let lastTx = 0;

function startTrafficMonitoring() {
  if (trafficInterval) clearInterval(trafficInterval);
  trafficInterval = setInterval(async () => {
    if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible() || mainWindow.isMinimized()) return;
    if (!globalRuntimeManager) return;

    try {
      const status = await globalRuntimeManager.status();
      if (!status.connected) {
        mainWindow.webContents.send("traffic-update", { rx: 0, tx: 0 });
        if (activeSingboxReq) {
          activeSingboxReq.destroy();
          activeSingboxReq = null;
        }
        lastRx = 0;
        lastTx = 0;
        return;
      }

      if (status.runtimeKind === "sing-box") {
        if (!activeSingboxReq) {
          activeSingboxReq = http
            .get(SINGBOX_TRAFFIC_URL, (res) => {
              res.on("data", (chunk) => {
                try {
                  const lines = chunk.toString().trim().split("\n");
                  const last = lines[lines.length - 1];
                  if (last) {
                    const data = JSON.parse(last);
                    if (mainWindow && !mainWindow.isDestroyed()) {
                      mainWindow.webContents.send("traffic-update", { rx: data.down, tx: data.up });
                    }
                  }
                } catch (e) {
                  console.warn("[traffic] sing-box parse error:", e);
                }
              });
              res.on("end", () => {
                activeSingboxReq = null;
              });
            })
            .on("error", () => {
              activeSingboxReq = null;
            });
        }
      } else if (status.runtimeKind === "xray") {
        if (activeSingboxReq) {
          activeSingboxReq.destroy();
          activeSingboxReq = null;
        }

        // === Метод 1: Xray Stats API через CLI ===
        let gotStats = false;
        if (status.resolvedRuntimePath) {
          try {
            const statsData = await queryXrayStats(status.resolvedRuntimePath, XRAY_API_PORT);
            if (statsData.downlink > 0 || statsData.uplink > 0) {
              gotStats = true;
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send("traffic-update", {
                  rx: statsData.downlink,
                  tx: statsData.uplink
                });
              }
            }
          } catch (e) {
            console.warn("[traffic] xray stats unavailable, falling back to netstat:", e);
          }
        }

        // === Метод 2: Fallback через netstat -e ===
        // ВАЖНО: используем exec с chcp 65001 для принудительной UTF-8 кодировки
        // Без chcp вывод идёт в CP866 (OEM) и regex не может найти строку «Байт»
        if (!gotStats) {
          try {
            const { stdout } = await execAsync("chcp 65001 >nul && netstat -e", { encoding: "utf-8", timeout: 3000 });
            const lines = stdout.split("\n");
            // С chcp 65001 вывод на английском: «Bytes»
            const byteLine = lines.find((l) => /Bytes|Byte|Байт/i.test(l));
            if (byteLine) {
              const nums = byteLine.match(/\d+/g);
              if (nums && nums.length >= 2) {
                const [rawRx, rawTx] = nums;
                if (!rawRx || !rawTx) {
                  return;
                }

                const rx = Number.parseInt(rawRx, 10);
                const tx = Number.parseInt(rawTx, 10);

                if (lastRx > 0 && lastTx > 0) {
                  const deltaRx = Math.max(0, rx - lastRx);
                  const deltaTx = Math.max(0, tx - lastTx);
                  if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send("traffic-update", {
                      rx: deltaRx,
                      tx: deltaTx
                    });
                  }
                }
                lastRx = rx;
                lastTx = tx;
              }
            }
          } catch (e) {
            console.warn("[traffic] netstat fallback error:", e);
          }
        }
      }
    } catch (e) {
      console.warn("[traffic] monitoring cycle error:", e);
    }
  }, 1000);
}

// ── Запрос к Xray Stats API через CLI subprocess ──
async function queryXrayStats(xrayPath: string, apiPort: number): Promise<{ uplink: number; downlink: number }> {
  const { stdout } = await execFileAsync(xrayPath, ["api", "statsquery", `-s=127.0.0.1:${apiPort}`, "-reset"], {
    timeout: 3000
  });

  let uplink = 0;
  let downlink = 0;

  // Regex безопасный для Windows \r\n и Unix \n
  const nameValueRegex = /name:\s*"([^"]+)"\s*[\r\n]+\s*value:\s*(\d+)/g;
  for (const match of stdout.matchAll(nameValueRegex)) {
    const name = match[1];
    const rawValue = match[2];
    if (!name || !rawValue) {
      continue;
    }

    const value = Number.parseInt(rawValue, 10);
    if (name?.includes(">>>traffic>>>uplink")) {
      uplink += value;
    } else if (name?.includes(">>>traffic>>>downlink")) {
      downlink += value;
    }
  }

  return { uplink, downlink };
}

// Улучшаем четкость текста и исключаем размытие интерфейса при масштабировании.
app.commandLine.appendSwitch("high-dpi-support", "1");
app.commandLine.appendSwitch("force-device-scale-factor", "1");

function getIconPath(): string | null {
  const candidates = [
    path.resolve(__dirname, "../renderer/main_window/icon.ico"),
    path.resolve(__dirname, "../renderer/main_window/assets/icon.ico"),
    path.resolve(app.getAppPath(), "renderer/public/assets/icon.ico")
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function getTrayAssetPath(filename: string): string | null {
  const candidates = [
    path.resolve(__dirname, "../renderer/main_window/assets", filename),
    path.resolve(__dirname, "../renderer/main_window", filename),
    path.resolve(app.getAppPath(), "renderer/public/assets", filename),
    path.resolve(app.getAppPath(), ".vite/renderer/main_window/assets", filename)
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function createMainWindow(): Promise<void> {
  const preload = path.join(__dirname, "preload.js");
  const iconPath = getIconPath();
  const minimizedLaunch = process.argv.includes("--minimized");

  // Set transparent to true to allow background vibrancy/acrylic effects to show through
  mainWindow = new BrowserWindow({
    width: 605,
    height: 940,
    minWidth: 400,
    minHeight: 600,
    resizable: true,
    title: "EgoistShield",
    titleBarStyle: "hidden",
    autoHideMenuBar: true,
    show: !minimizedLaunch,
    icon: iconPath ?? undefined,
    // Provide a transparent background so vibrancy/mica can function if we want it, or fallback to solid
    backgroundColor: "#05080d",
    transparent: false, // Set to true if utilizing acrylic/mica later, but stable on Win32 requires careful handling. Let's start solid but adaptive.
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });

  const stateStore = new StateStore(USER_DATA_DIR);
  globalStateStore = stateStore;
  if (!globalRuntimeManager) {
    globalRuntimeManager = new VpnRuntimeManager(process.resourcesPath, USER_DATA_DIR);
  }
  if (!globalZapretManager) {
    globalZapretManager = new ZapretManager(process.resourcesPath, app.getAppPath(), USER_DATA_DIR);
  }
  await registerIpcHandlers(mainWindow, stateStore, globalRuntimeManager, globalZapretManager);

  // Auto-connect: если включён autoConnect и есть сохранённый сервер
  const loadedState = await stateStore.load();
  try {
    syncWindowsLoginItemSettings({ app, settings: loadedState.settings });
  } catch (error: unknown) {
    logger.warn("[system] Failed to sync login item settings on startup:", error);
  }
  autoUpdateEnabled = loadedState.settings.autoUpdate;
  logger.info(`[updater] Persisted auto-update = ${autoUpdateEnabled}`);
  if (loadedState.settings.autoConnect && loadedState.activeNodeId) {
    const activeNodeId = loadedState.activeNodeId;
    // Задержка 3с — дождаться загрузки renderer UI
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("auto-connect", activeNodeId);
      }
    }, 3000);
  }

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    await mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  mainWindow.webContents.setVisualZoomLevelLimits(1, 1).catch((error: unknown) => {
    logger.warn("[window] Failed to lock visual zoom level:", error);
  });
  mainWindow.webContents.setZoomFactor(1);

  if (minimizedLaunch) {
    mainWindow.hide();
  }

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      return false;
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

export function updateTrayMenu(isConnected: boolean) {
  if (!tray) return;

  // Изменяем саму картинку трея в зависимости от статуса
  const trayFile = isConnected ? "tray-connected.png" : "tray-default.png";
  const iconPath = getTrayAssetPath(trayFile);
  if (iconPath) {
    const iconBase = nativeImage.createFromPath(iconPath);
    if (!iconBase.isEmpty()) {
      tray.setImage(iconBase);
    }
  }

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Основное окно",
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      { type: "separator" },
      {
        label: isConnected ? "Статус: Подключено 🟢" : "Статус: Отключено 🔴",
        enabled: false
      },
      { type: "separator" },
      {
        label: "Выход",
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ])
  );
}

function createTray(): void {
  if (tray) {
    return;
  }

  // Use the branded orange shield PNG as tray icon
  const trayPng = getTrayAssetPath("tray-icon.png") || getTrayAssetPath("tray-default.png");
  if (trayPng) {
    const img = nativeImage.createFromPath(trayPng);
    // Resize for tray (Windows tray icons ~32x32)
    const resized = img.isEmpty() ? img : img.resize({ width: 32, height: 32 });
    tray = new Tray(resized.isEmpty() ? img : resized);
  } else {
    const iconPath = getIconPath();
    if (!iconPath) return;
    tray = new Tray(nativeImage.createFromPath(iconPath));
  }

  tray.setToolTip("EgoistShield");

  tray.on("click", () => {
    if (mainWindow) {
      mainWindow.isMinimized() ? mainWindow.restore() : mainWindow.show();
      mainWindow.focus();
    }
  });

  updateTrayMenu(false);
}

const lock = app.requestSingleInstanceLock();
if (!lock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId("EgoistShield");
    logger.info(`[paths] Runtime=${runtimeEnvironment}, userData=${USER_DATA_DIR}`);
    await createMainWindow();
    createTray();

    // Запуск фонового трекинга трафика для UI
    startTrafficMonitoring();

    // ── Автообновление через GitHub API (NSIS-совместимый) ──
    setupAutoUpdater();

    app.on("activate", async () => {
      if (!mainWindow) {
        await createMainWindow();
      }
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// before-quit tray cleanup moved to unified handler above (line 27)
