import { contextBridge, ipcRenderer } from "electron";
import type { UsageRecord } from "../shared/types";
import type {
  RouteProbeResult,
  ZapretAutoSelectResult,
  ZapretCommandResult,
  ZapretDiscordCacheTarget,
  ZapretDiagnosticsReport,
  ZapretGameFilterMode,
  ZapretIpsetMode,
  ZapretUpdateInfo,
  DiagnosticResult,
  ImportResult,
  PersistedState,
  RuntimeInstallResult,
  RuntimeLogSummary,
  RuntimeStatus,
  RuntimeUpdateSummary,
  StressResult,
  ZapretProfile,
  ZapretStatus
} from "./ipc/contracts";

type ListenerDisposer = () => void;

function subscribeToChannel<T>(channel: string, callback: (data: T) => void): ListenerDisposer {
  const listener = (_event: unknown, data: T) => callback(data);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.off(channel, listener);
  };
}

function subscribeToSignal(channel: string, callback: () => void): ListenerDisposer {
  const listener = () => callback();
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.off(channel, listener);
  };
}

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
    onFallback: (callback: (data: { nextNodeId: string; error: string }) => void) =>
      subscribeToChannel("fallback-triggered", callback)
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
    ping: (host: string, port: number, timeoutMs?: number): Promise<number> =>
      ipcRenderer.invoke("vpn:ping", host, port, timeoutMs),
    pingActiveProxy: (): Promise<number> => ipcRenderer.invoke("vpn:ping-active-proxy"),
    speedtest: (): Promise<{ speed: number; bytes?: number; timeMs?: number; error: string | null }> =>
      ipcRenderer.invoke("vpn:speedtest"),
    geoip: (host: string): Promise<{ country: string; countryCode: string }> =>
      ipcRenderer.invoke("system:geoip", host),
    internetFix: (): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke("system:internet-fix"),
    readClipboard: (): Promise<string> => ipcRenderer.invoke("system:read-clipboard"),
    setDnsServers: (dnsServers: string): Promise<{ ok: boolean; message: string; servers: string[] }> =>
      ipcRenderer.invoke("system:set-dns-servers", dnsServers),
    resetDnsServers: (): Promise<{ ok: boolean; message: string; servers: string[] }> =>
      ipcRenderer.invoke("system:reset-dns-servers"),
    getMyIp: (): Promise<{ ip: string | null; countryCode: string | null; error: string | null }> =>
      ipcRenderer.invoke("vpn:get-my-ip"),
    routeProbe: (): Promise<RouteProbeResult> => ipcRenderer.invoke("vpn:route-probe"),
    dnsLeakTest: (): Promise<RouteProbeResult> =>
      ipcRenderer.invoke("vpn:dns-leak-test")
  },
  window: {
    minimize: (): Promise<boolean> => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: (): Promise<boolean> => ipcRenderer.invoke("window:toggle-maximize"),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke("window:is-maximized"),
    close: (): Promise<boolean> => ipcRenderer.invoke("window:close")
  },
  traffic: {
    onUpdate: (callback: (data: { rx: number; tx: number }) => void) => subscribeToChannel("traffic-update", callback)
  },
  updater: {
    onUpdateAvailable: (callback: (data: { version: string }) => void) =>
      subscribeToChannel("update-available", callback),
    onDownloadProgress: (callback: (data: { percent: number; transferred: number; total: number }) => void) =>
      subscribeToChannel("update-progress", callback),
    onUpdateDownloaded: (callback: (data: { version: string }) => void) =>
      subscribeToChannel("update-downloaded", callback),
    onUpdateNotAvailable: (callback: () => void) => subscribeToSignal("update-not-available", callback),
    onUpdateError: (callback: (data: { message: string }) => void) =>
      subscribeToChannel("update-error", callback),
    install: (): Promise<void> => ipcRenderer.invoke("updater:install"),
    check: (): Promise<{ ok: boolean; version?: string; error?: string }> => ipcRenderer.invoke("updater:check"),
    setAuto: (enabled: boolean): Promise<boolean> => ipcRenderer.invoke("updater:set-auto", enabled)
  },
  autoConnect: {
    onAutoConnect: (callback: (serverId: string) => void) => subscribeToChannel("auto-connect", callback)
  },
  logs: {
    getRecent: (maxLines?: number): Promise<Array<{ timestamp: string; level: string; message: string }>> =>
      ipcRenderer.invoke("logs:get-recent", maxLines),
    getRuntimeSummary: (maxLines?: number): Promise<RuntimeLogSummary[]> =>
      ipcRenderer.invoke("logs:get-runtime-summary", maxLines),
    getPath: (): Promise<string> => ipcRenderer.invoke("logs:get-path"),
    openFolder: (): Promise<boolean> => ipcRenderer.invoke("logs:open-folder")
  },
  usage: {
    saveRecord: (record: UsageRecord): Promise<boolean> => ipcRenderer.invoke("usage:save-record", record),
    getHistory: (): Promise<UsageRecord[]> => ipcRenderer.invoke("usage:get-history")
  },
  zapret: {
    status: (): Promise<ZapretStatus> => ipcRenderer.invoke("zapret:status"),
    listProfiles: (): Promise<ZapretProfile[]> => ipcRenderer.invoke("zapret:list-profiles"),
    installService: (profileName?: string): Promise<ZapretStatus> => ipcRenderer.invoke("zapret:install-service", profileName),
    setServiceProfile: (profileName: string): Promise<ZapretStatus> =>
      ipcRenderer.invoke("zapret:set-service-profile", profileName),
    startService: (): Promise<ZapretStatus> => ipcRenderer.invoke("zapret:start-service"),
    stopService: (): Promise<ZapretStatus> => ipcRenderer.invoke("zapret:stop-service"),
    removeService: (): Promise<ZapretStatus> => ipcRenderer.invoke("zapret:remove-service"),
    startStandalone: (profileName?: string): Promise<ZapretStatus> =>
      ipcRenderer.invoke("zapret:start-standalone", profileName),
    restartStandalone: (profileName?: string): Promise<ZapretStatus> =>
      ipcRenderer.invoke("zapret:restart-standalone", profileName),
    stopStandalone: (): Promise<ZapretStatus> => ipcRenderer.invoke("zapret:stop-standalone"),
    setGameFilterMode: (mode: ZapretGameFilterMode): Promise<ZapretStatus> =>
      ipcRenderer.invoke("zapret:set-game-filter-mode", mode),
    setIpsetMode: (mode: ZapretIpsetMode): Promise<ZapretStatus> => ipcRenderer.invoke("zapret:set-ipset-mode", mode),
    updateIpsetList: (): Promise<ZapretStatus> => ipcRenderer.invoke("zapret:update-ipset-list"),
    setUpdateChecksEnabled: (enabled: boolean): Promise<ZapretStatus> =>
      ipcRenderer.invoke("zapret:set-update-checks-enabled", enabled),
    checkUpdates: (): Promise<ZapretUpdateInfo> => ipcRenderer.invoke("zapret:check-updates"),
    runCoreUpdater: (): Promise<ZapretCommandResult> => ipcRenderer.invoke("zapret:run-core-updater"),
    resetNetworkState: (): Promise<ZapretStatus> => ipcRenderer.invoke("zapret:reset-network-state"),
    diagnostics: (): Promise<ZapretDiagnosticsReport> => ipcRenderer.invoke("zapret:diagnostics"),
    autoSelect: (): Promise<ZapretAutoSelectResult> => ipcRenderer.invoke("zapret:auto-select"),
    openServiceMenu: (): Promise<ZapretCommandResult> => ipcRenderer.invoke("zapret:open-service-menu"),
    runFlowsealTests: (): Promise<ZapretCommandResult> => ipcRenderer.invoke("zapret:run-flowseal-tests"),
    cleanDiscordCache: (target: ZapretDiscordCacheTarget): Promise<ZapretCommandResult> =>
      ipcRenderer.invoke("zapret:clean-discord-cache", target)
  }
};

contextBridge.exposeInMainWorld("egoistAPI", api);
