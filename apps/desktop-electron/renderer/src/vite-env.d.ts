/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

import type {
  DiagnosticResult,
  ImportResult,
  PersistedState,
  RuntimeInstallResult,
  RuntimeStatus,
  RuntimeUpdateSummary,
  StressResult
} from "./types";

declare global {
  interface Window {
    egoistAPI: {
      state: {
        get: () => Promise<PersistedState>;
        set: (next: PersistedState) => Promise<PersistedState>;
      };
      import: {
        text: (payload: string) => Promise<ImportResult>;
        file: (filePath: string) => Promise<ImportResult>;
      };
      subscription: {
        refreshOne: (url: string) => Promise<ImportResult>;
        refreshAll: () => Promise<ImportResult>;
      };
      vpn: {
        connect: () => Promise<RuntimeStatus>;
        disconnect: () => Promise<RuntimeStatus>;
        status: () => Promise<RuntimeStatus>;
        diagnose: () => Promise<DiagnosticResult>;
        stressTest: (iterations: number) => Promise<StressResult>;
      };
      runtime: {
        installXray: () => Promise<RuntimeInstallResult>;
        installAll: () => Promise<RuntimeUpdateSummary>;
      };
      app: {
        isAdmin: () => Promise<boolean>;
        isFirstRun: () => Promise<boolean>;
        markFirstRunDone: () => Promise<void>;
      };
      system: {
        pickFile: (filters: Array<{ name: string; extensions: string[] }>) => Promise<string | null>;
        ping: (host: string, port: number) => Promise<number>;
        pingActiveProxy: () => Promise<number>;
        speedtest: () => Promise<{ speed: number; bytes?: number; timeMs?: number; error: string | null }>;
        geoip: (host: string) => Promise<{ country: string; countryCode: string }>;
        internetFix: () => Promise<{ ok: boolean; message: string }>;
        readClipboard: () => Promise<string>;
        getMyIp: () => Promise<{ ip: string | null; countryCode: string | null; error: string | null }>;
        listProcesses: () => Promise<Array<{ name: string; path: string }>>;
        getAppIcon: (exePath: string) => Promise<string | null>;
      };
      window: {
        minimize: () => Promise<boolean>;
        close: () => Promise<boolean>;
      };
    };
  }
}
