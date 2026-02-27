import path from "node:path";
import fs from "node:fs";
import { app, BrowserWindow, Menu, Tray, nativeImage } from "electron";
import { registerIpcHandlers } from "./ipc/handlers";
import { StateStore } from "./ipc/state-store";
import { VpnRuntimeManager } from "./ipc/vpn-manager";
import { execFile, exec } from "node:child_process";
import { promisify } from "node:util";
import http from "node:http";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);
import { autoUpdater } from "electron-updater";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;
export let tray: Tray | null = null;
export let globalRuntimeManager: VpnRuntimeManager | null = null;
let trafficInterval: NodeJS.Timeout | null = null;
let isQuitting = false;

app.on('before-quit', () => {
  isQuitting = true;
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
          activeSingboxReq = http.get("http://127.0.0.1:9090/traffic", res => {
            res.on("data", chunk => {
              try {
                const lines = chunk.toString().trim().split("\n");
                const last = lines[lines.length - 1];
                if (last) {
                  const data = JSON.parse(last);
                  if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send("traffic-update", { rx: data.down, tx: data.up });
                  }
                }
              } catch { }
            });
            res.on("end", () => { activeSingboxReq = null; });
          }).on("error", () => { activeSingboxReq = null; });
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
            const statsData = await queryXrayStats(status.resolvedRuntimePath, 10085);
            if (statsData.downlink > 0 || statsData.uplink > 0) {
              gotStats = true;
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send("traffic-update", {
                  rx: statsData.downlink,
                  tx: statsData.uplink
                });
              }
            }
          } catch { /* Xray CLI недоступен — fallback ниже */ }
        }

        // === Метод 2: Fallback через netstat -e ===
        // ВАЖНО: используем exec с chcp 65001 для принудительной UTF-8 кодировки
        // Без chcp вывод идёт в CP866 (OEM) и regex не может найти строку «Байт»
        if (!gotStats) {
          try {
            const { stdout } = await execAsync("chcp 65001 >nul && netstat -e", { encoding: "utf-8", timeout: 3000 });
            const lines = stdout.split('\n');
            // С chcp 65001 вывод на английском: «Bytes»
            const byteLine = lines.find(l => /Bytes|Byte|Байт/i.test(l));
            if (byteLine) {
              const nums = byteLine.match(/\d+/g);
              if (nums && nums.length >= 2) {
                const rx = parseInt(nums[0], 10);
                const tx = parseInt(nums[1], 10);

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
          } catch { /* netstat fallback error */ }
        }
      }
    } catch {
      // Игнорируем ошибки при запросе сетевой статистики
    }
  }, 1000);
}

// ── Запрос к Xray Stats API через CLI subprocess ──
async function queryXrayStats(xrayPath: string, apiPort: number): Promise<{ uplink: number; downlink: number }> {
  const { stdout } = await execFileAsync(xrayPath, [
    "api", "statsquery", `-s=127.0.0.1:${apiPort}`, "-reset"
  ], { timeout: 3000 });

  let uplink = 0;
  let downlink = 0;

  // Regex безопасный для Windows \r\n и Unix \n
  const nameValueRegex = /name:\s*"([^"]+)"\s*[\r\n]+\s*value:\s*(\d+)/g;
  let match;
  while ((match = nameValueRegex.exec(stdout)) !== null) {
    const name = match[1];
    const value = parseInt(match[2], 10);
    if (name.includes(">>>traffic>>>uplink")) {
      uplink += value;
    } else if (name.includes(">>>traffic>>>downlink")) {
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
      sandbox: false, // Отключаем жесткий сэндбокс для dev режима
      webSecurity: !MAIN_WINDOW_VITE_DEV_SERVER_URL
    }
  });

  const stateStore = new StateStore(app.getPath("userData"));
  if (!globalRuntimeManager) {
    globalRuntimeManager = new VpnRuntimeManager(process.resourcesPath, app.getPath("userData"));
  }
  await registerIpcHandlers(mainWindow, stateStore, globalRuntimeManager);

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

  const iconPath = getIconPath();
  if (!iconPath) {
    return;
  }

  // Pass string directly to let Windows pick the sharpest internal .ico layer based on DPI
  tray = new Tray(iconPath);
  tray.setToolTip("EgoistShield");

  tray.on('click', () => {
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

    // Запуск автообновления
    try {
      autoUpdater.checkForUpdatesAndNotify();
      autoUpdater.on('update-downloaded', () => {
        if (mainWindow) {
          mainWindow.webContents.send('update-available');
        }
      });
    } catch (e) { /* ignore */ }

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

app.on("before-quit", () => {
  if (tray) {
    tray.destroy();
    tray = null;
  }
});
