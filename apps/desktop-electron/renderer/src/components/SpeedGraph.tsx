/**
 * SVG Sparkline — живой график скорости загрузки с glow-эффектом
 */
import { useMemo } from "react";

export function SpeedGraph({ data, color }: { data: number[]; color: string }) {
    const width = 500;
    const height = 64;

    const { d, areaD, lastPoint } = useMemo(() => {
        const max = Math.max(...data, 1);
        const points = data.map((val, i) => ({
            x: (i / (data.length - 1)) * width,
            y: height - (val / max) * height * 0.9
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

    return (
        <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className="w-full h-full"
            aria-hidden
        >
            <defs>
                <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.35" />
                    <stop offset="60%" stopColor={color} stopOpacity="0.08" />
                    <stop offset="100%" stopColor={color} stopOpacity="0.01" />
                </linearGradient>
                <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>
            <path d={areaD} fill={`url(#${id})`} />
            <path d={d} fill="none" stroke={color} strokeWidth="2" strokeOpacity="0.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeOpacity="0.9" strokeLinecap="round" strokeLinejoin="round" filter={`url(#${glowId})`} />
            {/* Pulsing endpoint dot */}
            <circle cx={lastPoint.x} cy={lastPoint.y} r="4" fill={color} opacity="0.9">
                <animate attributeName="r" values="3;5;3" dur="1.5s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.9;0.5;0.9" dur="1.5s" repeatCount="indefinite" />
            </circle>
            <circle cx={lastPoint.x} cy={lastPoint.y} r="8" fill={color} opacity="0.15">
                <animate attributeName="r" values="6;10;6" dur="1.5s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.15;0.05;0.15" dur="1.5s" repeatCount="indefinite" />
            </circle>
        </svg>
    );
}

