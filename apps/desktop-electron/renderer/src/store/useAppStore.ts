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
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { type ConnectionSlice, createConnectionSlice } from "./slices/connection-slice";
import { type ServersSlice, createServersSlice } from "./slices/servers-slice";
import { type SettingsSlice, createSettingsSlice } from "./slices/settings-slice";

// Re-export types for consumers
export type { Screen, Protocol, App } from "./slices/settings-slice";
export type { ServerConfig, SubscriptionConfig } from "./slices/servers-slice";

export type AppState = ConnectionSlice & SettingsSlice & ServersSlice;

export const useAppStore = create<AppState>()(
  persist(
    (...args) => ({
      ...createConnectionSlice(...args),
      ...createSettingsSlice(...args),
      ...createServersSlice(...args)
    }),
    {
      name: "egoist-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        tunMode: state.tunMode,
        fakeDns: state.fakeDns,
        killSwitch: state.killSwitch,
        autoConnect: state.autoConnect,
        notifications: state.notifications,
        autoStart: state.autoStart,
        hwAccel: state.hwAccel,
        protocol: state.protocol,

        selectedServerId: state.selectedServerId,
        servers: state.servers,
        proxyApps: state.proxyApps,
        bypassApps: state.bypassApps,
        favoriteServerIds: state.favoriteServerIds
      })
    }
  )
);
