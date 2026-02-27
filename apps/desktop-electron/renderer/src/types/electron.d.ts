/**
 * Глобальная типизация egoistAPI, экспонируемого через Electron contextBridge.
 * Устраняет все `window as any` в renderer-коде.
 */
import type {
    DiagnosticResult,
    ImportResult,
    PersistedState,
    RuntimeInstallResult,
    RuntimeStatus,
    RuntimeUpdateSummary,
    StressResult
} from "../../../electron/ipc/contracts";

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
    };
    vpn: {
        connect(): Promise<RuntimeStatus>;
        disconnect(): Promise<RuntimeStatus>;
        status(): Promise<RuntimeStatus>;
        diagnose(): Promise<DiagnosticResult>;
        stressTest(iterations: number): Promise<StressResult>;
        onFallback(callback: (data: { nextNodeId: string; error: string }) => void): void;
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
        ping(host: string, port: number): Promise<number>;
        pingActiveProxy(): Promise<number>;
        speedtest(): Promise<{ speed: number; bytes?: number; timeMs?: number; error: string | null }>;
        geoip(host: string): Promise<{ country: string; countryCode: string }>;
    };
    window: {
        minimize(): Promise<boolean>;
        close(): Promise<boolean>;
    };
    traffic: {
        onUpdate(callback: (data: { rx: number; tx: number }) => void): void;
        offUpdate(): void;
    };
    updater: {
        onUpdateAvailable(callback: () => void): void;
    };
}

declare global {
    interface Window {
        egoistAPI?: EgoistAPI;
    }
}

export { };
