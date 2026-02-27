import { motion } from "framer-motion";

export function ShieldLogo({ className, isConnected = false }: { className?: string, isConnected?: boolean }) {
    const activeGlow = "url(#megaGlow)";

    // Make the entire logo bright glowing orange regardless, but even brighter when connected.
    const colorPrimary = isConnected ? "#ff6600" : "#ff8c00"; // Extremely bright neon orange
    const colorSecondary = isConnected ? "#ff1a1a" : "#ff4500"; // Bright hot red/orange
    const colorAccent = isConnected ? "#ffea00" : "#ffb300"; // Bright neon yellow/amber

    // Base opacity values for disconnected state to still look "glowing orange" rather than "grey"
    const baseOpacity = isConnected ? 1 : 0.6;

    return (
        <svg
            viewBox="0 0 200 200"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            style={{ overflow: "visible" }}
        >
            <defs>
                <linearGradient id="shieldFill" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={colorPrimary} stopOpacity="0.2" />
                    <stop offset="50%" stopColor={colorSecondary} stopOpacity="0.05" />
                    <stop offset="100%" stopColor="#000000" stopOpacity="0.5" />
                </linearGradient>

                <linearGradient id="shieldEdge" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor={colorAccent} />
                    <stop offset="50%" stopColor={colorPrimary} />
                    <stop offset="100%" stopColor={colorSecondary} />
                </linearGradient>

                <linearGradient id="coreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#fff" />
                    <stop offset="50%" stopColor={colorAccent} />
                    <stop offset="100%" stopColor={colorPrimary} />
                </linearGradient>

                <filter id="megaGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="8" result="blur1" />
                    <feGaussianBlur stdDeviation="15" result="blur2" />
                    <feMerge>
                        <feMergeNode in="blur2" />
                        <feMergeNode in="blur1" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>

                <filter id="subtleGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
            </defs>

            {/* Deep Background Pulse */}
            {isConnected && (
                <motion.circle
                    cx="100"
                    cy="100"
                    r="80"
                    fill={colorPrimary}
                    opacity="0.1"
                    filter={activeGlow}
                    animate={{ scale: [0.8, 1.3, 0.8], opacity: [0.05, 0.2, 0.05] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                />
            )}

            {/* Outer Rotating Radar Ring */}
            <motion.circle
                cx="100"
                cy="100"
                r="90"
                stroke={colorPrimary}
                strokeWidth="1.5"
                strokeDasharray="4 12 20 12"
                fill="none"
                opacity={isConnected ? 0.8 : 0.4}
                animate={isConnected ? { rotate: 360 } : { rotate: 0 }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                style={{ transformOrigin: "100px 100px" }}
            />
            <motion.circle
                cx="100"
                cy="100"
                r="75"
                stroke={colorSecondary}
                strokeWidth="2.5"
                strokeDasharray="50 40 10 40"
                fill="none"
                opacity={isConnected ? 0.9 : 0.5}
                animate={isConnected ? { rotate: -360 } : { rotate: 0 }}
                transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                style={{ transformOrigin: "100px 100px" }}
            />

            {/* Main Shield Geometry */}
            <motion.path
                d="M100 20 L160 45 V100 C160 145 100 180 100 180 C100 180 40 145 40 100 V45 L100 20 Z"
                fill="url(#shieldFill)"
                stroke="url(#shieldEdge)"
                strokeWidth="4"
                strokeLinejoin="round"
                filter={activeGlow}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: isConnected ? 1 : 0.8 }}
                transition={{ duration: 1.5, ease: "easeOut" }}
            />

            {/* Inner Layer Shield */}
            <motion.path
                d="M100 40 L140 60 V100 C140 130 100 155 100 155 C100 155 60 130 60 100 V60 L100 40 Z"
                fill="none"
                stroke={colorPrimary}
                strokeWidth="2"
                opacity={isConnected ? 0.9 : 0.5}
                strokeDasharray="6 6"
                animate={isConnected ? { strokeDashoffset: [0, -100] } : {}}
                transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
                filter={activeGlow}
            />

            {/* Hi-Tech Circuit Lines inside */}
            <g stroke={colorSecondary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity={isConnected ? 1 : 0.6} filter={activeGlow}>
                <path d="M100 40 V155 M60 70 L90 70 L100 80 M140 70 L110 70 L100 80 M70 120 L85 120 L100 135 M130 120 L115 120 L100 135" />
                <circle cx="60" cy="70" r="3" fill={colorAccent} />
                <circle cx="140" cy="70" r="3" fill={colorAccent} />
                <circle cx="70" cy="120" r="3" fill={colorAccent} />
                <circle cx="130" cy="120" r="3" fill={colorAccent} />
            </g>

            {/* Central Energy Core */}
            <motion.circle
                cx="100"
                cy="100"
                r="14"
                fill="url(#coreGrad)"
                filter={activeGlow}
                animate={isConnected ? {
                    scale: [1, 1.3, 1],
                    opacity: [0.8, 1, 0.8]
                } : { scale: 1, opacity: 0.8 }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.circle
                cx="100"
                cy="100"
                r="6"
                fill="#ffffff"
                filter={activeGlow}
                animate={isConnected ? { opacity: [0.5, 1, 0.5], scale: [1, 1.2, 1] } : { opacity: 0.6 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            />

            {/* Floating Energy Particles */}
            {[
                { cx: 70, cy: 90, r: 2, dur: 3, delay: 0 },
                { cx: 130, cy: 110, r: 1.5, dur: 4, delay: 1 },
                { cx: 100, cy: 60, r: 2.5, dur: 2.5, delay: 0.5 },
                { cx: 80, cy: 140, r: 1.5, dur: 3.5, delay: 1.5 },
                { cx: 120, cy: 70, r: 2, dur: 4.5, delay: 0.2 },
            ].map((particle, i) => (
                <motion.circle
                    key={i}
                    cx={particle.cx}
                    cy={particle.cy}
                    r={particle.r}
                    fill={colorAccent}
                    filter="url(#subtleGlow)"
                    opacity={isConnected ? 0.8 : 0.3}
                    animate={isConnected ? {
                        y: [-10, 10, -10],
                        x: [-5, 5, -5],
                        opacity: [0.2, 0.8, 0.2]
                    } : { y: 0, x: 0 }}
                    transition={{
                        duration: particle.dur,
                        delay: particle.delay,
                        repeat: Infinity,
                        ease: "easeInOut"
                    }}
                />
            ))}
        </svg>
    );
}
