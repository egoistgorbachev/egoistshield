import { exec, execFile, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { BrowserWindow, Menu, Notification, Tray, app, ipcMain, nativeImage, shell } from "electron";

// ── electron-builder NSIS инсталлер ──
// Все install/update/uninstall операции (taskkill, cleanup, ярлыки)
// выполняются NSIS скриптом: packaging/nsis/installer.nsh
// Squirrel-код полностью удалён.

import { buildAppPathConfig, detectRuntimeEnvironment } from "./app-paths";
import { fullCleanup } from "./ipc/dns-cleanup";
import { registerIpcHandlers } from "./ipc/handlers";
import {
  buildGitHubAssetDownloadUrl,
  compareLooseVersions,
  normalizeVersionTag,
  resolveLatestGitHubRelease
} from "./ipc/github-release";
import { syncWindowsLoginItemSettings } from "./ipc/login-item-settings";
import logger, { configureLoggerPaths } from "./ipc/logger";
import { StateStore } from "./ipc/state-store";
import { TelegramProxyManager } from "./ipc/telegram-proxy-manager";
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

// ── IPC: Автообновление через GitHub Releases + release-page fallback ──
const GITHUB_OWNER = "egoistgorbachev";
const GITHUB_REPO = "egoistshield";
const APP_RELEASE_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const APP_RELEASE_PAGE_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

let autoUpdateEnabled = true;
let updateCheckInterval: ReturnType<typeof setInterval> | null = null;

type AppUpdateCheckResult = {
  ok: boolean;
  version: string | null;
  status?: "up-to-date" | "update-available" | "local-newer";
  currentVersion?: string;
  latestVersion?: string | null;
  downloadUrl?: string;
  releaseUrl?: string;
  error?: string;
};

async function checkUpdateViaGitHubAPI(): Promise<AppUpdateCheckResult> {
  try {
    const resolvedRelease = await resolveLatestGitHubRelease(APP_RELEASE_API_URL, {
      "User-Agent": `EgoistShield/${app.getVersion()}`,
      Accept: "application/vnd.github+json"
    });

    const current = app.getVersion();
    const latestTagRaw = resolvedRelease.tag_name?.trim() ?? null;
    const latestTag = normalizeVersionTag(latestTagRaw);
    if (!latestTag) {
      return {
        ok: true,
        version: null,
        status: "up-to-date",
        currentVersion: current,
        latestVersion: null
      };
    }

    const versionComparison = compareLooseVersions(latestTag, current);
    if (versionComparison <= 0) {
      const status = versionComparison === 0 ? "up-to-date" : "local-newer";
      if (status === "local-newer") {
        logger.warn(`[updater] Локальная версия ${current} опережает release-канал ${latestTag}`);
      } else {
        logger.info(`[updater] Текущая версия ${current} совпадает с release-каналом ${latestTag}`);
      }

      return {
        ok: true,
        version: null,
        status,
        currentVersion: current,
        latestVersion: latestTag
      };
    }

    const expectedAssetName = `EgoistShield-${latestTag}-Setup.exe`;
    const asset =
      resolvedRelease.release && Array.isArray(resolvedRelease.release.assets)
        ? resolvedRelease.release.assets.find((item) => item.name === expectedAssetName)
        : null;
    const downloadUrl =
      asset?.browser_download_url ??
      (latestTagRaw ? buildGitHubAssetDownloadUrl(APP_RELEASE_API_URL, latestTagRaw, expectedAssetName) : null);

    if (!downloadUrl) {
      return {
        ok: false,
        version: latestTag,
        status: "update-available",
        currentVersion: current,
        latestVersion: latestTag,
        releaseUrl: resolvedRelease.html_url ?? APP_RELEASE_PAGE_URL,
        error: `В релизе ${latestTag} не найден ${expectedAssetName}.`
      };
    }

    return {
      ok: true,
      version: latestTag,
      status: "update-available",
      currentVersion: current,
      latestVersion: latestTag,
      downloadUrl,
      releaseUrl: resolvedRelease.html_url ?? `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      version: null,
      currentVersion: app.getVersion(),
      latestVersion: null,
      error: msg
    };
  }
}

function emitUpdateError(message: string): void {
  logger.warn("[updater] Ошибка:", message);
  mainWindow?.webContents.send("update-error", { message });
}

async function openAppReleasePage(result?: AppUpdateCheckResult): Promise<boolean> {
  const releaseUrl = result?.releaseUrl ?? APP_RELEASE_PAGE_URL;
  await shell.openExternal(releaseUrl);
  return true;
}

function setupAutoUpdater(): void {
  if (!app.isPackaged) {
    logger.info("[updater] Dev-режим: фоновые проверки desktop-релизов отключены");
    return;
  }

  const doCheck = async () => {
    if (!autoUpdateEnabled) return;
    try {
      const result = await checkUpdateViaGitHubAPI();
      if (result.version) {
        logger.info(`[updater] Доступна новая версия desktop-клиента: ${result.version}`);
        mainWindow?.webContents.send("update-available", {
          version: result.version,
          downloadUrl: result.downloadUrl,
          releaseUrl: result.releaseUrl
        });

        if (Notification.isSupported()) {
          new Notification({
            title: "EgoistShield: Обновление",
            body: `Доступна версия ${result.version}. Скачайте релиз вручную со страницы проекта.`,
            silent: true
          }).show();
        }
      } else if (result.status === "local-newer") {
        logger.warn(
          `[updater] Автопроверка: локальная версия ${result.currentVersion ?? app.getVersion()} новее опубликованного канала ${result.latestVersion ?? "unknown"}`
        );
        mainWindow?.webContents.send("update-not-available");
      } else {
        logger.info("[updater] Текущая версия актуальна");
        mainWindow?.webContents.send("update-not-available");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      emitUpdateError(msg);
    }
  };

  setTimeout(doCheck, 10_000);
  updateCheckInterval = setInterval(doCheck, 4 * 60 * 60 * 1000);
  logger.info(`[updater] Автопроверка релизов настроена (manual download mode), текущая: ${app.getVersion()}`);
}

ipcMain.handle("updater:install", async () => {
  try {
    const result = await checkUpdateViaGitHubAPI();
    return await openAppReleasePage(result);
  } catch (err) {
    emitUpdateError(err instanceof Error ? err.message : String(err));
    return false;
  }
});

ipcMain.handle("updater:open-release-page", async () => {
  try {
    const result = await checkUpdateViaGitHubAPI();
    return await openAppReleasePage(result);
  } catch (error) {
    emitUpdateError(error instanceof Error ? error.message : String(error));
    return false;
  }
});

ipcMain.handle("updater:check", async () => {
  try {
    const result = await checkUpdateViaGitHubAPI();
    if (result.status !== "update-available" || !result.version) {
      return {
        ok: result.ok,
        version: result.version ?? undefined,
        status: result.status,
        currentVersion: result.currentVersion,
        latestVersion: result.latestVersion ?? undefined,
        releaseUrl: result.releaseUrl,
        downloadUrl: result.downloadUrl,
        error: result.error
      };
    }

    mainWindow?.webContents.send("update-available", {
      version: result.version,
      downloadUrl: result.downloadUrl,
      releaseUrl: result.releaseUrl
    });
    return {
      ok: result.ok,
      version: result.version,
      status: result.status,
      currentVersion: result.currentVersion,
      latestVersion: result.latestVersion ?? undefined,
      releaseUrl: result.releaseUrl,
      downloadUrl: result.downloadUrl,
      error: result.error
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitUpdateError(message);
    return {
      ok: false,
      version: undefined,
      status: undefined,
      currentVersion: app.getVersion(),
      latestVersion: undefined,
      releaseUrl: APP_RELEASE_PAGE_URL,
      error: message
    };
  }
});

ipcMain.handle("updater:set-auto", async (_event, enabled: boolean) => {
  autoUpdateEnabled = enabled;
  logger.info(`[updater] autoCheck set to ${enabled}`);

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
        const result = await checkUpdateViaGitHubAPI();
        if (result.version) {
          mainWindow?.webContents.send("update-available", {
            version: result.version,
            downloadUrl: result.downloadUrl,
            releaseUrl: result.releaseUrl
          });
        }
      } catch (error: unknown) {
        logger.warn("[updater] Scheduled check failed:", error);
      }
    };
    updateCheckInterval = setInterval(doCheck, 4 * 60 * 60 * 1000);
  }

  return enabled;
});

async function checkManagedComponentUpdates(): Promise<void> {
  try {
    if (globalZapretManager) {
      const status = await globalZapretManager.status();
      if (status.updateChecksEnabled) {
        const info = await globalZapretManager.checkForUpdates();
        if (info.updateAvailable && info.latestVersion && notifiedComponentVersions.get("zapret-core") !== info.latestVersion) {
          notifiedComponentVersions.set("zapret-core", info.latestVersion);
          if (Notification.isSupported()) {
            new Notification({
              title: "EgoistShield: Flowseal Core",
              body: `Доступно обновление ${info.latestVersion}`,
              silent: true
            }).show();
          }
        }
      }
    }

    if (globalTelegramProxyManager && (await globalTelegramProxyManager.shouldCheckUpdates())) {
      const info = await globalTelegramProxyManager.checkForUpdates();
      if (
        info.updateAvailable &&
        info.latestVersion &&
        notifiedComponentVersions.get("telegram-proxy") !== info.latestVersion
      ) {
        notifiedComponentVersions.set("telegram-proxy", info.latestVersion);
        if (Notification.isSupported()) {
          new Notification({
            title: "EgoistShield: Telegram Proxy",
            body: `Доступно обновление ${info.latestVersion}`,
            silent: true
          }).show();
        }
      }
    }
  } catch (error) {
    logger.warn("[updates] Managed component check failed:", error);
  }
}

function setupManagedComponentUpdateChecks(): void {
  if (componentUpdateInterval) {
    clearInterval(componentUpdateInterval);
  }

  setTimeout(() => {
    void checkManagedComponentUpdates();
  }, 20_000);

  componentUpdateInterval = setInterval(() => {
    void checkManagedComponentUpdates();
  }, 6 * 60 * 60 * 1000);
}

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;
export let tray: Tray | null = null;
export let globalRuntimeManager: VpnRuntimeManager | null = null;
export let globalZapretManager: ZapretManager | null = null;
export let globalTelegramProxyManager: TelegramProxyManager | null = null;
let trafficInterval: NodeJS.Timeout | null = null;
let isQuitting = false;
let componentUpdateInterval: ReturnType<typeof setInterval> | null = null;
const notifiedComponentVersions = new Map<string, string>();

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
  if (globalTelegramProxyManager) {
    void globalTelegramProxyManager.stop().catch((error: unknown) => {
      logger.warn("[telegram-proxy] Failed to stop background runtime during app shutdown:", error);
    });
  }
  // Cleanup DNS/proxy and kill VPN processes on exit
  fullCleanup().catch((e) => logger.warn("[exit] cleanup failed:", e));
  if (componentUpdateInterval) {
    clearInterval(componentUpdateInterval);
    componentUpdateInterval = null;
  }
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
  if (!globalTelegramProxyManager) {
    globalTelegramProxyManager = new TelegramProxyManager(process.resourcesPath, app.getAppPath(), USER_DATA_DIR);
  }
  await registerIpcHandlers(mainWindow, stateStore, globalRuntimeManager, globalZapretManager, globalTelegramProxyManager);

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

    // ── Автообновление через GitHub Releases + fallback (NSIS-совместимый) ──
    setupAutoUpdater();
    setupManagedComponentUpdateChecks();

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
