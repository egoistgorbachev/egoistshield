import { motion } from "framer-motion";
import { ShieldLogo } from "./ShieldLogo";

/* ──────────────────────────────────────────────────────────
   SplashScreen v8 — "Clean Power" (Framer Motion Edition)
   No blur, no ember. Sharp icon, bright gradient, fast.
   ────────────────────────────────────────────────────────── */
export function SplashScreen() {
  const circumference = 2 * Math.PI * 18;

  return (
    <motion.div
      className="absolute inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden w-full h-screen"
      style={{ background: "#082032" }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Subtle radial gradient — circular shield brand center */}
      <div
        className="absolute w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(255,76,41,0.12) 0%, transparent 60%)"
        }}
      />

      <div className="relative z-10 flex flex-col items-center">
        {/* Unified circular shield mark */}
        <motion.div
          className="flex h-28 w-28 items-center justify-center will-change-transform"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.175, 0.885, 0.32, 1.275] }} // backOut approximation
        >
          <ShieldLogo size="large" />
        </motion.div>

        {/* Brand text */}
        <motion.h1
          className="mt-4 text-[22px] font-display font-bold uppercase"
          style={{
            background: "linear-gradient(135deg, #FFFFFF, #FF6B47, #FF4C29)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent"
          }}
          initial={{ opacity: 0, y: 15, letterSpacing: "0.5em" }}
          animate={{ opacity: 1, y: 0, letterSpacing: "0.2em" }}
          transition={{ duration: 0.6, delay: 0.6, ease: "easeOut" }}
        >
          EgoistShield
        </motion.h1>

        {/* Version */}
        <motion.span
          className="mt-1 text-[9px] font-mono-metric font-medium tracking-[0.3em] text-whisper uppercase"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 1.0 }}
        >
          v{__APP_VERSION__}
        </motion.span>

        {/* Progress ring */}
        <div className="mt-6 w-9 h-9">
          <svg viewBox="0 0 40 40" className="w-full h-full -rotate-90" aria-hidden="true" focusable="false">
            <circle cx="20" cy="20" r="18" fill="none" stroke="rgba(255,76,41,0.15)" strokeWidth="2.5" />
            <circle
              cx="20"
              cy="20"
              r="18"
              fill="none"
              stroke="url(#splash-ring-grad-v2)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset="0"
            />
            <defs>
              <linearGradient id="splash-ring-grad-v2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="100%" stopColor="#FF4C29" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>
    </motion.div>
  );
}
