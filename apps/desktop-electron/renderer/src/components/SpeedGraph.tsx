/**
 * SpeedGraph v6 — Premium Waveform Chart
 * Full-width area chart with smooth bezier curves, multi-layer gradient,
 * animated glow point, subtle grid, and depth effects.
 * Designed to fill the parent container width.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { cn } from "../lib/cn";

const HEIGHT = 110;
const MAX_POINTS = 120;
const PADDING_TOP = 8;
const PADDING_BOTTOM = 4;
const CHART_HEIGHT = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
const GRID_LINES = 4;
type GraphPoint = [number, number];

interface SpeedGraphProps {
  value: number;
  maxValue?: number;
  unit?: string;
  label: string;
  color?: "brand" | "emerald";
  isActive?: boolean;
}

export function SpeedGraph({ value, unit = "КБ/с", label, color = "brand", isActive = false }: SpeedGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<number[]>([]);
  const animRef = useRef<number>(0);
  const dynamicMaxRef = useRef(10);
  const scanXRef = useRef(0);
  const glowPhaseRef = useRef(0);
  const widthRef = useRef(300);

  // Color palette
  const colors = useMemo(
    () =>
      color === "emerald"
        ? {
            line: "#34D399",
            fill1: "rgba(52,211,153,0.35)",
            fill2: "rgba(52,211,153,0.08)",
            fill3: "rgba(52,211,153,0)",
            glow: "rgba(52,211,153,0.7)",
            glowSoft: "rgba(52,211,153,0.12)",
            text: "#6EE7B7",
            dim: "rgba(52,211,153,0.15)",
            grid: "rgba(52,211,153,0.05)",
            scanAlpha: "rgba(52,211,153,0.06)"
          }
        : {
            line: "#FF4C29",
            fill1: "rgba(255,76,41,0.35)",
            fill2: "rgba(255,76,41,0.08)",
            fill3: "rgba(255,76,41,0)",
            glow: "rgba(255,76,41,0.7)",
            glowSoft: "rgba(255,76,41,0.12)",
            text: "#FF6B47",
            dim: "rgba(255,76,41,0.15)",
            grid: "rgba(255,76,41,0.05)",
            scanAlpha: "rgba(255,76,41,0.06)"
          },
    [color]
  );

  useEffect(() => {
    historyRef.current.push(value);
    if (historyRef.current.length > MAX_POINTS) {
      historyRef.current.shift();
    }
    const currentMax = Math.max(...historyRef.current, 1);
    dynamicMaxRef.current = Math.max(currentMax * 1.3, 10);
  }, [value]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const W = widthRef.current;
    ctx.clearRect(0, 0, W, HEIGHT);
    const points = historyRef.current;
    const maxV = dynamicMaxRef.current;

    // --- Horizontal grid lines ---
    for (let i = 0; i <= GRID_LINES; i++) {
      const y = PADDING_TOP + (CHART_HEIGHT / GRID_LINES) * i;
      ctx.strokeStyle = isActive ? colors.grid : "rgba(255,255,255,0.015)";
      ctx.lineWidth = 0.5;
      ctx.setLineDash([2, 6]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (points.length < 2) {
      const y = PADDING_TOP + CHART_HEIGHT;
      ctx.strokeStyle = isActive ? colors.dim : "rgba(255,255,255,0.03)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }

    // Calculate point positions
    const stepX = W / (MAX_POINTS - 1);
    const startIdx = MAX_POINTS - points.length;
    const coords: GraphPoint[] = points.map((v, i) => {
      const x = (startIdx + i) * stepX;
      const y = PADDING_TOP + CHART_HEIGHT - (v / maxV) * CHART_HEIGHT;
      return [x, Math.max(PADDING_TOP, Math.min(PADDING_TOP + CHART_HEIGHT, y))];
    });
    const firstCoord = coords[0];
    const lastCoord = coords[coords.length - 1];
    if (!firstCoord || !lastCoord) {
      return;
    }

    // --- Multi-layer gradient fill ---
    const gradient = ctx.createLinearGradient(0, PADDING_TOP, 0, PADDING_TOP + CHART_HEIGHT);
    if (isActive) {
      gradient.addColorStop(0, colors.fill1);
      gradient.addColorStop(0.4, colors.fill2);
      gradient.addColorStop(0.8, colors.glowSoft);
      gradient.addColorStop(1, colors.fill3);
    } else {
      gradient.addColorStop(0, "rgba(255,255,255,0.03)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
    }

    // Draw filled area
    ctx.beginPath();
    ctx.moveTo(firstCoord[0], PADDING_TOP + CHART_HEIGHT);
    ctx.lineTo(firstCoord[0], firstCoord[1]);

    for (let i = 1; i < coords.length; i++) {
      const previousCoord = coords[i - 1];
      const currentCoord = coords[i];
      if (!previousCoord || !currentCoord) {
        continue;
      }
      const [px, py] = previousCoord;
      const [cx, cy] = currentCoord;
      const midX = (px + cx) / 2;
      ctx.bezierCurveTo(midX, py, midX, cy, cx, cy);
    }

    ctx.lineTo(lastCoord[0], PADDING_TOP + CHART_HEIGHT);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // --- Second lighter fill layer for depth ---
    if (isActive) {
      const gradient2 = ctx.createLinearGradient(0, PADDING_TOP, 0, PADDING_TOP + CHART_HEIGHT);
      gradient2.addColorStop(0, colors.glowSoft);
      gradient2.addColorStop(1, "transparent");

      ctx.beginPath();
      ctx.moveTo(firstCoord[0], PADDING_TOP + CHART_HEIGHT);
      for (let i = 0; i < coords.length; i++) {
        const currentCoord = coords[i];
        if (!currentCoord) {
          continue;
        }
        const [x, y] = currentCoord;
        // Offset slightly up for depth
        ctx.lineTo(x, Math.min(y + 4, PADDING_TOP + CHART_HEIGHT));
      }
      ctx.lineTo(lastCoord[0], PADDING_TOP + CHART_HEIGHT);
      ctx.closePath();
      ctx.fillStyle = gradient2;
      ctx.fill();
    }

    // --- Line stroke ---
    ctx.beginPath();
    ctx.moveTo(firstCoord[0], firstCoord[1]);
    for (let i = 1; i < coords.length; i++) {
      const previousCoord = coords[i - 1];
      const currentCoord = coords[i];
      if (!previousCoord || !currentCoord) {
        continue;
      }
      const [px, py] = previousCoord;
      const [cx, cy] = currentCoord;
      const midX = (px + cx) / 2;
      ctx.bezierCurveTo(midX, py, midX, cy, cx, cy);
    }
    ctx.strokeStyle = isActive ? colors.line : "rgba(255,255,255,0.06)";
    ctx.lineWidth = isActive ? 2 : 1;
    ctx.shadowColor = isActive ? colors.glow : "transparent";
    ctx.shadowBlur = isActive ? 10 : 0;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // --- Glow endpoint ---
    if (isActive) {
      const [lx, ly] = lastCoord;
      glowPhaseRef.current += 0.04;
      const pulse = 1 + Math.sin(glowPhaseRef.current) * 0.3;

      // Outer glow ring
      ctx.beginPath();
      ctx.arc(lx, ly, 14 * pulse, 0, Math.PI * 2);
      const glowGrad = ctx.createRadialGradient(lx, ly, 0, lx, ly, 14 * pulse);
      glowGrad.addColorStop(0, colors.glow);
      glowGrad.addColorStop(0.5, colors.glowSoft);
      glowGrad.addColorStop(1, "transparent");
      ctx.fillStyle = glowGrad;
      ctx.fill();

      // Inner dot
      ctx.beginPath();
      ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = colors.line;
      ctx.fill();

      // White center
      ctx.beginPath();
      ctx.arc(lx, ly, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.fill();
    }

    // --- Scan line ---
    if (isActive) {
      scanXRef.current = (scanXRef.current + 0.4) % W;
      const sx = scanXRef.current;
      const scanGrad = ctx.createLinearGradient(sx - 40, 0, sx, 0);
      scanGrad.addColorStop(0, "transparent");
      scanGrad.addColorStop(1, colors.scanAlpha);
      ctx.fillStyle = scanGrad;
      ctx.fillRect(sx - 40, PADDING_TOP, 40, CHART_HEIGHT);
    }

    // --- Bottom baseline ---
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, PADDING_TOP + CHART_HEIGHT);
    ctx.lineTo(W, PADDING_TOP + CHART_HEIGHT);
    ctx.stroke();
  }, [colors, isActive]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let isInViewport = true;
    let isPageVisible = !document.hidden;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) isInViewport = entry.isIntersecting;
      },
      { threshold: 0.1 }
    );
    observer.observe(canvas);

    const onVisibility = () => {
      isPageVisible = !document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Responsive width
    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const w = Math.floor(rect.width) || 300;
      widthRef.current = w;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = HEIGHT * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${HEIGHT}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    updateSize();

    const resizeObs = new ResizeObserver(updateSize);
    resizeObs.observe(container);

    const loop = () => {
      if (isInViewport && isPageVisible) {
        // Reset transform before draw to avoid scale accumulation
        const dpr = window.devicePixelRatio || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
      }
      animRef.current = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(animRef.current);
      observer.disconnect();
      resizeObs.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [draw]);

  // Display value
  const displayVal = value < 0.1 ? "0.0" : value < 10 ? value.toFixed(1) : Math.round(value).toString();

  return (
    <div ref={containerRef} className="flex flex-col items-center flex-1 min-w-0">
      {/* Value + Unit */}
      <div className="flex items-baseline gap-1.5 mb-1">
        <span
          className={cn(
            "text-[26px] font-bold font-mono tabular-nums transition-colors leading-none",
            isActive ? "text-white" : "text-whisper"
          )}
          style={isActive ? { textShadow: `0 0 18px ${colors.glow}` } : undefined}
        >
          {displayVal}
        </span>
        <span
          className={cn("text-[10px] font-semibold uppercase tracking-wider", isActive ? "text-muted" : "text-whisper")}
        >
          {unit}
        </span>
      </div>

      {/* Canvas chart — responsive width */}
      <canvas ref={canvasRef} className="w-full rounded-sm" />

      {/* Label */}
      <span
        className={cn("text-[10px] font-bold uppercase tracking-widest mt-1", isActive ? "text-muted" : "text-whisper")}
      >
        {label}
      </span>
    </div>
  );
}
