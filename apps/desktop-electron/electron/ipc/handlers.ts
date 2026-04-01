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
import { registerLogHandlers } from "./handlers-logs";
import { registerSystemHandlers } from "./handlers-system";
import { registerVpnHandlers } from "./handlers-vpn";
import { registerZapretHandlers } from "./handlers-zapret";
import type { IpcContext } from "./ipc-context";
import type { StateStore } from "./state-store";
import type { VpnRuntimeManager } from "./vpn-manager";
import type { ZapretManager } from "./zapret-manager";

export async function registerIpcHandlers(
  window: BrowserWindow,
  stateStore: StateStore,
  runtimeManager: VpnRuntimeManager,
  zapretManager: ZapretManager
): Promise<void> {
  await stateStore.load();

  const ctx: IpcContext = { window, stateStore, runtimeManager, zapretManager };

  registerSystemHandlers(ctx);
  registerImportHandlers(ctx);
  registerVpnHandlers(ctx);
  registerZapretHandlers(ctx);
  registerLogHandlers();
}
