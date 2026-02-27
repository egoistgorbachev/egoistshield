/**
 * useAppStore — Slim Zustand store combiner.
 *
 * Логика разбита на слайсы:
 * - connection-slice: VPN connect/disconnect
 * - settings-slice: настройки, first-run, split tunnel
 * - servers-slice: серверы, пинг, подписки, sync
 *
 * Этот файл комбинирует слайсы в единый store с persist.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getAPI } from '../lib/api';

import { createConnectionSlice, type ConnectionSlice } from './slices/connection-slice';
import { createSettingsSlice, type SettingsSlice } from './slices/settings-slice';
import { createServersSlice, type ServersSlice } from './slices/servers-slice';

// Re-export types for consumers
export type { Screen, Protocol, App } from './slices/settings-slice';
export type { ServerConfig, SubscriptionConfig } from './slices/servers-slice';

export type AppState = ConnectionSlice & SettingsSlice & ServersSlice;

export const useAppStore = create<AppState>()(
    persist(
        (...args) => ({
            ...createConnectionSlice(...args),
            ...createSettingsSlice(...args),
            ...createServersSlice(...args),
        }),
        {
            name: 'egoist-storage',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                tunMode: state.tunMode,
                fakeDns: state.fakeDns,
                killSwitch: state.killSwitch,
                multihop: state.multihop,
                autoStart: state.autoStart,
                hwAccel: state.hwAccel,
                protocol: state.protocol,

                selectedServerId: state.selectedServerId,
                servers: state.servers,
                proxyApps: state.proxyApps,
                bypassApps: state.bypassApps
            })
        }
    )
);

// Fallback listener — auto-switch on VPN fallback
if (typeof window !== 'undefined') {
    const api = getAPI();
    if (api?.vpn?.onFallback) {
        api.vpn.onFallback((data) => {
            useAppStore.setState({ selectedServerId: data.nextNodeId, isConnected: true, isConnecting: false });
        });
    }
}
