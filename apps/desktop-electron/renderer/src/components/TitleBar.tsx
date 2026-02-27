import { X, Minus, Square, Copy } from "lucide-react";
import { useRef, useEffect, useState } from "react";
import { getAPI } from "../lib/api";
import { magnetEffect } from "../lib/gsap-setup";
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
      className="h-9 w-full flex items-center justify-between px-4 fixed top-0 left-0 z-50 select-none"
      style={{
        WebkitAppRegion: "drag",
        background: "linear-gradient(180deg, rgba(3,3,8,0.95) 0%, rgba(3,3,8,0.4) 100%)",
        backdropFilter: "blur(16px)",
      } as any}
    >
      {/* Brand — ultra compact */}
      <div className="flex items-center gap-2">
        <ShieldLogo className="w-4 h-4" isConnected={true} />
        <span className="font-display text-[11px] font-semibold tracking-[0.2em] text-brand-light/70 uppercase">
          ES
        </span>
      </div>

      {/* Window controls */}
      <div className="flex items-center gap-0.5" style={{ WebkitAppRegion: "no-drag" } as any}>
        <WinButton onClick={handleMinimize} label="Свернуть">
          <Minus className="w-3 h-3" />
        </WinButton>
        <WinButton onClick={handleMaximize} label={isMaximized ? "Восстановить" : "Развернуть"}>
          {isMaximized ? <Copy className="w-3 h-3 rotate-180" /> : <Square className="w-2.5 h-2.5" />}
        </WinButton>
        <WinButton onClick={handleClose} label="Закрыть" danger>
          <X className="w-3 h-3" />
        </WinButton>
      </div>
    </div>
  );
}

function WinButton({ onClick, label, children, danger }: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    return magnetEffect(ref.current, { strength: 0.15, radius: 30 });
  }, []);

  return (
    <button
      ref={ref}
      onClick={onClick}
      aria-label={label}
      className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 ${
        danger
          ? "text-white/25 hover:text-red-400 hover:bg-red-500/10"
          : "text-white/25 hover:text-white/60 hover:bg-white/[0.05]"
      }`}
    >
      {children}
    </button>
  );
}
