import { motion, useReducedMotion, type Variants } from "framer-motion";
import { useMemo, useId } from "react";

/* ──────────────────────────────────────────────────────────
   ShieldLogo — Premium animated SVG shield
   Matches "new logo.png" reference: metallic 3D shield with
   thick orange-gold beveled border, glowing V-chevron with
   a bright flare at the apex, two perspective orbital rings
   with golden satellite spheres.
   ────────────────────────────────────────────────────────── */

// ─── Shield path geometry ──────────────────────────────────
const SHIELD_OUTER =
  "M100 12 L180 38 V95 C180 148 100 190 100 190 C100 190 20 148 20 95 V38 Z";
const SHIELD_INNER =
  "M100 22 L170 44 V95 C170 142 100 180 100 180 C100 180 30 142 30 95 V44 Z";
const SHIELD_BEVEL =
  "M100 28 L164 47 V95 C164 138 100 174 100 174 C100 174 36 138 36 95 V47 Z";

// V-chevron paths (left/right halves for 3D split lighting)
const V_LEFT  = "M48 56 L100 140 L100 100 Z";
const V_RIGHT = "M152 56 L100 140 L100 100 Z";
const V_FULL  = "M48 56 L100 140 L152 56 L100 100 Z";

// ─── Animation variants ────────────────────────────────────
const pulseCore: Variants = {
  idle: { scale: 1, opacity: 0.7 },
  active: {
    scale: [1, 1.06, 1],
    opacity: [0.85, 1, 0.85],
    transition: { duration: 3, repeat: Infinity, ease: "easeInOut" },
  },
};

const flareVariants: Variants = {
  idle: { opacity: 0.15, scale: 0.6 },
  active: {
    opacity: [0.3, 0.7, 0.3],
    scale: [0.7, 1.3, 0.7],
    transition: { duration: 2.5, repeat: Infinity, ease: "easeInOut" },
  },
};

const particleDrift = (i: number): Variants => ({
  idle: { opacity: 0 },
  active: {
    y: [0, -20 - i * 6, 0],
    x: [0, (i % 2 === 0 ? 8 : -8), 0],
    opacity: [0, 0.9, 0],
    scale: [0.3, 1.4, 0.3],
    transition: {
      duration: 2.5 + i * 0.7,
      delay: i * 0.4,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
});

export function ShieldLogo({
  className,
  isConnected = false,
}: {
  className?: string;
  isConnected?: boolean;
}) {
  const prefersReduced = useReducedMotion();
  const uid = useId();

  // Unique IDs so multiple instances don't share filter/gradient ids
  const ids = useMemo(() => {
    const s = uid.replace(/:/g, "");
    return {
      shieldBg: `shBg${s}`,
      borderGrad: `brGr${s}`,
      borderHighlight: `brHi${s}`,
      innerBevel: `inBv${s}`,
      vGradL: `vgL${s}`,
      vGradR: `vgR${s}`,
      vHighlight: `vHl${s}`,
      glowHeavy: `glH${s}`,
      glowSoft: `glS${s}`,
      flare: `flr${s}`,
      satGrad: `stG${s}`,
    };
  }, [uid]);

  const state = isConnected ? "active" : "idle";
  const ringDur = prefersReduced ? 0 : isConnected ? 14 : 45;
  const ring2Dur = prefersReduced ? 0 : isConnected ? 22 : 60;

  return (
    <motion.svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ overflow: "visible" }}
      initial={false}
      animate={state}
    >
      <defs>
        {/* ── Shield body: dark metallic ── */}
        <linearGradient id={ids.shieldBg} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#2a2a2a" />
          <stop offset="45%" stopColor="#141414" />
          <stop offset="100%" stopColor="#080808" />
        </linearGradient>

        {/* ── Thick border gradient (gold→orange→red) ── */}
        <linearGradient id={ids.borderGrad} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%"  stopColor="#FFD54F" />
          <stop offset="25%" stopColor="#FFB300" />
          <stop offset="55%" stopColor="#FF6600" />
          <stop offset="85%" stopColor="#E53935" />
          <stop offset="100%" stopColor="#B71C1C" />
        </linearGradient>

        {/* ── Border inner highlight (bevel/shine) ── */}
        <linearGradient id={ids.borderHighlight} x1="30%" y1="0%" x2="70%" y2="100%">
          <stop offset="0%"  stopColor="#FFECB3" stopOpacity="0.7" />
          <stop offset="50%" stopColor="#FF8F00" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#BF360C" stopOpacity="0.6" />
        </linearGradient>

        {/* ── Inner bevel shadow ── */}
        <linearGradient id={ids.innerBevel} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.7" />
        </linearGradient>

        {/* ── V-chevron: Left (bright) ── */}
        <linearGradient id={ids.vGradL} x1="0%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%"  stopColor="#FFF9C4" />
          <stop offset="35%" stopColor="#FFD54F" />
          <stop offset="70%" stopColor="#FF8F00" />
          <stop offset="100%" stopColor="#E65100" />
        </linearGradient>

        {/* ── V-chevron: Right (darker, shadow side) ── */}
        <linearGradient id={ids.vGradR} x1="100%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%"  stopColor="#FFB74D" />
          <stop offset="40%" stopColor="#E65100" />
          <stop offset="80%" stopColor="#BF360C" />
          <stop offset="100%" stopColor="#7f1d00" />
        </linearGradient>

        {/* ── V inner highlight ── */}
        <linearGradient id={ids.vHighlight} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%"  stopColor="#FFFFFF" stopOpacity="0.9" />
          <stop offset="40%" stopColor="#FFECB3" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#FF6600" stopOpacity="0" />
        </linearGradient>

        {/* ── Satellite gradient ── */}
        <radialGradient id={ids.satGrad} cx="35%" cy="35%">
          <stop offset="0%"  stopColor="#FFFFFF" />
          <stop offset="30%" stopColor="#FFF176" />
          <stop offset="70%" stopColor="#FFB300" />
          <stop offset="100%" stopColor="#FF6600" />
        </radialGradient>

        {/* ── Glow filters ── */}
        <filter id={ids.glowHeavy} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="5" result="b1" />
          <feGaussianBlur stdDeviation="10" result="b2" />
          <feGaussianBlur stdDeviation="18" result="b3" />
          <feMerge>
            <feMergeNode in="b3" />
            <feMergeNode in="b2" />
            <feMergeNode in="b1" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={ids.glowSoft} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={ids.flare} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
      </defs>

      {/* ═══════════════════════════════════════════════════
          LAYER 1 — Ambient outer glow (connected only)
          ═══════════════════════════════════════════════════ */}
      <motion.ellipse
        cx="100" cy="105" rx="70" ry="65"
        fill="#FF6600"
        variants={{
          idle: { opacity: 0 },
          active: {
            opacity: [0.08, 0.16, 0.08],
            transition: { duration: 3, repeat: Infinity, ease: "easeInOut" },
          },
        }}
        filter={`url(#${ids.flare})`}
      />

      {/* ═══════════════════════════════════════════════════
          LAYER 2 — Rear orbital ring (behind shield)
          ═══════════════════════════════════════════════════ */}
      <motion.g
        style={{ transformOrigin: "100px 100px" }}
        animate={ringDur ? { rotate: 360 } : undefined}
        transition={{ duration: ringDur, repeat: Infinity, ease: "linear" }}
      >
        <g style={{ transformOrigin: "100px 100px", transform: "rotate(25deg) scaleY(0.38)" }}>
          {/* Solid ring */}
          <ellipse
            cx="100" cy="100" rx="138" ry="138"
            fill="none"
            stroke="#FF8C00"
            strokeWidth="2.2"
            opacity="0.7"
          />
          {/* Dashed overlay */}
          <ellipse
            cx="100" cy="100" rx="138" ry="138"
            fill="none"
            stroke="#FFB300"
            strokeWidth="1.5"
            strokeDasharray="12 18"
            opacity="0.5"
          />
          {/* Rear satellite */}
          <circle cx="-38" cy="100" r="9" fill={`url(#${ids.satGrad})`} filter={`url(#${ids.glowSoft})`} />
          <circle cx="-38" cy="100" r="3.5" fill="#FFF9C4" />
        </g>
      </motion.g>

      {/* ═══════════════════════════════════════════════════
          LAYER 2b — Second orbital ring (counter-rotating)
          ═══════════════════════════════════════════════════ */}
      <motion.g
        style={{ transformOrigin: "100px 100px" }}
        animate={ring2Dur ? { rotate: -360 } : undefined}
        transition={{ duration: ring2Dur, repeat: Infinity, ease: "linear" }}
      >
        <g style={{ transformOrigin: "100px 100px", transform: "rotate(-35deg) scaleY(0.32)" }}>
          <ellipse
            cx="100" cy="100" rx="155" ry="155"
            fill="none"
            stroke="#FFCA28"
            strokeWidth="1.2"
            strokeDasharray="8 24"
            opacity="0.35"
          />
        </g>
      </motion.g>

      {/* ═══════════════════════════════════════════════════
          LAYER 3 — THE SHIELD (static geometry)
          ═══════════════════════════════════════════════════ */}
      <g>
        {/* Outer border (thick, beveled gradient) */}
        <path d={SHIELD_OUTER} fill={`url(#${ids.borderGrad})`} />

        {/* Inner bevel shadow */}
        <path d={SHIELD_INNER} fill={`url(#${ids.innerBevel})`} />

        {/* Shield face (dark metallic) */}
        <path d={SHIELD_BEVEL} fill={`url(#${ids.shieldBg})`} />

        {/* Border highlight streak */}
        <path
          d={SHIELD_INNER}
          fill="none"
          stroke={`url(#${ids.borderHighlight})`}
          strokeWidth="1.5"
          strokeLinejoin="round"
          opacity="0.5"
        />

        {/* Subtle center seam for 3D volume */}
        <line x1="100" y1="28" x2="100" y2="174" stroke="#FFFFFF" strokeWidth="0.8" opacity="0.04" />
      </g>

      {/* ═══════════════════════════════════════════════════
          LAYER 4 — V-CHEVRON with split 3D lighting
          ═══════════════════════════════════════════════════ */}
      <motion.g variants={pulseCore} style={{ transformOrigin: "100px 100px" }}>
        {/* Bright flare behind V apex */}
        <motion.circle
          cx="100" cy="68" r="28"
          fill="#FFEA00"
          filter={`url(#${ids.flare})`}
          variants={flareVariants}
        />

        {/* Left face — bright / lit side */}
        <path d={V_LEFT} fill={`url(#${ids.vGradL})`} />

        {/* Right face — shadow side */}
        <path d={V_RIGHT} fill={`url(#${ids.vGradR})`} />

        {/* Edge highlight */}
        <path d={V_FULL} fill="none" stroke="#FFE082" strokeWidth="1" strokeLinejoin="round" opacity="0.6" />

        {/* Inner highlight (top area) */}
        <path
          d="M68 65 L100 120 L132 65 L100 92 Z"
          fill={`url(#${ids.vHighlight})`}
          opacity="0.5"
        />

        {/* Hot white core at the top of V */}
        <motion.circle
          cx="100" cy="72" r="6"
          fill="#FFFFFF"
          filter={`url(#${ids.glowSoft})`}
          variants={{
            idle: { opacity: 0.5, scale: 0.8 },
            active: {
              opacity: [0.6, 1, 0.6],
              scale: [0.8, 1.15, 0.8],
              transition: { duration: 2, repeat: Infinity, ease: "easeInOut" },
            },
          }}
        />
      </motion.g>

      {/* ═══════════════════════════════════════════════════
          LAYER 5 — Front orbital ring segment + satellite
          ═══════════════════════════════════════════════════ */}
      <motion.g
        style={{ transformOrigin: "100px 100px" }}
        animate={ringDur ? { rotate: 360 } : undefined}
        transition={{ duration: ringDur, repeat: Infinity, ease: "linear" }}
      >
        <g style={{ transformOrigin: "100px 100px", transform: "rotate(25deg) scaleY(0.38)" }}>
          {/* Front satellite — larger, with highlight */}
          <circle cx="238" cy="100" r="11" fill={`url(#${ids.satGrad})`} filter={`url(#${ids.glowHeavy})`} />
          <circle cx="238" cy="100" r="4.5" fill="#FFFDE7" />
        </g>
      </motion.g>

      {/* ═══════════════════════════════════════════════════
          LAYER 6 — Floating particles (connected state)
          ═══════════════════════════════════════════════════ */}
      {[
        { cx: 65, cy: 80, r: 2.2 },
        { cx: 135, cy: 115, r: 1.8 },
        { cx: 100, cy: 50, r: 2.5 },
        { cx: 80, cy: 145, r: 1.5 },
        { cx: 125, cy: 55, r: 2 },
        { cx: 55, cy: 120, r: 1.3 },
      ].map((p, i) => (
        <motion.circle
          key={i}
          cx={p.cx}
          cy={p.cy}
          r={p.r}
          fill="#FFEA00"
          filter={`url(#${ids.glowSoft})`}
          variants={particleDrift(i)}
        />
      ))}
    </motion.svg>
  );
}
