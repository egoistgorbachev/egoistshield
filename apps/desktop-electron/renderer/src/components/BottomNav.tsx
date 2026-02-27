import { Globe, Zap, Server, Settings as SettingsIcon } from "lucide-react";
import { cn } from "../lib/cn";
import { useAppStore, type Screen } from "../store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldLogo } from "./ShieldLogo";
import { useRef, useEffect, useState, useCallback } from "react";
import { gsap } from "../lib/gsap-setup";

const navItems: { id: Screen; icon: React.ReactNode; label: string }[] = [
  { id: "dashboard", icon: <Globe className="w-5 h-5" />, label: "Главная" },
  { id: "split-tunnel", icon: <Zap className="w-5 h-5" />, label: "Сплит" },
];
const navItemsRight: { id: Screen; icon: React.ReactNode; label: string }[] = [
  { id: "servers" as Screen, icon: <Server className="w-5 h-5" />, label: "Серверы" },
  { id: "settings", icon: <SettingsIcon className="w-5 h-5" />, label: "Настройки" },
];

export function BottomNav() {
  const currentScreen = useAppStore(s => s.currentScreen);
  const setScreen = useAppStore(s => s.setScreen);
  const isConnected = useAppStore(s => s.isConnected);
  const tunMode = useAppStore(s => s.tunMode);

  return (
    <div className="relative z-20 w-full px-5 pb-4">
      <nav
        aria-label="Основная навигация"
        className="relative max-w-[480px] mx-auto h-[64px] flex items-center justify-between px-3 rounded-2xl glass-panel"
      >
        {navItems.map(item => {
          const disabled = item.id === "split-tunnel" && !tunMode;
          return (
            <DockItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              active={currentScreen === item.id}
              disabled={disabled}
              onClick={() => !disabled && setScreen(item.id)}
            />
          );
        })}

        {/* Central Shield — elevated */}
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => setScreen("dashboard")}
          aria-label="Щит"
          className="relative -top-5 flex-shrink-0"
        >
          {/* Ring glow */}
          <div className={cn(
            "absolute inset-[-2px] rounded-full transition-all duration-700",
            isConnected ? "glow-emerald" : "glow-indigo"
          )}>
            <div className={cn(
              "w-full h-full rounded-full border-2 transition-colors duration-700",
              isConnected ? "border-neon-emerald/30" : "border-brand/20"
            )} />
          </div>

          {/* Button body */}
          <div className="relative w-[60px] h-[60px] rounded-full bg-void-surface flex items-center justify-center z-10 border border-white/[0.04] shadow-[0_0_20px_rgba(0,0,0,0.8)]">
            <ShieldLogo isConnected={isConnected} className="w-8 h-8 drop-shadow-[0_0_8px_currentColor]" />
          </div>

          {/* Pulse ring */}
          {isConnected && (
            <div className="absolute inset-[-6px] rounded-full border border-neon-emerald/20 animate-pulse-ring pointer-events-none" />
          )}
        </motion.button>

        {navItemsRight.map(item => (
          <DockItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            active={currentScreen === item.id}
            onClick={() => setScreen(item.id)}
          />
        ))}
      </nav>
    </div>
  );
}

function DockItem({ icon, label, active, disabled, onClick }: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [showTip, setShowTip] = useState(false);

  // Magnetic dock hover — icon scales on approach
  const handleMouseEnter = useCallback(() => {
    if (disabled || !ref.current) return;
    gsap.to(ref.current, { scale: 1.18, y: -4, duration: 0.3, ease: "back.out(2)" });
  }, [disabled]);

  const handleMouseLeave = useCallback(() => {
    if (!ref.current) return;
    gsap.to(ref.current, { scale: 1, y: 0, duration: 0.4, ease: "elastic.out(1, 0.5)" });
  }, []);

  const handleClick = () => {
    if (disabled) {
      setShowTip(true);
      setTimeout(() => setShowTip(false), 2000);
      return;
    }
    onClick();
  };

  return (
    <button
      ref={ref}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex flex-col items-center justify-center gap-1 w-12 py-1.5 rounded-xl outline-none transition-colors duration-200",
        disabled ? "text-white/8 cursor-not-allowed"
          : active ? "text-brand" : "text-white/30 hover:text-white/55"
      )}
    >
      {/* Tooltip for disabled */}
      <AnimatePresence>
        {showTip && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.93 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4 }}
            className="absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap bg-void-card text-white/80 text-[9px] font-semibold px-2.5 py-1.5 rounded-lg border border-brand/15 shadow-lg z-50"
          >
            Включите TUN + Sing-box
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active indicator dot */}
      {active && !disabled && (
        <motion.div
          layoutId="dock-active"
          className="absolute -bottom-0.5 w-1.5 h-1.5 rounded-full bg-brand shadow-[0_0_8px_#818CF8]"
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
          style={{ boxShadow: "0 0 8px rgba(99,102,241,0.5)" }}
        />
      )}

      <div className="relative z-10">{icon}</div>
      <span className={cn(
        "text-[8px] font-semibold tracking-wider uppercase transition-colors",
        disabled ? "text-white/8" : active ? "text-brand" : "text-white/20"
      )}>{label}</span>
    </button>
  );
}
