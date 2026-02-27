/// <reference types="vite/client" />

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
      };
      window: {
        minimize: () => Promise<boolean>;
        close: () => Promise<boolean>;
      };
    };
  }
}

export { };
