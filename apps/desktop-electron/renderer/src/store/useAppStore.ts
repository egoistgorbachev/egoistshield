/**
 * useAppStore — Slim Zustand store combiner.
 *
 * Логика разбита на слайсы:
 * - connection-slice: VPN connect/disconnect
 * - settings-slice: настройки и first-run
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
export type { Screen } from "./slices/settings-slice";
export type { ServerConfig, SubscriptionConfig } from "./slices/servers-slice";

export type AppState = ConnectionSlice & SettingsSlice & ServersSlice;

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function normalizeZapretProfile(value: unknown, fallback: string): string {
  if (!isString(value)) {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed || fallback;
}

function sanitizePersistedState(persistedState: unknown, currentState: AppState): AppState {
  if (!persistedState || typeof persistedState !== "object") {
    return currentState;
  }

  const persisted = persistedState as Partial<Record<keyof AppState, unknown>>;

  return {
    ...currentState,
    fakeDns: isBoolean(persisted.fakeDns) ? persisted.fakeDns : currentState.fakeDns,
    killSwitch: isBoolean(persisted.killSwitch) ? persisted.killSwitch : currentState.killSwitch,
    autoUpdate: isBoolean(persisted.autoUpdate) ? persisted.autoUpdate : currentState.autoUpdate,
    autoConnect: isBoolean(persisted.autoConnect) ? persisted.autoConnect : currentState.autoConnect,
    notifications: isBoolean(persisted.notifications) ? persisted.notifications : currentState.notifications,
    autoStart: isBoolean(persisted.autoStart) ? persisted.autoStart : currentState.autoStart,
    systemDnsServers: isString(persisted.systemDnsServers) ? persisted.systemDnsServers : currentState.systemDnsServers,
    zapretProfile: normalizeZapretProfile(persisted.zapretProfile, currentState.zapretProfile),
    zapretSuspendDuringVpn: isBoolean(persisted.zapretSuspendDuringVpn)
      ? persisted.zapretSuspendDuringVpn
      : currentState.zapretSuspendDuringVpn,
    selectedServerId: isString(persisted.selectedServerId) ? persisted.selectedServerId : currentState.selectedServerId,
    servers: Array.isArray(persisted.servers) ? (persisted.servers as AppState["servers"]) : currentState.servers,
    favoriteServerIds: isStringArray(persisted.favoriteServerIds)
      ? persisted.favoriteServerIds
      : currentState.favoriteServerIds
  };
}

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
      merge: (persistedState, currentState) => sanitizePersistedState(persistedState, currentState),
      partialize: (state) => ({
        fakeDns: state.fakeDns,
        killSwitch: state.killSwitch,
        autoUpdate: state.autoUpdate,
        autoConnect: state.autoConnect,
        notifications: state.notifications,
        autoStart: state.autoStart,
        systemDnsServers: state.systemDnsServers,
        zapretProfile: state.zapretProfile,
        zapretSuspendDuringVpn: state.zapretSuspendDuringVpn,

        selectedServerId: state.selectedServerId,
        servers: state.servers,
        favoriteServerIds: state.favoriteServerIds
      })
    }
  )
);
