import { motion, AnimatePresence } from "framer-motion";
import { Globe, ShieldAlert, ArrowDown, ArrowUp, ShieldCheck, Wifi, Eye, EyeOff } from "lucide-react";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { cn } from "../lib/cn";
import { getAPI } from "../lib/api";
import { formatSpeed, getPingStyle } from "../lib/dashboard-utils";
import { useAppStore } from "../store/useAppStore";
import { ShieldLogo } from "../components/ShieldLogo";
import { FlagIcon } from "../components/FlagIcon";
import { SpeedGraph } from "../components/SpeedGraph";
import { ParticleCanvas } from "../components/ParticleCanvas";
import { tiltCard, gsap } from "../lib/gsap-setup";

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

    const downSpeed = formatSpeed(traffic.down);
    const upSpeed = formatSpeed(traffic.up);

    const pingDisplay = useMemo(() => {
        const raw = isConnected ? activePing : (currentServer?.ping ?? null);
        return getPingStyle(raw);
    }, [isConnected, activePing, currentServer?.ping]);

    // Shield 3D tilt
    const shieldContainerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!shieldContainerRef.current) return;
        return tiltCard(shieldContainerRef.current, { maxTilt: 12, perspective: 600, scale: 1.02, speed: 0.3 });
    }, []);

    // Ping polling
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
            return;
        }
        const handleTraffic = (data: { rx: number; tx: number }) => {
            const downKBs = Math.round(data.rx / 1024);
            const upKBs = Math.round(data.tx / 1024);
            setTraffic({ down: downKBs, up: upKBs });
        };
        const api = getAPI();
        if (api?.traffic?.onUpdate) {
            api.traffic.onUpdate(handleTraffic);
        }
        return () => { if (api?.traffic?.offUpdate) api.traffic.offUpdate(); };
    }, [isConnected]);

    const handleConnectClick = () => {
        if (!currentServer) { setScreen('servers'); return; }
        toggleConnection();
    };

    // Convert KB/s to MB/s for gauge display
    const downMBs = traffic.down / 1024;
    const upMBs = traffic.up / 1024;
    const maxSpeed = Math.max(downMBs, upMBs, 10); // dynamic max

    return (
        <main className="relative w-full h-full flex flex-col overflow-hidden select-none"
            style={{ WebkitAppRegion: 'drag' } as any}
        >
            {/* Interactive Particle Background */}
            <ParticleCanvas isConnected={isConnected} />

            {/* Main Layout */}
            <div className="relative z-10 flex flex-col items-center w-full max-w-lg mx-auto h-full justify-center gap-5">

                {/* ═══ SHIELD ═══ */}
                <div className="relative flex items-center justify-center w-full mt-2">
                    {/* Connecting ripple */}
                    {isConnecting && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                            <motion.div
                                initial={{ width: 200, height: 200, opacity: 0.6 }}
                                animate={{ width: 400, height: 400, opacity: 0 }}
                                transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
                                className="rounded-full border border-brand/30 absolute"
                            />
                        </div>
                    )}

                    {/* Connected breathing pulse */}
                    {isConnected && !isConnecting && (
                        <motion.div
                            className="absolute w-56 h-56 rounded-full border border-neon-emerald/15 pointer-events-none z-0"
                            animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0, 0.3] }}
                            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                        />
                    )}

                    {/* Ambient glow */}
                    <motion.div
                        className="absolute w-52 h-52 rounded-full blur-[60px] z-0 pointer-events-none"
                        animate={{
                            backgroundColor: isConnecting
                                ? "rgba(129,140,248,0.15)"
                                : isConnected
                                    ? "rgba(52,211,153,0.2)"
                                    : "rgba(255,255,255,0.01)",
                            scale: isConnected || isConnecting ? [1, 1.1, 1] : 1,
                        }}
                        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    />

                    {/* Shield button with 3D tilt */}
                    <div ref={shieldContainerRef} style={{ WebkitAppRegion: 'no-drag' } as any}>
                        <button
                            onClick={handleConnectClick}
                            className="group relative w-52 h-52 rounded-full focus:outline-none z-10 transform-gpu transition-all duration-500 active:scale-95"
                        >
                            {/* Outer ring */}
                            <div className={cn(
                                "absolute inset-0 rounded-full transition-all duration-700 border-2",
                                isConnecting ? "border-brand/30 shadow-glow-brand"
                                    : isConnected ? "border-neon-emerald/25 shadow-glow-emerald"
                                        : "border-white/[0.06]"
                            )} />

                            {/* Rotating dashed ring */}
                            {isConnected && (
                                <motion.div
                                    className="absolute inset-2 rounded-full border border-dashed border-neon-emerald/10 pointer-events-none"
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
                                />
                            )}

                            {/* Inner cavity */}
                            <div className={cn(
                                "absolute inset-5 rounded-full border overflow-hidden flex items-center justify-center p-7 transition-all duration-500",
                                "bg-gradient-to-br from-void to-void-surface",
                                isConnected ? "border-neon-emerald/10" : "border-white/[0.04]"
                            )}
                                style={{ boxShadow: "inset 0 -4px 20px rgba(0,0,0,0.6), inset 0 2px 8px rgba(255,255,255,0.02)" }}
                            >
                                <ShieldLogo
                                    className={cn("w-full h-full transition-opacity duration-300", isConnecting ? "opacity-50 animate-pulse" : "opacity-90")}
                                    isConnected={isConnected}
                                />
                                {/* Inner glow */}
                                {isConnected && (
                                    <motion.div
                                        className="absolute inset-0 rounded-full bg-gradient-to-b from-neon-emerald/8 to-transparent pointer-events-none"
                                        animate={{ opacity: [0.2, 0.5, 0.2] }}
                                        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                                    />
                                )}
                            </div>
                        </button>
                    </div>
                </div>

                {/* ═══ STATUS TEXT ═══ */}
                <div className="flex flex-col items-center gap-2.5 z-10 shrink-0">
                    <AnimatePresence mode="wait">
                        <motion.h1
                            key={isDisconnecting ? "disc" : isConnecting ? "conn" : isConnected ? "on" : "off"}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ type: "spring", stiffness: 300, damping: 25 }}
                            className={cn(
                                "text-xl font-display font-bold tracking-[0.2em]",
                                isConnected ? "text-glow-emerald text-neon-emerald" : "text-glow-brand text-brand-light"
                            )}
                        >
                            {isDisconnecting ? "ОТКЛЮЧЕНИЕ..." : isConnecting ? "ПОДКЛЮЧЕНИЕ..." : isConnected ? "ЗАЩИЩЕНО" : "ОТКЛЮЧЕНО"}
                        </motion.h1>
                    </AnimatePresence>

                    {isConnected && (
                        <div className="flex items-center gap-2.5">
                            <span className="uppercase text-[9px] tracking-[0.15em] font-medium text-white/20 bg-white/[0.02] px-2.5 py-1 rounded-full border border-white/[0.04] font-mono-metric">
                                VLESS
                            </span>
                            <motion.span
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className={cn(
                                    "flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border backdrop-blur-sm font-mono-metric",
                                    pingDisplay.color, pingDisplay.glow,
                                    activePing && activePing < 80 ? "bg-neon-emerald/8 border-neon-emerald/20"
                                        : activePing && activePing < 200 ? "bg-neon-amber/8 border-neon-amber/20"
                                            : activePing ? "bg-neon-red/8 border-neon-red/20"
                                                : "bg-white/3 border-white/8"
                                )}
                            >
                                <Wifi className="w-2.5 h-2.5" />
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

                {/* ═══ ERROR ═══ */}
                <AnimatePresence>
                    {errorMessage && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="flex items-center gap-2 bg-neon-red/8 border border-neon-red/15 px-4 py-2.5 rounded-xl text-sm text-neon-red font-semibold max-w-[400px] z-10"
                        >
                            <ShieldAlert className="w-4 h-4 shrink-0" />
                            <span className="truncate">{errorMessage}</span>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ═══ STATS GRID ═══ */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    className="w-full grid grid-cols-2 gap-3 max-w-[480px] z-10 shrink-0"
                    style={{ WebkitAppRegion: 'no-drag' } as any}
                >
                    {/* IP Card */}
                    <div className={cn(
                        "flex items-center gap-3 px-4 py-3 rounded-2xl glass-panel glass-panel-hover transition-all cursor-default",
                    )}>
                        <ShieldCheck className={cn("w-4 h-4 shrink-0", isConnected ? "text-neon-emerald" : "text-white/15")} />
                        <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-[8px] font-bold uppercase tracking-widest text-white/30 leading-tight">IP</span>
                            <AnimatePresence mode="wait">
                                <motion.span
                                    key={ipHidden ? 'h' : 'v'}
                                    initial={{ opacity: 0, filter: 'blur(4px)' }}
                                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                                    exit={{ opacity: 0, filter: 'blur(4px)' }}
                                    className={cn("text-sm font-semibold truncate tracking-wide font-mono-metric", isConnected ? "text-white/80" : "text-white/25")}
                                >
                                    {isConnected
                                        ? (ipHidden ? "•••.•••.•••" : (currentServer?._host || "—"))
                                        : "—"
                                    }
                                </motion.span>
                            </AnimatePresence>
                        </div>
                        {isConnected && (
                            <button
                                onClick={(e) => { e.stopPropagation(); setIpHidden(!ipHidden); }}
                                className="p-1 rounded-lg hover:bg-white/5 transition-colors shrink-0"
                            >
                                {ipHidden
                                    ? <EyeOff className="w-3.5 h-3.5 text-white/20" />
                                    : <Eye className="w-3.5 h-3.5 text-neon-emerald/50" />
                                }
                            </button>
                        )}
                    </div>

                    {/* Server Card */}
                    <motion.div
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setScreen('servers')}
                        role="button"
                        className={cn(
                            "flex items-center gap-3 px-4 py-3 rounded-2xl glass-panel glass-panel-hover transition-all cursor-pointer group"
                        )}
                    >
                        {currentServer ? (
                            <FlagIcon code={currentServer.countryCode || "un"} size={24} />
                        ) : (
                            <div className="w-6 h-6 rounded-full bg-white/3 flex items-center justify-center shrink-0">
                                <Globe className="w-3.5 h-3.5 text-white/25" />
                            </div>
                        )}
                        <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-[8px] font-bold uppercase tracking-widest text-white/30 leading-tight">Узел</span>
                            <span className="text-sm font-semibold truncate text-white/70 group-hover:text-brand-light transition-colors">
                                {currentServer ? currentServer.name : "Выбрать"}
                            </span>
                        </div>
                    </motion.div>

                    {/* Speed Gauges — full width */}
                    <div className="col-span-2 flex items-center justify-center gap-8 py-3 rounded-2xl glass-panel">
                        <SpeedGraph
                            value={downMBs}
                            maxValue={maxSpeed}
                            unit={downSpeed.unit}
                            label="Приём"
                            color="indigo"
                            isActive={isConnected && traffic.down > 0}
                        />
                        <SpeedGraph
                            value={upMBs}
                            maxValue={maxSpeed}
                            unit={upSpeed.unit}
                            label="Отдача"
                            color="emerald"
                            isActive={isConnected && traffic.up > 0}
                        />
                    </div>
                </motion.div>
            </div>
        </main>
    );
}
