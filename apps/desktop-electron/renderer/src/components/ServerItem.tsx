import { memo } from "react";
import { motion } from "framer-motion";
import { Signal, ChevronRight, Trash2, Pin, Power, Zap } from "lucide-react";

import { cn } from "../lib/cn";
import type { ServerConfig } from "../store/useAppStore";
import { FlagIcon } from "./FlagIcon";

export interface ServerItemProps extends ServerConfig {
    active: boolean;
    isConnected?: boolean;
    isConnecting?: boolean;
    onClick: () => void;
    onRemove: () => void;
    onPin: () => void;
    onConnectToggle?: () => void;
}

export const ServerItem = memo(function ServerItem({
    name, ping, countryCode, recommended, pinned, active,
    isConnected, isConnecting, onClick, onRemove, onPin, onConnectToggle
}: ServerItemProps) {
    return (
        <div
            onClick={onClick}
            className={cn(
                "group relative p-4 rounded-[20px] flex items-center justify-between cursor-pointer transition-all duration-300",
                active
                    ? "bg-white/[0.04] border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] relative before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-1 before:h-10 before:bg-orange-500 before:rounded-r-full overflow-hidden"
                    : "bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 hover:border-white/10"
            )}
        >
            <div className="flex gap-4 items-center">
                <FlagIcon code={countryCode === 'unknown' ? 'un' : countryCode} size={40} />

                <div className="flex flex-col">
                    <div className="flex items-center gap-2 mb-1">
                        <span className={cn("font-bold text-base transition-colors", active ? "text-orange-50" : "text-white")}>
                            {name}
                        </span>
                        {recommended && (
                            <span className="px-1.5 py-0.5 bg-orange-500/20 text-orange-400 text-[10px] font-black uppercase tracking-wider rounded-md border border-orange-500/30">
                                Рекомендуем
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs max-[500px]:gap-2">
                        <span className={cn(
                            "font-black flex items-center gap-1 px-2 py-0.5 rounded-lg",
                            ping > 0 && ping < 80 ? "text-emerald-400 bg-emerald-500/15" :
                                ping >= 80 && ping < 200 ? "text-yellow-400 bg-yellow-500/15" :
                                    ping >= 200 ? "text-red-400 bg-red-500/15" :
                                        "text-white/30 bg-white/5"
                        )}>
                            <Signal className="w-3.5 h-3.5" />
                            {ping > 0 ? `${ping} мс` : '--'}
                        </span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-1">
                <button
                    onClick={(e) => { e.stopPropagation(); onPin(); }}
                    className={cn("w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                        pinned ? "text-orange-400 bg-orange-500/10" : "text-white/20 hover:text-white hover:bg-white/10 opacity-0 group-hover:opacity-100"
                    )}
                >
                    <Pin className="w-4 h-4" />
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white/20 hover:text-red-400 hover:bg-red-500/20 transition-all opacity-0 group-hover:opacity-100"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
                {active ? (
                    <button
                        onClick={(e) => { e.stopPropagation(); onConnectToggle?.(); }}
                        disabled={isConnecting}
                        className={cn(
                            "ml-2 w-10 h-10 rounded-[14px] flex items-center justify-center transition-all border backdrop-blur-md",
                            isConnecting ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/30" :
                                isConnected ? "bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20 hover:text-red-300" :
                                    "bg-orange-500/90 text-black border-orange-500/50 shadow-[0_4px_12px_rgba(249,115,22,0.3)] hover:bg-orange-400 hover:scale-105"
                        )}
                        title={isConnected ? "Отключить" : "Подключить"}
                    >
                        {isConnecting ? (
                            <Zap className="w-5 h-5 animate-pulse" />
                        ) : (
                            <Power className="w-5 h-5" />
                        )}
                    </button>
                ) : (
                    <ChevronRight className="w-6 h-6 text-white/20 ml-2 group-hover:text-white/40 transition-colors" />
                )}
            </div>
        </div>
    );
});
