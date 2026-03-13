import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import { useEffect, useRef } from "react";
import { gsap } from "../lib/gsap-setup";

/* ──────────────────────────────────────────────────────────
   SplashScreen v7 — "Clean Power"  
   No blur, no ember. Sharp icon, bright gradient, fast.
   ────────────────────────────────────────────────────────── */
export function SplashScreen() {
  const containerRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLHeadingElement>(null);
  const versionRef = useRef<HTMLSpanElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

    if (logoRef.current) {
      tl.fromTo(
        logoRef.current,
        { scale: 0.5, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.8, ease: "back.out(1.4)" },
        0.1
      );
    }

    if (textRef.current) {
      tl.fromTo(
        textRef.current,
        { opacity: 0, y: 15, letterSpacing: "0.5em" },
        { opacity: 1, y: 0, letterSpacing: "0.2em", duration: 0.6 },
        "-=0.3"
      );
    }
    if (versionRef.current) {
      tl.fromTo(versionRef.current, { opacity: 0 }, { opacity: 1, duration: 0.3 }, "-=0.2");
    }

    if (ringRef.current) {
      const circumference = 2 * Math.PI * 18;
      ringRef.current.style.strokeDasharray = `${circumference}`;
      ringRef.current.style.strokeDashoffset = `${circumference}`;

      tl.to(
        ringRef.current,
        {
          strokeDashoffset: 0,
          duration: 1,
          ease: "power2.inOut"
        },
        "-=0.1"
      );
    }

    return () => {
      tl.kill();
    };
  }, []);

  return (
    <motion.div
      ref={containerRef}
      className="absolute inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden w-full h-screen"
      style={{ background: "#030305" }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Subtle radial gradient — bright orange center */}
      <div
        className="absolute w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(255,107,0,0.12) 0%, transparent 60%)"
        }}
      />

      <div className="relative z-10 flex flex-col items-center">
        {/* Shield + Bolt Icon */}
        <div
          ref={logoRef}
          className="w-28 h-28 flex items-center justify-center will-change-transform"
          style={{ opacity: 0 }}
        >
          <div className="relative w-20 h-20">
            <div
              className="absolute inset-0 rounded-2xl flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #FF4D00, #FF6B00, #FF8C38)",
                boxShadow: "0 8px 40px rgba(255,107,0,0.5)",
                borderRadius: "28%"
              }}
            >
              {/* Glass highlight */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[70%] h-[40%] bg-gradient-to-b from-white/20 to-transparent rounded-t-[28%]" />
              <Zap
                className="w-9 h-9 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]"
                strokeWidth={2.5}
                fill="rgba(255,255,255,0.15)"
              />
            </div>
          </div>
        </div>

        {/* Brand text */}
        <h1
          ref={textRef}
          className="mt-4 text-[22px] font-display font-bold tracking-[0.2em] uppercase"
          style={{
            opacity: 0,
            background: "linear-gradient(135deg, #FFFFFF, #FF8C38, #FF6B00)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent"
          }}
        >
          EgoistShield
        </h1>

        {/* Version */}
        <span
          ref={versionRef}
          className="mt-1 text-[9px] font-mono-metric font-medium tracking-[0.3em] text-whisper uppercase"
          style={{ opacity: 0 }}
        >
          v{__APP_VERSION__}
        </span>

        {/* Progress ring */}
        <div className="mt-6 w-9 h-9">
          <svg viewBox="0 0 40 40" className="w-full h-full -rotate-90">
            <circle cx="20" cy="20" r="18" fill="none" stroke="rgba(255,107,0,0.15)" strokeWidth="2.5" />
            <circle
              ref={ringRef}
              cx="20"
              cy="20"
              r="18"
              fill="none"
              stroke="url(#splash-ring-grad-v2)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <defs>
              <linearGradient id="splash-ring-grad-v2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="100%" stopColor="#FF6B00" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>
    </motion.div>
  );
}
