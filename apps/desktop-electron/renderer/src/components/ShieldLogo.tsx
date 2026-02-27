import { motion } from "framer-motion";
import { useMemo, useId, useRef, useEffect } from "react";
import { gsap } from "../lib/gsap-setup";

/* ──────────────────────────────────────────────────────────
   ShieldLogo v2 — "Void Prism" 
   Ultra-minimalist, high-end 3D geometric logo. 
   An isometric floating monolith composed of crystalline fragments 
   that form a sleek "S" / "Shield" silhouette.
   Features GSAP 3D rotations, glassmorphic layers, and vivid gradients.
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
    };
  }, [uid]);

  const containerRef = useRef<SVGSVGElement>(null);
  const coreRef = useRef<SVGGElement>(null);
  const ringRef = useRef<SVGEllipseElement>(null);
  const leftShardRef = useRef<SVGPathElement>(null);
  const rightShardRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    
    // Core floating animation
    gsap.to(coreRef.current, {
      y: -8,
      duration: 3,
      repeat: Infinity,
      yoyo: true,
      ease: "sine.inOut"
    });

    // Orbital ring rotation + 3D tilt
    gsap.to(ringRef.current, {
      rotateZ: 360,
      duration: isConnected ? 8 : 20,
      repeat: Infinity,
      ease: "linear",
      transformOrigin: "100px 100px"
    });

    // Right shard opposing float
    gsap.to(rightShardRef.current, {
      y: 5,
      x: 2,
      duration: 4,
      repeat: Infinity,
      yoyo: true,
      ease: "power1.inOut"
    });

    // Left shard opposing float
    gsap.to(leftShardRef.current, {
      y: -5,
      x: -2,
      duration: 3.5,
      repeat: Infinity,
      yoyo: true,
      ease: "power1.inOut"
    });

  }, [isConnected]);

  // Color logic
  // Disconnected: cool indigo & violet
  // Connected: vibrant emerald & cyan
  const cLeft = isConnected ? ["#059669", "#34D399"] : ["#4F46E5", "#818CF8"];
  const cRight = isConnected ? ["#A7F3D0", "#10B981"] : ["#C7D2FE", "#6366F1"];
  const cCore = isConnected ? ["#34D399", "#A7F3D0", "#ffffff"] : ["#818CF8", "#C7D2FE", "#ffffff"];

  return (
    <motion.svg
      ref={containerRef}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
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
          <stop offset="50%" stopColor={cCore[1]} />
          <stop offset="100%" stopColor={cCore[2]} />
        </linearGradient>

        {/* Glossy overlay for shards */}
        <linearGradient id={ids.glassGlow} x1="0%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
          <stop offset="40%" stopColor="#ffffff" stopOpacity="0.1" />
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
          <feGaussianBlur stdDeviation="12" result="blur1" />
          <feGaussianBlur stdDeviation="24" result="blur2" />
          <feMerge>
            <feMergeNode in="blur2" />
            <feMergeNode in="blur1" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g style={{ transformOrigin: "100px 100px", transform: "perspective(600px) rotateX(20deg) rotateY(-15deg)" }}>
        
        {/* === AMBIENT BACK GLOW === */}
        <motion.circle
          cx="100" cy="100" r="45"
          fill={`url(#${ids.gradRight})`}
          filter={`url(#${ids.glowHeavy})`}
          opacity={isConnected ? 0.4 : 0.15}
          animate={{
            scale: isConnected ? [1, 1.2, 1] : 1,
            opacity: isConnected ? [0.3, 0.5, 0.3] : [0.1, 0.2, 0.1],
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* === 3D ORBITAL RING === */}
        <motion.ellipse
          ref={ringRef}
          cx="100" cy="100" rx="85" ry="85"
          fill="none"
          stroke={`url(#${ids.gradRight})`}
          strokeWidth="1.5"
          strokeDasharray="2 12"
          strokeLinecap="round"
          opacity={0.4}
          style={{ transformOrigin: "100px 100px", transform: "rotateX(60deg) rotateY(15deg)" }}
        />
        <motion.ellipse
          cx="100" cy="100" rx="100" ry="100"
          fill="none"
          stroke={`url(#${ids.gradLeft})`}
          strokeWidth="0.5"
          opacity={0.2}
          style={{ transformOrigin: "100px 100px", transform: "rotateX(60deg) rotateY(-15deg)" }}
        />

        {/* === LEFT SHARD (Darker, background) === 
            Isometric geometric wing representing security layer
        */}
        <path
          ref={leftShardRef}
          d="M 40 70 L 100 30 L 120 40 L 60 85 V 155 L 40 145 Z"
          fill={`url(#${ids.gradLeft})`}
          opacity="0.9"
        />
        {/* Left Shard Bevel / Shine */}
        <path
          d="M 40 70 L 100 30 L 120 40 L 60 85 V 155 L 40 145 Z"
          fill="none"
          stroke={`url(#${ids.glassGlow})`}
          strokeWidth="1.5"
          opacity="0.6"
        />

        {/* === RIGHT SHARD (Brighter, foreground) === 
            Overlapping wing creating negative space "S"/"Shield" 
        */}
        <path
          ref={rightShardRef}
          d="M 160 130 L 100 170 L 80 160 L 140 115 V 45 L 160 55 Z"
          fill={`url(#${ids.gradRight})`}
          opacity="0.95"
          filter={`drop-shadow(-8px 12px 12px rgba(0,0,0,0.5)) drop-shadow(-20px 20px 20px rgba(0,0,0,0.3))`}
        />
        {/* Right Shard Shine */}
        <path
          d="M 160 130 L 100 170 L 80 160 L 140 115 V 45 L 160 55 Z"
          fill="none"
          stroke={`url(#${ids.glassGlow})`}
          strokeWidth="1.5"
          opacity="0.8"
        />

        {/* === CENTRAL FLOATING CORE === */}
        <g ref={coreRef}>
          <motion.polygon
            points="100 75, 120 100, 100 125, 80 100"
            fill={`url(#${ids.gradCore})`}
            filter={`url(#${ids.glowSoft})`}
            animate={{
              scale: isConnected ? [1, 1.1, 1] : 1,
            }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          {/* Core high-gloss highlight */}
          <polygon
            points="100 75, 120 100, 100 100, 80 100"
            fill="#ffffff"
            opacity="0.5"
          />
          <polygon
            points="100 75, 106 82, 100 100, 94 82"
            fill="#ffffff"
            opacity="0.9"
            filter={`url(#${ids.glowSoft})`}
          />
        </g>
        
      </g>
    </motion.svg>
  );
}
