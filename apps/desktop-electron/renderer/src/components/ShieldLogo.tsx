import { motion } from "framer-motion";
import { useMemo, useId, useRef, useEffect } from "react";
import { gsap } from "../lib/gsap-setup";

/* ──────────────────────────────────────────────────────────
   ShieldLogo v3 — "Void Prism 3D Hyper-Glow" 
   Ultra-minimalist, high-end 3D geometric logo. 
   An isometric floating monolith composed of crystalline fragments 
   that form a sleek "S" / "Shield" silhouette.
   Features Extreme GSAP 3D rotations, intense glassmorphic layers, 
   super high contrast neon gradients and immense drop-shadows.
   ────────────────────────────────────────────────────────── */

export function ShieldLogo({
  className,
  isConnected = false,
}: {
  className?: string;
  isConnected?: boolean;
}) {
  const uid = useId();
  const ids = useMemo(() => {
    const s = uid.replace(/:/g, "");
    return {
      gradLeft: `gL_${s}`,
      gradRight: `gR_${s}`,
      gradCore: `gC_${s}`,
      glowSoft: `glowS_${s}`,
      glowHeavy: `glowH_${s}`,
      glassGlow: `glass_${s}`,
      neonGlow: `neonG_${s}`,
    };
  }, [uid]);

  const containerRef = useRef<SVGSVGElement>(null);
  const coreRef = useRef<SVGGElement>(null);
  const ringRef = useRef<SVGEllipseElement>(null);
  const ringOuterRef = useRef<SVGEllipseElement>(null);
  const leftShardRef = useRef<SVGPathElement>(null);
  const rightShardRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    
    // Core floating animation - more dynamic
    gsap.to(coreRef.current, {
      y: -12,
      scale: 1.05,
      rotationZ: 2,
      duration: 3.5,
      repeat: Infinity,
      yoyo: true,
      ease: "power2.inOut"
    });

    // Orbital ring rotation + 3D tilt
    gsap.to(ringRef.current, {
      rotateZ: 360,
      duration: isConnected ? 4 : 15,
      repeat: Infinity,
      ease: "linear",
      transformOrigin: "100px 100px"
    });

    gsap.to(ringOuterRef.current, {
      rotateZ: -360,
      duration: isConnected ? 8 : 25,
      repeat: Infinity,
      ease: "linear",
      transformOrigin: "100px 100px"
    });

    // Right shard opposing float
    gsap.to(rightShardRef.current, {
      y: 8,
      x: 3,
      rotationY: 5,
      duration: 4.5,
      repeat: Infinity,
      yoyo: true,
      ease: "sine.inOut"
    });

    // Left shard opposing float
    gsap.to(leftShardRef.current, {
      y: -8,
      x: -3,
      rotationX: 5,
      duration: 3.8,
      repeat: Infinity,
      yoyo: true,
      ease: "sine.inOut"
    });

  }, [isConnected]);

  // Color logic
  // Disconnected: cool indigo & violet
  // Connected: vibrant emerald & cyan
  const cLeft = isConnected ? ["#059669", "#34D399"] : ["#3730A3", "#6366F1"];
  const cRight = isConnected ? ["#6EE7B7", "#059669"] : ["#818CF8", "#4338CA"];
  const cCore = isConnected ? ["#10B981", "#D1FAE5", "#ffffff"] : ["#4F46E5", "#E0E7FF", "#ffffff"];
  const neonColor = isConnected ? "rgba(52, 211, 153, 0.8)" : "rgba(99, 102, 241, 0.8)";

  return (
    <motion.svg
      ref={containerRef}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      initial={{ opacity: 0, scale: 0.8, filter: "brightness(0.5)" }}
      animate={{ opacity: 1, scale: 1, filter: "brightness(1)" }}
      transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
      style={{ overflow: "visible" }}
    >
      <defs>
        <linearGradient id={ids.gradLeft} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={cLeft[0]} />
          <stop offset="100%" stopColor={cLeft[1]} />
        </linearGradient>

        <linearGradient id={ids.gradRight} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={cRight[0]} />
          <stop offset="100%" stopColor={cRight[1]} />
        </linearGradient>

        <linearGradient id={ids.gradCore} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={cCore[0]} />
          <stop offset="40%" stopColor={cCore[1]} />
          <stop offset="100%" stopColor={cCore[2]} />
        </linearGradient>

        {/* Glossy overlay for shards */}
        <linearGradient id={ids.glassGlow} x1="0%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="30%" stopColor="#ffffff" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>

        <filter id={ids.glowSoft} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id={ids.glowHeavy} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="15" result="blur1" />
          <feGaussianBlur stdDeviation="30" result="blur2" />
          <feMerge>
            <feMergeNode in="blur2" />
            <feMergeNode in="blur1" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id={ids.neonGlow} x="-150%" y="-150%" width="400%" height="400%">
          <feDropShadow dx="0" dy="0" stdDeviation="12" floodColor={isConnected ? "#10B981" : "#4F46E5"} floodOpacity="0.8" result="shadow1" />
          <feDropShadow dx="0" dy="8" stdDeviation="25" floodColor={isConnected ? "#059669" : "#3730A3"} floodOpacity="0.6" result="shadow2" />
          <feMerge>
            <feMergeNode in="shadow2" />
            <feMergeNode in="shadow1" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g style={{ transformOrigin: "100px 100px", transform: "perspective(800px) rotateX(25deg) rotateY(-20deg)" }}>
        
        {/* === AMBIENT BACK GLOW === */}
        <motion.circle
          cx="100" cy="100" r="45"
          fill={`url(#${ids.gradRight})`}
          filter={`url(#${ids.glowHeavy})`}
          opacity={isConnected ? 0.6 : 0.25}
          animate={{
            scale: isConnected ? [1, 1.3, 1] : 1,
            opacity: isConnected ? [0.5, 0.8, 0.5] : [0.2, 0.4, 0.2],
          }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* === 3D ORBITAL RING === */}
        <motion.ellipse
          ref={ringRef}
          cx="100" cy="100" rx="90" ry="90"
          fill="none"
          stroke={`url(#${ids.gradRight})`}
          strokeWidth="2"
          strokeDasharray="4 16"
          strokeLinecap="round"
          opacity={0.6}
          filter={`url(#${ids.glowSoft})`}
          style={{ transformOrigin: "100px 100px", transform: "rotateX(65deg) rotateY(20deg)" }}
        />
        <motion.ellipse
          ref={ringOuterRef}
          cx="100" cy="100" rx="110" ry="110"
          fill="none"
          stroke={`url(#${ids.gradLeft})`}
          strokeWidth="1"
          strokeDasharray="2 30"
          opacity={0.4}
          filter={`url(#${ids.glowSoft})`}
          style={{ transformOrigin: "100px 100px", transform: "rotateX(65deg) rotateY(-20deg)" }}
        />

        {/* === LEFT SHARD (Darker, background) === */}
        <path
          ref={leftShardRef}
          d="M 40 70 L 100 30 L 120 40 L 60 85 V 155 L 40 145 Z"
          fill={`url(#${ids.gradLeft})`}
          opacity="0.9"
          filter={`url(#${ids.neonGlow})`}
        />
        {/* Left Shard Bevel / Shine */}
        <path
          d="M 40 70 L 100 30 L 120 40 L 60 85 V 155 L 40 145 Z"
          fill="none"
          stroke={`url(#${ids.glassGlow})`}
          strokeWidth="2"
          opacity="0.7"
        />

        {/* === RIGHT SHARD (Brighter, foreground) === */}
        <path
          ref={rightShardRef}
          d="M 160 130 L 100 170 L 80 160 L 140 115 V 45 L 160 55 Z"
          fill={`url(#${ids.gradRight})`}
          opacity="0.95"
          filter={`url(#${ids.neonGlow})`}
        />
        {/* Right Shard Shine */}
        <path
          d="M 160 130 L 100 170 L 80 160 L 140 115 V 45 L 160 55 Z"
          fill="none"
          stroke={`url(#${ids.glassGlow})`}
          strokeWidth="2.5"
          opacity="0.9"
        />

        {/* === CENTRAL FLOATING CORE === */}
        <g ref={coreRef} filter={`url(#${ids.neonGlow})`}>
          <motion.polygon
            points="100 75, 120 100, 100 125, 80 100"
            fill={`url(#${ids.gradCore})`}
            animate={{
              scale: isConnected ? [1, 1.25, 1] : 1,
            }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          />
          {/* Core high-gloss highlight */}
          <polygon
            points="100 75, 120 100, 100 100, 80 100"
            fill="#ffffff"
            opacity="0.6"
          />
          <polygon
            points="100 75, 106 82, 100 100, 94 82"
            fill="#ffffff"
            opacity="1"
            filter={`url(#${ids.glowSoft})`}
          />
        </g>
        
      </g>
    </motion.svg>
  );
}
