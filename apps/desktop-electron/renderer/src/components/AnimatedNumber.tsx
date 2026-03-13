import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect } from "react";

/**
 * Плавная анимация числовых значений через framer-motion springs (60 fps)
 */
export function useAnimatedNumber(target: number, stiffness = 120, damping = 20) {
  const mv = useMotionValue(target);
  const spring = useSpring(mv, { stiffness, damping, mass: 0.5 });
  useEffect(() => {
    mv.set(target);
  }, [target, mv]);
  return spring;
}

/**
 * Компонент анимированного числа
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  className
}: {
  value: number;
  decimals?: number;
  className?: string;
}) {
  const spring = useAnimatedNumber(value);
  const display = useTransform(spring, (v) => (decimals > 0 ? v.toFixed(decimals) : Math.round(v).toString()));
  return <motion.span className={className}>{display}</motion.span>;
}
