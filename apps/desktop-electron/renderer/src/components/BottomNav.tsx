import { Zap, Globe, Settings as SettingsIcon, Server } from "lucide-react";
import { cn } from "../lib/cn";
import { useAppStore, type Screen } from "../store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldLogo } from "./ShieldLogo";
import { useState } from "react";

const navItems: { id: Screen; icon: React.ReactNode; label: string }[] = [
    { id: 'dashboard', icon: <Globe className="w-[18px] h-[18px]" />, label: "Главная" },
    { id: 'split-tunnel', icon: <Zap className="w-[18px] h-[18px]" />, label: "Сплит" },
];

const navItemsRight: { id: Screen; icon: React.ReactNode; label: string }[] = [
    { id: 'servers' as Screen, icon: <Server className="w-[18px] h-[18px]" />, label: "Серверы" },
    { id: 'settings', icon: <SettingsIcon className="w-[18px] h-[18px]" />, label: "Настройки" },
];

export function BottomNav() {
    const currentScreen = useAppStore(s => s.currentScreen);
    const setScreen = useAppStore(s => s.setScreen);
    const isConnected = useAppStore(s => s.isConnected);
    const tunMode = useAppStore(s => s.tunMode);

    return (
        <div className="relative z-20 w-full px-4 pb-3">
            {/* Floating pill nav */}
            <nav
                aria-label="Основная навигация"
                className="relative max-w-[520px] mx-auto h-[68px] flex items-center justify-between px-3 rounded-[22px] glass-card noise-overlay"
                style={{
                    background: "rgba(12, 12, 18, 0.75)",
                    boxShadow: "0 -4px 30px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 32px rgba(0,0,0,0.4)",
                }}
            >
                {navItems.map(item => {
                    const isSplitDisabled = item.id === 'split-tunnel' && !tunMode;
                    return (
                        <NavItem
                            key={item.id}
                            icon={item.icon}
                            label={item.label}
                            active={currentScreen === item.id}
                            disabled={isSplitDisabled}
                            disabledTooltip="Включите TUN режим + Sing-box в настройках"
                            onClick={() => !isSplitDisabled && setScreen(item.id)}
                        />
                    );
                })}

                {/* Central Shield button — floating above pill */}
                <motion.button
                    whileHover={{ scale: 1.06 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => setScreen('dashboard')}
                    aria-label="Щит — на главную"
                    className="relative -top-8 flex-shrink-0"
                >
                    {/* Rotating conic-gradient ring */}
                    <div className={cn(
                        "absolute inset-[-3px] rounded-[1.8rem] opacity-60 transition-opacity duration-700",
                        isConnected ? "animate-conic-spin opacity-80" : "opacity-30"
                    )}
                        style={{
                            background: "conic-gradient(from 0deg, #FF6B2C, #FF3D00, #FFB547, transparent, transparent, transparent, #FF6B2C)",
                            filter: "blur(2px)",
                        }}
                    />

                    {/* Main button body */}
                    <div className="relative w-[66px] h-[66px] rounded-[1.6rem] bg-gradient-to-br from-brand/20 to-brand-hot/20 p-[1.5px] flex items-center justify-center z-10">
                        <div className="w-full h-full rounded-[1.5rem] bg-gradient-to-br from-[#0C0C14] to-[#12121C] flex items-center justify-center transition-colors duration-300 group-hover:from-orange-950/30 group-hover:to-red-950/30">
                            <ShieldLogo isConnected={isConnected} className="w-9 h-9 drop-shadow-xl" />
                        </div>
                    </div>

                    {/* Ambient glow */}
                    {isConnected && (
                        <motion.div
                            className="absolute inset-0 rounded-[1.8rem] pointer-events-none"
                            animate={{ opacity: [0.2, 0.5, 0.2] }}
                            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                            style={{ boxShadow: "0 0 40px rgba(255,107,44,0.3), 0 0 80px rgba(255,107,44,0.1)" }}
                        />
                    )}
                </motion.button>

                {navItemsRight.map(item => (
                    <NavItem
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

function NavItem({ icon, label, active, disabled, disabledTooltip, onClick }: {
    icon: React.ReactNode;
    label: string;
    active?: boolean;
    disabled?: boolean;
    disabledTooltip?: string;
    onClick: () => void;
}) {
    const [showTooltip, setShowTooltip] = useState(false);

    const handleClick = () => {
        if (disabled) {
            setShowTooltip(true);
            setTimeout(() => setShowTooltip(false), 2000);
            return;
        }
        onClick();
    };

    return (
        <motion.button
            whileTap={disabled ? undefined : { scale: 0.88 }}
            onClick={handleClick}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            aria-disabled={disabled || undefined}
            className={cn(
                "relative flex flex-col items-center justify-center gap-1 transition-all duration-300 w-14 group outline-none py-2 rounded-xl",
                disabled
                    ? "text-white/10 cursor-not-allowed"
                    : active ? "text-brand" : "text-white/30 hover:text-white/55"
            )}
        >
            {/* Tooltip */}
            <AnimatePresence>
                {showTooltip && disabledTooltip && (
                    <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.95 }}
                        className="absolute -top-14 left-1/2 -translate-x-1/2 whitespace-nowrap bg-surface-card/95 text-white/90 text-[10px] font-semibold px-3 py-1.5 rounded-lg border border-brand/20 shadow-xl backdrop-blur-lg z-[60]"
                    >
                        {disabledTooltip}
                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-surface-card/95 border-r border-b border-white/10 rotate-45" />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Active background pill — sliding indicator */}
            {active && !disabled && (
                <motion.div
                    layoutId="nav-active-pill"
                    className="absolute inset-0 rounded-xl bg-white/[0.06] border border-white/[0.06]"
                    transition={{ type: "spring", stiffness: 400, damping: 28 }}
                    style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)" }}
                />
            )}

            {/* Icon */}
            <motion.div
                animate={{ scale: active ? 1.05 : 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="relative z-10"
            >
                {icon}
            </motion.div>

            {/* Label */}
            <span className={cn(
                "text-[9px] font-semibold tracking-wider transition-colors relative z-10 uppercase",
                disabled
                    ? "text-white/10"
                    : active ? "text-brand" : "text-white/30 group-hover:text-white/50"
            )}>{label}</span>
        </motion.button>
    );
}
