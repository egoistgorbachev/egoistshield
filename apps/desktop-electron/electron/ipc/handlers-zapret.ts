import { ipcMain } from "electron";
import type { IpcContext } from "./ipc-context";
import {
  ZapretDiscordCacheTargetSchema,
  ZapretGameFilterModeSchema,
  ZapretIpsetModeSchema,
  ZapretProfileInputSchema,
  ZapretUpdateChecksInputSchema
} from "./ipc-schemas";

function getZapretProfile(rawProfile: unknown, fallbackProfile: string): string {
  if (typeof rawProfile === "undefined" || rawProfile === null || rawProfile === "") {
    return fallbackProfile;
  }
  return ZapretProfileInputSchema.parse(rawProfile);
}

async function assertVpnDisconnected(
  runtimeManager: IpcContext["runtimeManager"],
  message: string
): Promise<void> {
  const vpnStatus = await runtimeManager.status();
  if (vpnStatus.connected) {
    throw new Error(message);
  }
}

export function registerZapretHandlers({ stateStore, runtimeManager, zapretManager }: IpcContext): void {
  ipcMain.handle("zapret:status", async () => {
    return zapretManager.status();
  });

  ipcMain.handle("zapret:list-profiles", async () => {
    return zapretManager.listProfiles();
  });

  ipcMain.handle("zapret:install-service", async (_event, rawProfile: unknown) => {
    await assertVpnDisconnected(runtimeManager, "Нельзя устанавливать или переустанавливать службу Zapret при активном VPN.");
    const fallbackProfile = stateStore.get().settings.zapretProfile;
    const profile = getZapretProfile(rawProfile, fallbackProfile);
    return zapretManager.installService(profile);
  });

  ipcMain.handle("zapret:set-service-profile", async (_event, rawProfile: unknown) => {
    await assertVpnDisconnected(runtimeManager, "Сначала отключите VPN внутри EgoistShield, затем меняйте профиль службы Zapret.");
    const fallbackProfile = stateStore.get().settings.zapretProfile;
    const profile = getZapretProfile(rawProfile, fallbackProfile);
    return zapretManager.setServiceProfile(profile);
  });

  ipcMain.handle("zapret:start-service", async () => {
    await assertVpnDisconnected(runtimeManager, "Сначала отключите VPN внутри EgoistShield, затем запускайте службу Zapret.");
    return zapretManager.startService();
  });

  ipcMain.handle("zapret:stop-service", async () => {
    return zapretManager.stopService();
  });

  ipcMain.handle("zapret:remove-service", async () => {
    return zapretManager.removeService();
  });

  ipcMain.handle("zapret:start-standalone", async (_event, rawProfile: unknown) => {
    await assertVpnDisconnected(runtimeManager, "Сначала отключите VPN внутри EgoistShield, затем запускайте standalone Zapret.");
    const fallbackProfile = stateStore.get().settings.zapretProfile;
    const profile = getZapretProfile(rawProfile, fallbackProfile);
    return zapretManager.startStandalone(profile);
  });

  ipcMain.handle("zapret:restart-standalone", async (_event, rawProfile: unknown) => {
    await assertVpnDisconnected(runtimeManager, "Сначала отключите VPN внутри EgoistShield, затем перезапускайте standalone Zapret.");
    const fallbackProfile = stateStore.get().settings.zapretProfile;
    const profile = getZapretProfile(rawProfile, fallbackProfile);
    return zapretManager.restartStandalone(profile);
  });

  ipcMain.handle("zapret:stop-standalone", async () => {
    return zapretManager.stopStandalone();
  });

  ipcMain.handle("zapret:set-game-filter-mode", async (_event, rawMode: unknown) => {
    return zapretManager.setGameFilterMode(ZapretGameFilterModeSchema.parse(rawMode));
  });

  ipcMain.handle("zapret:set-ipset-mode", async (_event, rawMode: unknown) => {
    return zapretManager.setIpsetMode(ZapretIpsetModeSchema.parse(rawMode));
  });

  ipcMain.handle("zapret:update-ipset-list", async () => {
    return zapretManager.updateIpsetList();
  });

  ipcMain.handle("zapret:set-update-checks-enabled", async (_event, rawEnabled: unknown) => {
    return zapretManager.setUpdateChecksEnabled(ZapretUpdateChecksInputSchema.parse(rawEnabled));
  });

  ipcMain.handle("zapret:check-updates", async () => {
    return zapretManager.checkForUpdates();
  });

  ipcMain.handle("zapret:run-core-updater", async () => {
    return zapretManager.runCoreUpdater();
  });

  ipcMain.handle("zapret:reset-network-state", async () => {
    await assertVpnDisconnected(runtimeManager, "Сначала отключите VPN внутри EgoistShield, затем сбрасывайте состояние Zapret.");
    return zapretManager.resetNetworkState();
  });

  ipcMain.handle("zapret:diagnostics", async () => {
    return zapretManager.runDiagnostics();
  });

  ipcMain.handle("zapret:auto-select", async () => {
    await assertVpnDisconnected(runtimeManager, "Сначала отключите VPN внутри EgoistShield, затем запускайте автоподбор профилей Zapret.");
    return zapretManager.autoSelectBestProfile();
  });

  ipcMain.handle("zapret:open-service-menu", async () => {
    await assertVpnDisconnected(runtimeManager, "Сначала отключите VPN внутри EgoistShield, затем открывайте меню Flowseal Service.");
    return zapretManager.openServiceMenu();
  });

  ipcMain.handle("zapret:run-flowseal-tests", async () => {
    await assertVpnDisconnected(runtimeManager, "Сначала отключите VPN внутри EgoistShield, затем запускайте Flowseal tests.");
    return zapretManager.runFlowsealTests();
  });

  ipcMain.handle("zapret:clean-discord-cache", async (_event, rawTarget: unknown) => {
    return zapretManager.cleanDiscordCache(ZapretDiscordCacheTargetSchema.parse(rawTarget));
  });
}
