/**
 * IPC Handlers — Orchestrator
 *
 * Тонкий модуль-оркестратор, делегирующий регистрацию в подмодули:
 * - handlers-vpn.ts      → VPN: connect, disconnect, ping, speedtest, leak-test
 * - handlers-import.ts   → Import: text, file, subscriptions, rename
 * - handlers-system.ts   → System: state, geoip, clipboard, window, runtime
 */
import type { BrowserWindow } from "electron";
import { registerImportHandlers } from "./handlers-import";
import { registerSystemHandlers } from "./handlers-system";
import { registerVpnHandlers } from "./handlers-vpn";
import type { IpcContext } from "./ipc-context";
import type { StateStore } from "./state-store";
import type { VpnRuntimeManager } from "./vpn-manager";

export async function registerIpcHandlers(
  window: BrowserWindow,
  stateStore: StateStore,
  runtimeManager: VpnRuntimeManager
): Promise<void> {
  await stateStore.load();

  const ctx: IpcContext = { window, stateStore, runtimeManager };

  registerSystemHandlers(ctx);
  registerImportHandlers(ctx);
  registerVpnHandlers(ctx);
}
