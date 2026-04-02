import { motion } from "framer-motion";
import { Copy, Minus, Square, X } from "lucide-react";
import { type CSSProperties, type ReactElement, type ReactNode, useEffect, useState } from "react";
import { getAPI } from "../lib/api";
import { ShieldLogo } from "./ShieldLogo";

/* ──────────────────────────────────────────────────────────
   TitleBar v3 — Bigger, visible window controls.
   Close button red on hover. All buttons 10×10 hit area.
   ────────────────────────────────────────────────────────── */

type AppRegionStyle = CSSProperties & {
  WebkitAppRegion: "drag" | "no-drag";
};

const DRAG_REGION_STYLE: AppRegionStyle = {
  WebkitAppRegion: "drag",
  background: "linear-gradient(180deg, rgba(4,12,19,0.98) 0%, rgba(6,18,28,0.82) 100%)",
  backdropFilter: "blur(22px)"
};

const NO_DRAG_REGION_STYLE: AppRegionStyle = {
  WebkitAppRegion: "no-drag"
};

export function TitleBar(): ReactElement {
  const handleClose = (): void => {
    const api = getAPI();
    if (api) {
      api.window.close();
    } else {
      window.close();
    }
  };
  const handleMinimize = (): void => {
    const api = getAPI();
    if (api) {
      api.window.minimize();
    }
  };
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const api = getAPI();
    if (!api) {
      return () => {
        isMounted = false;
      };
    }

    const syncMaximizeState = async (): Promise<void> => {
      try {
        const nextState = await api.window.isMaximized();
        if (isMounted) {
          setIsMaximized(nextState);
        }
      } catch (error: unknown) {
        console.warn("[TitleBar] Failed to sync maximize state", error);
      }
    };

    void syncMaximizeState();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleMaximize = (): void => {
    const api = getAPI();
    if (api) {
      api.window
        .toggleMaximize()
        .then((nextState) => {
          setIsMaximized(nextState);
        })
        .catch((error: unknown) => {
          console.warn("[TitleBar] Failed to toggle maximize state", error);
        });
    }
  };

  return (
    <div
      className="relative h-10 w-full shrink-0 select-none sticky top-0 z-50"
      style={DRAG_REGION_STYLE}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.12] to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />
      <div className="flex h-full items-center justify-between px-4">
        {/* Brand — text only */}
        <div className="flex items-center gap-2.5">
          <ShieldLogo className="h-4 w-4 shrink-0" animated={false} />
          <span className="font-display text-[11px] font-bold tracking-[0.3em] text-brand/70 uppercase">
            EgoistShield
          </span>
        </div>

        {/* Window controls — bigger, more visible */}
        <div
          role="toolbar"
          aria-label="Управление окном"
          className="flex items-center gap-0"
          style={NO_DRAG_REGION_STYLE}
        >
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
  children: ReactNode;
  danger?: boolean;
}): ReactElement {
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
