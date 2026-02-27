import { useRef, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { gsap } from "../lib/gsap-setup";
import { ShieldLogo } from "./ShieldLogo";

/* ──────────────────────────────────────────────────────────
   SplashScreen — GSAP-driven cinematic boot sequence
   Phase 1: Grid lines materialize → Phase 2: Shield materializes
   Phase 3: Brand text + ring progress → Fade out
   ────────────────────────────────────────────────────────── */
export function SplashScreen() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLHeadingElement>(null);
  const versionRef = useRef<HTMLSpanElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    setReady(true);

    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

    // Phase 1: Grid appears
    if (gridRef.current) {
      tl.fromTo(gridRef.current,
        { opacity: 0 },
        { opacity: 0.15, duration: 0.6 }
      );
    }

    // Phase 2: Shield materializes
    if (logoRef.current) {
      tl.fromTo(logoRef.current,
        { scale: 0.3, opacity: 0, rotateY: -20, filter: "blur(8px)" },
        { scale: 1, opacity: 1, rotateY: 0, filter: "blur(0px)", duration: 1, ease: "back.out(1.4)" },
        "-=0.3"
      );
    }

    // Phase 3: Text + version
    if (textRef.current) {
      tl.fromTo(textRef.current,
        { opacity: 0, y: 16, letterSpacing: "0.5em" },
        { opacity: 1, y: 0, letterSpacing: "0.2em", duration: 0.7 },
        "-=0.4"
      );
    }
    if (versionRef.current) {
      tl.fromTo(versionRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.4 },
        "-=0.3"
      );
    }

    // Phase 4: Ring progress
    if (ringRef.current) {
      const circumference = 2 * Math.PI * 18;
      ringRef.current.style.strokeDasharray = `${circumference}`;
      ringRef.current.style.strokeDashoffset = `${circumference}`;

      tl.to(ringRef.current, {
        strokeDashoffset: 0,
        duration: 1.2,
        ease: "power2.inOut",
      }, "-=0.2");
    }

    return () => { tl.kill(); };
  }, []);

  return (
    <motion.div
      ref={containerRef}
      className="absolute inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden w-full h-screen"
      style={{ background: "#030308" }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Grid background */}
      <div
        ref={gridRef}
        className="absolute inset-0 opacity-0"
        style={{
          backgroundImage: `
            linear-gradient(rgba(99,102,241,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99,102,241,0.06) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Ambient gradient orb */}
      <div
        className="absolute w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />

      <div className="relative z-10 flex flex-col items-center">
        {/* Shield Logo */}
        <div
          ref={logoRef}
          className="w-44 h-44 will-change-transform"
          style={{ opacity: 0, perspective: "800px" }}
        >
          <ShieldLogo isConnected={true} className="w-full h-full" />
        </div>

        {/* Brand text */}
        <h1
          ref={textRef}
          className="mt-6 text-[24px] font-display font-bold tracking-[0.2em] uppercase"
          style={{
            opacity: 0,
            background: "linear-gradient(135deg, #A5B4FC, #818CF8, #6366F1)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          EgoistShield
        </h1>

        {/* Version */}
        <span
          ref={versionRef}
          className="mt-1.5 text-[10px] font-mono-metric font-medium tracking-[0.3em] text-white/15 uppercase"
          style={{ opacity: 0 }}
        >
          v1.0.7
        </span>

        {/* Progress ring */}
        <div className="mt-8 w-10 h-10">
          <svg viewBox="0 0 40 40" className="w-full h-full -rotate-90">
            {/* Track */}
            <circle cx="20" cy="20" r="18" fill="none" stroke="rgba(99,102,241,0.1)" strokeWidth="2" />
            {/* Progress */}
            <circle
              ref={ringRef}
              cx="20" cy="20" r="18"
              fill="none"
              stroke="url(#splash-ring-grad)"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <defs>
              <linearGradient id="splash-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#A5B4FC" />
                <stop offset="100%" stopColor="#6366F1" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>
    </motion.div>
  );
}
