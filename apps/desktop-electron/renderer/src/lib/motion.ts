/**
 * Motion Presets — стандартизированные анимации Framer Motion.
 *
 * Используйте `{...fadeIn}` или `{...slideUp}` вместо
 * инлайн-объектов `initial/animate/exit/transition`.
 */

// ── Базовые spring-параметры ──
const springSnappy = { type: "spring" as const, stiffness: 350, damping: 30, mass: 0.8 };
const springSmooth = { type: "spring" as const, stiffness: 260, damping: 28, mass: 1 };
const springBouncy = { type: "spring" as const, stiffness: 400, damping: 22, mass: 0.6 };

// ── Presets ──

/** Плавное появление с вертикальным сдвигом (страницы) */
export const pageTransition = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: {
    ...springSnappy,
    opacity: { duration: 0.15 }
  }
};

/** Простое появление/исчезание */
export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2 }
};

/** Появление снизу (карточки, списки) */
export const slideUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 8 },
  transition: springSmooth
};

/** Появление с масштабом (модалки, попапы) */
export const scaleIn = {
  initial: { opacity: 0, scale: 0.92 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.92 },
  transition: springSnappy
};

/** Появление справа (панели) */
export const slideRight = {
  initial: { opacity: 0, x: 16 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -8 },
  transition: springSmooth
};

/** Hover + tap preset для кнопок */
export const tapScale = {
  whileHover: { scale: 1.03 },
  whileTap: { scale: 0.97 },
  transition: { duration: 0.15 }
};

/** Stagger-контейнер для списков */
export const staggerContainer = {
  animate: { transition: { staggerChildren: 0.04 } }
};

/** Stagger-дочерний элемент */
export const staggerItem = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.2 }
};

// ── v2 Extended Presets ──

/** Glass card — появление с мягким масштабом и blur */
export const glassCard = {
  initial: { opacity: 0, y: 10, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 6, scale: 0.98 },
  transition: { ...springSmooth, opacity: { duration: 0.25 } }
};

/** Пульсирующая кнопка — для кнопки подключения */
export const buttonPulse = {
  whileHover: { scale: 1.05, transition: springBouncy },
  whileTap: { scale: 0.95, transition: { duration: 0.1 } }
};

/** Toggle switch preset */
export const toggleSwitch = {
  initial: false,
  transition: { ...springBouncy, duration: 0.25 }
};

/** Shimmer effect для загрузки */
export const shimmerEffect = {
  initial: { x: "-100%" },
  animate: { x: "100%" },
  transition: { duration: 1.5, ease: "easeInOut", repeat: Number.POSITIVE_INFINITY }
};

// ═══════════════════════════════════════════════════════════
// MOTION v2 — Structured API (use for new components)
// Replaces inline { type: "spring", stiffness: N, damping: N }
// ═══════════════════════════════════════════════════════════

export const MOTION = {
  /** Spring presets — use as transition={MOTION.spring.snappy} */
  spring: {
    /** Buttons, toggles, quick tactile feedback */
    snappy: springSnappy,
    /** Panels, cards, navigation transitions */
    gentle: springSmooth,
    /** Playful: orbit particles, power button release */
    bouncy: springBouncy,
    /** Modal/dialog entrance — firm with minimal overshoot */
    modal: springSnappy
  },

  /** Easing presets (non-spring) */
  ease: {
    /** Standard enter: ease-out (decelerate) */
    enter: { duration: 0.3, ease: [0.0, 0.0, 0.2, 1] as const },
    /** Standard exit: ease-in (accelerate) */
    exit: { duration: 0.2, ease: [0.4, 0.0, 1, 1] as const },
    /** Emphasis: ease-in-out (symmetric) */
    emphasis: { duration: 0.5, ease: [0.4, 0.0, 0.2, 1] as const }
  },

  /** Standard variant sets — spread onto motion components */
  variants: {
    fade: fadeIn,
    slideUp,
    scaleIn,
    slideRight,
    glassCard,
    page: pageTransition,
    dialog: {
      initial: { scale: 0.95, y: 20, opacity: 0 },
      animate: { scale: 1, y: 0, opacity: 1 },
      exit: { scale: 0.95, y: 20, opacity: 0 }
    }
  }
} as const;
