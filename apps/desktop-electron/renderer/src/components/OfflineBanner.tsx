import { motion, AnimatePresence } from "framer-motion";
import { WifiOff, RefreshCw } from "lucide-react";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

/**
 * Анимированный баннер при потере интернет-соединения.
 * Auto-appear при offline, auto-dismiss при online.
 */
export function OfflineBanner() {
    const isOnline = useOnlineStatus();

    return (
        <AnimatePresence>
            {!isOnline && (
                <motion.div
                    initial={{ opacity: 0, y: -40, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto" }}
                    exit={{ opacity: 0, y: -40, height: 0 }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    className="relative z-40 overflow-hidden"
                >
                    <div className="flex items-center justify-center gap-3 px-4 py-2.5 bg-gradient-to-r from-red-500/15 via-orange-500/10 to-red-500/15 border-b border-red-500/20 backdrop-blur-md">
                        <motion.div
                            animate={{ scale: [1, 1.15, 1] }}
                            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        >
                            <WifiOff className="w-4 h-4 text-red-400" />
                        </motion.div>
                        <span className="text-sm font-bold text-red-300/90 tracking-wide">
                            Нет подключения к интернету
                        </span>
                        <span className="text-xs text-white/30">
                            Данные из кэша
                        </span>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
