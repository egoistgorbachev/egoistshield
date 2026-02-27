/**
 * Connection Slice — VPN connect/disconnect/status
 */
import type { StateCreator } from 'zustand';
import { getAPI } from '../../lib/api';

export interface ConnectionSlice {
    isConnected: boolean;
    isConnecting: boolean;
    isDisconnecting: boolean;
    errorMessage: string | null;
    toggleConnection: () => Promise<void>;
}

export const createConnectionSlice: StateCreator<
    ConnectionSlice & { selectedServerId: string; servers: Array<{ id: string; ping: number }> },
    [],
    [],
    ConnectionSlice
> = (set, get) => ({
    isConnected: false,
    isConnecting: false,
    isDisconnecting: false,
    errorMessage: null,

    toggleConnection: async () => {
        const { isConnected, isConnecting } = get();
        if (isConnecting) return;

        const api = getAPI();
        set({ isConnecting: true, isDisconnecting: isConnected, errorMessage: null });

        if (!api) {
            // Fallback for visual testing without backend
            setTimeout(() => {
                set({ isConnecting: false, isDisconnecting: false, isConnected: !isConnected });
            }, 1000);
            return;
        }

        try {
            if (isConnected) {
                const status = await api.vpn.disconnect();
                set({ isConnected: status.connected, isConnecting: false, isDisconnecting: false });
            } else {
                // Smart Routing Logic: pick lowest ping server if smart-optimal
                let connectId = get().selectedServerId;
                if (connectId === 'smart-optimal') {
                    const available = get().servers.filter(s => s.id !== 'smart-optimal' && s.ping > 0);
                    if (available.length > 0) {
                        available.sort((a, b) => a.ping - b.ping);
                        connectId = available[0].id;
                        const currentState = await api.state.get();
                        await api.state.set({ ...currentState, activeNodeId: connectId });
                    }
                }

                const status = await api.vpn.connect();
                if (status.connected) {
                    set({ isConnected: true, isConnecting: false, errorMessage: null });
                } else {
                    set({ isConnected: false, isConnecting: false, errorMessage: status.lastError || "Ошибка подключения" });
                }
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Неизвестная ошибка";
            set({ isConnected: false, isConnecting: false, isDisconnecting: false, errorMessage: msg });
        }
    }
});
