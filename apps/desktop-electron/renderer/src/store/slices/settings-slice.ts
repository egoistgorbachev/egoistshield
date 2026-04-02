/**
 * Settings Slice — рабочие настройки приложения без legacy tunnel routing UI.
 */
import type { StateCreator } from "zustand";
import { getAPI } from "../../lib/api";

export type Screen = "dashboard" | "servers" | "dns" | "zapret" | "telegram-proxy" | "settings";

export interface SettingsSlice {
  currentScreen: Screen;
  isFirstRun: boolean | null;
  fakeDns: boolean;
  killSwitch: boolean;
  autoUpdate: boolean;
  autoConnect: boolean;
  notifications: boolean;
  autoStart: boolean;
  systemDnsServers: string;
  zapretProfile: string;
  zapretSuspendDuringVpn: boolean;
  favoriteServerIds: string[];
  setScreen: (screen: Screen) => void;
  checkFirstRun: () => Promise<void>;
  completeFirstRun: () => Promise<void>;
  updateSetting: <K extends string>(key: K, value: unknown) => void;
  toggleFavorite: (serverId: string) => void;
}

function isBackendSyncedKey(key: string): boolean {
  return (
    key === "killSwitch" ||
    key === "autoUpdate" ||
    key === "autoStart" ||
    key === "autoConnect" ||
    key === "notifications" ||
    key === "fakeDns" ||
    key === "systemDnsServers" ||
    key === "zapretProfile" ||
    key === "zapretSuspendDuringVpn"
  );
}

export const createSettingsSlice: StateCreator<SettingsSlice, [], [], SettingsSlice> = (set, get) => ({
  currentScreen: "dashboard",
  isFirstRun: null,
  fakeDns: true,
  killSwitch: false,
  autoUpdate: true,
  autoConnect: false,
  notifications: true,
  autoStart: false,
  systemDnsServers: "",
  zapretProfile: "General",
  zapretSuspendDuringVpn: true,
  favoriteServerIds: [],

  setScreen: (screen) => set({ currentScreen: screen }),

  checkFirstRun: async () => {
    const api = getAPI();
    if (!api) {
      set({ isFirstRun: false });
      return;
    }

    const isFirstRun = await api.app.isFirstRun();
    set({ isFirstRun });
  },

  completeFirstRun: async () => {
    const api = getAPI();
    if (api) {
      await api.app.markFirstRunDone();
    }

    set({ isFirstRun: false });
  },

  updateSetting: (key, value) => {
    set((state) => ({ ...state, [key]: value }));

    if (!isBackendSyncedKey(key)) {
      return;
    }

    const api = getAPI();
    if (!api) {
      return;
    }

    void api.state.get().then((persistedState) => {
      const currentState = get();

      return api.state.set({
        ...persistedState,
        processRules: [],
        settings: {
          ...persistedState.settings,
          useTunMode: false,
          killSwitch: currentState.killSwitch,
          autoUpdate: currentState.autoUpdate,
          autoStart: currentState.autoStart,
          autoConnect: currentState.autoConnect,
          notifications: currentState.notifications,
          dnsMode: currentState.fakeDns ? "secure" : "auto",
          systemDnsServers: currentState.systemDnsServers,
          zapretProfile: currentState.zapretProfile,
          zapretSuspendDuringVpn: currentState.zapretSuspendDuringVpn
        }
      });
    });
  },

  toggleFavorite: (serverId) =>
    set((state) => ({
      favoriteServerIds: state.favoriteServerIds.includes(serverId)
        ? state.favoriteServerIds.filter((id) => id !== serverId)
        : [...state.favoriteServerIds, serverId]
    }))
});
