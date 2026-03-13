/**
 * SpeedGraph v4 — Live Waveform Line Chart
 * Streaming area chart with smooth bezier curves, gradient fill,
 * animated scan line, and real-time value display.
 * Updates with actual traffic data — NO simulations.
 */
import { useEffect, useRef } from "react";
import { cn } from "../lib/cn";

const WIDTH = 200;
const HEIGHT = 80;
const MAX_POINTS = 30; // 30 seconds of history at 1s intervals
const PADDING_TOP = 8;
const PADDING_BOTTOM = 20;
const CHART_HEIGHT = HEIGHT - PADDING_TOP - PADDING_BOTTOM;

export function SpeedGraph({
  value,
  maxValue = 100,
  unit = "КБ/с",
  label,
  color = "orange",
  isActive = false,
}: {
  value: number;
  maxValue?: number;
  unit?: string;
  label: string;
  color?: "orange" | "emerald";
  isActive?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<number[]>([]);
  const animRef = useRef<number>(0);
  const dynamicMaxRef = useRef(10); // Start with 10 KB/s

  // Color palette
  const colors = color === "emerald"
    ? { line: "#34D399", fill1: "rgba(52,211,153,0.25)", fill2: "rgba(52,211,153,0)", glow: "rgba(52,211,153,0.6)", text: "#6EE7B7", dim: "rgba(52,211,153,0.15)" }
    : { line: "#FF6B00", fill1: "rgba(255,107,0,0.25)", fill2: "rgba(255,107,0,0)", glow: "rgba(255,107,0,0.6)", text: "#FFB366", dim: "rgba(255,107,0,0.15)" };

  useEffect(() => {
    // Push new value to history
    historyRef.current.push(value);
    if (historyRef.current.length > MAX_POINTS) {
      historyRef.current.shift();
    }
    // Update dynamic max
    const currentMax = Math.max(...historyRef.current, 1);
    dynamicMaxRef.current = Math.max(currentMax * 1.3, 10);
  }, [value]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    ctx.scale(dpr, dpr);

    // ── Performance: skip draw when not visible ──
    let isInViewport = true;
    let isPageVisible = !document.hidden;

    const observer = new IntersectionObserver(
      ([entry]) => { if (entry) isInViewport = entry.isIntersecting; },
      { threshold: 0.1 }
    );
    observer.observe(canvas);

    const onVisibility = () => { isPageVisible = !document.hidden; };
    document.addEventListener("visibilitychange", onVisibility);

    let scanX = 0;

    const draw = () => {
      // Skip expensive draw when not visible
      if (!isInViewport || !isPageVisible) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }

      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      const points = historyRef.current;
      const maxV = dynamicMaxRef.current;

      if (points.length < 2) {
        // Draw flat line
        const y = PADDING_TOP + CHART_HEIGHT;
        ctx.strokeStyle = isActive ? colors.dim : "rgba(255,255,255,0.03)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(WIDTH, y);
        ctx.stroke();
        ctx.setLineDash([]);
        animRef.current = requestAnimationFrame(draw);
        return;
      }

      // Calculate point positions
      const stepX = WIDTH / (MAX_POINTS - 1);
      const startIdx = MAX_POINTS - points.length;
      const coords: [number, number][] = points.map((v, i) => {
        const x = (startIdx + i) * stepX;
        const y = PADDING_TOP + CHART_HEIGHT - (v / maxV) * CHART_HEIGHT;
        return [x, Math.max(PADDING_TOP, Math.min(PADDING_TOP + CHART_HEIGHT, y))];
      });

      // --- Gradient fill under curve ---
      const gradient = ctx.createLinearGradient(0, PADDING_TOP, 0, HEIGHT);
      gradient.addColorStop(0, isActive ? colors.fill1 : "rgba(255,255,255,0.03)");
      gradient.addColorStop(1, isActive ? colors.fill2 : "rgba(255,255,255,0)");

      ctx.beginPath();
      ctx.moveTo(coords[0]![0]!, PADDING_TOP + CHART_HEIGHT);
      ctx.lineTo(coords[0]![0]!, coords[0]![1]!);

      // Smooth bezier curve
      for (let i = 1; i < coords.length; i++) {
        const [px, py] = coords[i - 1]!;
        const [cx, cy] = coords[i]!;
        const midX = (px + cx) / 2;
        ctx.bezierCurveTo(midX, py, midX, cy, cx, cy);
      }

      ctx.lineTo(coords[coords.length - 1]![0]!, PADDING_TOP + CHART_HEIGHT);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      // --- Line stroke ---
      ctx.beginPath();
      ctx.moveTo(coords[0]![0]!, coords[0]![1]!);
      for (let i = 1; i < coords.length; i++) {
        const [px, py] = coords[i - 1]!;
        const [cx, cy] = coords[i]!;
        const midX = (px + cx) / 2;
        ctx.bezierCurveTo(midX, py, midX, cy, cx, cy);
      }
      ctx.strokeStyle = isActive ? colors.line : "rgba(255,255,255,0.08)";
      ctx.lineWidth = isActive ? 2 : 1;
      ctx.stroke();

      // --- Glow on latest point ---
      if (isActive && coords.length > 0) {
        const [lx, ly] = coords[coords.length - 1]!;
        ctx.beginPath();
        ctx.arc(lx, ly, 3, 0, Math.PI * 2);
        ctx.fillStyle = colors.line;
        ctx.fill();

        // Glow
        ctx.beginPath();
        ctx.arc(lx, ly, 8, 0, Math.PI * 2);
        const glowGrad = ctx.createRadialGradient(lx, ly, 0, lx, ly, 8);
        glowGrad.addColorStop(0, colors.glow);
        glowGrad.addColorStop(1, "transparent");
        ctx.fillStyle = glowGrad;
        ctx.fill();
      }

      // --- Scan line (animated) ---
      if (isActive) {
        scanX = (scanX + 0.5) % WIDTH;
        const scanGrad = ctx.createLinearGradient(scanX - 20, 0, scanX + 2, 0);
        scanGrad.addColorStop(0, "transparent");
        scanGrad.addColorStop(1, `${colors.line}15`);
        ctx.fillStyle = scanGrad;
        ctx.fillRect(scanX - 20, PADDING_TOP, 22, CHART_HEIGHT);
      }

      // --- Baseline ---
      ctx.strokeStyle = "rgba(255,255,255,0.03)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, PADDING_TOP + CHART_HEIGHT);
      ctx.lineTo(WIDTH, PADDING_TOP + CHART_HEIGHT);
      ctx.stroke();

      animRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animRef.current);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isActive, colors]);

  // Display value
  const displayVal = value < 10 ? value.toFixed(1) : Math.round(value).toString();

  return (
    <div className="flex flex-col items-center flex-1 min-w-0">
      {/* Value + Unit */}
      <div className="flex items-baseline gap-1 mb-1">
        <span
          className={cn(
            "text-2xl font-bold font-mono-metric tabular-nums transition-colors leading-none",
            isActive ? "text-white" : "text-whisper"
          )}
          style={isActive ? { textShadow: `0 0 12px ${colors.glow}` } : undefined}
        >
          {displayVal}
        </span>
        <span className={cn("text-[9px] font-semibold uppercase tracking-wider", isActive ? "text-muted" : "text-whisper")}>
          {unit}
        </span>
      </div>

      {/* Canvas chart */}
      <canvas
        ref={canvasRef}
        className="w-full"
        style={{ width: WIDTH, height: HEIGHT, imageRendering: "auto" }}
      />

      {/* Label */}
      <span
        className={cn(
          "text-[10px] font-bold uppercase tracking-widest mt-0.5",
          isActive ? "text-muted" : "text-whisper"
        )}
      >
        {label}
      </span>
    </div>
  );
}
