/**
 * Servers Slice — Серверы, пинг, CRUD, подписки
 */
import type { StateCreator } from "zustand";
import { getAPI } from "../../lib/api";
import { detectCountry } from "../../lib/country-detector";
import {
  SMART_CONNECT_CANDIDATE_LIMIT,
  SMART_CONNECT_FRESH_TTL_MS,
  SMART_CONNECT_PROBE_BUDGET,
  SMART_CONNECT_TIMEOUT_MS,
  buildSmartProbeTargets,
  mergeSmartCandidates,
  rankFreshSmartCandidates,
  rankSmartCandidates,
  toSmartCandidate
} from "../../lib/smart-connect";
import type { SettingsSlice } from "./settings-slice";

export interface ServerConfig {
  id: string;
  name: string;
  protocol: string;
  ping: number;
  load: number | null;
  countryCode: string;
  countryName?: string;
  recommended?: boolean;
  pinned?: boolean;
  security?: string;
  premium?: boolean;
  _host?: string;
  _port?: number;
  lastPingAt?: number | null;
  jitterMs?: number | null;
  lossPercent?: number | null;
  connectTimeMs?: number | null;
  timeToFirstByteMs?: number | null;
  successRate?: number | null;
  failureCount?: number | null;
  lastFailureAt?: number | null;
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

type PingableServer = ServerConfig & { _host: string; _port: number };
type GeoIpServer = ServerConfig & { _host: string };
type PingProbeResult = { id: string; ping: number; checkedAt: number };

function isPingableServer(server: ServerConfig): server is PingableServer {
  return typeof server._host === "string" && server._host.length > 0 && typeof server._port === "number";
}

function isGeoIpServer(server: ServerConfig): server is GeoIpServer {
  return typeof server._host === "string" && server._host.length > 0;
}

async function pingServers(
  servers: PingableServer[],
  timeoutMs: number,
  batchSize: number
): Promise<PingProbeResult[]> {
  const api = getAPI();
  if (!api || servers.length === 0) {
    return [];
  }

  const results: PingProbeResult[] = [];

  for (let index = 0; index < servers.length; index += batchSize) {
    const chunk = servers.slice(index, index + batchSize);
    const chunkResults = await Promise.all(
      chunk.map(async (server) => {
        try {
          const ping = await api.system.ping(server._host, server._port, timeoutMs);
          return { id: server.id, ping, checkedAt: Date.now() };
        } catch {
          return { id: server.id, ping: -1, checkedAt: Date.now() };
        }
      })
    );

    results.push(...chunkResults);
  }

  return results;
}

function applyPingProbeResults(servers: ServerConfig[], probeResults: PingProbeResult[]): ServerConfig[] {
  const resultMap = new Map(probeResults.map((result) => [result.id, result]));

  return servers.map((server) => {
    const result = resultMap.get(server.id);
    if (!result) {
      return server;
    }

    return {
      ...server,
      ping: result.ping > 0 ? result.ping : 0,
      lastPingAt: result.checkedAt
    };
  });
}

function updateServerConnectHealth(
  servers: ServerConfig[],
  serverId: string,
  outcome: "success" | "failure",
  connectTimeMs: number
): ServerConfig[] {
  return servers.map((server) => {
    if (server.id !== serverId) {
      return server;
    }

    const previousFailureCount = server.failureCount ?? 0;
    const previousSuccessRate = server.successRate ?? 1;
    const nextSuccessRate =
      outcome === "success"
        ? Math.min(1, previousSuccessRate * 0.75 + 0.25)
        : Math.max(0, previousSuccessRate * 0.7);

    return {
      ...server,
      connectTimeMs,
      successRate: nextSuccessRate,
      failureCount: outcome === "success" ? Math.max(0, previousFailureCount - 1) : previousFailureCount + 1,
      lastFailureAt: outcome === "failure" ? Date.now() : null
    };
  });
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
  ServersSlice & {
    isConnected: boolean;
    isConnecting: boolean;
    isDisconnecting: boolean;
    connectedServerId: string;
    errorMessage: string | null;
    sessionStartTime: number | null;
    sessionBytesRx: number;
    sessionBytesTx: number;
    toggleConnection: () => Promise<void>;
  } & Pick<
      SettingsSlice,
      "fakeDns" | "killSwitch" | "autoUpdate" | "autoConnect" | "notifications" | "autoStart" | "systemDnsServers"
    >,
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
      const wasConnected = get().isConnected;
      const startedAt = Date.now();
      console.log("[connectToServer] wasConnected:", wasConnected);

      set({ isConnecting: true, isDisconnecting: wasConnected, errorMessage: null });

      console.log("[connectToServer] calling api.vpn.connect(", id, ")...");
      const status = await api.vpn.connect(id);
      console.log("[connectToServer] connect result:", JSON.stringify(status));

      if (status.connected && status.activeNodeId === id) {
        set({
          isConnected: true,
          isConnecting: false,
          isDisconnecting: false,
          connectedServerId: id,
          errorMessage: null,
          sessionStartTime: Date.now(),
          sessionBytesRx: 0,
          sessionBytesTx: 0,
          servers: updateServerConnectHealth(get().servers, id, "success", Date.now() - startedAt)
        });
      } else if (status.connected && status.activeNodeId) {
        set({
          isConnected: true,
          isConnecting: false,
          isDisconnecting: false,
          connectedServerId: status.activeNodeId,
          errorMessage: status.lastError || "Не удалось переключиться на выбранный сервер",
          sessionStartTime: get().sessionStartTime,
          sessionBytesRx: get().sessionBytesRx,
          sessionBytesTx: get().sessionBytesTx,
          servers: updateServerConnectHealth(get().servers, id, "failure", Date.now() - startedAt)
        });
      } else {
        set({
          isConnected: false,
          isConnecting: false,
          isDisconnecting: false,
          connectedServerId: "",
          errorMessage: status.lastError || "Ошибка подключения",
          servers: updateServerConnectHealth(get().servers, id, "failure", Date.now() - startedAt)
        });
      }
    } catch (e: unknown) {
      console.error("[connectToServer] CATCH:", e);
      const msg = e instanceof Error ? e.message : "Ошибка подключения";
      set({
        isConnected: false,
        isConnecting: false,
        isDisconnecting: false,
        connectedServerId: "",
        errorMessage: msg,
        sessionStartTime: null,
        sessionBytesRx: 0,
        sessionBytesTx: 0,
        servers: updateServerConnectHealth(get().servers, id, "failure", 15_000)
      });
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
      const filteredNodes = subId ? currentState.nodes.filter((n) => n.subscriptionId !== subId) : currentState.nodes;

      await api.state.set({
        ...currentState,
        subscriptions: currentState.subscriptions.filter((s) => s.url !== url),
        nodes: filteredNodes,
        activeNodeId: filteredNodes.some((n) => n.id === currentState.activeNodeId)
          ? currentState.activeNodeId
          : (filteredNodes[0]?.id ?? null)
      });
      await get().syncWithBackend();
    }
  },

  renameSubscription: async (url, newName) => {
    set((state) => ({
      subscriptions: state.subscriptions.map((s) => (s.url === url ? { ...s, name: newName } : s))
    }));
    const api = getAPI();
    if (api) {
      await api.subscription.rename(url, newName);
    }
  },

  renameServer: async (id, newName) => {
    set((state) => ({
      servers: state.servers.map((s) => (s.id === id ? { ...s, name: newName } : s))
    }));
    const api = getAPI();
    if (api) {
      await api.node.rename(id, newName);
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
        const rawLoad = n.metadata?.load;
        const parsedLoad = rawLoad ? Number.parseInt(rawLoad, 10) : null;

        return {
          id: n.id,
          name: n.name || `${n.protocol} node`,
          protocol: n.protocol || "unknown",
          ping: 0,
          load: parsedLoad !== null && Number.isFinite(parsedLoad) ? parsedLoad : null,
          countryCode: extractedCountry,
          recommended: false,
          pinned: n.metadata?.pinned === "true",
          security: n.metadata?.security || (n.metadata?.flow ? "reality" : ""),
          premium: n.metadata?.premium === "true" || !!n.name?.toLowerCase().match(/premium|vip|pro|plus/i),
          _host: n.server,
          _port: n.port
        };
      });

      const existingPings = new Map(get().servers.map((server) => [server.id, server]));
      const serversToSet: ServerConfig[] = mappedServers.map((s) => ({
        ...s,
        ping: existingPings.get(s.id)?.ping || 0,
        lastPingAt: existingPings.get(s.id)?.lastPingAt ?? null
      }));

      // Сохраняем текущий UI-выбор если сервер ещё существует в списке;
      // иначе fallback на backend activeNodeId или первый сервер.
      const currentUiSelection = get().selectedServerId;
      const uiSelectionValid = currentUiSelection && serversToSet.some((s) => s.id === currentUiSelection);

      set({
        servers: serversToSet,
        subscriptions: state.subscriptions || [],
        selectedServerId: uiSelectionValid ? currentUiSelection : state.activeNodeId || serversToSet[0]?.id || "",
        fakeDns: state.settings.dnsMode === "secure",
        killSwitch: state.settings.killSwitch,
        autoUpdate: state.settings.autoUpdate,
        autoConnect: state.settings.autoConnect,
        notifications: state.settings.notifications,
        autoStart: state.settings.autoStart,
        systemDnsServers: state.settings.systemDnsServers ?? ""
      });

      get().testAllPings();
      get().startPingLoop();

      // Async GeoIP — batched by 5 for performance
      (async () => {
        const geoApi = getAPI();
        if (!geoApi?.system?.geoip) return;
        const currentServers = get().servers;
        const unknowns = currentServers.filter((s): s is GeoIpServer => s.countryCode === "un" && isGeoIpServer(s));

        // Process in batches of 5
        for (let i = 0; i < unknowns.length; i += 5) {
          const chunk = unknowns.slice(i, i + 5);
          const results = await Promise.allSettled(
            chunk.map(async (s) => {
              const geo = await geoApi.system.geoip(s._host);
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
        // Full ping ALL servers every 2s
        get().testAllPings();
      }, 2000);
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
    const state = get();
    const servers = state.servers.filter((s): s is PingableServer => s.id !== "smart-optimal" && isPingableServer(s));
    if (servers.length === 0) return;

    // Choose servers to ping
    let serversToPing: PingableServer[];
    if (activeOnly) {
      const active = servers.find((s) => s.id === state.selectedServerId);
      serversToPing = active ? [active] : [];
    } else {
      serversToPing = [];
      const activeServer = servers.find((s) => s.id === state.selectedServerId);
      if (activeServer) serversToPing.push(activeServer);
      for (const server of servers) {
        if (server.id !== state.selectedServerId) {
          serversToPing.push(server);
        }
      }
    }

    if (serversToPing.length === 0) return;
    const pingResults = await pingServers(serversToPing, 3_000, 5);

    set((currentState) => ({
      servers: applyPingProbeResults(currentState.servers, pingResults)
    }));
  },

  smartConnect: async () => {
    const state = get();
    const servers = state.servers.filter(isPingableServer);
    if (servers.length === 0) return;

    const cachedSamples = servers.map(toSmartCandidate);
    const immediateCandidates = rankFreshSmartCandidates(
      cachedSamples,
      undefined,
      SMART_CONNECT_CANDIDATE_LIMIT,
      Date.now(),
      SMART_CONNECT_FRESH_TTL_MS
    );
    const probeBudget = immediateCandidates.length > 0 ? 6 : SMART_CONNECT_PROBE_BUDGET;
    const probeTargets = buildSmartProbeTargets(
      cachedSamples,
      undefined,
      probeBudget,
      Date.now(),
      SMART_CONNECT_FRESH_TTL_MS
    )
      .map((candidate) => servers.find((server) => server.id === candidate.id))
      .filter((server): server is PingableServer => !!server);
    const probeResults = await pingServers(
      probeTargets,
      SMART_CONNECT_TIMEOUT_MS,
      Math.max(1, Math.min(SMART_CONNECT_PROBE_BUDGET, probeTargets.length))
    );

    if (probeResults.length > 0) {
      set((currentState) => ({
        servers: applyPingProbeResults(currentState.servers, probeResults)
      }));
    }

    const mergedCandidates = mergeSmartCandidates(
      immediateCandidates,
      probeResults.map((result) => ({
        ...toSmartCandidate(servers.find((server) => server.id === result.id) ?? { id: result.id, ping: result.ping }),
        ping: result.ping,
        checkedAt: result.checkedAt
      }))
    );
    const candidates = rankSmartCandidates(mergedCandidates, undefined, SMART_CONNECT_CANDIDATE_LIMIT);
    const fallbackCandidates =
      candidates.length > 0 ? candidates : rankSmartCandidates(cachedSamples, undefined, SMART_CONNECT_CANDIDATE_LIMIT);

    for (const candidate of fallbackCandidates) {
      await get().connectToServer(candidate.id);
      const currentState = get();
      if (currentState.isConnected && currentState.connectedServerId === candidate.id) {
        return;
      }
    }
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
