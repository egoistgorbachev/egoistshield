import { motion, AnimatePresence } from "framer-motion";
import { ShieldLogo } from "./ShieldLogo";
import { useState, useEffect } from "react";

/* ──────────────────────────────────────────────────────────
   SplashScreen — Cyber-Luxury Dark boot animation
   Aurora orbs + Cinematic logo + Conic progress ring
   ────────────────────────────────────────────────────────── */
export function SplashScreen() {
    const [phase, setPhase] = useState(0);

    useEffect(() => {
        const t1 = setTimeout(() => setPhase(1), 500);
        const t2 = setTimeout(() => setPhase(2), 1000);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, []);

    return (
        <motion.div
            className="absolute inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden w-full h-screen"
            style={{ background: "#050508" }}
            exit={{ opacity: 0, scale: 1.04 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
            {/* Aurora orbs — 3 drifting color spheres */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <motion.div
                    className="aurora-orb w-[350px] h-[350px] top-[10%] left-[15%]"
                    style={{ background: "radial-gradient(circle, rgba(255,107,44,0.15) 0%, transparent 70%)" }}
                    animate={{ x: [0, 40, -20, 0], y: [0, -30, 20, 0], scale: [1, 1.15, 0.95, 1] }}
                    transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                    className="aurora-orb w-[280px] h-[280px] top-[40%] right-[10%]"
                    style={{ background: "radial-gradient(circle, rgba(0,229,255,0.08) 0%, transparent 70%)" }}
                    animate={{ x: [0, -30, 25, 0], y: [0, 20, -25, 0], scale: [1, 1.1, 0.9, 1] }}
                    transition={{ duration: 13, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                    className="aurora-orb w-[200px] h-[200px] bottom-[15%] left-[30%]"
                    style={{ background: "radial-gradient(circle, rgba(255,61,0,0.1) 0%, transparent 70%)" }}
                    animate={{ x: [0, 25, -15, 0], y: [0, -20, 15, 0], scale: [1, 1.08, 1.02, 1] }}
                    transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                />
            </div>

            {/* Dot matrix subtle overlay */}
            <div className="absolute inset-0 dot-matrix opacity-30 pointer-events-none" />

            {/* Horizontal light sweep */}
            <motion.div
                className="absolute w-full h-[1px] will-change-transform"
                style={{ background: "linear-gradient(90deg, transparent 0%, rgba(255,181,71,0.5) 50%, transparent 100%)" }}
                initial={{ scaleX: 0, opacity: 0 }}
                animate={{ scaleX: 1, opacity: [0, 0.7, 0] }}
                transition={{ duration: 1.5, delay: 0.3, ease: "easeInOut" }}
            />

            <div className="relative z-10 flex flex-col items-center">
                {/* Logo — materializes with cinematic spring */}
                <motion.div
                    className="w-48 h-48 will-change-transform transform-gpu"
                    initial={{ scale: 0.4, opacity: 0, rotateY: -25 }}
                    animate={{
                        scale: 1, opacity: 1, rotateY: 0,
                        filter: [
                            "drop-shadow(0 0 0px rgba(255,107,44,0))",
                            "drop-shadow(0 0 50px rgba(255,107,44,0.5))",
                            "drop-shadow(0 0 25px rgba(255,107,44,0.25))",
                        ],
                    }}
                    transition={{
                        duration: 1.3, ease: [0.22, 1, 0.36, 1],
                        filter: { duration: 2.2, times: [0, 0.5, 1] },
                    }}
                >
                    <ShieldLogo isConnected={true} className="w-full h-full" />
                </motion.div>

                {/* Brand name — Space Grotesk gradient */}
                <AnimatePresence>
                    {phase >= 1 && (
                        <motion.h1
                            className="mt-5 text-[26px] font-display font-bold tracking-[0.22em] uppercase"
                            style={{
                                background: "linear-gradient(90deg, #FFB547, #FF6B2C, #FF3D00)",
                                WebkitBackgroundClip: "text",
                                WebkitTextFillColor: "transparent",
                            }}
                            initial={{ opacity: 0, y: 14, letterSpacing: "0.5em" }}
                            animate={{ opacity: 1, y: 0, letterSpacing: "0.22em" }}
                            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                        >
                            EgoistShield
                        </motion.h1>
                    )}
                </AnimatePresence>

                {/* Version badge */}
                <AnimatePresence>
                    {phase >= 1 && (
                        <motion.span
                            className="mt-2 text-[10px] font-mono-metric font-medium tracking-[0.3em] text-white/15 uppercase"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.3, duration: 0.5 }}
                        >
                            v1.0.4
                        </motion.span>
                    )}
                </AnimatePresence>

                {/* Progress — conic gradient ring */}
                <AnimatePresence>
                    {phase >= 2 && (
                        <motion.div
                            className="mt-10 relative w-12 h-12"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.4 }}
                        >
                            {/* Spinning ring */}
                            <motion.div
                                className="absolute inset-0 rounded-full"
                                style={{
                                    background: "conic-gradient(from 0deg, #FF6B2C, #FFB547, transparent 70%)",
                                    mask: "radial-gradient(circle, transparent 60%, black 61%)",
                                    WebkitMask: "radial-gradient(circle, transparent 60%, black 61%)",
                                }}
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                            />
                            {/* Center glow dot */}
                            <div
                                className="absolute inset-0 m-auto w-2 h-2 rounded-full bg-brand"
                                style={{ boxShadow: "0 0 12px rgba(255,107,44,0.5)" }}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}
