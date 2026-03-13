/**
 * Connection Slice — VPN connect/disconnect
 *
 * connectedServerId — ID фактически подключённого сервера (для Dashboard).
 * selectedServerId — ID выбранного в списке сервера (для подсветки в ServerList).
 */
import type { StateCreator } from "zustand";
import { getAPI } from "../../lib/api";

export interface ConnectionSlice {
  isConnected: boolean;
  isConnecting: boolean;
  isDisconnecting: boolean;
  connectedServerId: string;
  errorMessage: string | null;
  sessionStartTime: number | null;
  sessionBytesRx: number;
  sessionBytesTx: number;
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
        set({ isConnected: false, isConnecting: false, isDisconnecting: false, connectedServerId: "", sessionStartTime: null, sessionBytesRx: 0, sessionBytesTx: 0 });
      } else {
        const connectId = get().selectedServerId;
        const status = await api.vpn.connect(connectId || undefined);
        if (status.connected) {
          set({ isConnected: true, isConnecting: false, connectedServerId: connectId, errorMessage: null, sessionStartTime: Date.now(), sessionBytesRx: 0, sessionBytesTx: 0 });
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
      set({ isConnected: false, isConnecting: false, isDisconnecting: false, connectedServerId: "", errorMessage: msg, sessionStartTime: null, sessionBytesRx: 0, sessionBytesTx: 0 });
    }
  }
});
