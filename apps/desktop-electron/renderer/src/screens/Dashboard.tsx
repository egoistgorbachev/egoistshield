import { motion, AnimatePresence } from "framer-motion";
import { Globe, Zap, ShieldAlert, ArrowDown, ArrowUp, ShieldCheck, Activity, Wifi, Eye, EyeOff } from "lucide-react";
import { useState, useEffect, useMemo, useCallback } from "react";
import { cn } from "../lib/cn";
import { getAPI } from "../lib/api";
import { formatSpeed, getPingStyle } from "../lib/dashboard-utils";
import { useAppStore } from "../store/useAppStore";
import { ShieldLogo } from "../components/ShieldLogo";
import { FlagIcon } from "../components/FlagIcon";
import { AnimatedNumber } from "../components/AnimatedNumber";
import { SpeedGraph } from "../components/SpeedGraph";

// ── Stagger animation variants ──
const containerVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.06 } }
};

const cardVariants = {
    hidden: { opacity: 0, y: 12, scale: 0.96 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring" as const, stiffness: 400, damping: 28 } }
};



export function Dashboard() {
    const isConnected = useAppStore(s => s.isConnected);
    const isConnecting = useAppStore(s => s.isConnecting);
    const isDisconnecting = useAppStore(s => s.isDisconnecting);
    const toggleConnection = useAppStore(s => s.toggleConnection);
    const setScreen = useAppStore(s => s.setScreen);
    const servers = useAppStore(s => s.servers);
    const selectedServerId = useAppStore(s => s.selectedServerId);
    const errorMessage = useAppStore(s => s.errorMessage);
    const currentServer = servers.find(s => s.id === selectedServerId);

    const [traffic, setTraffic] = useState({ down: 0, up: 0 });
    const [isHidden, setIsHidden] = useState(false);
    const [ipHidden, setIpHidden] = useState(false);
    const [activePing, setActivePing] = useState<number | null>(null);
    // История скорости для графика (60 точек — 1 минута данных)
    const [speedHistory, setSpeedHistory] = useState<number[]>(() => new Array(60).fill(0));

    // Форматируем скорость с авто-единицами
    const downSpeed = formatSpeed(traffic.down);
    const upSpeed = formatSpeed(traffic.up);

    // Пинг стиль
    const pingDisplay = useMemo(() => {
        const raw = isConnected ? activePing : (currentServer?.ping ?? null);
        return getPingStyle(raw);
    }, [isConnected, activePing, currentServer?.ping]);

    useEffect(() => {
        let pingInterval: any;
        if (isConnected) {
            const doPing = async () => {
                const api = getAPI();
                if (api?.system?.pingActiveProxy) {
                    const p = await api.system.pingActiveProxy();
                    if (p > 0) setActivePing(p);
                }
            };
            doPing();
            pingInterval = setInterval(doPing, 5000);
        } else {
            setActivePing(null);
        }
        return () => clearInterval(pingInterval);
    }, [isConnected]);

    useEffect(() => {
        const handleVisibilityChange = () => setIsHidden(document.hidden);
        document.addEventListener("visibilitychange", handleVisibilityChange);
        handleVisibilityChange();
        return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
    }, []);

    useEffect(() => {
        if (!isConnected) {
            setTraffic({ down: 0, up: 0 });
            setSpeedHistory(new Array(60).fill(0));
            return;
        }

        const handleTraffic = (data: { rx: number, tx: number }) => {
            const downKBs = Math.round(data.rx / 1024);
            const upKBs = Math.round(data.tx / 1024);
            setTraffic({ down: downKBs, up: upKBs });
            setSpeedHistory(prev => [...prev.slice(1), downKBs]);
        };

        const api = getAPI();
        if (api?.traffic?.onUpdate) {
            api.traffic.onUpdate(handleTraffic);
        }

        return () => {
            if (api?.traffic?.offUpdate) {
                api.traffic.offUpdate();
            }
        };
    }, [isConnected]);

    const handleConnectClick = () => {
        if (!currentServer) {
            setScreen('servers');
            return;
        }
        toggleConnection();
    };

    return (
        <main className="relative w-full h-full flex flex-col overflow-hidden select-none"
            style={{ WebkitAppRegion: 'drag' } as any}
        >
            {/* Aurora Mesh Background — 3 drifting orbs */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none w-full h-full">
                <motion.div
                    animate={!isHidden ? {
                        scale: isConnected ? [1.0, 1.15, 1.0] : [1, 1.05, 1],
                        opacity: isConnected ? [0.12, 0.22, 0.12] : [0.04, 0.08, 0.04],
                    } : {}}
                    transition={!isHidden ? { duration: 8, ease: "easeInOut", repeat: Infinity } : { duration: 0 }}
                    className="aurora-orb w-[300px] h-[300px] top-[5%] left-[10%]"
                    style={{ background: isConnected ? "radial-gradient(circle, rgba(255,107,44,0.2) 0%, transparent 70%)" : "radial-gradient(circle, rgba(74,71,84,0.1) 0%, transparent 70%)" }}
                />
                <motion.div
                    animate={!isHidden ? {
                        scale: [1, 1.1, 0.95, 1],
                        x: [0, -20, 15, 0],
                        y: [0, 15, -10, 0],
                    } : {}}
                    transition={!isHidden ? { duration: 12, ease: "easeInOut", repeat: Infinity } : { duration: 0 }}
                    className="aurora-orb w-[250px] h-[250px] top-[35%] right-[5%]"
                    style={{ background: isConnected ? "radial-gradient(circle, rgba(0,229,255,0.06) 0%, transparent 70%)" : "radial-gradient(circle, rgba(74,71,84,0.05) 0%, transparent 70%)" }}
                />
                <motion.div
                    animate={!isHidden ? {
                        scale: [1, 1.08, 1],
                        x: [0, 25, 0],
                    } : {}}
                    transition={!isHidden ? { duration: 10, ease: "easeInOut", repeat: Infinity } : { duration: 0 }}
                    className="aurora-orb w-[200px] h-[200px] bottom-[15%] left-[25%]"
                    style={{ background: isConnected ? "radial-gradient(circle, rgba(255,61,0,0.08) 0%, transparent 70%)" : "radial-gradient(circle, rgba(74,71,84,0.04) 0%, transparent 70%)" }}
                />
                {/* Dot matrix overlay */}
                <div className="absolute inset-0 dot-matrix opacity-40" />
            </div>

            {/* Main Adaptive Layout */}
            <div className="relative z-10 flex flex-col items-center w-full max-w-lg mx-auto h-full justify-center gap-6">

                {/* Shield Connection Button */}
                <div className="relative flex items-center justify-center w-full mt-4">
                    {/* Connecting ripple rings */}
                    {isConnecting && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                            <motion.div
                                initial={{ width: 220, height: 220, opacity: 0.8 }}
                                animate={{ width: 450, height: 450, opacity: 0 }}
                                transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
                                className="rounded-full border border-orange-500/40 absolute"
                            />
                            <motion.div
                                initial={{ width: 220, height: 220, opacity: 0.6 }}
                                animate={{ width: 550, height: 550, opacity: 0 }}
                                transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut", delay: 0.4 }}
                                className="rounded-full border border-yellow-500/20 absolute"
                            />
                        </div>
                    )}

                    {/* Connected breathing pulse rings */}
                    {isConnected && !isConnecting && (
                        <>
                            <motion.div
                                className="absolute w-64 h-64 rounded-full border border-orange-500/20 pointer-events-none z-0"
                                animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0, 0.4] }}
                                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                            />
                            {/* Floating particles around shield */}
                            {[...Array(6)].map((_, i) => (
                                <motion.div
                                    key={i}
                                    className="absolute w-1 h-1 rounded-full bg-orange-400/60 pointer-events-none z-0 will-change-transform transform-gpu"
                                    animate={{
                                        x: [0, Math.cos(i * 60 * Math.PI / 180) * 140],
                                        y: [0, Math.sin(i * 60 * Math.PI / 180) * 140],
                                        opacity: [0.8, 0],
                                        scale: [1, 0.3]
                                    }}
                                    transition={{
                                        duration: 2.5 + i * 0.3,
                                        repeat: Infinity,
                                        ease: "easeOut",
                                        delay: i * 0.4
                                    }}
                                    style={{ left: "50%", top: "50%" }}
                                />
                            ))}
                        </>
                    )}

                    {/* Aura glow */}
                    <motion.div
                        className="absolute w-60 h-60 rounded-full blur-[60px] z-0 pointer-events-none"
                        animate={{
                            backgroundColor: isConnecting ? "rgba(234, 179, 8, 0.2)" : isConnected ? "rgba(249, 115, 22, 0.35)" : "rgba(255, 255, 255, 0.02)",
                            scale: isConnected || isConnecting ? [1, 1.15, 1] : 1,
                        }}
                        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    />

                    <button
                        onClick={handleConnectClick}
                        className="group relative w-60 h-60 rounded-full focus:outline-none z-10 transform-gpu transition-all duration-500 hover:scale-105 active:scale-95 ease-out shadow-[0_0_80px_rgba(0,0,0,0.4)]"
                        style={{ WebkitAppRegion: 'no-drag' } as any}
                    >
                        {/* Outer ring */}
                        <div className={cn(
                            "absolute inset-0 rounded-full transition-all duration-700 backdrop-blur-xl border-[2px]",
                            isConnecting ? "border-yellow-500/40 shadow-[inset_0_0_40px_rgba(234,179,8,0.2)]" :
                                isConnected ? "border-orange-500/40 shadow-[inset_0_0_40px_rgba(249,115,22,0.3)]" : "border-white/10 shadow-[inset_0_0_30px_rgba(255,255,255,0.02)]"
                        )} />

                        {/* Rotating ring accent for connected state */}
                        {isConnected && (
                            <motion.div
                                className="absolute inset-1 rounded-full border border-dashed border-orange-500/15 pointer-events-none"
                                animate={{ rotate: 360 }}
                                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                            />
                        )}

                        {/* Inner dark cavity with shield — deep indigo */}
                        <div className="absolute inset-5 rounded-full bg-gradient-to-br from-[#06060C] to-[#0C0C14] border border-white/[0.04] overflow-hidden flex items-center justify-center p-8 group-hover:from-[#0A0812] group-hover:to-[#100E18] transition-colors">
                            {/* Inner shadow depth */}
                            <div className="absolute inset-0 rounded-full" style={{ boxShadow: "inset 0 -4px 20px rgba(0,0,0,0.6), inset 0 4px 10px rgba(255,255,255,0.02)" }} />
                            <ShieldLogo
                                className={cn("w-full h-full drop-shadow-2xl transition-opacity duration-300", isConnecting ? "opacity-50 animate-pulse" : "opacity-90")}
                                isConnected={isConnected}
                            />
                            {/* Inner glow overlay */}
                            {isConnected && (
                                <motion.div
                                    className="absolute inset-0 rounded-full bg-gradient-to-b from-orange-500/10 to-transparent pointer-events-none"
                                    animate={{ opacity: [0.3, 0.6, 0.3] }}
                                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                                />
                            )}
                        </div>
                    </button>
                </div>

                {/* Status Text */}
                <div className="flex flex-col items-center gap-3 z-10 shrink-0">
                    <AnimatePresence mode="wait">
                        <motion.h1
                            key={isDisconnecting ? "disconnecting" : isConnecting ? "connecting" : isConnected ? "connected" : "disconnected"}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ type: "spring", stiffness: 300, damping: 25 }}
                            className="text-2xl font-display font-bold tracking-[0.2em] text-glow-brand"
                        >
                            {isDisconnecting ? "ОТКЛЮЧЕНИЕ..." : isConnecting ? "ПОДКЛЮЧЕНИЕ..." : isConnected ? "ЗАЩИЩЕНО" : "ОТКЛЮЧЕНО"}
                        </motion.h1>
                    </AnimatePresence>

                    {isConnected && (
                        <div className="flex items-center gap-3">
                            <span className="uppercase text-[10px] tracking-[0.15em] font-semibold text-white/25 bg-white/[0.03] px-3 py-1.5 rounded-full border border-white/[0.05] font-mono-metric" style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)" }}>
                                VLESS Protocol
                            </span>
                            {/* Яркий пинг-бейдж */}
                            <motion.span
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className={cn(
                                    "flex items-center gap-1.5 text-xs font-black px-3 py-1 rounded-full border backdrop-blur-sm",
                                    pingDisplay.color, pingDisplay.glow,
                                    activePing && activePing < 80 ? "bg-emerald-500/10 border-emerald-500/30" :
                                        activePing && activePing < 200 ? "bg-yellow-500/10 border-yellow-500/30" :
                                            activePing ? "bg-red-500/10 border-red-500/30" :
                                                "bg-white/5 border-white/10"
                                )}
                            >
                                <Wifi className="w-3 h-3" />
                                <AnimatePresence mode="wait">
                                    <motion.span
                                        key={pingDisplay.text}
                                        initial={{ opacity: 0, y: 4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -4 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        {pingDisplay.text}
                                    </motion.span>
                                </AnimatePresence>
                            </motion.span>
                        </div>
                    )}
                </div>

                {/* Error Message */}
                <AnimatePresence>
                    {errorMessage && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 px-5 py-3 rounded-2xl text-sm text-red-300 font-bold max-w-[400px] z-10"
                        >
                            <ShieldAlert className="w-5 h-5 shrink-0 text-red-400" />
                            <span className="truncate">{errorMessage}</span>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Network Stats Grid */}
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    className="w-full grid grid-cols-2 gap-3 max-w-[480px] z-10 shrink-0"
                    style={{ WebkitAppRegion: 'no-drag' } as any}
                >
                    {/* IP Card — compact horizontal */}
                    <motion.div
                        variants={cardVariants}
                        className={cn(
                            "flex items-center gap-3 px-4 py-3 rounded-2xl border backdrop-blur-xl shadow-lg transition-all duration-500 relative overflow-hidden cursor-default glass-card",
                            isConnected ? "bg-white/[0.04] border-white/10" : "bg-white/[0.02] border-white/5"
                        )}
                    >
                        <ShieldCheck className={cn("w-5 h-5 shrink-0", isConnected ? "text-emerald-400" : "text-white/20")} strokeWidth={2.5} />
                        <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-[9px] font-black uppercase tracking-widest text-white/40 leading-tight">IP Адрес</span>
                            <AnimatePresence mode="wait">
                                <motion.span
                                    key={ipHidden ? 'h' : 'v'}
                                    initial={{ opacity: 0, filter: 'blur(6px)' }}
                                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                                    exit={{ opacity: 0, filter: 'blur(6px)' }}
                                    transition={{ duration: 0.2 }}
                                    className={cn("text-sm font-bold truncate tracking-wide leading-snug", isConnected ? "text-white" : "text-white/35")}
                                >
                                    {isConnected
                                        ? (ipHidden ? "•••.•••.•••.•••" : (currentServer?._host || "Подключено"))
                                        : "Не подключено"
                                    }
                                </motion.span>
                            </AnimatePresence>
                        </div>
                        {isConnected && (
                            <button
                                onClick={(e) => { e.stopPropagation(); setIpHidden(!ipHidden); }}
                                className="p-1.5 rounded-xl hover:bg-white/10 transition-all duration-200 group/eye shrink-0"
                                style={{ WebkitAppRegion: 'no-drag' } as any}
                            >
                                <motion.div
                                    key={ipHidden ? 'off' : 'on'}
                                    initial={{ scale: 0.6, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                                >
                                    {ipHidden
                                        ? <EyeOff className="w-4 h-4 text-white/25 group-hover/eye:text-white/60 transition-colors" />
                                        : <Eye className="w-4 h-4 text-emerald-400/60 group-hover/eye:text-emerald-300 transition-colors" />
                                    }
                                </motion.div>
                            </button>
                        )}
                    </motion.div>

                    {/* Server Node Card — compact horizontal */}
                    <motion.div
                        variants={cardVariants}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setScreen('servers')}
                        role="button"
                        className={cn(
                            "flex items-center gap-3 px-4 py-3 rounded-2xl border backdrop-blur-xl shadow-lg transition-all duration-300 relative overflow-hidden cursor-pointer group glass-card",
                            isConnected ? "bg-orange-500/5 border-orange-500/20 hover:bg-orange-500/10" : "bg-white/[0.02] border-white/5 hover:bg-white/[0.05]"
                        )}
                    >
                        {currentServer ? (
                            <FlagIcon code={currentServer.countryCode || "un"} size={28} />
                        ) : (
                            <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                                <Globe className="w-4 h-4 text-white/30" strokeWidth={2} />
                            </div>
                        )}
                        <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-[9px] font-black uppercase tracking-widest text-white/40 leading-tight">
                                {currentServer?.countryName
                                    ? currentServer.countryName + " · Узел"
                                    : currentServer?.countryCode && currentServer.countryCode !== "un"
                                        ? currentServer.countryCode.toUpperCase() + " · Узел"
                                        : "Узел"
                                }
                            </span>
                            <span className="text-sm font-bold truncate tracking-wide text-white group-hover:text-orange-200 transition-colors leading-snug">
                                {currentServer ? currentServer.name : "Выбрать сервер"}
                            </span>
                        </div>
                    </motion.div>

                    {/* Speed Card — Full Width with Graph */}
                    <motion.div
                        variants={cardVariants}
                        className={cn(
                            "col-span-2 relative px-5 pt-4 pb-2 rounded-[24px] border backdrop-blur-xl shadow-lg transition-all duration-500 overflow-hidden cursor-default glass-card",
                            isConnected && traffic.down > 0 ? "bg-emerald-500/[0.03] border-emerald-500/15" : "bg-white/[0.02] border-white/5"
                        )}
                    >
                        {/* Speed values row */}
                        <div className="relative z-10 flex items-center justify-between w-full mb-3">
                            {/* Download */}
                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    "w-8 h-8 rounded-xl flex items-center justify-center",
                                    isConnected && traffic.down > 0 ? "bg-emerald-500/15" : "bg-white/5"
                                )}>
                                    <ArrowDown className={cn("w-4 h-4", isConnected && traffic.down > 0 ? "text-emerald-400" : "text-white/30")} strokeWidth={2.5} />
                                </div>
                                <div>
                                    <div className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-0.5">Прием</div>
                                    <div className="flex items-baseline gap-1">
                                        <AnimatedNumber value={parseFloat(downSpeed.value)} decimals={downSpeed.unit === "МБ/с" ? 2 : 0} className={cn("text-xl font-bold tracking-tight font-mono-metric", isConnected ? "text-white" : "text-white/40")} />
                                        <span className="text-[9px] text-white/40 font-bold uppercase">{downSpeed.unit}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Upload */}
                            <div className="flex items-center gap-3 flex-row-reverse">
                                <div className={cn(
                                    "w-8 h-8 rounded-xl flex items-center justify-center",
                                    isConnected && traffic.up > 0 ? "bg-blue-500/15" : "bg-white/5"
                                )}>
                                    <ArrowUp className={cn("w-4 h-4", isConnected && traffic.up > 0 ? "text-blue-400" : "text-white/30")} strokeWidth={2.5} />
                                </div>
                                <div className="text-right">
                                    <div className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-0.5">Отдача</div>
                                    <div className="flex items-baseline gap-1 justify-end">
                                        <AnimatedNumber value={parseFloat(upSpeed.value)} decimals={upSpeed.unit === "МБ/с" ? 2 : 0} className={cn("text-xl font-bold tracking-tight font-mono-metric", isConnected ? "text-white" : "text-white/40")} />
                                        <span className="text-[9px] text-white/40 font-bold uppercase">{upSpeed.unit}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Real-time SVG Graph — 80px tall, visible */}
                        <div className="relative w-full h-16 -mx-1">
                            <SpeedGraph data={speedHistory} color={isConnected ? "#00D68F" : "#00E5FF"} />
                        </div>
                    </motion.div>
                </motion.div>

            </div>
        </main>
    );
}
