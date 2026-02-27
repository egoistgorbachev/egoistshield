/**
 * Settings Slice — Настройки, тема, first-run
 */
import type { StateCreator } from 'zustand';
import { getAPI } from '../../lib/api';

export type Screen = 'dashboard' | 'split-tunnel' | 'servers' | 'logs' | 'settings';
export type Protocol = 'xray' | 'singbox';

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
    multihop: boolean;
    autoStart: boolean;
    hwAccel: boolean;
    protocol: Protocol;
    theme: 'dark' | 'light';

    // Split Tunnel
    proxyApps: App[];
    bypassApps: App[];

    // Actions
    setScreen: (screen: Screen) => void;
    checkFirstRun: () => Promise<void>;
    completeFirstRun: () => Promise<void>;
    toggleTheme: () => void;
    updateSetting: <K extends string>(key: K, value: unknown) => void;
    addProxyApp: (app: App) => void;
    removeProxyApp: (appName: string) => void;
    addBypassApp: (app: App) => void;
    removeBypassApp: (appName: string) => void;
}

export const createSettingsSlice: StateCreator<
    SettingsSlice & { isConnected: boolean; toggleConnection: () => Promise<void> },
    [],
    [],
    SettingsSlice
> = (set, get) => ({
    currentScreen: 'dashboard',
    isFirstRun: null,
    tunMode: false,
    fakeDns: true,
    killSwitch: false,
    multihop: false,
    autoStart: false,
    hwAccel: true,
    protocol: 'xray',
    theme: 'dark' as 'dark' | 'light',

    proxyApps: [],
    bypassApps: [],

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

    toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        set({ theme: next });
    },

    updateSetting: (key, value) => {
        const wasConnected = get().isConnected;
        set((state) => ({ ...state, [key]: value }));

        const api = getAPI();
        if (api) {
            const settingsMap: Record<string, string> = {
                tunMode: 'useTunMode',
                killSwitch: 'killSwitch',
                autoStart: 'autoStart',
            };
            const backendKey = settingsMap[key];
            if (backendKey) {
                api.state.get().then((st) => {
                    api.state.set({
                        ...st,
                        settings: { ...st.settings, [backendKey]: value as boolean }
                    });
                });
            }
            if (key === 'fakeDns') {
                api.state.get().then((st) => {
                    api.state.set({
                        ...st,
                        settings: { ...st.settings, dnsMode: (value ? 'secure' : 'auto') as 'auto' | 'secure' | 'system' | 'custom' }
                    });
                });
            }
        }

        if (key === 'protocol' && wasConnected) {
            setTimeout(async () => {
                await get().toggleConnection();
                await new Promise(r => setTimeout(r, 500));
                await get().toggleConnection();
            }, 100);
        }
    },

    addProxyApp: (app) => set((state) => ({ proxyApps: [...state.proxyApps, app] })),
    removeProxyApp: (appName) => set((state) => ({ proxyApps: state.proxyApps.filter(a => a.name !== appName) })),
    addBypassApp: (app) => set((state) => ({ bypassApps: [...state.bypassApps, app] })),
    removeBypassApp: (appName) => set((state) => ({ bypassApps: state.bypassApps.filter(a => a.name !== appName) })),
});
