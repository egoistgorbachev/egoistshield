import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";

type HeroBadgeTone = "brand" | "accent" | "success" | "warning" | "neutral";
type HeroBadgeLayout = "rail" | "balanced";

export type PageHeroBadge = {
  label: string;
  icon?: ReactNode;
  tone?: HeroBadgeTone;
};

function getBadgeToneClass(tone: HeroBadgeTone): string {
  switch (tone) {
    case "brand":
      return "border-brand/22 bg-brand/10 text-brand-light";
    case "accent":
      return "border-cyan-500/22 bg-cyan-500/10 text-cyan-300";
    case "success":
      return "border-emerald-500/22 bg-emerald-500/10 text-emerald-300";
    case "warning":
      return "border-amber-500/22 bg-amber-500/10 text-amber-300";
    default:
      return "border-white/10 bg-white/[0.045] text-white/70";
  }
}

export function PageHero({
  eyebrow,
  title,
  description,
  icon,
  badges = [],
  badgeLayout = "rail",
  railAction,
  actions,
  className
}: {
  eyebrow?: string;
  title: string;
  description: ReactNode;
  icon: ReactNode;
  badges?: PageHeroBadge[];
  badgeLayout?: HeroBadgeLayout;
  railAction?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const shouldReduceMotion = useReducedMotion();
  const useBalancedBadges = badgeLayout === "balanced" && !railAction;

  return (
    <motion.section
      initial={shouldReduceMotion ? false : { opacity: 0, y: 10, scale: 0.988 }}
      animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        "relative overflow-hidden rounded-[28px] border border-white/10",
        "bg-[linear-gradient(180deg,rgba(6,23,35,0.97),rgba(8,28,42,0.9))]",
        "shadow-[0_18px_64px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.04)]",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,76,41,0.13),transparent_32%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.08),transparent_26%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/[0.03] to-transparent" />
      <div className="relative flex flex-col gap-4 px-4 py-4 sm:px-5 sm:py-5">
        <div className="min-w-0 max-w-4xl">
          {eyebrow ? (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.18em] text-white/58">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-brand-light shadow-[0_0_8px_rgba(255,107,71,0.62)]" />
              {eyebrow}
            </div>
          ) : null}

          <div className={cn("flex items-start gap-3", eyebrow ? "mt-3" : "")}>
            <div className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] shadow-[0_12px_28px_rgba(0,0,0,0.18)]">
              {icon}
            </div>
            <div className="min-w-0">
              <h1 className="text-[25px] font-display font-bold leading-tight text-white/96 sm:text-[27px]">{title}</h1>
              <p className="mt-2 max-w-3xl text-[12.5px] leading-relaxed text-muted sm:text-[13px]">{description}</p>
            </div>
          </div>

          {badges.length > 0 || railAction ? (
            <div className="mt-3.5 flex min-w-0 items-center gap-2">
              {badges.length > 0 ? (
                <div
                  data-testid="page-hero-badges"
                  className={cn(
                    "min-w-0 flex-1",
                    useBalancedBadges
                      ? "grid grid-cols-3 gap-2 overflow-hidden"
                      : "flex items-center gap-1.5 overflow-x-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                  )}
                >
                  {badges.map((badge) => (
                    <div
                      key={badge.label}
                      data-testid="page-hero-badge"
                      className={cn(
                        "inline-flex min-h-[30px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-[8.5px] font-bold uppercase tracking-[0.08em]",
                        useBalancedBadges ? "min-w-0 w-full justify-center overflow-hidden" : "shrink-0 whitespace-nowrap",
                        getBadgeToneClass(badge.tone ?? "neutral")
                      )}
                    >
                      {badge.icon ? (
                        <span className="inline-flex h-3.5 w-3.5 items-center justify-center">{badge.icon}</span>
                      ) : null}
                      <span className={cn("min-w-0", useBalancedBadges ? "truncate" : "whitespace-nowrap")}>
                        {badge.label}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex-1" />
              )}
              {railAction ? (
                <div data-testid="page-hero-rail-action" className="shrink-0 py-1">
                  {railAction}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {actions ? (
          <div data-testid="page-hero-actions" className="w-full">
            {actions}
          </div>
        ) : null}
      </div>
    </motion.section>
  );
}
