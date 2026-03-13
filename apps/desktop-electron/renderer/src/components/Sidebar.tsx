import { AnimatePresence, motion } from "framer-motion";
import { Home, Server, Settings as SettingsIcon, Shield, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "../lib/cn";
import { type Screen, useAppStore } from "../store/useAppStore";

/* ──────────────────────────────────────────────────────────
   Sidebar v1 — "Vertical Dock"
   64px wide vertical nav. Shield/status top, nav items center.
   Glassmorphism, brand accent, tooltip on hover.
   ────────────────────────────────────────────────────────── */

const navItems: { id: Screen; icon: typeof Home; label: string; requiresTun?: boolean }[] = [
  { id: "dashboard", icon: Home, label: "Главная" },
  { id: "split-tunnel", icon: Zap, label: "Сплит-туннель", requiresTun: true },
  { id: "servers" as Screen, icon: Server, label: "Серверы" },
  { id: "settings", icon: SettingsIcon, label: "Настройки" }
];

export function Sidebar() {
  const currentScreen = useAppStore((s) => s.currentScreen);
  const setScreen = useAppStore((s) => s.setScreen);
  const isConnected = useAppStore((s) => s.isConnected);
  const tunMode = useAppStore((s) => s.tunMode);

  // Keyboard shortcuts: Ctrl+1..4 for navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.shiftKey) return;
      // Skip when focused on inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const map: Record<string, Screen> = {
        "1": "dashboard",
        "2": "split-tunnel",
        "3": "servers",
        "4": "settings"
      };
      const screen = map[e.key];
      if (screen) {
        e.preventDefault();
        if (screen === "split-tunnel" && !tunMode) return;
        setScreen(screen);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [setScreen, tunMode]);

  return (
    <nav
      aria-label="Основная навигация"
      className="sidebar-panel relative z-30 flex flex-col items-center h-full w-16 py-2 shrink-0 select-none"
    >
      {/* ── Shield / Status Button ── */}
      <div className="pt-8 pb-5">
        <motion.button
          whileTap={{ scale: 0.88 }}
          whileHover={{ scale: 1.08 }}
          onClick={() => setScreen("dashboard")}
          aria-label="Перейти на главную"
          className="relative"
        >
          {/* Glow ring — CSS-only, zero JS overhead */}
          <div
            className="absolute inset-[-6px] rounded-full pointer-events-none animate-glow-pulse"
            style={{
              background: isConnected
                ? "radial-gradient(circle, rgba(16,185,129,0.35) 0%, transparent 70%)"
                : "radial-gradient(circle, rgba(255,107,0,0.4) 0%, transparent 70%)"
            }}
          />
          <div
            className={cn(
              "relative w-11 h-11 rounded-full flex items-center justify-center z-10 transition-all duration-500",
              isConnected
                ? "bg-gradient-to-br from-emerald-700 to-emerald-500 shadow-[0_4px_18px_rgba(16,185,129,0.5),inset_0_1px_0_rgba(255,255,255,0.2)]"
                : "bg-gradient-to-br from-[#FF4D00] via-brand to-[#FF8C38] shadow-[0_4px_18px_rgba(255,107,0,0.5),inset_0_1px_0_rgba(255,255,255,0.2)]"
            )}
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[70%] h-[38%] bg-gradient-to-b from-white/20 to-transparent rounded-full blur-[1px]" />
            <div className="absolute inset-[1.5px] rounded-full border border-white/10" />
            <Shield
              className="w-5 h-5 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)] relative z-10"
              strokeWidth={2.5}
              fill="rgba(255,255,255,0.12)"
            />
          </div>
        </motion.button>
      </div>

      {/* ── Separator ── */}
      <div className="w-7 h-px bg-white/[0.06] mb-3" />

      {/* ── Nav Items ── */}
      <div className="flex flex-col items-center gap-1 flex-1">
        {navItems.map((item) => {
          const disabled = item.requiresTun && !tunMode;
          return (
            <SidebarItem
              key={item.id}
              Icon={item.icon}
              label={item.label}
              active={currentScreen === item.id}
              disabled={disabled}
              onClick={() => !disabled && setScreen(item.id)}
            />
          );
        })}
      </div>

      {/* ── Version ── */}
      <div className="pb-3 pt-2">
        <span className="text-[8px] font-mono-metric text-whisper tracking-wider">
          v{__APP_VERSION__}
        </span>
      </div>
    </nav>
  );
}

/* ── Individual Nav Item ────────────────────────────────── */
function SidebarItem({
  Icon,
  label,
  active,
  disabled,
  onClick
}: {
  Icon: typeof Home;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [showTip, setShowTip] = useState(false);

  const handleClick = useCallback(() => {
    if (disabled) {
      setShowTip(true);
      setTimeout(() => setShowTip(false), 2000);
      return;
    }
    onClick();
  }, [disabled, onClick]);

  return (
    <motion.button
      onClick={handleClick}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      whileHover={!disabled ? { scale: 1.06 } : undefined}
      whileTap={!disabled ? { scale: 0.9 } : undefined}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center justify-center w-11 h-11 rounded-xl outline-none transition-colors duration-200",
        disabled ? "text-whisper cursor-not-allowed" : active ? "text-brand" : "text-muted hover:text-white/65"
      )}
    >
      {/* Active indicator — gradient pill */}
      {active && !disabled && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute inset-0 rounded-xl"
          style={{
            background: "linear-gradient(135deg, rgba(255,107,0,0.12), rgba(255,107,0,0.04))",
            border: "1px solid rgba(255,107,0,0.2)",
            boxShadow: "0 0 10px rgba(255,107,0,0.08)"
          }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
        />
      )}

      <div className="relative z-10">
        <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} />
      </div>

      {/* Tooltip on hover */}
      <AnimatePresence>
        {(hovered || showTip) && (
          <motion.div
            initial={{ opacity: 0, x: -4, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 whitespace-nowrap z-50 pointer-events-none"
          >
            <div
              className={cn(
                "text-[11px] font-bold px-3 py-1.5 rounded-lg shadow-xl border",
                showTip
                  ? "bg-[#1a1a22] text-white/70 border-brand/15"
                  : "bg-[#1a1a22] text-white/70 border-white/8"
              )}
            >
              {showTip ? "Включите TUN в Настройках" : label}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
