import { motion } from "framer-motion";
import { useId, useMemo } from "react";

/* ──────────────────────────────────────────────────────────
   ShieldLogo v7 — "Inferno Bolt"
   2026 Design: Clean sharp shield with lightning bolt.
   No rings, no orbits. Pure geometric power.
   Connected = cyan shift. Disconnected = turquoise brand.
   ────────────────────────────────────────────────────────── */

export function ShieldLogo({
  className,
  isConnected = false,
  size = "default"
}: {
  className?: string;
  isConnected?: boolean;
  size?: "small" | "default" | "large";
}) {
  const uid = useId();
  const ids = useMemo(() => {
    const s = uid.replace(/:/g, "");
    return {
      shieldGrad: `sG_${s}`,
      boltGrad: `bG_${s}`,
      glowFilter: `gF_${s}`,
      bgGlow: `bg_${s}`
    };
  }, [uid]);

  // ── Palette ──
  const shieldC1 = isConnected ? "#C03010" : "#E0401E";
  const shieldC2 = isConnected ? "#FF4C29" : "#FF4C29";
  const shieldC3 = isConnected ? "#FF8A6C" : "#FF6B47";
  const boltC1 = isConnected ? "#FFFFFF" : "#FFFFFF";
  const boltC2 = isConnected ? "#FFD6A5" : "#FFD6A5";
  const glowColor = isConnected ? "rgba(255,76,41,0.6)" : "rgba(255,76,41,0.5)";
  const pixelSize = size === "small" ? 64 : size === "large" ? 144 : 104;

  return (
    <motion.svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      style={{ overflow: "visible", width: pixelSize, height: pixelSize }}
    >
      <defs>
        {/* Shield gradient */}
        <linearGradient id={ids.shieldGrad} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor={shieldC3} />
          <stop offset="50%" stopColor={shieldC2} />
          <stop offset="100%" stopColor={shieldC1} />
        </linearGradient>

        {/* Bolt gradient */}
        <linearGradient id={ids.boltGrad} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor={boltC1} />
          <stop offset="100%" stopColor={boltC2} />
        </linearGradient>

        {/* Crisp glow filter */}
        <filter id={ids.glowFilter} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Background glow */}
        <radialGradient id={ids.bgGlow} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={glowColor} />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>

      {/* === AMBIENT GLOW === */}
      <motion.circle
        cx="100"
        cy="100"
        r="65"
        fill={`url(#${ids.bgGlow})`}
        animate={{
          r: isConnected ? [65, 72, 65] : [65, 70, 65],
          opacity: isConnected ? [0.5, 0.7, 0.5] : [0.3, 0.5, 0.3]
        }}
        transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
      />

      {/* === SHIELD SHAPE === */}
      <motion.path
        d="M100 30
           C100 30, 145 40, 160 50
           C160 50, 162 110, 140 145
           C125 170, 100 180, 100 180
           C100 180, 75 170, 60 145
           C38 110, 40 50, 40 50
           C55 40, 100 30, 100 30Z"
        fill={`url(#${ids.shieldGrad})`}
        filter={`url(#${ids.glowFilter})`}
        animate={{
          scale: isConnected ? [1, 1.03, 1] : 1
        }}
        transition={{ duration: 2.5, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
        style={{ transformOrigin: "100px 105px" }}
      />

      {/* === SHIELD INNER BORDER (glass effect) === */}
      <path
        d="M100 40
           C100 40, 140 48, 152 56
           C152 56, 154 108, 135 138
           C122 160, 100 170, 100 170
           C100 170, 78 160, 65 138
           C46 108, 48 56, 48 56
           C60 48, 100 40, 100 40Z"
        fill="none"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth="1"
      />

      {/* === LIGHTNING BOLT === */}
      <motion.path
        d="M108 55 L88 108 L104 108 L92 155 L120 98 L104 98 L116 55Z"
        fill={`url(#${ids.boltGrad})`}
        filter={`url(#${ids.glowFilter})`}
        animate={{
          opacity: isConnected ? [1, 0.9, 1] : [0.95, 0.85, 0.95],
          scale: isConnected ? [1, 1.05, 1] : 1
        }}
        transition={{ duration: 1.8, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
        style={{ transformOrigin: "104px 105px" }}
      />

      {/* === SPECULAR HIGHLIGHT === */}
      <path
        d="M100 38
           C100 38, 135 45, 148 52
           C148 52, 124 38, 100 38Z"
        fill="white"
        opacity={0.25}
      />
    </motion.svg>
  );
}
