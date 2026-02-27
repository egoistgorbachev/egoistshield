import { motion, AnimatePresence } from "framer-motion";
import { ShieldLogo } from "./ShieldLogo";
import { useState, useEffect } from "react";

/* ──────────────────────────────────────────────────────────
   SplashScreen — Cinematic branded boot animation
   Phases: 1) Logo materializes  2) Name reveals  3) Bar fills
   ────────────────────────────────────────────────────────── */
export function SplashScreen() {
    const [phase, setPhase] = useState(0);

    useEffect(() => {
        const t1 = setTimeout(() => setPhase(1), 500);   // name appears
        const t2 = setTimeout(() => setPhase(2), 1000);  // bar starts
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, []);

    return (
        <motion.div
            className="absolute inset-0 z-[100] bg-[#0A0A0A] flex flex-col items-center justify-center overflow-hidden w-full h-screen"
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
            {/* Radial ambient glow */}
            <motion.div
                className="absolute w-[500px] h-[500px] rounded-full will-change-transform transform-gpu"
                style={{
                    background: "radial-gradient(circle, rgba(255,102,0,0.12) 0%, rgba(255,26,26,0.04) 50%, transparent 70%)",
                }}
                initial={{ scale: 0.3, opacity: 0 }}
                animate={{ scale: 1.4, opacity: 1 }}
                transition={{ duration: 2.5, ease: "easeOut" }}
            />

            {/* Horizontal light sweep */}
            <motion.div
                className="absolute w-full h-[1px] will-change-transform"
                style={{
                    background: "linear-gradient(90deg, transparent 0%, rgba(255,179,0,0.5) 50%, transparent 100%)",
                }}
                initial={{ scaleX: 0, opacity: 0, y: 0 }}
                animate={{ scaleX: 1, opacity: [0, 0.8, 0] }}
                transition={{ duration: 1.5, delay: 0.3, ease: "easeInOut" }}
            />

            <div className="relative z-10 flex flex-col items-center">
                {/* Logo — materializes with spring + glow pulse */}
                <motion.div
                    className="w-52 h-52 will-change-transform transform-gpu"
                    initial={{ scale: 0.5, opacity: 0, rotateY: -30 }}
                    animate={{
                        scale: 1,
                        opacity: 1,
                        rotateY: 0,
                        filter: [
                            "drop-shadow(0 0 0px rgba(255,102,0,0))",
                            "drop-shadow(0 0 40px rgba(255,102,0,0.5))",
                            "drop-shadow(0 0 20px rgba(255,102,0,0.3))",
                        ],
                    }}
                    transition={{
                        duration: 1.2,
                        ease: [0.22, 1, 0.36, 1],
                        filter: { duration: 2, times: [0, 0.5, 1] },
                    }}
                >
                    <ShieldLogo isConnected={true} className="w-full h-full" />
                </motion.div>

                {/* Brand name — letter-spaced reveal */}
                <AnimatePresence>
                    {phase >= 1 && (
                        <motion.h1
                            className="mt-5 text-[28px] font-black tracking-[0.25em] uppercase"
                            style={{
                                background: "linear-gradient(90deg, #FFD54F, #FF6600, #FF1A1A)",
                                WebkitBackgroundClip: "text",
                                WebkitTextFillColor: "transparent",
                            }}
                            initial={{ opacity: 0, y: 12, letterSpacing: "0.5em" }}
                            animate={{ opacity: 1, y: 0, letterSpacing: "0.25em" }}
                            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                        >
                            EgoistShield
                        </motion.h1>
                    )}
                </AnimatePresence>

                {/* Version badge */}
                <AnimatePresence>
                    {phase >= 1 && (
                        <motion.span
                            className="mt-2 text-[10px] font-bold tracking-[0.3em] text-white/20 uppercase"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.3, duration: 0.5 }}
                        >
                            v1.0.4
                        </motion.span>
                    )}
                </AnimatePresence>

                {/* Progress bar with shimmer */}
                <AnimatePresence>
                    {phase >= 2 && (
                        <motion.div
                            className="mt-8 w-56 h-[3px] bg-white/5 rounded-full overflow-hidden"
                            initial={{ opacity: 0, scaleX: 0.8 }}
                            animate={{ opacity: 1, scaleX: 1 }}
                            transition={{ duration: 0.4 }}
                        >
                            <motion.div
                                className="h-full rounded-full relative overflow-hidden"
                                style={{
                                    background: "linear-gradient(90deg, #FFD54F, #FF6600, #FF1A1A)",
                                }}
                                initial={{ width: "0%" }}
                                animate={{ width: "100%" }}
                                transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
                            >
                                {/* Shimmer overlay */}
                                <div className="absolute inset-0 overflow-hidden">
                                    <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}

