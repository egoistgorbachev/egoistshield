import { AnimatePresence, motion } from "framer-motion";
import { Home, Server, Settings as SettingsIcon, Shield } from "lucide-react";
import { useCallback, useState } from "react";
import { cn } from "../lib/cn";
import { type Screen, useAppStore } from "../store/useAppStore";

/* ──────────────────────────────────────────────────────────
   BottomNav v3 — "Perfect Dock"
   Larger icons (20px), bigger labels (9px),
   taller bar (62px), central button 56px.
   Gradient active indicator, smooth spring animations.
   ────────────────────────────────────────────────────────── */

const navItems: { id: Screen; icon: typeof Home; label: string }[] = [
  { id: "dashboard", icon: Home, label: "Главная" }
];
const navItemsRight: { id: Screen; icon: typeof Server; label: string }[] = [
  { id: "servers" as Screen, icon: Server, label: "Серверы" },
  { id: "settings", icon: SettingsIcon, label: "Настройки" }
];

export function BottomNav() {
  const currentScreen = useAppStore((s) => s.currentScreen);
  const setScreen = useAppStore((s) => s.setScreen);
  const isConnected = useAppStore((s) => s.isConnected);

  return (
    <div className="relative z-20 w-full px-3 pb-3">
      <nav
        aria-label="Основная навигация"
        className="relative max-w-[460px] mx-auto h-[62px] flex items-center justify-between px-2"
        style={{
          background: "linear-gradient(180deg, rgba(8,32,50,0.96), rgba(12,36,54,0.94))",
          backdropFilter: "blur(28px) saturate(1.6)",
          borderRadius: "22px",
          border: "1px solid rgba(51,71,86,0.45)",
          boxShadow:
            "0 -8px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.02), inset 0 1px 0 rgba(255,255,255,0.05)"
        }}
      >
        {navItems.map((item) => {
          return (
            <DockItem
              key={item.id}
              Icon={item.icon}
              label={item.label}
              active={currentScreen === item.id}
              onClick={() => setScreen(item.id)}
            />
          );
        })}

        {/* Central Shield — gradient elevated circle */}
        <motion.button
          whileTap={{ scale: 0.88 }}
          whileHover={{ scale: 1.05 }}
          onClick={() => setScreen("dashboard")}
          aria-label="Щит"
          className="relative -top-5 flex-shrink-0"
        >
          {/* Glow */}
          <motion.div
            className="absolute inset-[-10px] rounded-full pointer-events-none"
            animate={{
              opacity: [0.5, 0.8, 0.5]
            }}
            transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
            style={{
              background: isConnected
                ? "radial-gradient(circle, rgba(34,181,122,0.36) 0%, transparent 70%)"
                : "radial-gradient(circle, rgba(255,76,41,0.38) 0%, transparent 70%)"
            }}
          />

          {/* Button body */}
          <div
            className="relative w-[56px] h-[56px] rounded-full flex items-center justify-center z-10 transition-all duration-500"
            style={{
              background: isConnected
                ? "linear-gradient(135deg, #168A62, #22B57A, #4ED39A)"
                : "linear-gradient(135deg, #D63B1B, #FF4C29, #FF6B47)",
              boxShadow: isConnected
                ? "0 6px 24px rgba(34,181,122,0.4), inset 0 1px 0 rgba(255,255,255,0.2)"
                : "0 6px 24px rgba(255,76,41,0.5), inset 0 1px 0 rgba(255,255,255,0.2)"
            }}
          >
            {/* Glass highlight */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[75%] h-[40%] bg-gradient-to-b from-white/20 to-transparent rounded-full blur-[1px]" />
            <div className="absolute inset-[1.5px] rounded-full border border-white/10" />
            <Shield
              className="w-6 h-6 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)] relative z-10"
              strokeWidth={2.5}
              fill="rgba(255,255,255,0.12)"
            />
          </div>
        </motion.button>

        {navItemsRight.map((item) => (
          <DockItem
            key={item.id}
            Icon={item.icon}
            label={item.label}
            active={currentScreen === item.id}
            onClick={() => setScreen(item.id)}
          />
        ))}
      </nav>
    </div>
  );
}

function DockItem({
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
      whileHover={!disabled ? { scale: 1.04 } : undefined}
      whileTap={!disabled ? { scale: 0.92 } : undefined}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex flex-col items-center justify-center gap-1 w-[76px] py-1.5 rounded-2xl outline-none transition-colors duration-200",
        disabled ? "text-white/10 cursor-not-allowed" : active ? "text-brand" : "text-white/40 hover:text-white/65"
      )}
    >
      {/* Tooltip for disabled */}
      <AnimatePresence>
        {showTip && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.93 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4 }}
            className="absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap bg-[#2C394B] text-white/80 text-[10px] font-semibold px-3 py-2 rounded-xl border border-brand/15 shadow-xl z-50"
          >
            Недоступно
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active indicator — gradient pill */}
      {active && !disabled && (
        <motion.div
          layoutId="dock-active"
          className="absolute inset-0 rounded-2xl"
          style={{
            background: "linear-gradient(145deg, rgba(255,76,41,0.18), rgba(44,57,75,0.42))",
            border: "1px solid rgba(255,76,41,0.28)",
            boxShadow: "0 0 16px rgba(255,76,41,0.14), inset 0 1px 0 rgba(255,255,255,0.04)"
          }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
        />
      )}

      <div className="relative z-10">
        <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} />
      </div>
      <span
        className={cn(
          "text-[9px] font-bold tracking-wider uppercase transition-colors relative z-10",
          disabled ? "text-white/10" : active ? "text-brand" : "text-white/30"
        )}
      >
        {label}
      </span>
    </motion.button>
  );
}
