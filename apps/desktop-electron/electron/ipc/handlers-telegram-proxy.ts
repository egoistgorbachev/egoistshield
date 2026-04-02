import { ipcMain } from "electron";
import type { TelegramProxyConfig } from "../../shared/types";
import type { IpcContext } from "./ipc-context";

export function registerTelegramProxyHandlers({ telegramProxyManager }: IpcContext): void {
  ipcMain.handle("telegram-proxy:status", async () => telegramProxyManager.status());

  ipcMain.handle("telegram-proxy:save-config", async (_event, rawConfig: TelegramProxyConfig) =>
    telegramProxyManager.saveConfig(rawConfig)
  );

  ipcMain.handle("telegram-proxy:start", async () => telegramProxyManager.start());
  ipcMain.handle("telegram-proxy:stop", async () => telegramProxyManager.stop());
  ipcMain.handle("telegram-proxy:restart", async () => telegramProxyManager.restart());
  ipcMain.handle("telegram-proxy:check-updates", async () => telegramProxyManager.checkForUpdates());
  ipcMain.handle("telegram-proxy:install-update", async () => telegramProxyManager.installUpdate());
  ipcMain.handle("telegram-proxy:open-link", async () => telegramProxyManager.openConnectionLink());
  ipcMain.handle("telegram-proxy:open-logs", async () => telegramProxyManager.openLogs());
}
