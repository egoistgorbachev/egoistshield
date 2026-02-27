/**
 * SpeedGraph — Circular arc gauge for download/upload speed
 * 270° arc with gradient stroke, GSAP-animated fill, center value
 */
import { useRef, useEffect } from "react";
import { gsap } from "../lib/gsap-setup";

const SIZE = 120;
const STROKE = 6;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const ARC_DEGREES = 270;
const ARC_LENGTH = (ARC_DEGREES / 360) * CIRCUMFERENCE;
const START_ANGLE = 135; // degrees

export function SpeedGraph({
  value,
  maxValue = 100,
  unit = "МБ/с",
  label,
  color = "indigo",
  isActive = false,
}: {
  value: number;
  maxValue?: number;
  unit?: string;
  label: string;
  color?: "indigo" | "emerald";
  isActive?: boolean;
}) {
  const arcRef = useRef<SVGCircleElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const prevValueRef = useRef(0);

  useEffect(() => {
    if (!arcRef.current) return;

    const percent = Math.min(value / maxValue, 1);
    const target = ARC_LENGTH - percent * ARC_LENGTH;

    gsap.to(arcRef.current, {
      strokeDashoffset: target,
      duration: 0.8,
      ease: "power2.out",
    });

    // Animate number
    if (valueRef.current) {
      const obj = { val: prevValueRef.current };
      gsap.to(obj, {
        val: value,
        duration: 0.6,
        ease: "power2.out",
        onUpdate: () => {
          if (valueRef.current) {
            valueRef.current.textContent = obj.val < 10 ? obj.val.toFixed(1) : Math.round(obj.val).toString();
          }
        },
      });
    }

    prevValueRef.current = value;
  }, [value, maxValue]);

  const gradId = `gauge-${color}`;
  const trackColor = isActive ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.03)";
  const [c1, c2] = color === "emerald"
    ? ["#34D399", "#059669"]
    : ["#A5B4FC", "#6366F1"];

  return (
    <div className="relative flex flex-col items-center">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-[135deg]">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={c1} />
            <stop offset="100%" stopColor={c2} />
          </linearGradient>
        </defs>

        {/* Track */}
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
          fill="none"
          stroke={trackColor}
          strokeWidth={STROKE}
          strokeDasharray={`${ARC_LENGTH} ${CIRCUMFERENCE}`}
          strokeLinecap="round"
        />

        {/* Active arc */}
        <circle
          ref={arcRef}
          cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={STROKE}
          strokeDasharray={`${ARC_LENGTH} ${CIRCUMFERENCE}`}
          strokeDashoffset={ARC_LENGTH}
          strokeLinecap="round"
          style={{ filter: isActive ? `drop-shadow(0 0 6px ${c1}40)` : "none" }}
        />
      </svg>

      {/* Center value */}
      <div className="absolute inset-0 flex flex-col items-center justify-center rotate-0">
        <span
          ref={valueRef}
          className={cn("text-2xl font-bold font-mono-metric transition-colors", isActive ? "text-white" : "text-white/30")}
        >
          {value < 10 ? value.toFixed(1) : Math.round(value)}
        </span>
        <span className="text-[8px] font-semibold uppercase tracking-wider text-white/30 mt-0.5">{unit}</span>
      </div>

      {/* Label below */}
      <span className="mt-1 text-[9px] font-bold uppercase tracking-widest text-white/35">{label}</span>
    </div>
  );
}

// cn helper imported locally
function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}
