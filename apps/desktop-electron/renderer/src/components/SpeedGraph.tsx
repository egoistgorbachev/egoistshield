/**
 * SVG Sparkline — неоновый график скорости с двойным stroke, glow, scan-line
 */
import { useMemo } from "react";

export function SpeedGraph({ data, color }: { data: number[]; color: string }) {
    const width = 500;
    const height = 64;

    const { d, areaD, lastPoint } = useMemo(() => {
        const max = Math.max(...data, 1);
        const points = data.map((val, i) => ({
            x: (i / (data.length - 1)) * width,
            y: height - (val / max) * height * 0.88
        }));

        let pathD = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
            const prev = points[i - 1];
            const curr = points[i];
            const cpx = (prev.x + curr.x) / 2;
            pathD += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`;
        }

        return {
            d: pathD,
            areaD: pathD + ` L ${width} ${height} L 0 ${height} Z`,
            lastPoint: points[points.length - 1],
        };
    }, [data]);

    const id = `sg-${color.replace('#', '')}`;
    const glowId = `glow-${id}`;
    const gridId = `grid-${id}`;

    return (
        <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className="w-full h-full"
            aria-hidden
        >
            <defs>
                {/* 4-stop area gradient */}
                <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                    <stop offset="30%" stopColor={color} stopOpacity="0.15" />
                    <stop offset="70%" stopColor={color} stopOpacity="0.04" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>

                {/* Neon glow filter */}
                <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>

                {/* Subtle grid pattern */}
                <pattern id={gridId} width="25" height="16" patternUnits="userSpaceOnUse">
                    <line x1="0" y1="16" x2="25" y2="16" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
                    <line x1="25" y1="0" x2="25" y2="16" stroke="rgba(255,255,255,0.02)" strokeWidth="0.5" />
                </pattern>
            </defs>

            {/* Background grid */}
            <rect width={width} height={height} fill={`url(#${gridId})`} />

            {/* Gradient area fill */}
            <path d={areaD} fill={`url(#${id})`} />

            {/* Thick blur stroke (neon glow layer) */}
            <path d={d} fill="none" stroke={color} strokeWidth="3" strokeOpacity="0.2" strokeLinecap="round" strokeLinejoin="round" filter={`url(#${glowId})`} />

            {/* Thin crisp stroke (main line) */}
            <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeOpacity="0.9" strokeLinecap="round" strokeLinejoin="round" />

            {/* Pulsing endpoint — triple layer */}
            <circle cx={lastPoint.x} cy={lastPoint.y} r="10" fill={color} opacity="0.06">
                <animate attributeName="r" values="8;14;8" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.06;0.02;0.06" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx={lastPoint.x} cy={lastPoint.y} r="5" fill={color} opacity="0.2">
                <animate attributeName="r" values="4;6;4" dur="1.5s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.2;0.1;0.2" dur="1.5s" repeatCount="indefinite" />
            </circle>
            <circle cx={lastPoint.x} cy={lastPoint.y} r="2.5" fill={color} opacity="0.95" />

            {/* Scan line (vertical moving line) */}
            <line x1="0" y1="0" x2="0" y2={height} stroke={color} strokeWidth="1" strokeOpacity="0.08">
                <animate attributeName="x1" values={`0;${width}`} dur="4s" repeatCount="indefinite" />
                <animate attributeName="x2" values={`0;${width}`} dur="4s" repeatCount="indefinite" />
            </line>
        </svg>
    );
}
