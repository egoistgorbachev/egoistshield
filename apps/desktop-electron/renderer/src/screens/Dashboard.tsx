import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  CheckCircle,
  Clock,
  Copy,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  Lock,
  Power,
  ShieldAlert,
  ShieldCheck,
  Wifi,
  WifiOff,
  Zap
} from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { ConnectionTimeline } from "../components/ConnectionTimeline";
import { DepthBackground } from "../components/DepthBackground";
import { FlagIcon } from "../components/FlagIcon";
import { Skeleton } from "../components/Skeleton";
import { SpeedGraph } from "../components/SpeedGraph";
import { UsageInsights } from "../components/UsageInsights";
import { getAPI } from "../lib/api";
import { cn } from "../lib/cn";
import { formatSpeed, getPingStyle } from "../lib/dashboard-utils";
import { MOTION } from "../lib/motion";
import { useHealthCheck } from "../lib/useHealthCheck";
import type { ConnectionMode } from "../store/slices/connection-slice";
import { useAppStore } from "../store/useAppStore";

/* ──────────────────────────────────────────────────────────
   Dashboard v3 — "Depth Power"
   DepthBackground + bright Power button + unified glass cards
   ────────────────────────────────────────────────────────── */

type AppRegionStyle = CSSProperties & { WebkitAppRegion: "drag" | "no-drag" };
type OrbitParticleStyle = CSSProperties & {
  "--orbit-start": string;
  "--orbit-radius": string;
  "--orbit-duration": string;
  "--orbit-delay": string;
};

const NO_DRAG_REGION_STYLE: AppRegionStyle = { WebkitAppRegion: "no-drag" };
const ORBIT_PARTICLES = [
  { id: "orbit-0", start: "0deg", radius: "82px", duration: "3.2s", delay: "0s", size: 4 },
  { id: "orbit-1", start: "60deg", radius: "78px", duration: "4.0s", delay: "0.5s", size: 3 },
  { id: "orbit-2", start: "120deg", radius: "85px", duration: "3.5s", delay: "1.0s", size: 3.5 },
  { id: "orbit-3", start: "180deg", radius: "80px", duration: "3.8s", delay: "1.5s", size: 3 },
  { id: "orbit-4", start: "240deg", radius: "76px", duration: "4.2s", delay: "2.0s", size: 4 },
  { id: "orbit-5", start: "300deg", radius: "83px", duration: "3.0s", delay: "2.5s", size: 3 }
] as const;
const CONNECTION_MODE_TOOLTIP_CONTENT: Record<
  ConnectionMode,
  { title: string; description: string; accentClass: string }
> = {
  smart: {
    title: "Smart Mode",
    description: "Автоматически выбирает сервер с лучшим пингом и обходит сбои подключения.",
    accentClass: "text-brand border-brand/20"
  },
  default: {
    title: "Default Mode",
    description: "Строго подключается только к выбранному серверу.",
    accentClass: "text-white/90 border-white/10"
  }
};

/* ── InternetFixButton — gradient style ─────────────────── */
function InternetFixButton() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleFix = async () => {
    if (status === "loading") return;
    setStatus("loading");
    try {
      const api = getAPI();
      if (!api?.system?.internetFix) throw new Error("API unavailable");
      await api.system.internetFix();
      setStatus("success");
      setTimeout(() => setStatus("idle"), 3000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  };

  const label = {
    idle: "Починить интернет",
    loading: "Восстановление...",
    success: "Интернет восстановлен",
    error: "Ошибка — попробуйте снова"
  }[status];

  const Icon = {
    idle: WifiOff,
    loading: Loader2,
    success: CheckCircle,
    error: AlertTriangle
  }[status];

  const btnStyle =
    status === "success"
      ? "bg-gradient-to-br from-emerald-500/20 to-emerald-500/10 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
      : status === "error"
        ? "bg-gradient-to-br from-red-500/20 to-red-500/10 border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.1)]"
        : "bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.05] hover:border-white/[0.08]";

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      disabled={status === "loading"}
      onClick={handleFix}
      className={cn(
        "col-span-2 relative flex items-center justify-center gap-2.5 py-3 px-6 rounded-2xl",
        "text-sm font-semibold tracking-wide cursor-pointer backdrop-blur-sm",
        "transition-all duration-300 hover:brightness-110 active:scale-[0.98]",
        btnStyle,
        status === "loading" && "opacity-70 pointer-events-none",
        status === "success" && "text-emerald-400",
        status === "error" && "text-red-400",
        status === "idle" && "text-muted hover:text-white/70"
      )}
    >
      <Icon className={cn("w-4 h-4 shrink-0", status === "loading" && "animate-spin")} />
      {label}
    </motion.button>
  );
}

/* ── InfoCard — unified glass card ────────────────── */
function InfoCard({
  children,
  onClick,
  className
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <motion.div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      className={cn(
        "relative flex items-center gap-3 px-4 py-3.5 rounded-2xl cursor-default",
        "bg-glass-subtle border border-glass-border-subtle shadow-card",
        "backdrop-blur-md transition-all duration-300 group overflow-visible",
        "hover:-translate-y-[1px] hover:border-glass-border-medium hover:shadow-[0_4px_20px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)]",
        "active:scale-[0.98] active:duration-100",
        onClick && "cursor-pointer",
        className
      )}
    >
      {/* Hover glow */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: "linear-gradient(135deg, rgba(255,76,41,0.06), transparent 60%)" }}
      />
      {children}
    </motion.div>
  );
}

export function Dashboard() {
  useHealthCheck();
  const isConnected = useAppStore((s) => s.isConnected);
  const isConnecting = useAppStore((s) => s.isConnecting);
  const isDisconnecting = useAppStore((s) => s.isDisconnecting);
  const toggleConnection = useAppStore((s) => s.toggleConnection);
  const setScreen = useAppStore((s) => s.setScreen);
  const servers = useAppStore((s) => s.servers);
  const connectedServerId = useAppStore((s) => s.connectedServerId);
  const selectedServerId = useAppStore((s) => s.selectedServerId);
  const errorMessage = useAppStore((s) => s.errorMessage);
  const smartConnect = useAppStore((s) => s.smartConnect);
  const connectionMode = useAppStore((s) => s.connectionMode);
  const setConnectionMode = useAppStore((s) => s.setConnectionMode);
  const activePing = useAppStore((s) => s.activePing);
  const [isSmartConnecting, setIsSmartConnecting] = useState(false);
  const [hoveredMode, setHoveredMode] = useState<ConnectionMode | null>(null);
  // Dashboard показывает ФАКТИЧЕСКИ подключённый сервер, а не выбранный в списке
  const currentServer = servers.find((s) => s.id === (isConnected ? connectedServerId : selectedServerId));

  const [traffic, setTraffic] = useState({ down: 0, up: 0 });
  const [ipHidden, setIpHidden] = useState(true);
  const [realIp, setRealIp] = useState<string | null>(null);
  const [ipCountryCode, setIpCountryCode] = useState<string | null>(null);
  const [ipCopied, setIpCopied] = useState(false);
  const sessionStartTime = useAppStore((s) => s.sessionStartTime);
  const [sessionElapsed, setSessionElapsed] = useState(0);

  const downSpeed = formatSpeed(traffic.down);
  const upSpeed = formatSpeed(traffic.up);

  const pingDisplay = useMemo(() => {
    const raw = isConnected ? activePing : (currentServer?.ping ?? null);
    return getPingStyle(raw);
  }, [isConnected, activePing, currentServer?.ping]);

  // Ping polling перенесён в App.tsx (глобальный — работает на всех экранах)

  // Real IP polling
  useEffect(() => {
    let cancelled = false;
    const fetchIp = async () => {
      try {
        const api = getAPI();
        if (api?.system?.getMyIp) {
          const result = await api.system.getMyIp();
          if (!cancelled && result.ip) {
            setRealIp(result.ip);
            if (result.countryCode) setIpCountryCode(result.countryCode);
            return true;
          }
        }
      } catch {
        /* ignore */
      }
      return false;
    };

    if (!isConnected) {
      setRealIp(null);
      setIpCountryCode(null);
      // Fetch direct IP even when disconnected
      fetchIp();
      const interval = setInterval(fetchIp, 30000);
      return () => {
        cancelled = true;
        clearInterval(interval);
      };
    }

    // Connected: rapid retries (2s x 5), then normal 10s polling
    let retries = 0;
    const maxRetries = 5;
    const tryFetch = async () => {
      const ok = await fetchIp();
      if (!ok && retries < maxRetries && !cancelled) {
        retries++;
        setTimeout(tryFetch, 2000);
      }
    };
    // Delay first attempt 1.5s to let proxy initialize
    const initialDelay = setTimeout(tryFetch, 1500);
    const interval = setInterval(fetchIp, 10000);
    return () => {
      cancelled = true;
      clearTimeout(initialDelay);
      clearInterval(interval);
    };
  }, [isConnected]);

  useEffect(() => {
    if (!isConnected) {
      setTraffic({ down: 0, up: 0 });
      return;
    }

    const handleTraffic = (data: { rx: number; tx: number }) => {
      setTraffic({ down: Math.round(data.rx / 1024), up: Math.round(data.tx / 1024) });
    };
    const api = getAPI();
    const dispose = api?.traffic?.onUpdate ? api.traffic.onUpdate(handleTraffic) : undefined;
    return () => {
      dispose?.();
    };
  }, [isConnected]);

  // Session timer
  useEffect(() => {
    if (!sessionStartTime) {
      setSessionElapsed(0);
      return;
    }
    setSessionElapsed(Math.floor((Date.now() - sessionStartTime) / 1000));
    const timer = setInterval(() => {
      setSessionElapsed(Math.floor((Date.now() - sessionStartTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [sessionStartTime]);

  const handleConnectClick = () => {
    if (!currentServer && connectionMode === "default") {
      setScreen("servers");
      return;
    }
    if (connectionMode === "smart" && !isConnected && !isConnecting) {
      handleSmartConnect();
      return;
    }
    toggleConnection();
  };

  const handleSmartConnect = async () => {
    if (isSmartConnecting || isConnecting) return;
    setIsSmartConnecting(true);
    try {
      await smartConnect();
    } finally {
      setIsSmartConnecting(false);
    }
  };

  const downMBs = traffic.down / 1024;
  const upMBs = traffic.up / 1024;
  const maxSpeed = Math.max(downMBs, upMBs, 10);

  // Главная кнопка должна быть предельно читаемой:
  // фирменный оранжевый в off-state и насыщенный зелёный в on-state,
  // без скачков цвета из-за качества пинга.
  const btnGrad = useMemo(() => {
    if (isConnecting) return "linear-gradient(135deg, #FF6B47, #FF4C29)";
    if (!isConnected) return "linear-gradient(135deg, #E0401E, #FF4C29, #FF6B47)";
    return "linear-gradient(135deg, #047857, #10B981, #34D399)";
  }, [isConnected, isConnecting]);

  const btnShadow = useMemo(() => {
    if (isConnecting) return "0 8px 40px rgba(255,76,41,0.4), 0 2px 8px rgba(255,76,41,0.2)";
    if (!isConnected) return "0 8px 40px rgba(255,76,41,0.5), 0 2px 8px rgba(255,76,41,0.3)";
    return "0 8px 40px rgba(16,185,129,0.42), 0 2px 8px rgba(16,185,129,0.22)";
  }, [isConnected, isConnecting]);

  const hideConnectionModeTooltip = (mode: ConnectionMode): void => {
    if (hoveredMode !== mode) {
      return;
    }

    setHoveredMode(null);
  };

  return (
    <main className="relative w-full h-full flex flex-col overflow-hidden select-none bg-[#082032]">
      {/* Interactive Depth Background */}
      <DepthBackground isConnected={isConnected} />

      {/* Aurora Background */}
      <div
        className={cn(
          "absolute inset-0 pointer-events-none transition-opacity duration-1000 z-0",
          isConnected ? "opacity-50" : "opacity-30"
        )}
      >
        <div
          className={cn(
            "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[100px] animate-aurora mix-blend-screen",
            isConnected ? "bg-emerald-500/25" : "bg-[#FF4C29]/20"
          )}
        />
      </div>

      {/* Main Layout */}
      <div
        data-testid="dashboard-scroll-area"
        className="relative z-10 h-full w-full overflow-y-auto overflow-x-hidden custom-scrollbar"
      >
        <div className="mx-auto flex min-h-full w-full max-w-[36rem] flex-col items-center justify-center gap-4 px-5 py-4 sm:px-6">
          {/* ═══ CONNECT BUTTON ═══ */}
          <div className="relative flex items-center justify-center w-full mt-2" style={NO_DRAG_REGION_STYLE}>
            {/* Ambient glow — CSS-only, zero JS overhead */}
            <div
              className="absolute w-44 h-44 rounded-full pointer-events-none animate-glow-pulse-slow"
              style={{
                background: isConnected
                  ? "radial-gradient(circle, rgba(16,185,129,0.35) 0%, transparent 65%)"
                  : "radial-gradient(circle, rgba(255,76,41,0.4) 0%, transparent 65%)"
              }}
            />

            {/* Connecting pulse rings — CSS keyframes for compositor thread */}
            {isConnecting && (
              <>
                <div className="absolute w-36 h-36 rounded-full border-2 border-brand/40 pointer-events-none animate-connect-ring" />
                <div
                  className="absolute w-36 h-36 rounded-full border-2 border-brand/25 pointer-events-none animate-connect-ring"
                  style={{ animationDelay: "0.5s" }}
                />
                {/* Status Ring — circular progress arc */}
                <svg
                  aria-hidden="true"
                  focusable="false"
                  className="absolute w-[168px] h-[168px] animate-status-ring pointer-events-none"
                  viewBox="0 0 168 168"
                >
                  <circle cx="84" cy="84" r="78" fill="none" stroke="rgba(255,76,41,0.12)" strokeWidth="3" />
                  <circle
                    cx="84"
                    cy="84"
                    r="78"
                    fill="none"
                    stroke="url(#glow-grad)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray="160 330"
                    style={{ filter: "drop-shadow(0 0 6px rgba(255,76,41,0.5))" }}
                  />
                  <defs>
                    <linearGradient id="glow-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FF4C29" stopOpacity="1" />
                      <stop offset="100%" stopColor="#FF4C29" stopOpacity="0.1" />
                    </linearGradient>
                  </defs>
                </svg>
              </>
            )}

            {/* VPN data flow particles — orbit around button when connected */}
            {isConnected &&
              ORBIT_PARTICLES.map((particle) => (
                <div
                  key={particle.id}
                  className="absolute rounded-full pointer-events-none animate-vpn-orbit"
                  style={
                    {
                      top: "50%",
                      left: "50%",
                      width: `${particle.size}px`,
                      height: `${particle.size}px`,
                      background: "radial-gradient(circle, rgba(16,185,129,0.95), rgba(16,185,129,0.4))",
                      boxShadow: "0 0 8px 2px rgba(16,185,129,0.7)",
                      "--orbit-start": particle.start,
                      "--orbit-radius": particle.radius,
                      "--orbit-duration": particle.duration,
                      "--orbit-delay": particle.delay
                    } as OrbitParticleStyle
                  }
                />
              ))}

            {/* Power Button */}
            <motion.button
              onClick={handleConnectClick}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.88 }}
              transition={MOTION.spring.bouncy}
              aria-label={isConnecting ? "Подключение..." : isConnected ? "Отключить VPN" : "Подключить VPN"}
              className={cn(
                "relative w-36 h-36 rounded-full focus:outline-none z-10 group",
                isConnected && !isConnecting && !isDisconnecting && "animate-shield-breathe"
              )}
            >
              {/* Pulsing focus ring (keyboard a11y) — CSS-only, zero GPU when not focused */}
              <div className="absolute inset-[-6px] rounded-full pointer-events-none opacity-0 group-focus-visible:opacity-100 group-focus-visible:animate-pulse-ring transition-opacity" />

              {/* Gradient fill — smooth transition on ping color change */}
              <motion.div
                className="absolute inset-0 rounded-full"
                animate={{ boxShadow: btnShadow }}
                transition={{ duration: 0.8 }}
                style={{ background: btnGrad, transition: "background 1s ease" }}
              />

              {/* Glass highlight */}
              <div className="absolute inset-0 rounded-full overflow-hidden">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-[45%] bg-gradient-to-b from-white/20 to-transparent rounded-full blur-sm" />
              </div>

              {/* Inner border */}
              <div className="absolute inset-[2px] rounded-full border border-white/10" />

              {/* Icon */}
              <div className="relative z-10 flex items-center justify-center w-full h-full">
                {isConnecting ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                  >
                    <Loader2 className="w-10 h-10 text-white" strokeWidth={2} />
                  </motion.div>
                ) : (
                  <Power className="w-10 h-10 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]" strokeWidth={2.5} />
                )}
              </div>
            </motion.button>
          </div>

          {/* ═══ STATUS TEXT ═══ */}
          <div className="flex flex-col items-center gap-2 z-10 shrink-0">
            <AnimatePresence mode="wait">
              <motion.h1
                key={isDisconnecting ? "disc" : isConnecting ? "conn" : isConnected ? "on" : "off"}
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className={cn(
                  "text-2xl font-display font-bold tracking-[0.25em] uppercase",
                  isConnected ? "text-emerald-400" : "text-brand"
                )}
                style={{
                  textShadow: isConnected ? "0 0 24px rgba(16,185,129,0.6)" : "0 0 24px rgba(255,76,41,0.6)"
                }}
              >
                {isDisconnecting
                  ? "ОТКЛЮЧЕНИЕ..."
                  : isConnecting
                    ? "ПОДКЛЮЧЕНИЕ..."
                    : isConnected
                      ? "ЗАЩИЩЕНО"
                      : "ОТКЛЮЧЕНО"}
              </motion.h1>
            </AnimatePresence>

            {(isConnected || isConnecting || isDisconnecting) && currentServer && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3"
              >
                {/* Server name + flag during connecting */}
                {(isConnecting || isDisconnecting) && (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
                    <FlagIcon code={currentServer.countryCode || "un"} size={16} />
                    {currentServer.name}
                  </span>
                )}
                {isConnected && (
                  <span className="uppercase text-[11px] tracking-[0.15em] font-medium text-muted bg-white/[0.04] px-3.5 py-1.5 rounded-full border border-white/[0.06] font-mono-metric">
                    {(currentServer?.protocol ?? "VPN").toUpperCase()}
                  </span>
                )}
              </motion.div>
            )}
          </div>

          {/* ═══ CONNECTION TIMELINE ═══ */}
          {(isConnecting || isDisconnecting) && (
            <ConnectionTimeline isConnecting={isConnecting} isConnected={false} serverName={currentServer?.name} />
          )}

          {/* ═══ SMART / DEFAULT MODE TOGGLE ═══ */}
          {!isConnected && !isConnecting && !isDisconnecting && servers.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              style={NO_DRAG_REGION_STYLE}
              className="relative z-20 flex flex-col items-center gap-3 shrink-0"
            >
              <div className="relative flex items-center gap-0 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-1 backdrop-blur-sm">
                <button
                  type="button"
                  onClick={() => setConnectionMode("smart")}
                  onPointerEnter={() => setHoveredMode("smart")}
                  onPointerLeave={() => hideConnectionModeTooltip("smart")}
                  onMouseEnter={() => setHoveredMode("smart")}
                  onMouseLeave={() => hideConnectionModeTooltip("smart")}
                  onFocus={() => setHoveredMode("smart")}
                  onBlur={() => hideConnectionModeTooltip("smart")}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold tracking-wide transition-all duration-300",
                    connectionMode === "smart"
                      ? "bg-brand/15 text-brand border border-brand/25 shadow-[0_0_12px_rgba(255,76,41,0.18)]"
                      : "text-muted hover:text-white/60"
                  )}
                >
                  <Zap className="w-3.5 h-3.5" />
                  Smart
                </button>

                <button
                  type="button"
                  onClick={() => setConnectionMode("default")}
                  onPointerEnter={() => setHoveredMode("default")}
                  onPointerLeave={() => hideConnectionModeTooltip("default")}
                  onMouseEnter={() => setHoveredMode("default")}
                  onMouseLeave={() => hideConnectionModeTooltip("default")}
                  onFocus={() => setHoveredMode("default")}
                  onBlur={() => hideConnectionModeTooltip("default")}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold tracking-wide transition-all duration-300",
                    connectionMode === "default"
                      ? "bg-white/[0.08] text-white/80 border border-white/[0.12] shadow-[0_0_12px_rgba(255,255,255,0.05)]"
                      : "text-muted hover:text-white/60"
                  )}
                >
                  <Lock className="w-3.5 h-3.5" />
                  Default
                </button>
              </div>

              <div className="flex min-h-[58px] w-full items-start justify-center">
                <AnimatePresence mode="wait">
                  {hoveredMode && (
                    <motion.div
                      key={hoveredMode}
                      data-testid="connection-mode-tooltip"
                      initial={{ opacity: 0, y: -4, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.96 }}
                      transition={{ duration: 0.16, ease: "easeOut" }}
                      className="rounded-2xl border bg-[#2C394B]/96 px-3 py-2.5 text-center text-[10px] leading-tight text-white/90 shadow-[0_12px_36px_rgba(0,0,0,0.42)] backdrop-blur-md pointer-events-none"
                      style={{ ...NO_DRAG_REGION_STYLE, width: 248, maxWidth: "calc(100vw - 112px)" }}
                    >
                      <span
                        className={cn(
                          "mb-1 block border-b pb-1 font-bold",
                          CONNECTION_MODE_TOOLTIP_CONTENT[hoveredMode].accentClass
                        )}
                      >
                        {CONNECTION_MODE_TOOLTIP_CONTENT[hoveredMode].title}
                      </span>
                      {CONNECTION_MODE_TOOLTIP_CONTENT[hoveredMode].description}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {/* ═══ ERROR ═══ */}
          <AnimatePresence>
            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 px-4 py-2.5 rounded-2xl text-sm text-red-400 font-semibold max-w-[400px] z-10 backdrop-blur-sm"
              >
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span className="truncate">{errorMessage}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ═══ STATS GRID ═══ */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="z-10 flex w-full max-w-[480px] shrink-0 flex-col gap-2.5 overflow-visible"
            style={NO_DRAG_REGION_STYLE}
          >
            {/* Quick-stats strip (Connected) */}
            {isConnected && (
              <InfoCard className="w-full py-3 px-4 flex-row items-center justify-between !cursor-default backdrop-blur-md bg-white/[0.04]">
                <div
                  className="flex items-center gap-2 text-white/90 font-mono-metric text-[13px] font-medium"
                  title="Узел"
                >
                  <Globe className="w-4 h-4 text-brand" />
                  <span>{currentServer?.countryCode?.toUpperCase() || "UN"}</span>
                </div>
                <div className="w-px h-4 bg-white/10" />
                <div
                  className="flex items-center gap-2 text-white/90 font-mono-metric text-[13px] font-medium"
                  title="Задержка (Ping)"
                >
                  <Wifi className={cn("w-4 h-4", pingDisplay.color.replace("bg-", "text-").replace("/10", ""))} />
                  <span>{pingDisplay.text}</span>
                </div>
                <div className="w-px h-4 bg-white/10" />
                <div
                  className="flex items-center gap-2 text-white/90 font-mono-metric text-[13px] font-medium"
                  title="Время сессии"
                >
                  <Clock className="w-4 h-4 text-violet-400" />
                  <span>
                    {String(Math.floor(sessionElapsed / 3600)).padStart(2, "0")}:
                    {String(Math.floor((sessionElapsed % 3600) / 60)).padStart(2, "0")}:
                    {String(sessionElapsed % 60).padStart(2, "0")}
                  </span>
                </div>
              </InfoCard>
            )}

            {/* Cards Row */}
            <div data-testid="dashboard-cards-grid" className="grid grid-cols-2 gap-2.5 w-full">
              {/* IP Card */}
              {!realIp && !isConnected ? (
                <InfoCard
                  className={
                    isConnected
                      ? "col-span-2 flex-row justify-between items-center py-2 px-4 !cursor-default"
                      : "flex-col"
                  }
                >
                  <Skeleton className="w-5 h-4 rounded" />
                  <div className="flex flex-col gap-1.5 flex-1">
                    <Skeleton className="h-3 w-8" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                </InfoCard>
              ) : (
                <InfoCard
                  className={
                    isConnected
                      ? "col-span-2 flex-row justify-between items-center py-2 px-4 !cursor-default"
                      : "flex-col"
                  }
                >
                  <div
                    className={cn(
                      "flex shrink-0",
                      isConnected ? "flex-row items-center gap-3" : "flex-col items-center gap-0.5"
                    )}
                  >
                    {ipCountryCode ? (
                      <img
                        src={`https://flagcdn.com/w40/${ipCountryCode}.png`}
                        alt={ipCountryCode}
                        className="w-5 h-4 object-cover rounded-[3px] shadow-sm"
                        style={{ imageRendering: "auto" }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <ShieldCheck className={cn("w-4 h-4", isConnected ? "text-[#FF6B47]" : "text-subtle")} />
                    )}
                    {ipCountryCode && !isConnected && (
                      <span className="text-[8px] font-bold uppercase tracking-wider text-muted leading-none">
                        {ipCountryCode.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div
                    className={cn(
                      "flex relative z-10",
                      isConnected ? "flex-row items-center gap-3 flex-1 px-4" : "flex-col min-w-0 flex-1"
                    )}
                  >
                    <span className="text-[11px] font-bold uppercase tracking-widest text-muted leading-tight">IP</span>
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={ipHidden ? "h" : "v"}
                        initial={{ opacity: 0, filter: "blur(4px)" }}
                        animate={{ opacity: 1, filter: "blur(0px)" }}
                        exit={{ opacity: 0, filter: "blur(4px)" }}
                        className={cn(
                          "text-[13px] font-semibold truncate tracking-wide font-mono-metric",
                          isConnected ? "text-white/85 text-[14px]" : "text-subtle"
                        )}
                      >
                        {ipHidden ? "•••.•••.•••" : realIp || "…"}
                      </motion.span>
                    </AnimatePresence>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 relative z-10">
                    {isConnected && (
                      <button
                        type="button"
                        aria-label={ipHidden ? "Показать IP" : "Скрыть IP"}
                        onClick={(e) => {
                          e.stopPropagation();
                          setIpHidden(!ipHidden);
                        }}
                        className="p-1.5 rounded-lg hover:bg-white/5 transition-all w-8 h-8 flex items-center justify-center shrink-0"
                      >
                        {ipHidden ? (
                          <EyeOff className="w-3.5 h-3.5 text-whisper" />
                        ) : (
                          <Eye className="w-3.5 h-3.5 text-[#FF6B47]/50" />
                        )}
                      </button>
                    )}
                    {realIp && !ipHidden && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (realIp) {
                            navigator.clipboard.writeText(realIp);
                            setIpCopied(true);
                            setTimeout(() => setIpCopied(false), 2000);
                          }
                        }}
                        className="p-1.5 rounded-lg hover:bg-white/5 transition-all w-8 h-8 flex items-center justify-center shrink-0"
                        title="Скопировать IP"
                      >
                        {ipCopied ? (
                          <Check className="w-3.5 h-3.5 text-[#FF6B47]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-whisper" />
                        )}
                      </button>
                    )}
                  </div>
                </InfoCard>
              )}

              {/* Server Card - Show only when disconnected */}
              {!isConnected && (
                <InfoCard onClick={() => setScreen("servers")}>
                  {currentServer ? (
                    <FlagIcon code={currentServer.countryCode || "un"} size={28} />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-white/3 flex items-center justify-center shrink-0">
                      <Globe className="w-[18px] h-[18px] text-subtle" />
                    </div>
                  )}
                  <div className="flex flex-col min-w-0 flex-1 relative z-10">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-muted leading-tight">
                      Узел
                    </span>
                    <span className="text-lg font-semibold truncate text-white/75 group-hover:text-brand transition-colors">
                      {currentServer ? currentServer.name : "Выбрать"}
                    </span>
                  </div>
                </InfoCard>
              )}
            </div>

            {/* Speed Gauges */}
            {isConnected && (
              <InfoCard className="justify-center !cursor-default py-3">
                <div className="flex items-center justify-center gap-8 w-full relative z-10">
                  <SpeedGraph
                    value={downMBs}
                    maxValue={maxSpeed}
                    unit={downSpeed.unit}
                    label="Приём"
                    color="brand"
                    isActive={traffic.down > 0}
                  />
                  <SpeedGraph
                    value={upMBs}
                    maxValue={maxSpeed}
                    unit={upSpeed.unit}
                    label="Отдача"
                    color="emerald"
                    isActive={traffic.up > 0}
                  />
                </div>
              </InfoCard>
            )}

            {/* Internet Fix */}
            <div className="w-full mt-1 flex justify-center">
              <InternetFixButton />
            </div>

            {/* Usage Insights - Only when disconnected to save space, or always? Let's show always but at the bottom */}
            {!isConnected && !isConnecting && !isDisconnecting && <UsageInsights className="mt-2" />}
          </motion.div>
        </div>
      </div>
    </main>
  );
}
