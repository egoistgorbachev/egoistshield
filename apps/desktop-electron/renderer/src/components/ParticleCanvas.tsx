/**
 * ParticleCanvas — Interactive Canvas 2D particle system
 * 
 * - 50+ particles drift gently in void
 * - Mouse repels particles within 120px radius
 * - Particles connect with lines when < 100px apart
 * - Color shifts from indigo → emerald when VPN connected
 * - GPU-accelerated via requestAnimationFrame
 */
import { useRef, useEffect, useCallback } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  alpha: number;
}

const PARTICLE_COUNT = 55;
const CONNECTION_DIST = 100;
const MOUSE_RADIUS = 180;
const MOUSE_FORCE = 1.2;

export function ParticleCanvas({ isConnected = false }: { isConnected?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: -999, y: -999 });
  const rafRef = useRef<number>(0);
  const connectedRef = useRef(isConnected);

  // Keep connected state fresh without re-creating particles
  useEffect(() => { connectedRef.current = isConnected; }, [isConnected]);

  const initParticles = useCallback((w: number, h: number) => {
    const particles: Particle[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 1.5 + 0.5,
        alpha: Math.random() * 0.5 + 0.2,
      });
    }
    particlesRef.current = particles;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      if (particlesRef.current.length === 0) {
        initParticles(rect.width, rect.height);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const handleMouseLeave = () => {
      mouseRef.current = { x: -999, y: -999 };
    };

    resize();
    window.addEventListener("resize", resize);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);

    const animate = () => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const connected = connectedRef.current;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      ctx.clearRect(0, 0, w, h);

      const particles = particlesRef.current;

      // Update + draw particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Mouse repulsion
        const dx = p.x - mx;
        const dy = p.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MOUSE_RADIUS && dist > 0) {
          const force = (MOUSE_RADIUS - dist) / MOUSE_RADIUS * MOUSE_FORCE;
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
        }

        // Speed limit
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        const maxSpeed = connected ? 1.2 : 0.6;
        if (speed > maxSpeed) {
          p.vx = (p.vx / speed) * maxSpeed;
          p.vy = (p.vy / speed) * maxSpeed;
        }

        // Friction
        p.vx *= 0.995;
        p.vy *= 0.995;

        // Move
        p.x += p.vx;
        p.y += p.vy;

        // Wrap edges
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;

        // Draw particle
        const color = connected
          ? `rgba(52, 211, 153, ${p.alpha})`  // emerald
          : `rgba(129, 140, 248, ${p.alpha})`; // indigo
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.shadowBlur = 12;
        ctx.shadowColor = connected ? "#34D399" : "#818CF8";
        ctx.fill();
        // Reset shadow for performance on lines
        ctx.shadowBlur = 0;
      }

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          const ddx = a.x - b.x;
          const ddy = a.y - b.y;
          const d = Math.sqrt(ddx * ddx + ddy * ddy);

          if (d < CONNECTION_DIST) {
            const alpha = (1 - d / CONNECTION_DIST) * 0.12;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = connected
              ? `rgba(52, 211, 153, ${alpha})`
              : `rgba(129, 140, 248, ${alpha})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [initParticles]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-auto z-0"
      style={{ opacity: 0.7 }}
    />
  );
}
