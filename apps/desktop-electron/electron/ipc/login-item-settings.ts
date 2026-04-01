import type { App } from "electron";
import type { AppSettings } from "./contracts";

type LoginItemApp = Pick<App, "setLoginItemSettings">;
type LoginItemSettings = Parameters<LoginItemApp["setLoginItemSettings"]>[0];
type AutoStartSettings = Pick<AppSettings, "autoStart" | "startMinimized">;

export function buildWindowsLoginItemSettings(
  settings: AutoStartSettings,
  executablePath: string
): LoginItemSettings {
  return {
    openAtLogin: settings.autoStart,
    path: executablePath,
    args: settings.startMinimized ? ["--minimized"] : []
  };
}

export function syncWindowsLoginItemSettings({
  app,
  settings,
  platform = process.platform,
  executablePath = process.execPath
}: {
  app: LoginItemApp;
  settings: AutoStartSettings;
  platform?: NodeJS.Platform;
  executablePath?: string;
}): boolean {
  if (platform !== "win32") {
    return false;
  }

  app.setLoginItemSettings(buildWindowsLoginItemSettings(settings, executablePath));
  return true;
}
