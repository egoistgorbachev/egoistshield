/**
 * IpcContext — общий контекст для модульных IPC handler'ов.
 * Все sub-registration functions получают этот контекст.
 */
import type { BrowserWindow } from "electron";
import type { StateStore } from "./state-store";
import type { SystemDohManager } from "./system-doh-manager";
import type { TelegramProxyManager } from "./telegram-proxy-manager";
import type { VpnRuntimeManager } from "./vpn-manager";
import type { ZapretManager } from "./zapret-manager";

export interface IpcContext {
  window: BrowserWindow;
  stateStore: StateStore;
  runtimeManager: VpnRuntimeManager;
  systemDohManager: SystemDohManager;
  zapretManager: ZapretManager;
  telegramProxyManager: TelegramProxyManager;
}
