import { motion } from "framer-motion";
import { Activity, Check, ChevronRight, Pencil, Power, Star, Trash2, Zap } from "lucide-react";
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
  rank?: number;
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
  pinned,
  security,
  premium,
  active,
  isConnected,
  isConnecting,
  rank,
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
          ? cn(
              "bg-white/[0.03] border shadow-[0_4px_24px_rgba(38,201,154,0.15),inset_0_1px_0_rgba(255,255,255,0.03)] overflow-hidden",
              isConnected ? "border-emerald-500/30" : "border-white/10"
            )
          : "hover:bg-white/[0.03] border border-white/5 hover:border-white/10"
      )}
    >
      {/* Active left accent bar */}
      {active && (
        <motion.div
          layoutId="server-active-bar"
          className={cn(
            "absolute left-0 inset-y-0 my-auto w-1 h-6 rounded-r-full shadow-[0_0_12px_rgba(38,201,154,0.5)]",
            isConnected
              ? "bg-gradient-to-b from-emerald-400 to-emerald-500"
              : "bg-gradient-to-b from-white/40 to-white/20"
          )}
        />
      )}

      <div className="flex gap-3.5 items-center">
        <FlagIcon code={countryCode === "unknown" ? "un" : countryCode} size={40} />

        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-0.5">
            {isEditing ? (
              <div className="flex items-center gap-1.5" onMouseDown={(e) => e.stopPropagation()}>
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
                  type="button"
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
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={cn(
                "font-bold flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[11px] transition-colors",
                ping > 0 && ping < 80
                  ? "text-emerald-400 bg-emerald-500/10"
                  : ping >= 80 && ping < 200
                    ? "text-amber-400 bg-amber-500/10"
                    : ping >= 200
                      ? "text-red-400 bg-red-500/10"
                      : "text-white/30 bg-white/5"
              )}
              title={ping > 0 ? `Ping: ${ping} ms` : "Ping: --"}
            >
              <span className="relative flex h-2 w-2">
                {ping > 0 && (
                  <span
                    className={cn(
                      "animate-ping absolute inline-flex h-full w-full rounded-full opacity-30",
                      ping < 80 ? "bg-emerald-400" : ping < 200 ? "bg-amber-400" : "bg-red-400"
                    )}
                  />
                )}
                <span
                  className={cn(
                    "relative inline-flex rounded-full h-2 w-2 shadow-sm",
                    ping > 0
                      ? ping < 80
                        ? "bg-emerald-500 shadow-emerald-500/50"
                        : ping < 200
                          ? "bg-amber-500 shadow-amber-500/50"
                          : "bg-red-500 shadow-red-500/50"
                      : "bg-white/30"
                  )}
                />
              </span>
              {ping > 0 ? `${ping} мс` : "--"}
            </span>
            {rank != null && rank <= 3 && ping > 0 && (
              <span className="text-[11px]" title={`Rank #${rank}`}>
                {rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉"}
              </span>
            )}

            {/* Health / Load badge (pseudo-calculated from ping for now) */}
            {ping > 0 && (
              <span
                className={cn(
                  "font-bold flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] uppercase tracking-wider",
                  ping < 80
                    ? "text-emerald-400 bg-emerald-500/10"
                    : ping < 200
                      ? "text-amber-400 bg-amber-500/10"
                      : "text-red-400 bg-red-500/10"
                )}
              >
                <Activity className="w-2.5 h-2.5" />
                {ping < 80 ? "LOW LOAD" : ping < 200 ? "MEDIUM" : "HIGH LOAD"}
              </span>
            )}

            {/* Premium badge */}
            {premium && (
              <span className="font-bold flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] text-fuchsia-400 bg-fuchsia-500/10 uppercase tracking-wider">
                <Star className="w-2.5 h-2.5" fill="currentColor" />
                PREMIUM
              </span>
            )}

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
          title="Удалить"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </motion.button>

        {/* Connect / Quick Connect */}
        {active ? (
          <motion.button
            onClick={(e) => {
              e.stopPropagation();
              onConnectToggle?.();
            }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            disabled={isConnecting}
            className="ml-1.5 w-10 h-10 rounded-xl flex items-center justify-center relative overflow-hidden shrink-0"
            style={{
              background: isConnecting
                ? "linear-gradient(135deg, rgba(38,201,154,0.8), rgba(38,201,154,1))"
                : isConnected
                  ? "linear-gradient(135deg, rgba(38,201,154,0.8), rgba(38,201,154,1))"
                  : "linear-gradient(135deg, rgba(38,201,154,0.8), rgba(38,201,154,1))",
              boxShadow: isConnecting
                ? "0 4px 16px rgba(38,201,154,0.4)"
                : isConnected
                  ? "0 4px 16px rgba(38,201,154,0.4)"
                  : "0 4px 16px rgba(38,201,154,0.4)"
            }}
            title={isConnected ? "Отключить" : "Подключить"}
          >
            <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent" />
            <div className="absolute inset-[1px] rounded-[10px] border border-white/10" />
            {isConnecting ? (
              <Zap className="w-4.5 h-4.5 text-white animate-pulse relative z-10" />
            ) : (
              <Power className="w-4.5 h-4.5 text-white relative z-10" strokeWidth={2.5} />
            )}
          </motion.button>
        ) : (
          <div className="relative flex items-center justify-end w-32 h-10 ml-1.5 shrink-0">
            <ChevronRight className="w-5 h-5 text-white/15 group-hover:opacity-0 transition-opacity absolute right-2.5" />
            <motion.button
              onClick={(e) => {
                e.stopPropagation();
                onClick();
                onConnectToggle?.();
              }}
              className="absolute right-0 w-max px-3.5 h-9 rounded-xl text-[11px] font-bold opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center gap-1.5 translate-x-2 group-hover:translate-x-0 pointer-events-none group-hover:pointer-events-auto"
              style={{
                background: "linear-gradient(135deg, rgba(38,201,154,0.8), rgba(38,201,154,1))",
                color: "#fff",
                boxShadow: "0 4px 16px rgba(38,201,154,0.4), inset 0 1px 0 rgba(255,255,255,0.1)"
              }}
            >
              <Power className="w-3.5 h-3.5" />
              Подключить
            </motion.button>
          </div>
        )}
      </div>
    </motion.div>
  );
});
