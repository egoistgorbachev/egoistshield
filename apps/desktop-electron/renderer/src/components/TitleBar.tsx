import { motion } from "framer-motion";
import { Copy, Minus, Square, X } from "lucide-react";
import { useState } from "react";
import { getAPI } from "../lib/api";

/* ──────────────────────────────────────────────────────────
   TitleBar v3 — Bigger, visible window controls.
   Close button red on hover. All buttons 10×10 hit area.
   ────────────────────────────────────────────────────────── */

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
      (api?.window as any).maximize();
      setIsMaximized(!isMaximized);
    }
  };

  return (
    <div
      className="h-10 w-full flex items-center justify-between px-4 sticky top-0 z-50 select-none shrink-0"
      style={
        {
          WebkitAppRegion: "drag",
          background: "linear-gradient(180deg, rgba(5,5,8,0.98) 0%, rgba(5,5,8,0.7) 100%)",
          backdropFilter: "blur(20px)"
        } as any
      }
    >
      {/* Brand — text only */}
      <span className="font-display text-[11px] font-bold tracking-[0.3em] text-brand/70 uppercase">EgoistShield</span>

      {/* Window controls — bigger, more visible */}
      <div className="flex items-center gap-0" style={{ WebkitAppRegion: "no-drag" } as any}>
        <WinButton onClick={handleMinimize} label="Свернуть">
          <Minus className="w-4 h-4" strokeWidth={2} />
        </WinButton>
        <WinButton onClick={handleMaximize} label={isMaximized ? "Восстановить" : "Развернуть"}>
          {isMaximized ? <Copy className="w-3.5 h-3.5 rotate-180" /> : <Square className="w-3 h-3" />}
        </WinButton>
        <WinButton onClick={handleClose} label="Закрыть" danger>
          <X className="w-4 h-4" strokeWidth={2.5} />
        </WinButton>
      </div>
    </div>
  );
}

function WinButton({
  onClick,
  label,
  children,
  danger
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <motion.button
      onClick={onClick}
      aria-label={label}
      tabIndex={0}
      whileTap={{ scale: 0.95 }}
      className={`w-[46px] h-10 flex items-center justify-center transition-all duration-200 ${
        danger
          ? "text-white/50 hover:text-white hover:bg-red-500/25"
          : "text-white/50 hover:text-white/90 hover:bg-white/[0.08]"
      }`}
    >
      {children}
    </motion.button>
  );
}
