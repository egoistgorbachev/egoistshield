/**
 * IpcContext — общий контекст для модульных IPC handler'ов.
 * Все sub-registration functions получают этот контекст.
 */
import type { BrowserWindow } from "electron";
import type { StateStore } from "./state-store";
import type { VpnRuntimeManager } from "./vpn-manager";
import type { ZapretManager } from "./zapret-manager";

export interface IpcContext {
  window: BrowserWindow;
  stateStore: StateStore;
  runtimeManager: VpnRuntimeManager;
  zapretManager: ZapretManager;
}
