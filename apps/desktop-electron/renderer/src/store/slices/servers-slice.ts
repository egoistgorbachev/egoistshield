/**
 * Servers Slice — Серверы, пинг, CRUD, подписки
 */
import type { StateCreator } from "zustand";
import { getAPI } from "../../lib/api";
import { detectCountry } from "../../lib/country-detector";

export interface ServerConfig {
  id: string;
  name: string;
  protocol: string;
  ping: number;
  load: number;
  countryCode: string;
  countryName?: string;
  recommended?: boolean;
  pinned?: boolean;
  security?: string;
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
  connectToServer: (id: string) => Promise<void>;
  addServer: (server: ServerConfig) => void;
  removeServer: (id: string) => void;
  togglePinServer: (id: string) => void;
  refreshSubscription: (url: string) => Promise<void>;
  removeSubscription: (url: string) => Promise<void>;
  renameSubscription: (url: string, newName: string) => Promise<void>;
  renameServer: (id: string, newName: string) => Promise<void>;
  refreshAllSubscriptions: () => Promise<void>;
  syncWithBackend: () => Promise<void>;
  installRuntime: () => Promise<void>;
  testAllPings: (activeOnly?: boolean) => Promise<void>;
  smartConnect: () => Promise<void>;
  startPingLoop: () => void;
  stopPingLoop: () => void;
}

export const createServersSlice: StateCreator<
  ServersSlice & { isConnected: boolean; isConnecting: boolean; isDisconnecting: boolean; connectedServerId: string; errorMessage: string | null; sessionStartTime: number | null; sessionBytesRx: number; sessionBytesTx: number; toggleConnection: () => Promise<void> },
  [],
  [],
  ServersSlice
> = (set, get) => ({
  selectedServerId: "",
  servers: [],
  subscriptions: [],
  _pingInterval: null,

  setSelectedServer: async (id) => {
    // Только UI-выбор — без backend state, без подключения
    set({ selectedServerId: id });
  },

  connectToServer: async (id) => {
    console.log("[connectToServer] START id:", id);
    set({ selectedServerId: id });

    const api = getAPI();
    if (!api) {
      console.error("[connectToServer] API not available");
      set({ errorMessage: "Бэкенд не доступен." });
      return;
    }

    try {
      // Обновляем activeNodeId в backend
      console.log("[connectToServer] updating backend activeNodeId...");
      const currentState = await api.state.get();
      await api.state.set({ ...currentState, activeNodeId: id });

      const wasConnected = get().isConnected;
      console.log("[connectToServer] wasConnected:", wasConnected);

      set({ isConnecting: true, isDisconnecting: wasConnected, errorMessage: null });

      if (wasConnected) {
        console.log("[connectToServer] disconnecting...");
        try { await api.vpn.disconnect(); } catch { /* ignore */ }
        set({ isConnected: false, isDisconnecting: false, sessionStartTime: null, sessionBytesRx: 0, sessionBytesTx: 0 });
      }

      console.log("[connectToServer] calling api.vpn.connect(", id, ")...");
      const status = await api.vpn.connect(id);
      console.log("[connectToServer] connect result:", JSON.stringify(status));

      if (status.connected) {
        set({ isConnected: true, isConnecting: false, connectedServerId: id, errorMessage: null, sessionStartTime: Date.now(), sessionBytesRx: 0, sessionBytesTx: 0 });
      } else {
        set({
          isConnected: false,
          isConnecting: false,
          connectedServerId: "",
          errorMessage: status.lastError || "Ошибка подключения"
        });
      }
    } catch (e: unknown) {
      console.error("[connectToServer] CATCH:", e);
      const msg = e instanceof Error ? e.message : "Ошибка подключения";
      set({ isConnected: false, isConnecting: false, isDisconnecting: false, connectedServerId: "", errorMessage: msg, sessionStartTime: null, sessionBytesRx: 0, sessionBytesTx: 0 });
    }
  },

  addServer: (server) => set((state) => ({ servers: [...state.servers, server] })),

  removeServer: async (id) => {
    set((state) => ({ servers: state.servers.filter((s) => s.id !== id) }));
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
        set({ selectedServerId: state.servers[0]?.id || "" });
      }
    }
  },

  togglePinServer: async (id) => {
    set((state) => ({
      servers: state.servers.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s))
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
      // Найти ID подписки для каскадного удаления нод
      const subToRemove = currentState.subscriptions.find((s) => s.url === url);
      const subId = subToRemove?.id;

      // Удаляем ноды, привязанные к этой подписке
      const filteredNodes = subId
        ? currentState.nodes.filter((n) => n.subscriptionId !== subId)
        : currentState.nodes;

      await api.state.set({
        ...currentState,
        subscriptions: currentState.subscriptions.filter((s) => s.url !== url),
        nodes: filteredNodes,
        activeNodeId: filteredNodes.some((n) => n.id === currentState.activeNodeId)
          ? currentState.activeNodeId
          : filteredNodes[0]?.id ?? null
      });
      await get().syncWithBackend();
    }
  },

  renameSubscription: async (url, newName) => {
    set((state) => ({
      subscriptions: state.subscriptions.map((s) => (s.url === url ? { ...s, name: newName } : s))
    }));
    const api = getAPI();
    if (api && (api as any).subscription?.rename) {
      await (api as any).subscription.rename(url, newName);
    }
  },

  renameServer: async (id, newName) => {
    set((state) => ({
      servers: state.servers.map((s) => (s.id === id ? { ...s, name: newName } : s))
    }));
    const api = getAPI();
    if (api && (api as any).node?.rename) {
      await (api as any).node.rename(id, newName);
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
          protocol: n.protocol || "unknown",
          ping: 0,
          load: 0,
          countryCode: extractedCountry,
          recommended: false,
          pinned: n.metadata?.pinned === "true",
          security: n.metadata?.security || (n.metadata?.flow ? "reality" : ""),
          _host: n.server,
          _port: n.port
        };
      });

      const existingPings = new Map(get().servers.map((s) => [s.id, s.ping]));
      const serversToSet: ServerConfig[] = mappedServers.map((s) => ({
        ...s,
        ping: existingPings.get(s.id) || 0
      }));

      // Сохраняем текущий UI-выбор если сервер ещё существует в списке;
      // иначе fallback на backend activeNodeId или первый сервер.
      const currentUiSelection = get().selectedServerId;
      const uiSelectionValid = currentUiSelection && serversToSet.some((s) => s.id === currentUiSelection);

      set({
        servers: serversToSet,
        subscriptions: state.subscriptions || [],
        selectedServerId: uiSelectionValid ? currentUiSelection : (state.activeNodeId || serversToSet[0]?.id || "")
      });

      get().testAllPings();
      get().startPingLoop();

      // Async GeoIP — batched by 5 for performance
      (async () => {
        const geoApi = getAPI();
        if (!geoApi?.system?.geoip) return;
        const currentServers = get().servers;
        const unknowns = currentServers.filter((s) => s.countryCode === "un" && s._host);

        // Process in batches of 5
        for (let i = 0; i < unknowns.length; i += 5) {
          const chunk = unknowns.slice(i, i + 5);
          const results = await Promise.allSettled(
            chunk.map(async (s) => {
              const geo = await geoApi.system.geoip(s._host!);
              return { id: s.id, countryCode: geo.countryCode, country: geo.country };
            })
          );

          const updates = new Map<string, { countryCode: string; country: string }>();
          for (const r of results) {
            if (r.status === "fulfilled" && r.value.countryCode && r.value.countryCode !== "un") {
              updates.set(r.value.id, { countryCode: r.value.countryCode, country: r.value.country });
            }
          }

          if (updates.size > 0) {
            set({
              servers: get().servers.map((srv) => {
                const u = updates.get(srv.id);
                return u ? { ...srv, countryCode: u.countryCode, countryName: u.country } : srv;
              })
            });
          }
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
        // Pause when window is hidden
        if (typeof document !== "undefined" && document.hidden) return;
        // Full ping ALL servers every 3s
        get().testAllPings();
      }, 3000);
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

  testAllPings: async (activeOnly?: boolean) => {
    const api = getAPI();
    if (!api) return;

    const state = get();
    const servers = state.servers.filter((s) => s.id !== "smart-optimal");
    if (servers.length === 0) return;

    // Choose servers to ping
    let serversToPing: ServerConfig[];
    if (activeOnly) {
      const active = servers.find((s) => s.id === state.selectedServerId);
      serversToPing = active ? [active] : [];
    } else {
      serversToPing = [];
      const activeServer = servers.find((s) => s.id === state.selectedServerId);
      if (activeServer) serversToPing.push(activeServer);
      servers.forEach((s) => {
        if (s.id !== state.selectedServerId) serversToPing.push(s);
      });
    }

    if (serversToPing.length === 0) return;
    const newPings = new Map<string, number>();

    for (let i = 0; i < serversToPing.length; i += 5) {
      const chunk = serversToPing.slice(i, i + 5);
      const results = await Promise.all(
        chunk.map(async (s: ServerConfig) => {
          try {
            const p = await api.system.ping(s._host!, s._port!);
            return { id: s.id, ping: p };
          } catch {
            return { id: s.id, ping: -1 };
          }
        })
      );
      results.forEach((r) => newPings.set(r.id, r.ping));
    }

    set((state) => ({
      servers: state.servers.map((s) => {
        const p = newPings.get(s.id);
        return p !== undefined && p > 0 ? { ...s, ping: p } : s;
      })
    }));
  },

  smartConnect: async () => {
    const api = getAPI();
    if (!api) return;

    const state = get();
    const servers = state.servers.filter((s) => s._host && s._port);
    if (servers.length === 0) return;

    // Пингуем все серверы параллельно (батчами по 5)
    const pingResults: { id: string; ping: number }[] = [];
    for (let i = 0; i < servers.length; i += 5) {
      const chunk = servers.slice(i, i + 5);
      const results = await Promise.all(
        chunk.map(async (s) => {
          try {
            const p = await api.system.ping(s._host!, s._port!);
            return { id: s.id, ping: p > 0 ? p : Infinity };
          } catch {
            return { id: s.id, ping: Infinity };
          }
        })
      );
      pingResults.push(...results);
    }

    // Обновляем пинги в store
    const newPings = new Map(pingResults.map((r) => [r.id, r.ping]));
    set((state) => ({
      servers: state.servers.map((s) => {
        const p = newPings.get(s.id);
        return p !== undefined && p > 0 && p < Infinity ? { ...s, ping: p } : s;
      })
    }));

    // Выбираем сервер с минимальным пингом
    const reachable = pingResults.filter((r) => r.ping < Infinity);
    if (reachable.length === 0) return;
    reachable.sort((a, b) => a.ping - b.ping);
    const bestId = reachable[0]!.id;

    // Подключаемся
    await get().connectToServer(bestId);
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
  }
});
