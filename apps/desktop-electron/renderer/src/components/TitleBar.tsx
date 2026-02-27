import { X, Minus, Square, Copy } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";
import { getAPI } from "../lib/api";
import { ShieldLogo } from "./ShieldLogo";

export function TitleBar() {
    const handleClose = () => {
        const api = getAPI();
        if (api) { api.window.close(); } else { window.close(); }
    };

    const handleMinimize = () => {
        const api = getAPI();
        if (api) { api.window.minimize(); }
    };

    const [isMaximized, setIsMaximized] = useState(false);

    const handleMaximize = () => {
        const api = getAPI();
        if ((api?.window as any)?.maximize) {
            (api!.window as any).maximize();
            setIsMaximized(!isMaximized);
        }
    };

    return (
        <div
            className="h-10 w-full flex items-center justify-between px-4 fixed top-0 left-0 z-50 select-none"
            style={{
                WebkitAppRegion: "drag",
                background: "linear-gradient(180deg, rgba(5,5,8,0.95) 0%, rgba(5,5,8,0.6) 60%, transparent 100%)",
                backdropFilter: "blur(12px)",
            } as any}
        >
            {/* Brand */}
            <div className="flex items-center gap-2.5 group">
                <motion.div
                    whileHover={{ rotate: 15, scale: 1.15 }}
                    transition={{ type: "spring", stiffness: 400, damping: 18 }}
                    className="relative"
                >
                    <ShieldLogo className="w-5 h-5" isConnected={true} />
                    <div className="absolute inset-0 rounded-full bg-brand/20 blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </motion.div>
                <span className="font-display text-[13px] font-bold tracking-[0.18em] bg-clip-text text-transparent bg-gradient-to-r from-brand-accent via-brand to-brand-hot uppercase">
                    EgoistShield
                </span>
            </div>

            {/* Window controls */}
            <div role="toolbar" aria-label="Управление окном" className="flex items-center gap-0.5" style={{ WebkitAppRegion: "no-drag" } as any}>
                {[
                    { action: handleMinimize, label: "Свернуть", icon: <Minus className="w-3.5 h-3.5" /> },
                    { action: handleMaximize, label: isMaximized ? "Восстановить" : "Развернуть", icon: isMaximized ? <Copy className="w-3.5 h-3.5 rotate-180" /> : <Square className="w-3 h-3" /> },
                ].map((btn, i) => (
                    <motion.button
                        key={i}
                        onClick={btn.action}
                        aria-label={btn.label}
                        whileHover={{ scale: 1.12 }}
                        whileTap={{ scale: 0.88 }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-all duration-200"
                    >
                        {btn.icon}
                    </motion.button>
                ))}
                <motion.button
                    onClick={handleClose}
                    aria-label="Закрыть"
                    whileHover={{ scale: 1.12 }}
                    whileTap={{ scale: 0.88 }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
                >
                    <X className="w-3.5 h-3.5" />
                </motion.button>
            </div>
        </div>
    );
}
