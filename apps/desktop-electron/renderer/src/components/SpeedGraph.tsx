/**
 * SVG Sparkline — живой график скорости загрузки
 */
export function SpeedGraph({ data, color }: { data: number[]; color: string }) {
    const width = 500;
    const height = 64;
    const max = Math.max(...data, 1);

    const points = data.map((val, i) => ({
        x: (i / (data.length - 1)) * width,
        y: height - (val / max) * height * 0.9
    }));

    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const cpx = (prev.x + curr.x) / 2;
        d += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`;
    }

    const areaD = d + ` L ${width} ${height} L 0 ${height} Z`;
    const id = `sg-${color.replace('#', '')}`;

    return (
        <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className="w-full h-full"
            aria-hidden
        >
            <defs>
                <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={color} stopOpacity="0.02" />
                </linearGradient>
            </defs>
            <path d={areaD} fill={`url(#${id})`} />
            <path d={d} fill="none" stroke={color} strokeWidth="2" strokeOpacity="0.7" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="3" fill={color} opacity="0.9" />
            <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="6" fill={color} opacity="0.2" />
        </svg>
    );
}
