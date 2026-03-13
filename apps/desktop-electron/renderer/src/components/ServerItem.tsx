import { motion } from "framer-motion";
import { Check, ChevronRight, Pencil, Power, Signal, Star, Trash2, Zap } from "lucide-react";
import { memo, useState } from "react";

import { cn } from "../lib/cn";
import type { ServerConfig } from "../store/useAppStore";
import { FlagIcon } from "./FlagIcon";

/* ──────────────────────────────────────────────────────────
   ServerItem v2 — Unified gradient button style.
   Connect button matches Power button on Dashboard.
   Pin/Delete show on hover, smooth transitions.
   ────────────────────────────────────────────────────────── */

export interface ServerItemProps extends ServerConfig {
  active: boolean;
  isConnected?: boolean;
  isConnecting?: boolean;
  onClick: () => void;
  onRemove: () => void;
  onPin: () => void;
  onConnectToggle?: () => void;
  onRename?: (newName: string) => void;
}

export const ServerItem = memo(function ServerItem({
  name,
  ping,
  countryCode,
  recommended,
  pinned,
  security,
  active,
  isConnected,
  isConnecting,
  onClick,
  onRemove,
  onPin,
  onConnectToggle,
  onRename
}: ServerItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(name);
  return (
    <motion.div
      onClick={onClick}
      whileHover={{ scale: 1.01, y: -1 }}
      whileTap={{ scale: 0.99 }}
      className={cn(
        "group relative p-4 rounded-2xl flex items-center justify-between cursor-pointer transition-all duration-300",
        active
          ? "bg-white/[0.03] border border-brand/25 shadow-[0_4px_24px_rgba(255,107,0,0.15),inset_0_1px_0_rgba(255,255,255,0.03)] overflow-hidden"
          : "hover:bg-white/[0.03] border border-white/5 hover:border-white/10"
      )}
    >
      {/* Active left accent bar */}
      {active && (
        <motion.div
          layoutId="server-active-bar"
          className="absolute left-0 inset-y-0 my-auto w-1 h-6 rounded-r-full bg-gradient-to-b from-[#FF8C38] to-[#FF4D00] shadow-[0_0_12px_rgba(255,107,0,0.5)]"
        />
      )}

      <div className="flex gap-3.5 items-center">
        <FlagIcon code={countryCode === "unknown" ? "un" : countryCode} size={40} />

        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-0.5">
            {isEditing ? (
              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      onRename?.(editName);
                      setIsEditing(false);
                    }
                    if (e.key === "Escape") {
                      setEditName(name);
                      setIsEditing(false);
                    }
                  }}
                  onBlur={() => {
                    onRename?.(editName);
                    setIsEditing(false);
                  }}
                  className="bg-white/5 border border-brand/30 rounded-lg px-2 py-0.5 text-sm font-bold text-white focus:outline-none focus:ring-1 focus:ring-brand/50 w-36"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRename?.(editName);
                    setIsEditing(false);
                  }}
                  className="p-1 bg-emerald-500/20 rounded-lg text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                >
                  <Check className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <span className={cn("font-bold text-[15px] transition-colors", active ? "text-white" : "text-white/85")}>
                {name}
              </span>
            )}
            {recommended && (
              <span
                className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md"
                style={{
                  background: "linear-gradient(135deg, rgba(255,107,0,0.15), rgba(255,107,0,0.08))",
                  border: "1px solid rgba(255,107,0,0.25)",
                  color: "#FF8C38"
                }}
              >
                ★ Рекомендуем
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={cn(
                "font-bold flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px]",
                ping > 0 && ping < 80
                  ? "text-emerald-400 bg-emerald-500/10"
                  : ping >= 80 && ping < 200
                    ? "text-amber-400 bg-amber-500/10"
                    : ping >= 200
                      ? "text-red-400 bg-red-500/10"
                      : "text-white/30 bg-white/5"
              )}
            >
              <Signal className="w-3 h-3" />
              {ping > 0 ? `${ping} мс` : "--"}
            </span>
            {/* Security badge */}
            {security === "reality" && (
              <span className="font-bold px-2 py-0.5 rounded-lg text-[10px] text-emerald-400 bg-emerald-500/10 uppercase tracking-wider">
                REALITY
              </span>
            )}
            {security === "tls" && (
              <span className="font-bold px-2 py-0.5 rounded-lg text-[10px] text-sky-400 bg-sky-500/10 uppercase tracking-wider">
                TLS
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {/* Rename button */}
        <motion.button
          onClick={(e) => {
            e.stopPropagation();
            setEditName(name);
            setIsEditing(true);
          }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white/15 hover:text-brand hover:bg-brand/10 transition-all opacity-0 group-hover:opacity-100"
        >
          <Pencil className="w-3.5 h-3.5" />
        </motion.button>

        {/* Favorite button */}
        <motion.button
          onClick={(e) => {
            e.stopPropagation();
            onPin();
          }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className={cn(
            "w-9 h-9 rounded-xl flex items-center justify-center transition-all",
            pinned
              ? "text-amber-400 bg-amber-400/10"
              : "text-white/15 hover:text-amber-400/50 hover:bg-white/5 opacity-0 group-hover:opacity-100"
          )}
          title={pinned ? "Убрать из избранного" : "Добавить в избранное"}
        >
          <Star className="w-3.5 h-3.5" fill={pinned ? "currentColor" : "none"} />
        </motion.button>

        {/* Delete button */}
        <motion.button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white/15 hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </motion.button>

        {/* Connect button — gradient style */}
        {active ? (
          <motion.button
            onClick={(e) => {
              e.stopPropagation();
              onConnectToggle?.();
            }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            disabled={isConnecting}
            className="ml-1.5 w-10 h-10 rounded-xl flex items-center justify-center relative overflow-hidden"
            style={{
              background: isConnecting
                ? "linear-gradient(135deg, #F59E0B, #D97706)"
                : isConnected
                  ? "linear-gradient(135deg, #059669, #10B981)"
                  : "linear-gradient(135deg, #FF4D00, #FF6B00)",
              boxShadow: isConnecting
                ? "0 4px 16px rgba(245,158,11,0.4)"
                : isConnected
                  ? "0 4px 16px rgba(16,185,129,0.4)"
                  : "0 4px 16px rgba(255,107,0,0.5)"
            }}
            title={isConnected ? "Отключить" : "Подключить"}
          >
            {/* Glass highlight */}
            <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent" />
            <div className="absolute inset-[1px] rounded-[10px] border border-white/10" />
            {isConnecting ? (
              <Zap className="w-4.5 h-4.5 text-white animate-pulse relative z-10" />
            ) : (
              <Power className="w-4.5 h-4.5 text-white relative z-10" strokeWidth={2.5} />
            )}
          </motion.button>
        ) : (
          <ChevronRight className="w-5 h-5 text-white/15 ml-1.5 group-hover:text-white/30 transition-colors" />
        )}
      </div>
    </motion.div>
  );
});
