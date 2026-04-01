/**
 * Глобальная типизация egoistAPI, экспонируемого через Electron contextBridge.
 * Устраняет все `window as any` в renderer-коде.
 */
import type {
  DiagnosticResult,
  ImportResult,
  PersistedState,
  RouteProbeResult,
  RuntimeInstallResult,
  RuntimeLogSummary,
  RuntimeStatus,
  RuntimeUpdateSummary,
  StressResult,
  ZapretAutoSelectResult,
  ZapretCommandResult,
  ZapretDiscordCacheTarget,
  ZapretDiagnosticsReport,
  ZapretGameFilterMode,
  ZapretIpsetMode,
  ZapretProfile,
  ZapretStatus,
  ZapretUpdateInfo
} from "../../../electron/ipc/contracts";
import type { UsageRecord } from "../../shared/types";

export interface EgoistAPI {
  state: {
    get(): Promise<PersistedState>;
    set(next: PersistedState): Promise<PersistedState>;
  };
  import: {
    text(payload: string): Promise<ImportResult>;
    file(filePath: string): Promise<ImportResult>;
  };
  subscription: {
    refreshOne(url: string): Promise<ImportResult>;
    refreshAll(): Promise<ImportResult>;
    rename(url: string, newName: string): Promise<boolean>;
  };
  node: {
    rename(id: string, newName: string): Promise<boolean>;
  };
  vpn: {
    connect(nodeId?: string): Promise<RuntimeStatus>;
    disconnect(): Promise<RuntimeStatus>;
    status(): Promise<RuntimeStatus>;
    diagnose(): Promise<DiagnosticResult>;
    stressTest(iterations: number): Promise<StressResult>;
    onFallback(callback: (data: { nextNodeId: string; error: string }) => void): () => void;
  };
  runtime: {
    installXray(): Promise<RuntimeInstallResult>;
    installAll(): Promise<RuntimeUpdateSummary>;
  };
  app: {
    isAdmin(): Promise<boolean>;
    isFirstRun(): Promise<boolean>;
    markFirstRunDone(): Promise<void>;
  };
  system: {
    pickFile(filters: Array<{ name: string; extensions: string[] }>): Promise<string | null>;
    listProcesses(): Promise<Array<{ name: string; path: string }>>;
    getAppIcon(exePath: string): Promise<string | null>;
    ping(host: string, port: number, timeoutMs?: number): Promise<number>;
    pingActiveProxy(): Promise<number>;
    speedtest(): Promise<{ speed: number; bytes?: number; timeMs?: number; error: string | null }>;
    geoip(host: string): Promise<{ country: string; countryCode: string }>;
    internetFix(): Promise<{ ok: boolean; message: string }>;
    readClipboard(): Promise<string>;
    setDnsServers(dnsServers: string): Promise<{ ok: boolean; message: string; servers: string[] }>;
    resetDnsServers(): Promise<{ ok: boolean; message: string; servers: string[] }>;
    getMyIp(): Promise<{ ip: string | null; countryCode: string | null; error: string | null }>;
    routeProbe(): Promise<RouteProbeResult>;
    dnsLeakTest(): Promise<RouteProbeResult>;
  };
  window: {
    minimize(): Promise<boolean>;
    toggleMaximize(): Promise<boolean>;
    isMaximized(): Promise<boolean>;
    close(): Promise<boolean>;
  };
  traffic: {
    onUpdate(callback: (data: { rx: number; tx: number }) => void): () => void;
  };
  updater: {
    onUpdateAvailable(callback: (data: { version: string }) => void): () => void;
    onDownloadProgress(callback: (data: { percent: number; transferred: number; total: number }) => void): () => void;
    onUpdateDownloaded(callback: (data: { version: string }) => void): () => void;
    onUpdateNotAvailable(callback: () => void): () => void;
    onUpdateError(callback: (data: { message: string }) => void): () => void;
    install(): Promise<void>;
    check(): Promise<{ ok: boolean; version?: string; error?: string }>;
    setAuto(enabled: boolean): Promise<boolean>;
  };
  autoConnect: {
    onAutoConnect(callback: (serverId: string) => void): () => void;
  };
  logs: {
    getRecent(maxLines?: number): Promise<Array<{ timestamp: string; level: string; message: string }>>;
    getRuntimeSummary(maxLines?: number): Promise<RuntimeLogSummary[]>;
    getPath(): Promise<string>;
    openFolder(): Promise<boolean>;
  };
  usage: {
    saveRecord(record: UsageRecord): Promise<boolean>;
    getHistory(): Promise<UsageRecord[]>;
  };
  zapret: {
    status(): Promise<ZapretStatus>;
    listProfiles(): Promise<ZapretProfile[]>;
    installService(profileName?: string): Promise<ZapretStatus>;
    setServiceProfile(profileName: string): Promise<ZapretStatus>;
    startService(): Promise<ZapretStatus>;
    stopService(): Promise<ZapretStatus>;
    removeService(): Promise<ZapretStatus>;
    startStandalone(profileName?: string): Promise<ZapretStatus>;
    restartStandalone(profileName?: string): Promise<ZapretStatus>;
    stopStandalone(): Promise<ZapretStatus>;
    setGameFilterMode(mode: ZapretGameFilterMode): Promise<ZapretStatus>;
    setIpsetMode(mode: ZapretIpsetMode): Promise<ZapretStatus>;
    updateIpsetList(): Promise<ZapretStatus>;
    setUpdateChecksEnabled(enabled: boolean): Promise<ZapretStatus>;
    checkUpdates(): Promise<ZapretUpdateInfo>;
    runCoreUpdater(): Promise<ZapretCommandResult>;
    resetNetworkState(): Promise<ZapretStatus>;
    diagnostics(): Promise<ZapretDiagnosticsReport>;
    autoSelect(): Promise<ZapretAutoSelectResult>;
    openServiceMenu(): Promise<ZapretCommandResult>;
    runFlowsealTests(): Promise<ZapretCommandResult>;
    cleanDiscordCache(target: ZapretDiscordCacheTarget): Promise<ZapretCommandResult>;
  };
}

declare global {
  interface Window {
    egoistAPI?: EgoistAPI;
  }
}
