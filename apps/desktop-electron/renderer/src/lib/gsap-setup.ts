/**
 * GSAP Setup — Core initialization + custom utilities
 * Used for heavy animations: 3D tilt, particle systems, timeline sequences
 */
import { gsap } from "gsap";

// ── Register custom eases ──
gsap.registerEase("shield.out", (p: number) => {
  // Smooth overshoot for shield animations
  return 1 - (1 - p) ** 4 * Math.cos(p * Math.PI * 0.5);
});

// ── 3D Tilt Effect ──
// Adds perspective tilt that follows mouse position
export function tiltCard(
  el: HTMLElement,
  options: { maxTilt?: number; perspective?: number; scale?: number; speed?: number } = {}
) {
  const { maxTilt = 8, perspective = 800, scale = 1.02, speed = 0.4 } = options;

  el.style.transformStyle = "preserve-3d";
  el.style.perspective = `${perspective}px`;
  el.style.willChange = "transform";

  const handleMove = (e: MouseEvent) => {
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;

    gsap.to(el, {
      rotateX: -y * maxTilt,
      rotateY: x * maxTilt,
      scale,
      duration: speed,
      ease: "power2.out"
    });
  };

  const handleLeave = () => {
    gsap.to(el, {
      rotateX: 0,
      rotateY: 0,
      scale: 1,
      duration: 0.6,
      ease: "elastic.out(1, 0.5)"
    });
  };

  el.addEventListener("mousemove", handleMove);
  el.addEventListener("mouseleave", handleLeave);

  // Return cleanup function
  return () => {
    el.removeEventListener("mousemove", handleMove);
    el.removeEventListener("mouseleave", handleLeave);
  };
}

// ── Counter Animation ──
export function animateCounter(
  el: HTMLElement,
  endValue: number,
  options: { duration?: number; decimals?: number; suffix?: string } = {}
) {
  const { duration = 1.2, decimals = 0, suffix = "" } = options;
  const obj = { val: 0 };

  return gsap.to(obj, {
    val: endValue,
    duration,
    ease: "power2.out",
    onUpdate: () => {
      el.textContent = obj.val.toFixed(decimals) + suffix;
    }
  });
}

// ── Stagger Reveal ──
export function staggerReveal(
  elements: HTMLElement[] | NodeListOf<HTMLElement>,
  options: { from?: "start" | "center" | "edges"; stagger?: number } = {}
) {
  const { from = "start", stagger = 0.08 } = options;

  return gsap.from(elements, {
    opacity: 0,
    y: 20,
    scale: 0.96,
    duration: 0.6,
    ease: "power3.out",
    stagger: { amount: stagger * (elements as any).length, from }
  });
}

export { gsap };
