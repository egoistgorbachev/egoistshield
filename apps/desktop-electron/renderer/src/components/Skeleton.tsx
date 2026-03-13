import { cn } from "../lib/cn";

/**
 * Skeleton — shimmer placeholder для loading-состояний.
 * Вариант B+C: gradient sweep + content-aware layout.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden bg-white/[0.04] rounded-lg", className)}>
      <div
        className="absolute inset-0 animate-shimmer"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%)",
          backgroundSize: "200% 100%",
        }}
      />
    </div>
  );
}
