import { useCallback, useEffect, useRef } from "react";

/* ──────────────────────────────────────────────────────────
   DepthBackground — Interactive 3D depth grid + floating orbs
   Follows mouse parallax for depth illusion.
   Subtle, performant, no libraries needed.
   ────────────────────────────────────────────────────────── */

export function DepthBackground({ isConnected = false }: { isConnected?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const orbsRef = useRef<Orb[]>([]);

  interface Orb {
    x: number;
    y: number;
    r: number;
    speed: number;
    depth: number;
    hue: number;
    opacity: number;
  }

  const initOrbs = useCallback(
    (w: number, h: number) => {
      const orbs: Orb[] = [];
      const isReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (isReducedMotion) return;

      for (let i = 0; i < 3; i++) {
        orbs.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: 80 + Math.random() * 120,
          speed: 0.2 + Math.random() * 0.3,
          depth: 0.3 + Math.random() * 0.7,
          hue: isConnected ? 170 + Math.random() * 20 : 20 + Math.random() * 15,
          opacity: 0.04 + Math.random() * 0.06
        });
      }
      orbsRef.current = orbs;
    },
    [isConnected]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let animId: number;
    let w = 0;
    let h = 0;

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

    // Cache reduced-motion preference outside draw loop
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    const onMotionChange = (e: MediaQueryListEvent) => { reducedMotion = e.matches; };
    motionQuery.addEventListener("change", onMotionChange);

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
      if (orbsRef.current.length === 0) initOrbs(w, h);
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX / w;
      mouseRef.current.y = e.clientY / h;
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", handleMouseMove);

    let time = 0;

    const draw = () => {
      time += 0.008;

      // Skip expensive draw when not visible
      if (!isInViewport || !isPageVisible || reducedMotion) {
        animId = requestAnimationFrame(draw);
        return;
      }

      ctx.clearRect(0, 0, w, h);

      const mx = (mouseRef.current.x - 0.5) * 2;
      const my = (mouseRef.current.y - 0.5) * 2;

      // -- Floating orbs with parallax --
      for (const orb of orbsRef.current) {
        const px = orb.x + Math.sin(time * orb.speed) * 30 + mx * 15 * orb.depth;
        const py = orb.y + Math.cos(time * orb.speed * 0.7) * 20 + my * 10 * orb.depth;

        const grad = ctx.createRadialGradient(px, py, 0, px, py, orb.r);
        const hsl = `hsla(${orb.hue}, 90%, 50%, ${orb.opacity})`;
        const hslT = `hsla(${orb.hue}, 90%, 50%, 0)`;
        grad.addColorStop(0, hsl);
        grad.addColorStop(1, hslT);
        ctx.fillStyle = grad;
        ctx.fillRect(px - orb.r, py - orb.r, orb.r * 2, orb.r * 2);
      }

      // -- Subtle grid with parallax --
      const gridSize = 80;
      const gridOpacity = 0.025;
      ctx.strokeStyle = `rgba(255,107,0,${gridOpacity})`;
      ctx.lineWidth = 0.5;

      const offsetX = mx * 8;
      const offsetY = my * 8;

      for (let x = -gridSize + (offsetX % gridSize); x < w + gridSize; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = -gridSize + (offsetY % gridSize); y < h + gridSize; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      animId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animId);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
      motionQuery.removeEventListener("change", onMotionChange);
    };
  }, [initOrbs]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-0"
      style={{ opacity: 0.9 }}
    />
  );
}
