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
  Power,
  ShieldAlert,
  ShieldCheck,
  Wifi,
  WifiOff
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DepthBackground } from "../components/DepthBackground";
import { FlagIcon } from "../components/FlagIcon";
import { Skeleton } from "../components/Skeleton";
import { SpeedGraph } from "../components/SpeedGraph";
import { getAPI } from "../lib/api";
import { cn } from "../lib/cn";
import { formatSpeed, getPingStyle } from "../lib/dashboard-utils";
import { useHealthCheck } from "../lib/useHealthCheck";
import { useAppStore } from "../store/useAppStore";

/* ──────────────────────────────────────────────────────────
   Dashboard v3 — "Depth Power"
   DepthBackground + bright Power button + unified glass cards
   ────────────────────────────────────────────────────────── */

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
      ? "bg-gradient-to-br from-emerald-500/20 to-emerald-500/10 border border-emerald-500/30"
      : status === "error"
        ? "bg-gradient-to-br from-red-500/20 to-red-500/10 border border-red-500/30"
        : "bg-white/[0.03] border border-white/[0.06]";

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
        "backdrop-blur-md transition-all duration-300 group overflow-hidden",
        "hover:-translate-y-[1px] hover:border-glass-border-medium hover:shadow-[0_4px_20px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)]",
        "active:scale-[0.98] active:duration-100",
        onClick && "cursor-pointer",
        className
      )}
    >
      {/* Hover glow */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: "linear-gradient(135deg, rgba(255,107,0,0.04), transparent 60%)" }}
      />
      {children}
    </motion.div>
  );
}

function formatTrafficBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} ГБ`;
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
  // Dashboard показывает ФАКТИЧЕСКИ подключённый сервер, а не выбранный в списке
  const currentServer = servers.find((s) => s.id === (isConnected ? connectedServerId : selectedServerId));

  const [traffic, setTraffic] = useState({ down: 0, up: 0 });
  const [ipHidden, setIpHidden] = useState(true);
  const [activePing, setActivePing] = useState<number | null>(null);
  const [realIp, setRealIp] = useState<string | null>(null);
  const [ipCountryCode, setIpCountryCode] = useState<string | null>(null);
  const [ipCopied, setIpCopied] = useState(false);
  const sessionStartTime = useAppStore((s) => s.sessionStartTime);
  const [sessionElapsed, setSessionElapsed] = useState(0);
  const [sessionRx, setSessionRx] = useState(0);
  const [sessionTx, setSessionTx] = useState(0);

  const downSpeed = formatSpeed(traffic.down);
  const upSpeed = formatSpeed(traffic.up);

  const pingDisplay = useMemo(() => {
    const raw = isConnected ? activePing : (currentServer?.ping ?? null);
    return getPingStyle(raw);
  }, [isConnected, activePing, currentServer?.ping]);

  // Ping polling
  useEffect(() => {
    let pingInterval: ReturnType<typeof setInterval> | undefined;
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
      } catch { /* ignore */ }
      return false;
    };

    if (!isConnected) {
      setRealIp(null);
      setIpCountryCode(null);
      // Fetch direct IP even when disconnected
      fetchIp();
      const interval = setInterval(fetchIp, 30000);
      return () => { cancelled = true; clearInterval(interval); };
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
    return () => { cancelled = true; clearTimeout(initialDelay); clearInterval(interval); };
  }, [isConnected]);

  useEffect(() => {
    if (!isConnected) {
      setTraffic({ down: 0, up: 0 });
      setSessionRx(0);
      setSessionTx(0);
      return;
    }
    const handleTraffic = (data: { rx: number; tx: number }) => {
      setTraffic({ down: Math.round(data.rx / 1024), up: Math.round(data.tx / 1024) });
      // Накапливаем трафик сессии (байты за секунду)
      setSessionRx((prev) => prev + data.rx);
      setSessionTx((prev) => prev + data.tx);
    };
    const api = getAPI();
    if (api?.traffic?.onUpdate) api.traffic.onUpdate(handleTraffic);
    return () => {
      if (api?.traffic?.offUpdate) api.traffic.offUpdate();
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
    if (!currentServer) {
      setScreen("servers");
      return;
    }
    toggleConnection();
  };

  const downMBs = traffic.down / 1024;
  const upMBs = traffic.up / 1024;
  const maxSpeed = Math.max(downMBs, upMBs, 10);

  // Button gradient
  const btnGrad = isConnecting
    ? "linear-gradient(135deg, #FF4D00, #FF6B00)"
    : isConnected
      ? "linear-gradient(135deg, #059669, #10B981, #34D399)"
      : "linear-gradient(135deg, #FF4D00, #FF6B00, #FF8C38)";
  const btnShadow = isConnecting
    ? "0 8px 40px rgba(255,107,0,0.4), 0 2px 8px rgba(255,107,0,0.2)"
    : isConnected
      ? "0 8px 40px rgba(16,185,129,0.4), 0 2px 8px rgba(16,185,129,0.2)"
      : "0 8px 40px rgba(255,107,0,0.5), 0 2px 8px rgba(255,107,0,0.3)";

  return (
    <main
      className="relative w-full h-full flex flex-col overflow-hidden select-none bg-[#0a0a0f]"
      style={{ WebkitAppRegion: "drag" } as any}
    >
      {/* Interactive Depth Background */}
      <DepthBackground isConnected={isConnected} />

      {/* Main Layout */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-lg mx-auto h-full justify-center gap-4 overflow-y-auto custom-scrollbar py-4">
        {/* ═══ CONNECT BUTTON ═══ */}
        <div
          className="relative flex items-center justify-center w-full mt-2"
          style={{ WebkitAppRegion: "no-drag" } as any}
        >
          {/* Ambient glow — CSS-only, zero JS overhead */}
          <div
            className="absolute w-44 h-44 rounded-full pointer-events-none animate-glow-pulse-slow"
            style={{
              background: isConnected
                ? "radial-gradient(circle, rgba(16,185,129,0.4) 0%, transparent 65%)"
                : "radial-gradient(circle, rgba(255,107,0,0.45) 0%, transparent 65%)"
            }}
          />

          {/* Connecting pulse rings — CSS keyframes for compositor thread */}
          {isConnecting && (
            <>
              <div className="absolute w-36 h-36 rounded-full border-2 border-brand/40 pointer-events-none animate-connect-ring" />
              <div className="absolute w-36 h-36 rounded-full border-2 border-brand/25 pointer-events-none animate-connect-ring" style={{ animationDelay: '0.5s' }} />
              {/* Status Ring — circular progress arc */}
              <svg className="absolute w-[168px] h-[168px] animate-status-ring pointer-events-none" viewBox="0 0 168 168">
                <circle
                  cx="84" cy="84" r="78"
                  fill="none"
                  stroke="rgba(255,107,0,0.12)"
                  strokeWidth="3"
                />
                <circle
                  cx="84" cy="84" r="78"
                  fill="none"
                  stroke="url(#status-ring-gradient)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray="160 330"
                  style={{ filter: "drop-shadow(0 0 6px rgba(255,107,0,0.5))" }}
                />
                <defs>
                  <linearGradient id="status-ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#FF6B00" stopOpacity="1" />
                    <stop offset="100%" stopColor="#FF6B00" stopOpacity="0.1" />
                  </linearGradient>
                </defs>
              </svg>
            </>
          )}

          {/* Power Button */}
          <motion.button
            onClick={handleConnectClick}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.92 }}
            aria-label={isConnecting ? "Подключение..." : isConnected ? "Отключить VPN" : "Подключить VPN"}
            className="relative w-36 h-36 rounded-full focus:outline-none z-10 group"
          >
            {/* Pulsing focus ring (keyboard a11y) — CSS-only, zero GPU when not focused */}
            <div
              className="absolute inset-[-6px] rounded-full pointer-events-none opacity-0 group-focus-visible:opacity-100 group-focus-visible:animate-pulse-ring transition-opacity"
            />

            {/* Gradient fill */}
            <motion.div
              className="absolute inset-0 rounded-full"
              animate={{ boxShadow: btnShadow }}
              transition={{ duration: 0.5 }}
              style={{ background: btnGrad }}
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
                textShadow: isConnected ? "0 0 24px rgba(52,211,153,0.6)" : "0 0 24px rgba(255,107,0,0.6)"
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
              className="flex items-center gap-2"
            >
              {/* Server name + flag during connecting */}
              {(isConnecting || isDisconnecting) && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
                  <FlagIcon code={currentServer.countryCode || "un"} size={16} />
                  {currentServer.name}
                </span>
              )}
              {isConnected && (
                <>
                  <span className="uppercase text-[11px] tracking-[0.15em] font-medium text-muted bg-white/[0.04] px-3.5 py-1.5 rounded-full border border-white/[0.06] font-mono-metric">
                    {(currentServer?.protocol ?? "VPN").toUpperCase()}
                  </span>
                  <span
                    className={cn(
                      "flex items-center gap-1.5 text-xs font-bold px-3.5 py-1.5 rounded-full border backdrop-blur-sm font-mono-metric",
                      pingDisplay.color,
                      pingDisplay.glow,
                      activePing && activePing < 80
                        ? "bg-emerald-500/10 border-emerald-500/20"
                        : activePing && activePing < 200
                          ? "bg-amber-500/10 border-amber-500/20"
                          : activePing
                            ? "bg-red-500/10 border-red-500/20"
                            : "bg-white/3 border-white/8"
                    )}
                  >
                    <Wifi className="w-3 h-3" />
                    {pingDisplay.text}
                  </span>
                </>
              )}
            </motion.div>
          )}
        </div>

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
          className="w-full grid grid-cols-2 gap-2.5 max-w-[480px] z-10 shrink-0"
          style={{ WebkitAppRegion: "no-drag" } as any}
        >
          {/* IP Card */}
          {!realIp && !isConnected ? (
            <InfoCard>
              <Skeleton className="w-5 h-4 rounded" />
              <div className="flex flex-col gap-1.5 flex-1">
                <Skeleton className="h-3 w-8" />
                <Skeleton className="h-4 w-28" />
              </div>
            </InfoCard>
          ) : (
          <InfoCard>
            {/* Flag + Country Code — always visible */}
            <div className="flex flex-col items-center gap-0.5 shrink-0">
              {ipCountryCode ? (
                <img
                  src={`https://flagcdn.com/w40/${ipCountryCode}.png`}
                  alt={ipCountryCode}
                  className="w-5 h-4 object-cover rounded-[3px] shadow-sm"
                  style={{ imageRendering: "auto" }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <ShieldCheck className={cn("w-4 h-4", isConnected ? "text-emerald-400" : "text-subtle")} />
              )}
              {ipCountryCode && (
                <span className="text-[8px] font-bold uppercase tracking-wider text-muted leading-none">
                  {ipCountryCode.toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex flex-col min-w-0 flex-1 relative z-10">
              <span className="text-[11px] font-bold uppercase tracking-widest text-muted leading-tight">IP</span>
              <AnimatePresence mode="wait">
                <motion.span
                  key={ipHidden ? "h" : "v"}
                  initial={{ opacity: 0, filter: "blur(4px)" }}
                  animate={{ opacity: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, filter: "blur(4px)" }}
                  className={cn(
                    "text-[13px] font-semibold truncate tracking-wide font-mono-metric",
                    isConnected ? "text-white/85" : "text-subtle"
                  )}
                >
                  {ipHidden ? "•••.•••.•••" : (realIp || "…")}
                </motion.span>
              </AnimatePresence>
            </div>
            {isConnected && (
              <button
                type="button"
                aria-label={ipHidden ? "Показать IP" : "Скрыть IP"}
                onClick={(e) => {
                  e.stopPropagation();
                  setIpHidden(!ipHidden);
                }}
                className="p-1.5 rounded-lg hover:bg-white/5 transition-all shrink-0 relative z-10"
              >
                {ipHidden ? (
                  <EyeOff className="w-3.5 h-3.5 text-whisper" />
                ) : (
                  <Eye className="w-3.5 h-3.5 text-emerald-400/50" />
                )}
              </button>
            )}
            {/* Copy IP */}
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
                className="p-1.5 rounded-lg hover:bg-white/5 transition-all shrink-0 relative z-10"
                title="Скопировать IP"
              >
                {ipCopied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-whisper" />
                )}
              </button>
            )}
          </InfoCard>
          )}

          {/* Server Card */}
          <InfoCard onClick={() => setScreen("servers")}>
            {currentServer ? (
              <FlagIcon code={currentServer.countryCode || "un"} size={28} />
            ) : (
              <div className="w-9 h-9 rounded-full bg-white/3 flex items-center justify-center shrink-0">
                <Globe className="w-[18px] h-[18px] text-subtle" />
              </div>
            )}
            <div className="flex flex-col min-w-0 flex-1 relative z-10">
              <span className="text-[11px] font-bold uppercase tracking-widest text-muted leading-tight">Узел</span>
              <span className="text-lg font-semibold truncate text-white/75 group-hover:text-brand transition-colors">
                {currentServer ? currentServer.name : "Выбрать"}
              </span>
            </div>
          </InfoCard>

          {/* Session Stats */}
          {isConnected && (
            <InfoCard className="col-span-2 !cursor-default">
              <div className="flex items-center gap-3 w-full relative z-10">
                <div className="w-9 h-9 rounded-full bg-violet-500/10 flex items-center justify-center shrink-0">
                  <Clock className="w-[18px] h-[18px] text-violet-400" />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-muted leading-tight">Сессия</span>
                  <span className="text-lg font-semibold text-white/85 font-mono-metric">
                    {String(Math.floor(sessionElapsed / 3600)).padStart(2, '0')}:{String(Math.floor((sessionElapsed % 3600) / 60)).padStart(2, '0')}:{String(sessionElapsed % 60).padStart(2, '0')}
                  </span>
                </div>
                <div className="flex flex-col items-end text-sm text-muted font-mono-metric gap-0.5">
                  <span>↓ {formatTrafficBytes(sessionRx)}</span>
                  <span>↑ {formatTrafficBytes(sessionTx)}</span>
                </div>
              </div>
            </InfoCard>
          )}

          {/* Speed Gauges */}
          <InfoCard className="col-span-2 justify-center !cursor-default">
            <div className="flex items-center justify-center gap-8 w-full relative z-10">
              <SpeedGraph
                value={downMBs}
                maxValue={maxSpeed}
                unit={downSpeed.unit}
                label="Приём"
                color="orange"
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
          </InfoCard>

          {/* Internet Fix */}
          <InternetFixButton />
        </motion.div>
      </div>
    </main>
  );
}
