import { contextBridge, ipcRenderer } from "electron";
import type {
  DiagnosticResult,
  ImportResult,
  PersistedState,
  RuntimeInstallResult,
  RuntimeStatus,
  RuntimeUpdateSummary,
  StressResult
} from "./ipc/contracts";

const api = {
  state: {
    get: (): Promise<PersistedState> => ipcRenderer.invoke("state:get"),
    set: (next: PersistedState): Promise<PersistedState> => ipcRenderer.invoke("state:set", next)
  },
  import: {
    text: (payload: string): Promise<ImportResult> => ipcRenderer.invoke("import:text", payload),
    file: (filePath: string): Promise<ImportResult> => ipcRenderer.invoke("import:file", filePath)
  },
  subscription: {
    refreshOne: (url: string): Promise<ImportResult> => ipcRenderer.invoke("subscription:refresh-one", url),
    refreshAll: (): Promise<ImportResult> => ipcRenderer.invoke("subscription:refresh-all"),
    rename: (url: string, newName: string): Promise<boolean> => ipcRenderer.invoke("subscription:rename", url, newName)
  },
  node: {
    rename: (id: string, newName: string): Promise<boolean> => ipcRenderer.invoke("node:rename", id, newName)
  },
  vpn: {
    connect: (nodeId?: string): Promise<RuntimeStatus> => ipcRenderer.invoke("vpn:connect", nodeId),
    disconnect: (): Promise<RuntimeStatus> => ipcRenderer.invoke("vpn:disconnect"),
    status: (): Promise<RuntimeStatus> => ipcRenderer.invoke("vpn:status"),
    diagnose: (): Promise<DiagnosticResult> => ipcRenderer.invoke("vpn:diagnose"),
    stressTest: (iterations: number): Promise<StressResult> => ipcRenderer.invoke("vpn:stress-test", iterations),
    onFallback: (callback: (data: { nextNodeId: string; error: string }) => void) => {
      ipcRenderer.on("fallback-triggered", (_event, data) => callback(data));
    }
  },
  runtime: {
    installXray: (): Promise<RuntimeInstallResult> => ipcRenderer.invoke("runtime:install-xray"),
    installAll: (): Promise<RuntimeUpdateSummary> => ipcRenderer.invoke("runtime:install-all")
  },
  app: {
    isAdmin: (): Promise<boolean> => ipcRenderer.invoke("app:is-admin"),
    isFirstRun: (): Promise<boolean> => ipcRenderer.invoke("app:is-first-run"),
    markFirstRunDone: (): Promise<void> => ipcRenderer.invoke("app:mark-first-run-done")
  },
  system: {
    pickFile: (filters: Array<{ name: string; extensions: string[] }>): Promise<string | null> =>
      ipcRenderer.invoke("system:pick-file", filters),
    listProcesses: (): Promise<Array<{ name: string; path: string }>> => ipcRenderer.invoke("system:list-processes"),
    getAppIcon: (exePath: string): Promise<string | null> => ipcRenderer.invoke("system:get-app-icon", exePath),
    ping: (host: string, port: number): Promise<number> => ipcRenderer.invoke("vpn:ping", host, port),
    pingActiveProxy: (): Promise<number> => ipcRenderer.invoke("vpn:ping-active-proxy"),
    speedtest: (): Promise<{ speed: number; bytes?: number; timeMs?: number; error: string | null }> =>
      ipcRenderer.invoke("vpn:speedtest"),
    geoip: (host: string): Promise<{ country: string; countryCode: string }> =>
      ipcRenderer.invoke("system:geoip", host),
    internetFix: (): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke("system:internet-fix"),
    readClipboard: (): Promise<string> => ipcRenderer.invoke("system:read-clipboard"),
    getMyIp: (): Promise<{ ip: string | null; countryCode: string | null; error: string | null }> => ipcRenderer.invoke("vpn:get-my-ip"),
    dnsLeakTest: (): Promise<{ leaked: boolean; dnsServers: string[]; vpnIp: string | null; error: string | null }> => ipcRenderer.invoke("vpn:dns-leak-test")
  },
  window: {
    minimize: (): Promise<boolean> => ipcRenderer.invoke("window:minimize"),
    close: (): Promise<boolean> => ipcRenderer.invoke("window:close")
  },
  traffic: {
    onUpdate: (callback: (data: { rx: number; tx: number }) => void) => {
      ipcRenderer.on("traffic-update", (_event, data) => callback(data));
    },
    offUpdate: () => {
      ipcRenderer.removeAllListeners("traffic-update");
    }
  },
  updater: {
    onUpdateAvailable: (callback: (data: { version: string }) => void) => {
      ipcRenderer.on("update-available", (_event, data) => callback(data));
    },
    onDownloadProgress: (callback: (data: { percent: number; transferred: number; total: number }) => void) => {
      ipcRenderer.on("update-progress", (_event, data) => callback(data));
    },
    onUpdateDownloaded: (callback: (data: { version: string }) => void) => {
      ipcRenderer.on("update-downloaded", (_event, data) => callback(data));
    },
    install: (): Promise<void> => ipcRenderer.invoke("updater:install")
  },
  autoConnect: {
    onAutoConnect: (callback: (serverId: string) => void) => {
      ipcRenderer.on("auto-connect", (_event, serverId) => callback(serverId));
    }
  }
};

contextBridge.exposeInMainWorld("egoistAPI", api);
