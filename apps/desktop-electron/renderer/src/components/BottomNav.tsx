import { Zap, Globe, Settings as SettingsIcon, Server } from "lucide-react";
import { cn } from "../lib/cn";
import { useAppStore, type Screen } from "../store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldLogo } from "./ShieldLogo";
import { useState } from "react";

const navItems: { id: Screen; icon: React.ReactNode; label: string }[] = [
    { id: 'dashboard', icon: <Globe className="w-5 h-5" />, label: "Главная" },
    { id: 'split-tunnel', icon: <Zap className="w-5 h-5" />, label: "Сплит" },
];

const navItemsRight: { id: Screen; icon: React.ReactNode; label: string }[] = [
    { id: 'servers' as Screen, icon: <Server className="w-5 h-5" />, label: "Серверы" },
    { id: 'settings', icon: <SettingsIcon className="w-5 h-5" />, label: "Настройки" },
];

export function BottomNav() {
    const currentScreen = useAppStore(s => s.currentScreen);
    const setScreen = useAppStore(s => s.setScreen);
    const isConnected = useAppStore(s => s.isConnected);
    const tunMode = useAppStore(s => s.tunMode);

    return (
        <div className="relative z-20 w-full bg-surface-app/70 backdrop-blur-3xl border-t border-white/[0.04]">
            <nav aria-label="Основная навигация" className="max-w-[605px] mx-auto h-20 flex items-center justify-between px-6">
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

                {/* Central Shield button */}
                <motion.button
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => setScreen('dashboard')}
                    aria-label="Щит — на главную"
                    className={cn(
                        "relative -top-6 w-[72px] h-[72px] rounded-[1.8rem] bg-gradient-to-br from-orange-400 to-red-600 p-[2px] shadow-[0_10px_25px_rgba(251,146,36,0.3)] flex items-center justify-center transition-all duration-500 group",
                        isConnected && "animate-pulse-glow"
                    )}
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-[#0a0f16] to-[#121824] m-[2px] rounded-[1.7rem] z-0 group-hover:from-orange-950/40 group-hover:to-red-950/40 transition-colors duration-300" />
                    <div className="absolute inset-0 p-3 z-10">
                        <ShieldLogo isConnected={isConnected} className="w-full h-full drop-shadow-xl" />
                    </div>
                    {/* Connected indicator ring */}
                    {isConnected && (
                        <motion.div
                            className="absolute inset-[-3px] rounded-[2rem] border border-orange-500/30 pointer-events-none"
                            animate={{ opacity: [0.3, 0.7, 0.3] }}
                            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
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
            whileTap={disabled ? undefined : { scale: 0.9 }}
            onClick={handleClick}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            aria-disabled={disabled || undefined}
            className={cn(
                "relative flex flex-col items-center justify-center gap-1.5 transition-all duration-300 w-16 group outline-none py-2",
                disabled
                    ? "text-white/15 cursor-not-allowed"
                    : active ? "text-orange-400" : "text-white/35 hover:text-white/60"
            )}
        >
            {/* Тултип */}
            <AnimatePresence>
                {showTooltip && disabledTooltip && (
                    <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.95 }}
                        className="absolute -top-14 left-1/2 -translate-x-1/2 whitespace-nowrap bg-black/95 text-white/90 text-[10px] font-bold px-3 py-1.5 rounded-lg border border-orange-500/20 shadow-xl z-[60]"
                    >
                        {disabledTooltip}
                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-black/90 border-r border-b border-white/10 rotate-45" />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Иконка с анимацией масштаба */}
            <motion.div
                animate={{ scale: active ? 1.1 : 1, y: active ? -1 : 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="relative z-10"
            >
                {icon}
            </motion.div>

            {/* Название */}
            <span className={cn(
                "text-[10px] font-bold tracking-wider transition-colors relative z-10",
                disabled
                    ? "text-white/15"
                    : active ? "text-orange-400" : "text-white/35 group-hover:text-white/60"
            )}>{label}</span>

            {/* Индикатор — маленькая точка-капля под текстом */}
            {active && !disabled && (
                <motion.div
                    layoutId="nav-indicator-dot"
                    className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-orange-400 shadow-[0_0_6px_2px_rgba(251,146,36,0.5)]"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
            )}
        </motion.button>
    );
}

