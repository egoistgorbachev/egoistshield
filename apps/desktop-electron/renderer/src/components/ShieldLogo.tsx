import { cn } from "../lib/cn";

const SHIELD_LOGO_SRC = "./assets/shield-logo.png";

export function ShieldLogo({
  className,
  animated = true,
  isConnected = false,
  size = "default"
}: {
  className?: string;
  animated?: boolean;
  isConnected?: boolean;
  size?: "small" | "default" | "large";
}) {
  const pixelSize = size === "small" ? 64 : size === "large" ? 144 : 104;

  return (
    <img
      src={SHIELD_LOGO_SRC}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn(
        "block select-none object-contain",
        !className && size === "small" && "h-16 w-16",
        !className && size === "default" && "h-[104px] w-[104px]",
        !className && size === "large" && "h-36 w-36",
        animated && "transition-transform duration-300",
        isConnected
          ? "drop-shadow-[0_0_18px_rgba(83,217,161,0.28)]"
          : "drop-shadow-[0_8px_24px_rgba(255,96,64,0.18)]",
        className
      )}
      style={className ? undefined : { width: pixelSize, height: pixelSize }}
    />
  );
}
