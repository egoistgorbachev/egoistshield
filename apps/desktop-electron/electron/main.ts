import { exec, execFile, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { BrowserWindow, Menu, Notification, Tray, app, ipcMain, nativeImage } from "electron";
import { registerIpcHandlers } from "./ipc/handlers";
import { StateStore } from "./ipc/state-store";
import { VpnRuntimeManager } from "./ipc/vpn-manager";


export let globalStateStore: StateStore | null = null;

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);
import { autoUpdater } from "electron-updater";
import { fullCleanup } from "./ipc/dns-cleanup";
import logger from "./ipc/logger";

// ── IPC: Установить скачанное обновление ──
ipcMain.handle("updater:install", () => {
  autoUpdater.quitAndInstall(false, true);
});

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;
export let tray: Tray | null = null;
export let globalRuntimeManager: VpnRuntimeManager | null = null;
let trafficInterval: NodeJS.Timeout | null = null;
let isQuitting = false;

// ── Network config constants ──
const SINGBOX_TRAFFIC_URL = "http://127.0.0.1:9090/traffic";
const XRAY_API_PORT = 10085;

app.on("before-quit", () => {
  isQuitting = true;
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
    spawnSync("taskkill", ["/F", "/IM", "xray.exe"], { windowsHide: true, timeout: 3000 });
    spawnSync("taskkill", ["/F", "/IM", "sing-box.exe"], { windowsHide: true, timeout: 3000 });
    spawnSync(
      "reg",
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
      "reg",
      ["delete", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings", "/v", "ProxyServer", "/f"],
      { windowsHide: true, timeout: 3000 }
    );
    spawnSync(
      "reg",
      ["delete", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings", "/v", "AutoConfigURL", "/f"],
      { windowsHide: true, timeout: 3000 }
    );
    spawnSync("ipconfig", ["/flushdns"], { windowsHide: true, timeout: 3000 });
    spawnSync("netsh", ["winsock", "reset"], { windowsHide: true, timeout: 5000 });
  } catch {
    /* best-effort */
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
                const rx = Number.parseInt(nums[0]!, 10);
                const tx = Number.parseInt(nums[1]!, 10);

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
  let match;
  while ((match = nameValueRegex.exec(stdout)) !== null) {
    const name = match[1];
    const value = Number.parseInt(match[2]!, 10);
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

  const stateStore = new StateStore(app.getPath("userData"));
  globalStateStore = stateStore;
  if (!globalRuntimeManager) {
    globalRuntimeManager = new VpnRuntimeManager(process.resourcesPath, app.getPath("userData"));
  }
  await registerIpcHandlers(mainWindow, stateStore, globalRuntimeManager);

  // Auto-connect: если включён autoConnect и есть сохранённый сервер
  const loadedState = await stateStore.load();
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

  mainWindow.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {
    // ignore
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
    await createMainWindow();
    createTray();

    // Запуск фонового трекинга трафика для UI
    startTrafficMonitoring();

    // ── Автообновление через GitHub Releases ──
    try {
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.logger = logger;

      autoUpdater.on("checking-for-update", () => {
        logger.info("[updater] checking for updates...");
      });

      autoUpdater.on("update-available", (info) => {
        logger.info(`[updater] update available: v${info.version}`);
        if (mainWindow) {
          mainWindow.webContents.send("update-available", { version: info.version });
        }
      });

      autoUpdater.on("update-not-available", () => {
        logger.info("[updater] no updates available");
      });

      autoUpdater.on("download-progress", (progress) => {
        if (mainWindow) {
          mainWindow.webContents.send("update-progress", {
            percent: Math.round(progress.percent),
            transferred: progress.transferred,
            total: progress.total
          });
        }
      });

      autoUpdater.on("update-downloaded", (info) => {
        logger.info(`[updater] update downloaded: v${info.version}`);
        if (mainWindow) {
          mainWindow.webContents.send("update-downloaded", { version: info.version });
        }
        // Системное уведомление Windows
        new Notification({
          title: "EgoistShield — Обновление готово",
          body: `Версия ${info.version} скачана. Перезапустите для установки.`
        }).show();
      });

      autoUpdater.on("error", (err) => {
        logger.warn("[updater] error:", err?.message || err);
      });

      // Проверить обновления через 5 секунд после запуска
      setTimeout(() => {
        autoUpdater.checkForUpdates().catch((e) => {
          logger.warn("[updater] check failed:", e?.message || e);
        });
      }, 5000);
    } catch (e) {
      console.warn("[updater] auto-update init failed:", e);
    }

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
