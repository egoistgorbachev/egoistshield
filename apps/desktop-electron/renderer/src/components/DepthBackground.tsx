import { useCallback, useEffect, useRef } from "react";

/* ──────────────────────────────────────────────────────────
   DepthBackground — Interactive 3D depth grid + floating orbs
   + radial vignette + center glow for volumetric feel.
   Follows mouse parallax for depth illusion.
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

      // More orbs for richer background (5 instead of 3)
      for (let i = 0; i < 5; i++) {
        orbs.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: 100 + Math.random() * 160,
          speed: 0.15 + Math.random() * 0.25,
          depth: 0.3 + Math.random() * 0.7,
          hue: isConnected ? 150 + Math.random() * 30 : 10 + Math.random() * 20,
          opacity: 0.03 + Math.random() * 0.05
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

    let animId: number | null = null;
    let w = 0;
    let h = 0;
    let time = 0;
    let frameSkip = 0;

    // ── Performance: skip draw when not visible ──
    let isInViewport = true;
    let isPageVisible = !document.hidden;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        isInViewport = entry.isIntersecting;
        if (isInViewport) {
          renderCurrentFrame();
          scheduleNextFrame();
        } else {
          stopAnimation();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(canvas);

    const onVisibility = () => {
      isPageVisible = !document.hidden;
      if (isPageVisible) {
        renderCurrentFrame();
        scheduleNextFrame();
      } else {
        stopAnimation();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Cache reduced-motion preference outside draw loop
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    const onMotionChange = (e: MediaQueryListEvent) => {
      reducedMotion = e.matches;
      renderCurrentFrame();
      if (reducedMotion) {
        stopAnimation();
      } else {
        scheduleNextFrame();
      }
    };
    motionQuery.addEventListener("change", onMotionChange);

    const shouldAnimate = () => isInViewport && isPageVisible && !reducedMotion;

    const stopAnimation = () => {
      if (animId !== null) {
        cancelAnimationFrame(animId);
        animId = null;
      }
    };

    const renderFrame = () => {
      ctx.clearRect(0, 0, w, h);

      const mx = (mouseRef.current.x - 0.5) * 2;
      const my = (mouseRef.current.y - 0.5) * 2;

      // -- Subtle center glow for volumetric depth --
      const centerX = w * 0.5 + mx * 20;
      const centerY = h * 0.35 + my * 15;
      const centerGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, w * 0.5);
      const glowColor = isConnected ? "rgba(52, 211, 153, 0.04)" : "rgba(255, 76, 41, 0.03)";
      centerGrad.addColorStop(0, glowColor);
      centerGrad.addColorStop(0.6, "rgba(5, 21, 32, 0.01)");
      centerGrad.addColorStop(1, "transparent");
      ctx.fillStyle = centerGrad;
      ctx.fillRect(0, 0, w, h);

      // -- Floating orbs with parallax --
      for (const orb of orbsRef.current) {
        const px = orb.x + Math.sin(time * orb.speed) * 30 + mx * 15 * orb.depth;
        const py = orb.y + Math.cos(time * orb.speed * 0.7) * 20 + my * 10 * orb.depth;

        const grad = ctx.createRadialGradient(px, py, 0, px, py, orb.r);
        const hsl = `hsla(${orb.hue}, 85%, 45%, ${orb.opacity})`;
        const hslT = `hsla(${orb.hue}, 85%, 45%, 0)`;
        grad.addColorStop(0, hsl);
        grad.addColorStop(0.6, `hsla(${orb.hue}, 85%, 45%, ${orb.opacity * 0.3})`);
        grad.addColorStop(1, hslT);
        ctx.fillStyle = grad;
        ctx.fillRect(px - orb.r, py - orb.r, orb.r * 2, orb.r * 2);
      }

      // -- Subtle grid with parallax --
      const gridSize = 80;
      const gridOpacity = 0.02;
      ctx.strokeStyle = `rgba(255,76,41,${gridOpacity})`;
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

      // -- Edge vignette for depth framing --
      const vigGrad = ctx.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, w * 0.75);
      vigGrad.addColorStop(0, "transparent");
      vigGrad.addColorStop(0.7, "rgba(5, 21, 32, 0.15)");
      vigGrad.addColorStop(1, "rgba(3, 10, 18, 0.45)");
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, w, h);
    };

    const renderCurrentFrame = () => {
      if (w === 0 || h === 0) {
        return;
      }
      renderFrame();
    };

    const scheduleNextFrame = () => {
      if (animId !== null || !shouldAnimate()) {
        return;
      }

      animId = requestAnimationFrame(draw);
    };

    function draw() {
      animId = null;
      time += 0.008;
      frameSkip++;

      // Performance: throttle to ~30fps when connected (SpeedGraph gets GPU priority)
      if (isConnected && frameSkip % 2 !== 0) {
        scheduleNextFrame();
        return;
      }

      if (!shouldAnimate()) {
        return;
      }

      renderFrame();
      scheduleNextFrame();
    }

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      if (orbsRef.current.length === 0) initOrbs(w, h);
      renderCurrentFrame();
      scheduleNextFrame();
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (w === 0 || h === 0) {
        return;
      }
      mouseRef.current.x = e.clientX / w;
      mouseRef.current.y = e.clientY / h;
      if (!shouldAnimate()) {
        renderCurrentFrame();
      }
    };

    orbsRef.current = [];
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", handleMouseMove);

    renderCurrentFrame();
    scheduleNextFrame();

    return () => {
      stopAnimation();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
      motionQuery.removeEventListener("change", onMotionChange);
    };
  }, [initOrbs, isConnected]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-0"
      style={{ opacity: 0.9 }}
    />
  );
}
