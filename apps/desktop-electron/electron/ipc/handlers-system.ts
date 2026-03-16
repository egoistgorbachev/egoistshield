/**
 * System/App IPC Handlers — state:get, state:set, system:geoip, app:is-first-run,
 * app:mark-first-run-done, app:is-admin, runtime:install-*, system:pick-file,
 * system:list-processes, system:get-app-icon, system:read-clipboard,
 * system:internet-fix, window:minimize, window:close
 */
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { Notification, app, clipboard, dialog, ipcMain } from "electron";
import log from "electron-log";
import { updateTrayMenu } from "../main";
import type { PersistedState, RuntimeUpdateSummary } from "./contracts";
import type { IpcContext } from "./ipc-context";
import {
  AppIconInputSchema,
  GeoipInputSchema,
  PersistedStateSchema,
  PickFileFilterSchema
} from "./ipc-schemas";
import logger from "./logger";

const execFileAsync = promisify(execFile);

export function registerSystemHandlers({ window, stateStore, runtimeManager }: IpcContext): void {
  // ── State management ──
  ipcMain.handle("state:get", async () => {
    return stateStore.get();
  });

  ipcMain.handle("state:set", async (_event, rawState: unknown) => {
    const state = PersistedStateSchema.parse(rawState) as PersistedState;
    const persisted = await stateStore.set(state);
    if (process.platform === "win32") {
      try {
        app.setLoginItemSettings({
          openAtLogin: persisted.settings.autoStart,
          path: process.execPath,
          args: persisted.settings.startMinimized ? ["--minimized"] : []
        });
      } catch {
        // ignore
      }
    }
    return persisted;
  });

  ipcMain.handle("app:is-admin", async () => runtimeManager.isAdmin());

  // GeoIP
  ipcMain.handle(
    "system:geoip",
    async (_event, rawHost: unknown): Promise<{ country: string; countryCode: string }> => {
      const host = GeoipInputSchema.parse(rawHost);
      try {
        const res = await fetch(`https://ipwho.is/${encodeURIComponent(host)}?fields=country,country_code,success`, {
          signal: AbortSignal.timeout(3000)
        });
        const data = await res.json();
        if (data.success && data.country_code) {
          return { country: data.country || "", countryCode: data.country_code.toLowerCase() };
        }
      } catch {
        /* timeout or network error */
      }
      return { country: "", countryCode: "un" };
    }
  );

  // First run management
  const firstRunMarker = path.join(app.getPath("userData"), ".first-run-done");

  ipcMain.handle("app:is-first-run", async () => {
    try {
      await fs.access(firstRunMarker);
      return false;
    } catch {
      return true;
    }
  });

  ipcMain.handle("app:mark-first-run-done", async () => {
    await fs.writeFile(firstRunMarker, new Date().toISOString(), "utf8");
  });

  // Runtime installation
  ipcMain.handle("runtime:install-xray", async () => {
    return runtimeManager.installXrayRuntime();
  });

  ipcMain.handle("runtime:install-all", async () => {
    const result: RuntimeUpdateSummary = await runtimeManager.installAllRuntimes();
    return result;
  });

  // File picker
  ipcMain.handle("system:pick-file", async (_event, rawFilters: unknown) => {
    const filters = PickFileFilterSchema.parse(rawFilters);
    const result = await dialog.showOpenDialog(window, {
      properties: ["openFile"],
      filters
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  // List running processes
  ipcMain.handle("system:list-processes", async () => {
    if (process.platform === "win32") {
      try {
        const script = "Get-Process | Where-Object { $_.Path } | Select-Object Name, Path | ConvertTo-Json -Compress";
        const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], {
          maxBuffer: 1024 * 1024 * 10
        });
        let procs = JSON.parse(stdout);
        if (!Array.isArray(procs)) procs = [procs];

        const unique = new Map<string, { name: string; path: string }>();
        for (const p of procs) {
          const parsedName = `${p.Name.toLowerCase()}.exe`;
          if (!unique.has(parsedName)) {
            unique.set(parsedName, { name: `${p.Name}.exe`, path: p.Path });
          }
        }
        return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
      } catch (err) {
        log.error("List processes failed", err);
        return [];
      }
    }
    return [];
  });

  // App icon
  ipcMain.handle("system:get-app-icon", async (_event, rawExePath: unknown) => {
    const exePath = AppIconInputSchema.parse(rawExePath);
    try {
      const icon = await app.getFileIcon(exePath, { size: "normal" });
      return icon.toDataURL();
    } catch {
      return null;
    }
  });

  // Clipboard (rate-limited + URI-filtered)
  let lastClipboardRead = 0;
  const CLIPBOARD_COOLDOWN_MS = 1000;
  const CLIPBOARD_URI_PATTERN = /^(vmess|vless|trojan|ss|ssr|hysteria2?|tuic|wg|wireguard|socks[45]?|https?):\/\//i;
  const CLIPBOARD_BASE64_PATTERN = /^[A-Za-z0-9+/=\r\n]{20,}$/;
  const CLIPBOARD_SUB_URL_PATTERN = /^https?:\/\/.+/i;

  ipcMain.handle("system:read-clipboard", async () => {
    const now = Date.now();
    if (now - lastClipboardRead < CLIPBOARD_COOLDOWN_MS) {
      return ""; // rate-limited
    }
    lastClipboardRead = now;

    const text = clipboard.readText().trim();
    if (!text) return "";

    if (
      CLIPBOARD_URI_PATTERN.test(text) ||
      CLIPBOARD_SUB_URL_PATTERN.test(text) ||
      CLIPBOARD_BASE64_PATTERN.test(text)
    ) {
      return text;
    }

    return "";
  });

  // Internet Fix (Network Lock Recovery)
  ipcMain.handle("system:internet-fix", async () => {
    // 1. Отключить kill-switch firewall rules
    const { KillSwitch } = await import("./kill-switch");
    const ks = new KillSwitch();
    await ks.disable().catch(() => {});

    // 2. Полная очистка: kill VPN processes + reset DNS/proxy
    const { fullCleanup } = await import("./dns-cleanup");
    return fullCleanup();
  });

  // Window controls
  ipcMain.handle("window:minimize", async () => {
    window.minimize();
    return true;
  });

  ipcMain.handle("window:close", async () => {
    window.close();
    return true;
  });

  // Event listener for unexpected VPN exit
  runtimeManager.on("unexpected-exit", async (lastError) => {
    logger.warn("[vpn] unexpected exit:", lastError);

    if (Notification.isSupported()) {
      new Notification({
        title: "EgoistShield: Соединение потеряно",
        body: lastError || "VPN-соединение разорвано."
      }).show();
    }

    updateTrayMenu(false);
  });
}
