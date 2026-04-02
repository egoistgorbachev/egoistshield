import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export function SegmentedTabs<T extends string>({
  label,
  items,
  activeId,
  onChange,
  className
}: {
  label: string;
  items: Array<{ id: T; label: string; icon?: ReactNode; badge?: string }>;
  activeId: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "relative flex w-full flex-wrap gap-1.5 rounded-[20px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
        className
      )}
    >
      {items.map((item) => {
        const isActive = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(item.id)}
            className={cn(
              "relative flex min-w-[108px] flex-1 items-center justify-center gap-2 rounded-[15px] px-3.5 py-2.5 text-[13px] font-semibold transition-all duration-300",
              isActive ? "text-white" : "text-subtle hover:text-white/75"
            )}
          >
            {isActive ? (
              <motion.div
                layoutId={`${label}-segment-active`}
                className="absolute inset-0 rounded-[15px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,76,41,0.16),rgba(34,211,238,0.07))] shadow-[0_10px_24px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.05)]"
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
              />
            ) : null}
            <span className="relative z-10 flex items-center gap-2">
              {item.icon ? <span className="inline-flex h-4 w-4 items-center justify-center">{item.icon}</span> : null}
              {item.label}
              {item.badge ? (
                <span className="rounded-full border border-white/10 bg-black/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-white/60">
                  {item.badge}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
