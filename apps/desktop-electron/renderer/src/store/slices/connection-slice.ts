/**
 * Connection Slice — VPN connect/disconnect
 *
 * connectedServerId — ID фактически подключённого сервера (для Dashboard).
 * selectedServerId — ID выбранного в списке сервера (для подсветки в ServerList).
 */
import type { StateCreator } from "zustand";
import type { RuntimeStatus } from "../../../../electron/ipc/contracts";
import { getAPI } from "../../lib/api";

export type ConnectionMode = "smart" | "default";

export interface ConnectionSlice {
  isConnected: boolean;
  isConnecting: boolean;
  isDisconnecting: boolean;
  connectedServerId: string;
  errorMessage: string | null;
  sessionStartTime: number | null;
  sessionBytesRx: number;
  sessionBytesTx: number;
  connectionMode: ConnectionMode;
  activePing: number | null;
  setConnectionMode: (mode: ConnectionMode) => void;
  setActivePing: (ping: number | null) => void;
  toggleConnection: () => Promise<void>;
}

export const createConnectionSlice: StateCreator<
  ConnectionSlice & { selectedServerId: string },
  [],
  [],
  ConnectionSlice
> = (set, get) => ({
  isConnected: false,
  isConnecting: false,
  isDisconnecting: false,
  connectedServerId: "",
  errorMessage: null,
  sessionStartTime: null,
  sessionBytesRx: 0,
  sessionBytesTx: 0,
  connectionMode: "default",
  activePing: null,

  setConnectionMode: (mode) => set({ connectionMode: mode }),
  setActivePing: (ping) => set({ activePing: ping }),

  toggleConnection: async () => {
    const { isConnected, isConnecting } = get();
    if (isConnecting) return;

    const api = getAPI();
    if (!api) {
      set({ errorMessage: "Бэкенд не доступен. Перезапустите приложение." });
      return;
    }

    set({ isConnecting: true, isDisconnecting: isConnected, errorMessage: null });

    try {
      if (isConnected) {
        await api.vpn.disconnect();
        set({
          isConnected: false,
          isConnecting: false,
          isDisconnecting: false,
          connectedServerId: "",
          sessionStartTime: null,
          sessionBytesRx: 0,
          sessionBytesTx: 0
        });
      } else {
        const connectId = get().selectedServerId;

        // Timeout to prevent infinite hang if IPC fails
        const connectPromise = api.vpn.connect(connectId || undefined);
        const timeoutPromise = new Promise<RuntimeStatus>((resolve) =>
          setTimeout(
            () =>
              resolve({
                connected: false,
                isMock: false,
                pid: null,
                startedAt: null,
                activeNodeId: null,
                lastError: "Превышено время ожидания ответа от VPN-ядра. Попробуйте снова.",
                isAdmin: false,
                resolvedRuntimePath: null,
                runtimeKind: null,
                processRulesApplied: false,
                proxyPort: null,
                lifecycle: "failed",
                diagnostic: {
                  reason: "tcp_timeout",
                  details: "Превышено время ожидания ответа от VPN-ядра. Попробуйте снова.",
                  updatedAt: new Date().toISOString(),
                  fallbackAttempted: false,
                  fallbackTarget: null
                }
              }),
            15000
          )
        );

        const status = await Promise.race([connectPromise, timeoutPromise]);

        if (status.connected) {
          set({
            isConnected: true,
            isConnecting: false,
            connectedServerId: connectId,
            errorMessage: null,
            sessionStartTime: Date.now(),
            sessionBytesRx: 0,
            sessionBytesTx: 0
          });
        } else {
          set({
            isConnected: false,
            isConnecting: false,
            connectedServerId: "",
            errorMessage: status.lastError || "Ошибка подключения"
          });
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Неизвестная ошибка";
      set({
        isConnected: false,
        isConnecting: false,
        isDisconnecting: false,
        connectedServerId: "",
        errorMessage: msg,
        sessionStartTime: null,
        sessionBytesRx: 0,
        sessionBytesTx: 0
      });
    }
  }
});
