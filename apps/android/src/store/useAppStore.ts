/**
 * useAppStore — Zustand store for EgoistShield Android.
 * Adapted from desktop-electron store.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { VpnNode, ServerConfig } from '../types';
import { vpnBridge } from '../native/vpnBridge';
import { buildSingBoxConfig } from '../native/configBuilder';
import { parseVpnText, detectCountryCode } from '../native/uriParser';

export type Screen = 'dashboard' | 'servers' | 'settings';

export interface AppSettings {
  autoConnect: boolean;
  notifications: boolean;
}

export interface AppState {
  // Connection
  isConnected: boolean;
  isConnecting: boolean;
  isDisconnecting: boolean;
  connectedServerId: string;
  errorMessage: string | null;
  sessionStartTime: number | null;

  // Servers
  servers: ServerConfig[];
  selectedServer: string;  // alias for selectedServerId
  favoriteServerIds: string[];

  // Settings
  settings: AppSettings;

  // Navigation
  currentScreen: Screen;

  // Actions
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  toggleConnection: () => Promise<void>;
  setScreen: (screen: Screen) => void;
  addServer: (node: VpnNode) => void;
  addServersFromText: (text: string) => { added: number; issues: string[] };
  removeServer: (id: string) => void;
  setSelectedServer: (id: string) => void;
  toggleFavorite: (id: string) => void;
  clearError: () => void;
  updateSettings: (updates: Partial<AppSettings>) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // ── Connection ──
      isConnected: false,
      isConnecting: false,
      isDisconnecting: false,
      connectedServerId: '',
      errorMessage: null,
      sessionStartTime: null,

      // ── Servers ──
      servers: [],
      selectedServer: '',
      favoriteServerIds: [],

      // ── Settings ──
      settings: {
        autoConnect: false,
        notifications: true,
      },

      // ── Navigation ──
      currentScreen: 'dashboard',

      // ── Actions ──
      connect: async () => {
        const { isConnecting, selectedServer, servers } = get();
        if (isConnecting) return;

        set({ isConnecting: true, errorMessage: null });

        try {
          const server = servers.find(s => s.id === selectedServer);
          if (!server) {
            set({ isConnecting: false, errorMessage: 'Выберите сервер' });
            return;
          }

          const configJson = buildSingBoxConfig(server);
          const status = await vpnBridge.connect(configJson);

          if (status.connected) {
            set({
              isConnected: true,
              isConnecting: false,
              connectedServerId: selectedServer,
              errorMessage: null,
              sessionStartTime: Date.now(),
            });
          } else {
            set({
              isConnected: false,
              isConnecting: false,
              connectedServerId: '',
              errorMessage: 'Ошибка подключения',
            });
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Неизвестная ошибка';
          set({
            isConnected: false,
            isConnecting: false,
            connectedServerId: '',
            errorMessage: msg,
            sessionStartTime: null,
          });
        }
      },

      disconnect: async () => {
        set({ isDisconnecting: true });
        try {
          await vpnBridge.disconnect();
        } catch (e) {
          // ignore
        }
        set({
          isConnected: false,
          isConnecting: false,
          isDisconnecting: false,
          connectedServerId: '',
          sessionStartTime: null,
        });
      },

      toggleConnection: async () => {
        const { isConnected } = get();
        if (isConnected) {
          await get().disconnect();
        } else {
          await get().connect();
        }
      },

      setScreen: (screen) => set({ currentScreen: screen }),

      addServer: (node: VpnNode) => {
        const { servers } = get();
        const newServer: ServerConfig = {
          ...node,
          countryCode: node.countryCode || detectCountryCode(node.name),
          ping: null,
        };

        // Deduplicate by URI
        const exists = servers.some(s => s.uri === newServer.uri);
        if (!exists) {
          const updated = [...servers, newServer];
          set({ servers: updated });
          // Auto-select if none selected
          if (!get().selectedServer) {
            set({ selectedServer: newServer.id });
          }
        }
      },

      addServersFromText: (text: string) => {
        const { nodes, issues } = parseVpnText(text);
        const { servers } = get();

        const newServers: ServerConfig[] = nodes.map(node => ({
          ...node,
          countryCode: detectCountryCode(node.name),
          ping: null,
        }));

        const existingUris = new Set(servers.map(s => s.uri));
        const unique = newServers.filter(s => !existingUris.has(s.uri));

        if (unique.length > 0) {
          set({ servers: [...servers, ...unique] });
          if (!get().selectedServer && unique.length > 0) {
            set({ selectedServer: unique[0].id });
          }
        }

        return { added: unique.length, issues };
      },

      removeServer: (id: string) => {
        const { servers, selectedServer, connectedServerId } = get();
        const filtered = servers.filter(s => s.id !== id);
        const updates: Partial<AppState> = { servers: filtered };

        if (selectedServer === id) {
          (updates as any).selectedServer = filtered[0]?.id || '';
        }
        if (connectedServerId === id) {
          updates.connectedServerId = '';
        }

        set(updates as AppState);
      },

      setSelectedServer: (id: string) => set({ selectedServer: id }),

      toggleFavorite: (id: string) => {
        const { favoriteServerIds } = get();
        if (favoriteServerIds.includes(id)) {
          set({ favoriteServerIds: favoriteServerIds.filter(f => f !== id) });
        } else {
          set({ favoriteServerIds: [...favoriteServerIds, id] });
        }
      },

      clearError: () => set({ errorMessage: null }),

      updateSettings: (updates: Partial<AppSettings>) => {
        const { settings } = get();
        set({ settings: { ...settings, ...updates } });
      },
    }),
    {
      name: 'egoist-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        servers: state.servers,
        selectedServer: state.selectedServer,
        favoriteServerIds: state.favoriteServerIds,
        settings: state.settings,
      }),
    }
  )
);
