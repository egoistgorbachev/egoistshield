/**
 * Servers Slice — Серверы, пинг, CRUD, подписки
 */
import type { StateCreator } from 'zustand';
import { getAPI } from '../../lib/api';
import { detectCountry } from '../../lib/country-detector';

export interface ServerConfig {
    id: string;
    name: string;
    ping: number;
    load: number;
    countryCode: string;
    countryName?: string;
    recommended?: boolean;
    pinned?: boolean;
    _host?: string;
    _port?: number;
}

export interface SubscriptionConfig {
    id: string;
    url: string;
    name?: string | null;
    enabled: boolean;
    lastUpdated: string | null;
    upload?: number;
    download?: number;
    total?: number;
    expire?: number;
}

export interface ServersSlice {
    selectedServerId: string;
    servers: ServerConfig[];
    subscriptions: SubscriptionConfig[];
    _pingInterval: NodeJS.Timeout | null;

    setSelectedServer: (id: string) => void;
    addServer: (server: ServerConfig) => void;
    removeServer: (id: string) => void;
    togglePinServer: (id: string) => void;
    refreshSubscription: (url: string) => Promise<void>;
    removeSubscription: (url: string) => Promise<void>;
    refreshAllSubscriptions: () => Promise<void>;
    syncWithBackend: () => Promise<void>;
    installRuntime: () => Promise<void>;
    testAllPings: () => Promise<void>;
    startPingLoop: () => void;
    stopPingLoop: () => void;
}

export const createServersSlice: StateCreator<
    ServersSlice & { isConnected: boolean; toggleConnection: () => Promise<void> },
    [],
    [],
    ServersSlice
> = (set, get) => ({
    selectedServerId: '',
    servers: [],
    subscriptions: [],
    _pingInterval: null,

    setSelectedServer: async (id) => {
        const state = get();
        const wasConnected = state.isConnected;

        set({ selectedServerId: id });
        const api = getAPI();
        if (api) {
            const currentState = await api.state.get();
            await api.state.set({ ...currentState, activeNodeId: id });

            if (wasConnected && state.selectedServerId !== id) {
                await get().toggleConnection();
                await new Promise(r => setTimeout(r, 500));
                await get().toggleConnection();
            }
        } else if (id === 'smart-optimal') {
            if (wasConnected && state.selectedServerId !== id) {
                await get().toggleConnection();
                await new Promise(r => setTimeout(r, 500));
                await get().toggleConnection();
            }
        }
    },

    addServer: (server) => set((state) => ({ servers: [...state.servers, server] })),

    removeServer: async (id) => {
        set((state) => ({ servers: state.servers.filter(s => s.id !== id) }));
        const api = getAPI();
        if (api) {
            const currentState = await api.state.get();
            await api.state.set({
                ...currentState,
                nodes: currentState.nodes.filter((n) => n.id !== id),
                activeNodeId: currentState.activeNodeId === id ? null : currentState.activeNodeId
            });
            const state = get();
            if (state.selectedServerId === id) {
                set({ selectedServerId: state.servers[0]?.id || '' });
            }
        }
    },

    togglePinServer: async (id) => {
        set((state) => ({
            servers: state.servers.map(s => s.id === id ? { ...s, pinned: !s.pinned } : s)
        }));
        const api = getAPI();
        if (api) {
            const currentState = await api.state.get();
            const updatedNodes = currentState.nodes.map((n) => {
                if (n.id === id) {
                    return { ...n, metadata: { ...n.metadata, pinned: n.metadata?.pinned === "true" ? "false" : "true" } };
                }
                return n;
            });
            await api.state.set({ ...currentState, nodes: updatedNodes });
        }
    },

    refreshSubscription: async (url) => {
        const api = getAPI();
        if (api) {
            await api.subscription.refreshOne(url);
            await get().syncWithBackend();
        }
    },

    removeSubscription: async (url) => {
        const api = getAPI();
        if (api) {
            const currentState = await api.state.get();
            await api.state.set({
                ...currentState,
                subscriptions: currentState.subscriptions.filter((s) => s.url !== url),
            });
            await get().syncWithBackend();
        }
    },

    refreshAllSubscriptions: async () => {
        const api = getAPI();
        if (api) {
            await api.subscription.refreshAll();
            await get().syncWithBackend();
        }
    },

    syncWithBackend: async () => {
        const api = getAPI();
        if (api) {
            const state = await api.state.get();

            const mappedServers: ServerConfig[] = state.nodes.map((n) => {
                const extractedCountry = detectCountry(n.name || "");
                return {
                    id: n.id,
                    name: n.name || `${n.protocol} node`,
                    ping: 0,
                    load: 0,
                    countryCode: extractedCountry,
                    recommended: false,
                    pinned: n.metadata?.pinned === "true",
                    _host: n.server,
                    _port: n.port
                };
            });

            const existingPings = new Map(get().servers.map(s => [s.id, s.ping]));
            const serversToSet: ServerConfig[] = mappedServers.map((s) => ({
                ...s,
                ping: existingPings.get(s.id) || 0
            }));

            set({
                servers: serversToSet,
                subscriptions: state.subscriptions || [],
                selectedServerId: state.activeNodeId || serversToSet[0]?.id || ''
            });

            get().testAllPings();
            get().startPingLoop();

            // Async GeoIP
            (async () => {
                const geoApi = getAPI();
                if (!geoApi?.system?.geoip) return;
                const currentServers = get().servers;
                const unknowns = currentServers.filter(s => s.countryCode === 'un' && s._host);
                for (const s of unknowns) {
                    try {
                        const geo = await geoApi.system.geoip(s._host!);
                        if (geo.countryCode && geo.countryCode !== 'un') {
                            set({
                                servers: get().servers.map(srv =>
                                    srv.id === s.id
                                        ? { ...srv, countryCode: geo.countryCode, countryName: geo.country }
                                        : srv
                                )
                            });
                        }
                    } catch { /* ignore geoip error */ }
                }
            })();
        }
    },

    startPingLoop: () => {
        const state = get();
        if (!state._pingInterval) {
            // Immediate first ping
            get().testAllPings();
            const interval = setInterval(() => {
                get().testAllPings();
            }, 5000);
            set({ _pingInterval: interval });
        }
    },

    stopPingLoop: () => {
        const state = get();
        if (state._pingInterval) {
            clearInterval(state._pingInterval);
            set({ _pingInterval: null });
        }
    },

    testAllPings: async () => {
        const api = getAPI();
        if (!api) return;

        const state = get();
        const servers = state.servers.filter(s => s.id !== 'smart-optimal');
        if (servers.length === 0) return;

        // Ping ALL servers — active first, then rest in batches of 5
        const serversToPing: ServerConfig[] = [];
        const activeServer = servers.find(s => s.id === state.selectedServerId);
        if (activeServer) serversToPing.push(activeServer);
        servers.forEach(s => {
            if (s.id !== state.selectedServerId) serversToPing.push(s);
        });
        const newPings = new Map<string, number>();

        for (let i = 0; i < serversToPing.length; i += 5) {
            const chunk = serversToPing.slice(i, i + 5);
            const results = await Promise.all(chunk.map(async (s: ServerConfig) => {
                try {
                    const p = await api.system.ping(s._host!, s._port!);
                    return { id: s.id, ping: p };
                } catch {
                    return { id: s.id, ping: -1 };
                }
            }));
            results.forEach(r => newPings.set(r.id, r.ping));
        }

        set((state) => ({
            servers: state.servers.map(s => {
                const p = newPings.get(s.id);
                return p !== undefined && p > 0 ? { ...s, ping: p } : s;
            })
        }));
    },

    installRuntime: async () => {
        const api = getAPI();
        if (api) {
            try {
                await api.runtime.installAll();
            } catch (e) {
                console.error("Failed to install runtime", e);
            }
        }
    },
});
