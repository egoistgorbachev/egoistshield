import { X, Minus, Square, Copy } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";
import { getAPI } from "../lib/api";
import { ShieldLogo } from "./ShieldLogo";

export function TitleBar() {
    const handleClose = () => {
        const api = getAPI();
        if (api) {
            api.window.close();
        } else {
            window.close();
        }
    };

    const handleMinimize = () => {
        const api = getAPI();
        if (api) {
            api.window.minimize();
        }
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
        <div className="h-10 w-full bg-gradient-to-b from-surface-app/90 via-surface-app/60 to-transparent flex items-center justify-between px-4 fixed top-0 left-0 z-50 select-none backdrop-blur-md border-b border-white/[0.04]" style={{ WebkitAppRegion: "drag" } as any}>
            <div className="flex items-center gap-2.5 drag-region group">
                <motion.div
                    whileHover={{ rotate: 15, scale: 1.1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                >
                    <ShieldLogo className="w-5 h-5 drop-shadow-[0_0_8px_rgba(255,102,0,0.4)]" isConnected={true} />
                </motion.div>
                <span className="text-[14px] font-black tracking-[0.12em] bg-clip-text text-transparent bg-gradient-to-r from-brand-light via-brand to-brand-hot uppercase text-glow-brand">EgoistShield</span>
            </div>

            <div role="toolbar" aria-label="Управление окном" className="flex items-center gap-1" style={{ WebkitAppRegion: "no-drag" } as any}>
                <motion.button
                    onClick={handleMinimize}
                    aria-label="Свернуть"
                    whileHover={{ scale: 1.15 }}
                    whileTap={{ scale: 0.9 }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/[0.08] transition-colors duration-200"
                >
                    <Minus className="w-3.5 h-3.5" />
                </motion.button>
                <motion.button
                    onClick={handleMaximize}
                    aria-label={isMaximized ? "Восстановить" : "Развернуть"}
                    whileHover={{ scale: 1.15 }}
                    whileTap={{ scale: 0.9 }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/[0.08] transition-colors duration-200"
                >
                    {isMaximized ? <Copy className="w-3.5 h-3.5 rotate-180" /> : <Square className="w-3.5 h-3.5" />}
                </motion.button>
                <motion.button
                    onClick={handleClose}
                    aria-label="Закрыть"
                    whileHover={{ scale: 1.15, backgroundColor: "rgba(239, 68, 68, 0.15)" }}
                    whileTap={{ scale: 0.9 }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-red-400 transition-colors duration-200"
                >
                    <X className="w-3.5 h-3.5" />
                </motion.button>
            </div>
        </div>
    );
}

