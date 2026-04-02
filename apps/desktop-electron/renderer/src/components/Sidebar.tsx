import { AnimatePresence, motion } from "framer-motion";
import { Globe2, Home, Send, Server, Settings as SettingsIcon, Zap } from "lucide-react";
import { useCallback, useState } from "react";
import { cn } from "../lib/cn";
import { ShieldLogo } from "./ShieldLogo";
import { type Screen, useAppStore } from "../store/useAppStore";

/* ──────────────────────────────────────────────────────────
   Sidebar v1 — "Vertical Dock"
   64px wide vertical nav. Shield/status top, nav items center.
   Glassmorphism, brand accent, tooltip on hover.
   ────────────────────────────────────────────────────────── */

const navItems: { id: Screen; icon: typeof Home; label: string }[] = [
  { id: "dashboard", icon: Home, label: "Главная" },
  { id: "servers" as Screen, icon: Server, label: "Серверы" },
  { id: "dns", icon: Globe2, label: "DNS" },
  { id: "zapret", icon: Zap, label: "Zapret" },
  { id: "telegram-proxy", icon: Send, label: "Прокси Telegram" },
  { id: "settings", icon: SettingsIcon, label: "Настройки" }
];

export function Sidebar() {
  const currentScreen = useAppStore((s) => s.currentScreen);
  const setScreen = useAppStore((s) => s.setScreen);
  const isConnected = useAppStore((s) => s.isConnected);

  return (
    <nav
      aria-label="Основная навигация"
      className="sidebar-panel relative z-30 flex h-full w-[72px] shrink-0 flex-col items-center py-2 select-none"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/[0.035] to-transparent" />
      <div className="pointer-events-none absolute inset-y-6 right-0 w-px bg-gradient-to-b from-transparent via-white/[0.06] to-transparent" />

      {/* ── Shield / Status Button ── */}
      <div className="pt-7 pb-4">
        <motion.button
          whileTap={{ scale: 0.88 }}
          whileHover={{ scale: 1.08 }}
          onClick={() => setScreen("dashboard")}
          aria-label="Перейти на главную"
          className="relative flex items-center justify-center"
        >
          <ShieldLogo className="h-11 w-11" isConnected={isConnected} animated={false} />
        </motion.button>
        <div className="mt-3 text-center">
          <div className="text-[9px] font-bold uppercase tracking-[0.32em] text-white/38">Ядро</div>
        </div>
      </div>

      {/* ── Separator ── */}
      <div className="mb-4 h-px w-8 bg-gradient-to-r from-transparent via-white/[0.1] to-transparent" />

      {/* ── Nav Items ── */}
      <div className="flex flex-col items-center gap-1 flex-1">
        {navItems.map((item) => {
          return (
            <SidebarItem
              key={item.id}
              Icon={item.icon}
              label={item.label}
              active={currentScreen === item.id}
              onClick={() => setScreen(item.id)}
            />
          );
        })}
      </div>

      {/* ── Version ── */}
      <div className="pb-3 pt-2">
        <span className="text-xs font-mono-metric text-whisper tracking-wider">v{__APP_VERSION__}</span>
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
        "group relative flex h-11 w-11 items-center justify-center rounded-[14px] outline-none transition-colors duration-200",
        disabled ? "text-whisper cursor-not-allowed" : active ? "text-brand" : "text-muted hover:text-white/65"
      )}
    >
      {/* Active indicator — gradient pill */}
      {active && !disabled && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute inset-0 rounded-xl"
          style={{
            background: "linear-gradient(145deg, rgba(255,76,41,0.22), rgba(34,211,238,0.08), rgba(44,57,75,0.4))",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 0 16px rgba(255,76,41,0.14), inset 0 1px 0 rgba(255,255,255,0.05)"
          }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
        />
      )}

      {!active && !disabled ? (
        <div className="pointer-events-none absolute inset-0 rounded-[14px] border border-transparent transition-colors duration-200 group-hover:border-white/6" />
      ) : null}

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
                  ? "bg-[#2C394B]/95 text-[#D2D2D2] border-brand/25"
                  : "bg-[#2C394B]/95 text-[#D2D2D2] border-white/8"
              )}
            >
              {showTip ? "Недоступно" : label}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
