/**
 * Settings Slice — Настройки, first-run
 */
import type { StateCreator } from "zustand";
import { getAPI } from "../../lib/api";

export type Screen = "dashboard" | "split-tunnel" | "servers" | "settings";
export type Protocol = "xray" | "singbox";

export interface App {
  name: string;
  path?: string;
  icon?: string;
}

export interface SettingsSlice {
  currentScreen: Screen;
  isFirstRun: boolean | null;
  tunMode: boolean;
  fakeDns: boolean;
  killSwitch: boolean;
  autoConnect: boolean;
  notifications: boolean;
  autoStart: boolean;
  hwAccel: boolean;
  protocol: Protocol;

  // Split Tunnel
  proxyApps: App[];
  bypassApps: App[];

  // Favorites
  favoriteServerIds: string[];

  // Actions
  setScreen: (screen: Screen) => void;
  checkFirstRun: () => Promise<void>;
  completeFirstRun: () => Promise<void>;

  updateSetting: <K extends string>(key: K, value: unknown) => void;
  addProxyApp: (app: App) => void;
  removeProxyApp: (appName: string) => void;
  addBypassApp: (app: App) => void;
  removeBypassApp: (appName: string) => void;
  toggleFavorite: (serverId: string) => void;
}

export const createSettingsSlice: StateCreator<
  SettingsSlice & { isConnected: boolean; isConnecting: boolean; isDisconnecting: boolean; connectedServerId: string; errorMessage: string | null; toggleConnection: () => Promise<void> },
  [],
  [],
  SettingsSlice
> = (set, get) => ({
  currentScreen: "dashboard",
  isFirstRun: null,
  tunMode: false,
  fakeDns: true,
  killSwitch: false,
  autoConnect: false,
  notifications: true,
  autoStart: false,
  hwAccel: true,
  protocol: "xray",

  proxyApps: [],
  bypassApps: [],
  favoriteServerIds: [],

  setScreen: (screen) => set({ currentScreen: screen }),

  checkFirstRun: async () => {
    const api = getAPI();
    if (api) {
      const first = await api.app.isFirstRun();
      set({ isFirstRun: first });
    } else {
      set({ isFirstRun: false });
    }
  },

  completeFirstRun: async () => {
    const api = getAPI();
    if (api) {
      await api.app.markFirstRunDone();
    }
    set({ isFirstRun: false });
  },

  updateSetting: (key, value) => {
    const wasConnected = get().isConnected;
    set((state) => ({ ...state, [key]: value }));

    const api = getAPI();
    if (api) {
      const settingsMap: Record<string, string> = {
        tunMode: "useTunMode",
        killSwitch: "killSwitch",
        autoStart: "autoStart",
        autoConnect: "autoConnect"
      };
      const backendKey = settingsMap[key];
      const isFakeDns = key === "fakeDns";

      if (backendKey || isFakeDns) {
        api.state.get().then((st) => {
          const updates: Partial<typeof st.settings> = {};
          if (backendKey) (updates as Record<string, unknown>)[backendKey] = value;
          if (isFakeDns) updates.dnsMode = (value ? "secure" : "auto") as "auto" | "secure" | "system" | "custom";
          api.state.set({ ...st, settings: { ...st.settings, ...updates } });
        });
      }
    }

    if (key === "protocol" && wasConnected) {
      // Прямой disconnect→connect при смене протокола
      const reconnectApi = getAPI();
      if (reconnectApi) {
        set({ isConnecting: true, isDisconnecting: true, errorMessage: null } as Partial<SettingsSlice>);
        reconnectApi.vpn.disconnect()
          .then(() => reconnectApi.vpn.connect((get() as unknown as { selectedServerId: string }).selectedServerId))
          .then((status) => {
            if (status.connected) {
              set({ isConnected: true, isConnecting: false, isDisconnecting: false, errorMessage: null } as Partial<SettingsSlice>);
            } else {
              set({ isConnected: false, isConnecting: false, isDisconnecting: false, errorMessage: status.lastError || "Ошибка переключения протокола" } as Partial<SettingsSlice>);
            }
          })
          .catch((e: unknown) => {
            const msg = e instanceof Error ? e.message : "Ошибка переключения протокола";
            set({ isConnected: false, isConnecting: false, isDisconnecting: false, errorMessage: msg } as Partial<SettingsSlice>);
          });
      }
    }
  },

  addProxyApp: (app) => set((state) => ({ proxyApps: [...state.proxyApps, app] })),
  removeProxyApp: (appName) => set((state) => ({ proxyApps: state.proxyApps.filter((a) => a.name !== appName) })),
  addBypassApp: (app) => set((state) => ({ bypassApps: [...state.bypassApps, app] })),
  removeBypassApp: (appName) => set((state) => ({ bypassApps: state.bypassApps.filter((a) => a.name !== appName) })),
  toggleFavorite: (serverId) => set((state) => ({
    favoriteServerIds: state.favoriteServerIds.includes(serverId)
      ? state.favoriteServerIds.filter((id) => id !== serverId)
      : [...state.favoriteServerIds, serverId]
  }))
});
