import { X, Minus, Square, Copy } from "lucide-react";
import { useState } from "react";
import { getAPI } from "../lib/api";

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
        <div className="h-10 w-full bg-gradient-to-b from-surface-app/80 to-transparent flex items-center justify-between px-4 fixed top-0 left-0 z-50 select-none backdrop-blur-sm border-b border-white/5" style={{ WebkitAppRegion: "drag" } as any}>
            <div className="flex items-center gap-2 drag-region">
                <span className="text-[14px] font-black tracking-[0.1em] bg-clip-text text-transparent bg-gradient-to-r from-orange-400 to-red-500 uppercase drop-shadow-[0_0_10px_rgba(249,115,22,0.4)]">EgoistShield</span>
            </div>

            <div role="toolbar" aria-label="Управление окном" className="flex items-center gap-2" style={{ WebkitAppRegion: "no-drag" } as any}>
                <button onClick={handleMinimize} aria-label="Свернуть" className="w-6 h-6 rounded flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition">
                    <Minus className="w-3.5 h-3.5" />
                </button>
                <button onClick={handleMaximize} aria-label={isMaximized ? "Восстановить" : "Развернуть"} className="w-6 h-6 rounded flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition">
                    {isMaximized ? <Copy className="w-3.5 h-3.5 rotate-180" /> : <Square className="w-3.5 h-3.5" />}
                </button>
                <button onClick={handleClose} aria-label="Закрыть" className="w-6 h-6 rounded flex items-center justify-center text-white/50 hover:text-red-400 hover:bg-red-400/20 transition">
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
}
