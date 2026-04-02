import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle,
  ChevronDown,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SearchX,
  Server,
  Star,
  Trash2,
  X
} from "lucide-react";
import { Suspense, lazy, useDeferredValue, useMemo, useState } from "react";
import { AddServerModal } from "../components/AddServerModal";
import { FlagIcon } from "../components/FlagIcon";
import { PageHero } from "../components/PageHero";
import { SegmentedTabs } from "../components/SegmentedTabs";
import { ServerItem } from "../components/ServerItem";
import { getAPI } from "../lib/api";
import { cn } from "../lib/cn";
import { type ServerConfig, useAppStore } from "../store/useAppStore";

const Globe3D = lazy(() => import("../components/Globe3D").then((m) => ({ default: m.Globe3D })));

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function ServerList() {
  const servers = useAppStore((s) => s.servers);
  const subscriptions = useAppStore((s) => s.subscriptions);
  const selectedServerId = useAppStore((s) => s.selectedServerId);
  const setSelectedServer = useAppStore((s) => s.setSelectedServer);
  const removeServer = useAppStore((s) => s.removeServer);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const favoriteServerIds = useAppStore((s) => s.favoriteServerIds);
  const removeSubscription = useAppStore((s) => s.removeSubscription);
  const refreshSubscription = useAppStore((s) => s.refreshSubscription);
  const refreshAllSubscriptions = useAppStore((s) => s.refreshAllSubscriptions);
  const renameSubscription = useAppStore((s) => s.renameSubscription);
  const renameServer = useAppStore((s) => s.renameServer);
  const isConnected = useAppStore((s) => s.isConnected);
  const isConnecting = useAppStore((s) => s.isConnecting);
  const connectedServerId = useAppStore((s) => s.connectedServerId);
  const toggleConnection = useAppStore((s) => s.toggleConnection);
  const connectToServer = useAppStore((s) => s.connectToServer);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [editingSubUrl, setEditingSubUrl] = useState<string | null>(null);
  const [editingSubName, setEditingSubName] = useState("");
  const [refreshLoading, setRefreshLoading] = useState(false);

  // ── Speedtest state ──
  const [speedtestRunning, setSpeedtestRunning] = useState(false);
  const [speedtestResult, setSpeedtestResult] = useState<{
    speed: number;
    bytes?: number;
    timeMs?: number;
    error: string | null;
  } | null>(null);

  const showToast = (message: string, type: "success" | "error"): void => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSpeedtest = async (): Promise<void> => {
    if (speedtestRunning) {
      return;
    }
    setSpeedtestRunning(true);
    setSpeedtestResult(null);
    try {
      const api = getAPI();
      if (api?.system?.speedtest) {
        const result = await api.system.speedtest();
        setSpeedtestResult(result);
        if (result.error) {
          showToast(result.error, "error");
        } else {
          showToast(`Скорость: ${result.speed} Мбит/с`, "success");
        }
      } else {
        showToast("Тест скорости недоступен", "error");
      }
    } catch (error: unknown) {
      showToast(getErrorMessage(error, "Ошибка"), "error");
    } finally {
      setSpeedtestRunning(false);
    }
  };

  const handleRefresh = async (url: string): Promise<void> => {
    try {
      showToast("Обновление...", "success");
      await refreshSubscription(url);
      showToast("Подписка успешно обновлена!", "success");
    } catch (error: unknown) {
      showToast(getErrorMessage(error, "Ошибка обновления"), "error");
    }
  };
  const [activeTab, setActiveTab] = useState<"map" | "nodes" | "subscriptions">("nodes");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [sortType, setSortType] = useState<"group" | "ping" | "alpha">("ping");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const normalizedSearchQuery = deferredSearchQuery.trim().toLowerCase();

  const toggleGroup = (countryCode: string) => {
    setExpandedGroups((prev) => ({ ...prev, [countryCode]: !prev[countryCode] }));
  };

  // Группировка серверов
  const pinnedServers = useMemo(
    () => servers.filter((s) => favoriteServerIds.includes(s.id)),
    [servers, favoriteServerIds]
  );
  const regularServers = useMemo(
    () => servers.filter((s) => !favoriteServerIds.includes(s.id)),
    [servers, favoriteServerIds]
  );

  const groupedServers = useMemo(() => {
    const groups: Record<string, ServerConfig[]> = {};
    for (const server of regularServers) {
      groups[server.countryCode] = groups[server.countryCode] ?? [];
      groups[server.countryCode]?.push(server);
    }
    return groups;
  }, [regularServers]);

  // Ping ranking: рассчитываем позицию каждого сервера по пингу
  const rankMap = useMemo(() => {
    const ranked = [...servers]
      .filter((s) => s.ping > 0)
      .sort((a, b) => a.ping - b.ping)
      .reduce<Map<string, number>>((map, s, i) => {
        map.set(s.id, i + 1);
        return map;
      }, new Map());
    return ranked;
  }, [servers]);

  // Filtered servers by search
  const filteredPinned = useMemo(() => {
    if (!normalizedSearchQuery) return pinnedServers;
    return pinnedServers.filter(
      (s) =>
        s.name.toLowerCase().includes(normalizedSearchQuery) ||
        s.countryCode?.toLowerCase().includes(normalizedSearchQuery) ||
        s.countryName?.toLowerCase().includes(normalizedSearchQuery)
    );
  }, [normalizedSearchQuery, pinnedServers]);

  const filteredGroups = useMemo(() => {
    if (!normalizedSearchQuery) return groupedServers;
    const result: Record<string, ServerConfig[]> = {};
    for (const [cc, group] of Object.entries(groupedServers)) {
      const filtered = group.filter(
        (s) =>
          s.name.toLowerCase().includes(normalizedSearchQuery) ||
          s.countryCode?.toLowerCase().includes(normalizedSearchQuery) ||
          s.countryName?.toLowerCase().includes(normalizedSearchQuery)
      );
      if (filtered.length > 0) result[cc] = filtered;
    }
    return result;
  }, [groupedServers, normalizedSearchQuery]);

  // Flat sorted list for ping/alpha sorting
  const flatSortedServers = useMemo(() => {
    let list = [...regularServers];
    if (normalizedSearchQuery) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(normalizedSearchQuery) ||
          s.countryCode?.toLowerCase().includes(normalizedSearchQuery) ||
          s.countryName?.toLowerCase().includes(normalizedSearchQuery)
      );
    }
    if (sortType === "ping") {
      // Sort valid pings first, then invalid
      list.sort((a, b) => {
        const pa = a.ping > 0 ? a.ping : 999999;
        const pb = b.ping > 0 ? b.ping : 999999;
        if (pa !== pb) return pa - pb;
        return a.name.localeCompare(b.name);
      });
    } else if (sortType === "alpha") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  }, [normalizedSearchQuery, regularServers, sortType]);
  const heroExtraActions: React.ReactNode[] = [];

  if (isConnected) {
    heroExtraActions.push(
      <HeroActionButton
        key="speedtest"
        title="Замерить скорость узла"
        busy={speedtestRunning}
        tone={speedtestRunning ? "warning" : "default"}
        onClick={handleSpeedtest}
      >
        {speedtestRunning ? (
          <>
            <motion.div
              animate={{ scale: [1, 1.18, 1], opacity: [1, 0.7, 1] }}
              transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
            >
              <Activity className="h-4 w-4" />
            </motion.div>
            Замер...
          </>
        ) : (
          <>
            <Activity className="h-4 w-4" />
            Тест скорости
          </>
        )}
      </HeroActionButton>
    );
  }

  if (activeTab === "subscriptions" && subscriptions.length > 0) {
    heroExtraActions.push(
      <HeroActionButton
        key="refresh-subscriptions"
        title="Обновить все подписки"
        busy={refreshLoading}
        onClick={async () => {
          if (refreshLoading) {
            return;
          }
          setRefreshLoading(true);
          try {
            await refreshAllSubscriptions();
            showToast("Подписки обновлены", "success");
          } catch (error: unknown) {
            showToast(getErrorMessage(error, "Ошибка обновления"), "error");
          } finally {
            setRefreshLoading(false);
          }
        }}
      >
        <RefreshCw className={cn("h-4 w-4", refreshLoading && "animate-spin")} />
        Обновить
      </HeroActionButton>
    );
  }

  return (
    <main className="relative z-10 flex-1 flex flex-col h-full overflow-hidden">
      <div className="mt-4 px-6 pb-4">
        <PageHero
          eyebrow="Библиотека маршрутов"
          title="Серверы"
          icon={<Server className="h-7 w-7 text-brand-light" />}
          description="Узлы, карта, поиск, подписки и тест скорости в одном рабочем пространстве."
          badges={[
            { label: `${servers.length} узлов`, icon: <Server className="h-3.5 w-3.5" />, tone: "brand" },
            {
              label: `${favoriteServerIds.length} в избранном`,
              icon: <Star className="h-3.5 w-3.5" />,
              tone: favoriteServerIds.length > 0 ? "warning" : "neutral"
            },
            {
              label: isConnected ? "VPN активен" : "VPN выключен",
              icon: <Activity className="h-3.5 w-3.5" />,
              tone: isConnected ? "success" : "neutral"
            }
          ]}
          railAction={
            <HeroActionButton title="Добавить конфигурацию" tone="brand" onClick={() => setIsAddModalOpen(true)}>
              <Plus className="h-4 w-4" />
              Добавить
            </HeroActionButton>
          }
          actions={
            heroExtraActions.length > 0 ? <div className="flex flex-wrap gap-2">{heroExtraActions}</div> : null
          }
        />
      </div>

      {/* Speedtest Result Banner */}
      <AnimatePresence>
        {speedtestResult && !speedtestResult.error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-4"
          >
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-brand/5 border border-brand/20 backdrop-blur-md">
              <div className="w-12 h-12 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center shrink-0">
                <Activity className="w-6 h-6 text-brand" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-white font-mono-metric">{speedtestResult.speed}</span>
                  <span className="text-sm font-bold text-muted uppercase">Мбит/с</span>
                </div>
                <span className="text-xs text-muted">
                  Загружено {speedtestResult.bytes ? (speedtestResult.bytes / 1_000_000).toFixed(0) : "—"} МБ за{" "}
                  {speedtestResult.timeMs ? (speedtestResult.timeMs / 1000).toFixed(1) : "--"}с
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSpeedtestResult(null)}
                className="text-subtle hover:text-white/60 transition-colors p-1"
              >
                ✕
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={cn("mb-4", activeTab === "map" ? "mx-6" : "px-6")}>
        <SegmentedTabs
          label="Режим просмотра серверов"
          activeId={activeTab}
          onChange={setActiveTab}
          items={[
            { id: "map", label: "Карта", icon: <Globe3DIcon /> },
            { id: "nodes", label: "Узлы", icon: <Server className="h-4 w-4" /> },
            {
              id: "subscriptions",
              label: "Подписки",
              icon: <RefreshCw className="h-4 w-4" />,
              badge: String(subscriptions.length)
            }
          ]}
        />
      </div>

      {/* ═══ MAP TAB ═══ */}
      {activeTab === "map" && (
        <div
          data-testid="serverlist-map-tab-panel"
          className="flex-1 flex items-center justify-center relative"
          style={{ minHeight: 0 }}
        >
          <Suspense
            fallback={
              <div className="flex-1 flex items-center justify-center h-full">
                <div className="relative w-[280px] h-[280px] flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border border-white/[0.05] animate-pulse" />
                  <div className="absolute inset-4 rounded-full border border-white/[0.03]" />
                  <div className="absolute inset-8 rounded-full border border-white/[0.02]" />
                  <div className="w-8 h-8 rounded-full bg-brand/10 animate-pulse" />
                </div>
              </div>
            }
          >
            <Globe3D
              servers={servers}
              selectedServerId={selectedServerId}
              onSelectCountry={(cc) => {
                const server = servers.find((s) => s.countryCode?.toLowerCase() === cc);
                if (server) {
                  if (selectedServerId === server.id) {
                    if (isConnected && connectedServerId === server.id) {
                      toggleConnection();
                    } else {
                      connectToServer(server.id);
                    }
                  } else {
                    setSelectedServer(server.id);
                  }
                }
              }}
              className="w-full h-full"
            />
          </Suspense>
        </div>
      )}
      {activeTab !== "map" && (
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 flex flex-col gap-4 relative z-10">
          <AnimatePresence mode="popLayout">
            {activeTab === "nodes" &&
              (servers.length === 0 ? (
                <EmptyState onAdd={() => setIsAddModalOpen(true)} type="узлов" />
              ) : (
                <div className="grid grid-cols-1 gap-4 p-6 pt-0 w-full max-w-7xl mx-auto">
                  {/* Search Bar */}
                  <div className="relative overflow-hidden rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Поиск серверов..."
                      className="w-full rounded-[16px] border border-white/[0.08] bg-black/10 py-3 pl-9 pr-8 text-sm text-white/90 outline-none transition-all placeholder:text-subtle focus:border-brand/30 focus:bg-white/[0.06]"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle hover:text-white/60 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Сортировка */}
                  <div className="flex rounded-[18px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-1 mb-2">
                    <button
                      type="button"
                      onClick={() => setSortType("ping")}
                      className={cn(
                        "flex-1 text-xs py-1.5 font-bold rounded-lg transition-all",
                        sortType === "ping" ? "bg-white/10 text-brand shadow-sm" : "text-subtle hover:text-white/60"
                      )}
                    >
                      По скорости
                    </button>
                    <button
                      type="button"
                      onClick={() => setSortType("group")}
                      className={cn(
                        "flex-1 text-xs py-1.5 font-bold rounded-lg transition-all",
                        sortType === "group" ? "bg-white/10 text-brand shadow-sm" : "text-subtle hover:text-white/60"
                      )}
                    >
                      По странам
                    </button>
                  </div>

                  {/* Избранные */}
                  {filteredPinned.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2 mb-2 drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]">
                        <Star className="w-4 h-4" fill="currentColor" /> Избранные
                      </h3>
                      {filteredPinned.map((server) => (
                        <ServerItem
                          key={server.id}
                          {...server}
                          active={selectedServerId === server.id}
                          isConnected={isConnected && connectedServerId === server.id}
                          isConnecting={isConnecting && connectedServerId === server.id}
                          onClick={() => setSelectedServer(server.id)}
                          onRemove={() => removeServer(server.id)}
                          onPin={() => toggleFavorite(server.id)}
                          pinned={favoriteServerIds.includes(server.id)}
                          rank={rankMap.get(server.id)}
                          onConnectToggle={() => {
                            if (isConnected && connectedServerId === server.id) {
                              toggleConnection();
                            } else {
                              connectToServer(server.id);
                            }
                          }}
                          onRename={(newName) => renameServer(server.id, newName)}
                        />
                      ))}
                    </div>
                  )}

                  {/* Серверы (Плоский список или Группы) */}
                  {sortType === "group" ? (
                    Object.entries(filteredGroups).map(([countryCode, countryServers]) => (
                      <div key={countryCode} className="space-y-2 rounded-[18px] p-2 select-none glass-panel">
                        <button
                          type="button"
                          onClick={() => toggleGroup(countryCode)}
                          className="w-full flex items-center justify-between p-3"
                        >
                          <div className="flex items-center gap-3">
                            <FlagIcon code={countryCode === "unknown" ? "un" : countryCode} size={32} />
                            <span className="font-bold text-lg text-white/90">{countryCode.toUpperCase()}</span>
                            <span className="bg-white/10 text-muted px-2 py-0.5 rounded-full text-xs font-medium">
                              {countryServers.length}
                            </span>
                          </div>
                          <motion.div animate={{ rotate: expandedGroups[countryCode] ? 180 : 0 }}>
                            <ChevronDown className="w-5 h-5 text-muted" />
                          </motion.div>
                        </button>

                        <AnimatePresence initial={false}>
                          {expandedGroups[countryCode] && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
                              className="overflow-hidden space-y-2 px-1 pb-1"
                            >
                              {countryServers.map((server) => (
                                <ServerItem
                                  key={server.id}
                                  {...server}
                                  active={selectedServerId === server.id}
                                  isConnected={isConnected && connectedServerId === server.id}
                                  isConnecting={isConnecting && connectedServerId === server.id}
                                  onClick={() => setSelectedServer(server.id)}
                                  onRemove={() => removeServer(server.id)}
                                  onPin={() => toggleFavorite(server.id)}
                                  pinned={favoriteServerIds.includes(server.id)}
                                  rank={rankMap.get(server.id)}
                                  recommended={rankMap.get(server.id) === 1}
                                  onConnectToggle={() => {
                                    if (isConnected && connectedServerId === server.id) {
                                      toggleConnection();
                                    } else {
                                      connectToServer(server.id);
                                    }
                                  }}
                                  onRename={(newName) => renameServer(server.id, newName)}
                                />
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))
                  ) : (
                    <div className="space-y-2">
                      {flatSortedServers.map((server) => (
                        <ServerItem
                          key={server.id}
                          {...server}
                          active={selectedServerId === server.id}
                          isConnected={isConnected && connectedServerId === server.id}
                          isConnecting={isConnecting && connectedServerId === server.id}
                          onClick={() => setSelectedServer(server.id)}
                          onRemove={() => removeServer(server.id)}
                          onPin={() => toggleFavorite(server.id)}
                          pinned={favoriteServerIds.includes(server.id)}
                          rank={rankMap.get(server.id)}
                          recommended={rankMap.get(server.id) === 1}
                          onConnectToggle={() => {
                            if (isConnected && connectedServerId === server.id) {
                              toggleConnection();
                            } else {
                              connectToServer(server.id);
                            }
                          }}
                          onRename={(newName) => renameServer(server.id, newName)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}

            {activeTab === "subscriptions" &&
              (subscriptions.length === 0 ? (
                <EmptyState onAdd={() => setIsAddModalOpen(true)} type="подписок" />
              ) : (
                <div className="space-y-4">
                  {subscriptions.map((sub) => {
                    // Format bytes
                    const formatBytes = (bytes?: number): string => {
                      if (!bytes) return "—";
                      if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} ГБ`;
                      if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} МБ`;
                      return `${(bytes / 1024).toFixed(0)} КБ`;
                    };

                    const used = (sub.upload || 0) + (sub.download || 0);
                    const totalLimit = sub.total ?? 0;
                    const hasLimits = totalLimit > 0;
                    const usagePercent = hasLimits ? Math.min(100, Math.round((used / totalLimit) * 100)) : 0;

                    // Days until expiry
                    const expireDate = sub.expire ? new Date(sub.expire * 1000) : null;
                    const daysLeft = expireDate
                      ? Math.max(0, Math.ceil((expireDate.getTime() - Date.now()) / 86400000))
                      : null;

                    return (
                      <div
                        key={sub.url}
                        style={{
                          contentVisibility: "auto",
                          containIntrinsicSize: "188px"
                        }}
                        className="rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.02]"
                      >
                        {/* Header — gradient with name */}
                        <div className="bg-gradient-to-r from-brand/10 to-accent/5 px-5 py-3.5 flex items-center justify-between border-b border-white/[0.04]">
                          <div className="flex-1 min-w-0 mr-3">
                            {editingSubUrl === sub.url ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  ref={(el) => el?.focus()}
                                  value={editingSubName}
                                  onChange={(e) => setEditingSubName(e.target.value)}
                                  onKeyDown={async (e) => {
                                    if (e.key === "Enter") {
                                      await renameSubscription(sub.url, editingSubName);
                                      setEditingSubUrl(null);
                                    }
                                    if (e.key === "Escape") setEditingSubUrl(null);
                                  }}
                                  onBlur={async () => {
                                    await renameSubscription(sub.url, editingSubName);
                                    setEditingSubUrl(null);
                                  }}
                                  className="flex-1 bg-white/5 border border-brand/30 rounded-lg px-2 py-1 text-sm font-bold text-white focus:outline-none focus:ring-1 focus:ring-brand/50"
                                />
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await renameSubscription(sub.url, editingSubName);
                                    setEditingSubUrl(null);
                                  }}
                                  className="p-1 bg-emerald-500/20 rounded-lg text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <h4 className="font-black text-white/90 text-sm truncate" title={sub.url}>
                                {sub.name || "Подписка"}
                              </h4>
                            )}
                            <p className="text-[10px] text-muted mt-0.5 truncate font-mono" title={sub.url}>
                              {sub.url}
                            </p>
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingSubUrl(sub.url);
                                setEditingSubName(sub.name || "");
                              }}
                              className="p-2 bg-white/[0.06] hover:bg-brand/20 rounded-xl text-muted hover:text-brand transition-all duration-200 hover:scale-105 active:scale-95"
                              title="Переименовать"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRefresh(sub.url)}
                              className="p-2 bg-white/[0.06] hover:bg-brand/20 rounded-xl text-muted hover:text-brand transition-all duration-200 hover:scale-105 active:scale-95"
                              title="Обновить"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeSubscription(sub.url)}
                              className="p-2 bg-white/[0.06] hover:bg-red-500/20 rounded-xl text-muted hover:text-red-400 transition-all duration-200 hover:scale-105 active:scale-95"
                              title="Удалить"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Body — stats */}
                        {/* Body — stats */}
                        <div className="px-5 py-4">
                          <div className="space-y-4">
                            <div className="flex items-center gap-5">
                              {/* Visual Chart */}
                              <div className="shrink-0 relative w-[60px] h-[60px]">
                                <svg
                                  aria-hidden="true"
                                  focusable="false"
                                  width="60"
                                  height="60"
                                  viewBox="0 0 60 60"
                                  className="transform -rotate-90"
                                >
                                  <circle
                                    cx="30"
                                    cy="30"
                                    r="26"
                                    fill="transparent"
                                    stroke="currentColor"
                                    strokeWidth="5"
                                    className="text-white/[0.05]"
                                  />
                                  <circle
                                    cx="30"
                                    cy="30"
                                    r="26"
                                    fill="transparent"
                                    stroke={
                                      !hasLimits
                                        ? "#10b981"
                                        : usagePercent > 90
                                          ? "#ef4444"
                                          : usagePercent > 75
                                            ? "#f59e0b"
                                            : "#10b981"
                                    }
                                    strokeWidth="5"
                                    strokeLinecap="round"
                                    strokeDasharray={26 * 2 * Math.PI}
                                    strokeDashoffset={26 * 2 * Math.PI * (1 - (hasLimits ? usagePercent : 100) / 100)}
                                  />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <span
                                    className={cn(
                                      "text-xs font-black",
                                      !hasLimits
                                        ? "text-emerald-400"
                                        : usagePercent > 90
                                          ? "text-red-400"
                                          : usagePercent > 75
                                            ? "text-amber-400"
                                            : "text-emerald-400"
                                    )}
                                  >
                                    {hasLimits ? `${usagePercent}%` : "∞"}
                                  </span>
                                </div>
                              </div>

                              {/* Stats Texts */}
                              <div className="flex-1 grid grid-cols-2 gap-3">
                                <div>
                                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted mb-0.5">
                                    Трафик
                                  </div>
                                  <div className="text-sm font-black text-white/90 truncate">{formatBytes(used)}</div>
                                  <div className="text-[10px] text-subtle font-medium mt-0.5">
                                    {hasLimits ? `из ${formatBytes(sub.total)}` : "без ограничений"}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted mb-0.5">
                                    Осталось
                                  </div>
                                  <div
                                    className={cn(
                                      "text-sm font-black truncate",
                                      daysLeft !== null && daysLeft <= 3
                                        ? "text-red-400"
                                        : daysLeft !== null && daysLeft <= 7
                                          ? "text-amber-400"
                                          : "text-emerald-400"
                                    )}
                                  >
                                    {daysLeft !== null ? (daysLeft === 0 ? "Сегодня" : `${daysLeft} дн.`) : "∞"}
                                  </div>
                                  {sub.lastUpdated && (
                                    <div
                                      className="text-[9px] text-subtle font-medium mt-1 truncate"
                                      title={`Обновлено: ${new Date(sub.lastUpdated).toLocaleString()}`}
                                    >
                                      Обн: {new Date(sub.lastUpdated).toLocaleDateString()}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Warnings */}
                            {((hasLimits && usagePercent > 80) || (daysLeft !== null && daysLeft <= 7)) && (
                              <div
                                className={cn(
                                  "flex items-start gap-2.5 p-3 rounded-xl text-xs font-medium border",
                                  (hasLimits && usagePercent > 90) || (daysLeft !== null && daysLeft <= 3)
                                    ? "bg-red-500/10 text-red-400 border-red-500/20"
                                    : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                )}
                              >
                                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                <div className="leading-relaxed">
                                  {hasLimits && usagePercent > 90 ? (
                                    <span className="block mb-0.5">
                                      <strong className="font-bold">Трафик почти исчерпан.</strong> Осталось{" "}
                                      {formatBytes(totalLimit - used)}.
                                    </span>
                                  ) : hasLimits && usagePercent > 80 ? (
                                    <span className="block mb-0.5">Использовано более 80% доступного трафика.</span>
                                  ) : null}

                                  {daysLeft !== null && daysLeft <= 3 ? (
                                    <span className="block">
                                      Подписка скоро истечет ({daysLeft === 0 ? "сегодня" : `через ${daysLeft} дн.`}).
                                    </span>
                                  ) : daysLeft !== null && daysLeft <= 7 ? (
                                    <span className="block">Срок действия подписки подходит к концу.</span>
                                  ) : null}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
          </AnimatePresence>
        </div>
      )}

      <AddServerModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />

      {/* Custom Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.output
            aria-live="polite"
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 z-toast pointer-events-none"
          >
            <div
              className={cn(
                "flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border backdrop-blur-xl",
                toast.type === "error"
                  ? "bg-red-500/10 border-red-500/20 text-red-100"
                  : "bg-emerald-500/10 border-emerald-500/20 text-emerald-100"
              )}
            >
              {toast.type === "error" ? (
                <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
              ) : (
                <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
              )}
              <span className="font-bold text-sm tracking-wide">{toast.message}</span>
            </div>
          </motion.output>
        )}
      </AnimatePresence>
    </main>
  );
}

function HeroActionButton({
  children,
  onClick,
  busy = false,
  title,
  tone = "default"
}: {
  children: React.ReactNode;
  onClick: () => void | Promise<void>;
  busy?: boolean;
  title: string;
  tone?: "default" | "brand" | "warning";
}) {
  const toneClass =
    tone === "brand"
      ? "border-brand/30 bg-brand/14 text-brand-light hover:border-brand/45 hover:bg-brand/18"
      : tone === "warning"
        ? "border-amber-500/30 bg-amber-500/14 text-amber-300 hover:border-amber-500/45 hover:bg-amber-500/18"
        : "border-white/10 bg-white/[0.05] text-white/82 hover:border-white/18 hover:bg-white/[0.08]";

  return (
    <motion.button
      type="button"
      title={title}
      disabled={busy}
      onClick={() => void onClick()}
      whileHover={busy ? undefined : { scale: 1.02, y: -1 }}
      whileTap={busy ? undefined : { scale: 0.985 }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] transition-all shadow-[0_8px_18px_rgba(0,0,0,0.1)] disabled:cursor-wait disabled:opacity-70",
        toneClass
      )}
    >
      {children}
    </motion.button>
  );
}

function Globe3DIcon() {
  return (
    <span className="relative inline-flex h-4 w-4 items-center justify-center">
      <span className="absolute inset-0 rounded-full border border-current opacity-80" />
      <span className="absolute inset-y-[1px] left-1/2 w-px -translate-x-1/2 rounded-full bg-current opacity-70" />
      <span className="absolute left-[2px] right-[2px] top-1/2 h-px -translate-y-1/2 rounded-full bg-current opacity-70" />
    </span>
  );
}

function EmptyState({ onAdd, type }: { onAdd: () => void; type: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center my-auto h-full text-center p-8 rounded-[22px] glass-panel"
    >
      <SearchX className="w-16 h-16 text-whisper mb-4" />
      <h3 className="text-xl font-bold text-muted mb-2">Список {type} пуст</h3>
      <p className="text-base text-muted mb-6 max-w-sm">Нажмите плюс для добавления конфигурации или подписки.</p>
      <button
        type="button"
        onClick={onAdd}
        className="px-6 py-3 text-white font-bold rounded-xl transition-all flex items-center gap-2 relative overflow-hidden bg-gradient-to-br from-brand to-[#1EB589] shadow-[0_4px_20px_rgba(38,201,154,0.4),inset_0_1px_0_rgba(255,255,255,0.1)]"
      >
        <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent" />
        <Plus className="relative z-10" /> <span className="relative z-10">Добавить</span>
      </button>
    </motion.div>
  );
}
