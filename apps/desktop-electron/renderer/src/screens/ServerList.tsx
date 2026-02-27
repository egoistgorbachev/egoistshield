import { useState, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Server, Signal, ChevronRight, Plus, SearchX, Trash2, Pin, Globe, RefreshCw, AlertTriangle, CheckCircle, Power, Zap, Gauge } from "lucide-react";

import { cn } from "../lib/cn";
import { useAppStore, ServerConfig } from "../store/useAppStore";
import { AddServerModal } from "../components/AddServerModal";
import { FlagIcon } from "../components/FlagIcon";
import { ServerItem } from "../components/ServerItem";

export function ServerList() {
    const servers = useAppStore(s => s.servers);
    const subscriptions = useAppStore(s => s.subscriptions);
    const selectedServerId = useAppStore(s => s.selectedServerId);
    const setSelectedServer = useAppStore(s => s.setSelectedServer);
    const removeServer = useAppStore(s => s.removeServer);
    const togglePinServer = useAppStore(s => s.togglePinServer);
    const removeSubscription = useAppStore(s => s.removeSubscription);
    const refreshSubscription = useAppStore(s => s.refreshSubscription);
    const refreshAllSubscriptions = useAppStore(s => s.refreshAllSubscriptions);
    const isConnected = useAppStore(s => s.isConnected);
    const isConnecting = useAppStore(s => s.isConnecting);
    const toggleConnection = useAppStore(s => s.toggleConnection);

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

    // ── Speedtest state ──
    const [speedtestRunning, setSpeedtestRunning] = useState(false);
    const [speedtestResult, setSpeedtestResult] = useState<{ speed: number; timeMs?: number; error: string | null } | null>(null);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const handleSpeedtest = async () => {
        if (speedtestRunning) return;
        setSpeedtestRunning(true);
        setSpeedtestResult(null);
        try {
            const gw = window as any;
            if (gw.egoistAPI?.system?.speedtest) {
                const result = await gw.egoistAPI.system.speedtest();
                setSpeedtestResult(result);
                if (result.error) {
                    showToast(result.error, 'error');
                } else {
                    showToast(`Скорость: ${result.speed} Мбит/с`, 'success');
                }
            }
        } catch (e: any) {
            showToast(e.message || "Ошибка", 'error');
        }
        setSpeedtestRunning(false);
    };

    const handleRefresh = async (url: string) => {
        try {
            showToast("Обновление...", "success");
            await refreshSubscription(url);
            showToast("Подписка успешно обновлена!", "success");
        } catch (e: any) {
            showToast(e.message || "Ошибка обновления", "error");
        }
    };
    const [activeTab, setActiveTab] = useState<'nodes' | 'subscriptions'>('nodes');
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

    const toggleGroup = (countryCode: string) => {
        setExpandedGroups(prev => ({ ...prev, [countryCode]: !prev[countryCode] }));
    };

    // Группировка серверов
    const pinnedServers = useMemo(() => servers.filter(s => s.pinned), [servers]);
    const regularServers = useMemo(() => servers.filter(s => !s.pinned), [servers]);

    const groupedServers = useMemo(() => {
        const groups: Record<string, ServerConfig[]> = {};
        regularServers.forEach(server => {
            if (!groups[server.countryCode]) {
                groups[server.countryCode] = [];
            }
            groups[server.countryCode].push(server);
        });
        return groups;
    }, [regularServers]);

    return (
        <main className="relative z-10 flex-1 flex flex-col p-6 h-full pb-28 overflow-hidden">
            <div className="mb-4 mt-4 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-display font-bold text-white/90 flex items-center gap-3">
                        <Server className="text-brand/60 w-7 h-7" />
                        Серверы
                    </h1>
                </div>
                <div className="flex gap-2">
                    {/* Speedtest Button */}
                    {isConnected && (
                        <motion.button
                            onClick={handleSpeedtest}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            disabled={speedtestRunning}
                            className={cn(
                                "p-3 text-white transition-all rounded-xl shadow-lg border flex items-center gap-2",
                                speedtestRunning
                                    ? "bg-amber-500/20 border-amber-500/30 text-amber-400 cursor-wait shadow-[0_0_15px_rgba(251,191,36,0.2)]"
                                    : "bg-white/5 hover:bg-brand/20 border-white/10 hover:border-brand/40 hover:text-brand"
                            )}
                            title="Замерить скорость узла"
                        >
                            {speedtestRunning ? (
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                >
                                    <Gauge className="w-6 h-6" />
                                </motion.div>
                            ) : (
                                <Gauge className="w-6 h-6" />
                            )}
                        </motion.button>
                    )}
                    {activeTab === 'subscriptions' && subscriptions.length > 0 && (
                        <motion.button
                            onClick={() => refreshAllSubscriptions()}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="p-3 bg-white/5 hover:bg-brand/20 text-white transition-colors rounded-xl shadow-lg border border-white/10"
                            title="Обновить все подписки"
                        >
                            <RefreshCw className="w-6 h-6" />
                        </motion.button>
                    )}
                    <motion.button
                        onClick={() => setIsAddModalOpen(true)}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="p-3 bg-white/5 hover:bg-brand/20 text-white hover:text-brand rounded-xl border border-white/10 hover:border-brand/40 transition-colors shadow-lg flex items-center justify-center"
                        title="Добавить конфигурацию"
                    >
                        <Plus className="w-6 h-6" />
                    </motion.button>
                </div>
            </div>

            {/* Speedtest Result Banner */}
            <AnimatePresence>
                {speedtestResult && !speedtestResult.error && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden mb-4"
                    >
                        <div className="flex items-center gap-4 p-4 rounded-2xl bg-orange-500/5 border border-orange-500/20 backdrop-blur-md">
                            <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
                                <Gauge className="w-6 h-6 text-orange-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-2">
                                    <span className="text-3xl font-bold text-white font-mono-metric">{speedtestResult.speed}</span>
                                    <span className="text-sm font-bold text-white/50 uppercase">Мбит/с</span>
                                </div>
                                <span className="text-xs text-white/40">
                                    Загружено 10 МБ за {speedtestResult.timeMs ? (speedtestResult.timeMs / 1000).toFixed(1) : '--'}с
                                </span>
                            </div>
                            <button onClick={() => setSpeedtestResult(null)} className="text-white/30 hover:text-white/60 transition-colors p-1">✕</button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="flex p-1 rounded-2xl mb-4 glass-panel">
                <button
                    onClick={() => setActiveTab('nodes')}
                    className={cn(
                        "flex-1 py-2.5 text-sm max-[500px]:text-xs font-semibold rounded-xl transition-all duration-300",
                        activeTab === 'nodes' ? "bg-brand/10 text-brand shadow-md border border-brand/15" : "text-white/30 hover:text-white/60"
                    )}
                >
                    Узлы
                </button>
                <button
                    onClick={() => setActiveTab('subscriptions')}
                    className={cn(
                        "flex-1 py-2.5 text-sm max-[500px]:text-xs font-semibold rounded-xl transition-all duration-300",
                        activeTab === 'subscriptions' ? "bg-brand/10 text-brand shadow-md border border-brand/15" : "text-white/30 hover:text-white/60"
                    )}
                >
                    Подписки ({subscriptions.length})
                </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 flex flex-col gap-4 relative z-10">
                <AnimatePresence mode="popLayout">
                    {activeTab === 'nodes' && (
                        <>
                            {servers.length === 0 ? (
                                <EmptyState onAdd={() => setIsAddModalOpen(true)} type="узлов" />
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6 pt-0 pb-28 w-full max-w-7xl mx-auto">
                                    {/* Закрепленные */}
                                    {pinnedServers.length > 0 && (
                                        <div className="space-y-3">
                                            <h3 className="text-sm font-bold text-brand uppercase tracking-wider flex items-center gap-2 mb-2 drop-shadow-[0_0_8px_rgba(129,140,248,0.4)]">
                                                <Pin className="w-4 h-4" /> Закрепленные
                                            </h3>
                                            {pinnedServers.map(server => (
                                                <ServerItem
                                                    key={server.id}
                                                    {...server}
                                                    active={selectedServerId === server.id}
                                                    isConnected={isConnected && selectedServerId === server.id}
                                                    isConnecting={isConnecting && selectedServerId === server.id}
                                                    onClick={() => setSelectedServer(server.id)}
                                                    onRemove={() => removeServer(server.id)}
                                                    onPin={() => togglePinServer(server.id)}
                                                    onConnectToggle={() => {
                                                        if (selectedServerId !== server.id) {
                                                            setSelectedServer(server.id);
                                                            if (!isConnected) toggleConnection();
                                                        } else {
                                                            toggleConnection();
                                                        }
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    )}

                                    {/* Сгруппированные */}
                                    {Object.entries(groupedServers).map(([countryCode, countryServers]) => (
                                        <div key={countryCode} className="space-y-2 rounded-[18px] p-2 select-none glass-panel">
                                            <button
                                                onClick={() => toggleGroup(countryCode)}
                                                className="w-full flex items-center justify-between p-3"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <FlagIcon code={countryCode === 'unknown' ? 'un' : countryCode} size={32} />
                                                    <span className="font-bold text-lg text-white/90">
                                                        {countryCode.toUpperCase()}
                                                    </span>
                                                    <span className="bg-white/10 text-white/60 px-2 py-0.5 rounded-full text-xs font-medium">
                                                        {countryServers.length}
                                                    </span>
                                                </div>
                                                <motion.div animate={{ rotate: expandedGroups[countryCode] ? 90 : 0 }}>
                                                    <ChevronRight className="w-5 h-5 text-white/40" />
                                                </motion.div>
                                            </button>

                                            <AnimatePresence>
                                                {(!expandedGroups[countryCode]) && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: 'auto', opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        className="overflow-hidden space-y-2 px-1 pb-1"
                                                    >
                                                        {countryServers.map(server => (
                                                            <ServerItem
                                                                key={server.id}
                                                                {...server}
                                                                active={selectedServerId === server.id}
                                                                isConnected={isConnected && selectedServerId === server.id}
                                                                isConnecting={isConnecting && selectedServerId === server.id}
                                                                onClick={() => setSelectedServer(server.id)}
                                                                onRemove={() => removeServer(server.id)}
                                                                onPin={() => togglePinServer(server.id)}
                                                                onConnectToggle={() => {
                                                                    if (selectedServerId !== server.id) {
                                                                        setSelectedServer(server.id);
                                                                        if (!isConnected) toggleConnection();
                                                                    } else {
                                                                        toggleConnection();
                                                                    }
                                                                }}
                                                            />
                                                        ))}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {activeTab === 'subscriptions' && (
                        <>
                            {subscriptions.length === 0 ? (
                                <EmptyState onAdd={() => setIsAddModalOpen(true)} type="подписок" />
                            ) : (
                                <div className="space-y-4">
                                    {subscriptions.map((sub, idx) => {
                                        // Format bytes
                                        const formatBytes = (bytes?: number) => {
                                            if (!bytes) return "—";
                                            if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + " ГБ";
                                            if (bytes >= 1048576) return (bytes / 1048576).toFixed(0) + " МБ";
                                            return (bytes / 1024).toFixed(0) + " КБ";
                                        };

                                        const used = (sub.upload || 0) + (sub.download || 0);
                                        const hasLimits = sub.total && sub.total > 0;
                                        const usagePercent = hasLimits ? Math.min(100, Math.round((used / sub.total!) * 100)) : 0;

                                        // Days until expiry
                                        const expireDate = sub.expire ? new Date(sub.expire * 1000) : null;
                                        const daysLeft = expireDate ? Math.max(0, Math.ceil((expireDate.getTime() - Date.now()) / 86400000)) : null;

                                        return (
                                            <div key={idx} className="rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.02]">
                                                {/* Header — gradient with name */}
                                                <div className="bg-gradient-to-r from-brand/10 to-accent/5 px-5 py-3.5 flex items-center justify-between border-b border-white/[0.04]">
                                                    <div className="flex-1 min-w-0 mr-3">
                                                        <h4 className="font-black text-white/90 text-sm truncate" title={sub.url}>{sub.name || "Подписка"}</h4>
                                                        <p className="text-[10px] text-white/30 mt-0.5 truncate font-mono" title={sub.url}>{sub.url}</p>
                                                    </div>
                                                    <div className="flex gap-1.5 shrink-0">
                                                        <button onClick={() => handleRefresh(sub.url)} className="p-2 bg-white/[0.06] hover:bg-brand/20 rounded-xl text-white/50 hover:text-brand transition-all duration-200 hover:scale-105 active:scale-95" title="Обновить">
                                                            <RefreshCw className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button onClick={() => removeSubscription(sub.url)} className="p-2 bg-white/[0.06] hover:bg-red-500/20 rounded-xl text-white/50 hover:text-red-400 transition-all duration-200 hover:scale-105 active:scale-95" title="Удалить">
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Body — stats */}
                                                <div className="px-5 py-4">
                                                    {hasLimits ? (
                                                        <div className="space-y-3">
                                                            {/* Usage stats row */}
                                                            <div className="grid grid-cols-3 gap-3">
                                                                <div className="text-center">
                                                                    <div className="text-[9px] font-bold uppercase tracking-wider text-white/30 mb-1">Загружено</div>
                                                                    <div className="text-sm font-black text-emerald-400">{formatBytes(sub.download)}</div>
                                                                </div>
                                                                <div className="text-center">
                                                                    <div className="text-[9px] font-bold uppercase tracking-wider text-white/30 mb-1">Выгружено</div>
                                                                    <div className="text-sm font-black text-blue-400">{formatBytes(sub.upload)}</div>
                                                                </div>
                                                                <div className="text-center">
                                                                    <div className="text-[9px] font-bold uppercase tracking-wider text-white/30 mb-1">Лимит</div>
                                                                    <div className="text-sm font-black text-white/80">{formatBytes(sub.total)}</div>
                                                                </div>
                                                            </div>

                                                            {/* Progress bar */}
                                                            <div>
                                                                <div className="flex justify-between mb-1.5">
                                                                    <span className="text-[10px] font-bold text-white/40">Использовано {usagePercent}%</span>
                                                                    {daysLeft !== null && (
                                                                        <span className={cn("text-[10px] font-bold",
                                                                            daysLeft <= 3 ? "text-red-400" : daysLeft <= 7 ? "text-yellow-400" : "text-white/40"
                                                                        )}>
                                                                            {daysLeft === 0 ? "Истекает сегодня" : `Осталось ${daysLeft} дн.`}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="h-2 w-full bg-white/[0.06] rounded-full overflow-hidden">
                                                                    <motion.div
                                                                        className={cn("h-full rounded-full",
                                                                            usagePercent > 90 ? "bg-gradient-to-r from-red-500 to-red-400" :
                                                                                usagePercent > 75 ? "bg-gradient-to-r from-yellow-500 to-amber-400" :
                                                                                    "bg-gradient-to-r from-emerald-500 to-teal-400"
                                                                        )}
                                                                        initial={{ width: 0 }}
                                                                        animate={{ width: `${usagePercent}%` }}
                                                                        transition={{ duration: 0.8, ease: "easeOut" }}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-xs text-white/40">Безлимит</span>
                                                            {sub.lastUpdated && (
                                                                <span className="text-[10px] text-white/25">
                                                                    Обновлено: {new Date(sub.lastUpdated).toLocaleString()}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </AnimatePresence>
            </div>

            <AddServerModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />

            {/* Custom Toast Notification */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: 50, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.9 }}
                        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
                    >
                        <div className={cn(
                            "flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border backdrop-blur-xl",
                            toast.type === 'error' ? "bg-red-500/10 border-red-500/20 text-red-100" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-100"
                        )}>
                            {toast.type === 'error' ? (
                                <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                            ) : (
                                <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                            )}
                            <span className="font-bold text-sm tracking-wide">{toast.message}</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </main>
    );
}

function EmptyState({ onAdd, type }: { onAdd: () => void, type: string }) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center my-auto h-full text-center p-8 rounded-[22px] glass-panel"
        >
            <SearchX className="w-16 h-16 text-white/20 mb-4" />
            <h3 className="text-xl font-bold text-white/70 mb-2">Список {type} пуст</h3>
            <p className="text-base text-white/40 mb-6 max-w-sm">Нажмите плюс для добавления конфигурации или подписки.</p>
            <button
                onClick={onAdd}
                className="px-6 py-3 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 font-bold rounded-xl border border-orange-500/30 transition-all shadow-[0_0_15px_rgba(249,115,22,0.15)] flex items-center gap-2"
            >
                <Plus /> Добавить
            </button>
        </motion.div>
    );
}
