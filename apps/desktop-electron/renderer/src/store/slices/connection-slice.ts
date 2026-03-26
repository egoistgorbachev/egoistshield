/**
 * Connection Slice — VPN connect/disconnect
 *
 * connectedServerId — ID фактически подключённого сервера (для Dashboard).
 * selectedServerId — ID выбранного в списке сервера (для подсветки в ServerList).
 */
import type { StateCreator } from "zustand";
import { getAPI } from "../../lib/api";
import type { ServersSlice } from "./servers-slice";

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
  ConnectionSlice &
    Pick<ServersSlice, "connectToServer" | "startSmartModeMonitoring" | "stopSmartModeMonitoring"> & {
      selectedServerId: string;
    },
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

  setConnectionMode: (mode) => {
    set({ connectionMode: mode });
    if (mode === "smart" && get().isConnected) {
      get().startSmartModeMonitoring();
      return;
    }

    get().stopSmartModeMonitoring();
  },

  setActivePing: (ping) => set({ activePing: ping }),

  toggleConnection: async () => {
    const { isConnected, isConnecting } = get();
    if (isConnecting) {
      return;
    }

    const api = getAPI();
    if (!api) {
      set({ errorMessage: "Бэкенд не доступен. Перезапустите приложение." });
      return;
    }

    if (isConnected) {
      set({ isConnecting: true, isDisconnecting: true, errorMessage: null });
      try {
        await api.vpn.disconnect();
        get().stopSmartModeMonitoring();
        set({
          isConnected: false,
          isConnecting: false,
          isDisconnecting: false,
          connectedServerId: "",
          errorMessage: null,
          sessionStartTime: null,
          sessionBytesRx: 0,
          sessionBytesTx: 0,
          activePing: null
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Неизвестная ошибка";
        set({
          isConnecting: false,
          isDisconnecting: false,
          errorMessage: message
        });
      }
      return;
    }

    const connectId = get().selectedServerId;
    if (!connectId) {
      set({ errorMessage: "Выберите сервер перед подключением." });
      return;
    }

    await get().connectToServer(connectId);
  }
});
