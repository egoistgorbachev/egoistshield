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

/** Плавное появление с масштабированием (страницы) */
export const pageTransition = {
    initial: { opacity: 0, scale: 0.97, filter: "blur(4px)" },
    animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
    exit: { opacity: 0, scale: 0.97, filter: "blur(4px)" },
    transition: {
        ...springSnappy,
        opacity: { duration: 0.18 },
        filter: { duration: 0.2 },
    },
};

/** Простое появление/исчезание */
export const fadeIn = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.2 },
};

/** Появление снизу (карточки, списки) */
export const slideUp = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 8 },
    transition: springSmooth,
};

/** Появление с масштабом (модалки, попапы) */
export const scaleIn = {
    initial: { opacity: 0, scale: 0.92 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.92 },
    transition: springSnappy,
};

/** Появление справа (панели) */
export const slideRight = {
    initial: { opacity: 0, x: 16 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -8 },
    transition: springSmooth,
};

/** Hover + tap preset для кнопок */
export const tapScale = {
    whileHover: { scale: 1.03 },
    whileTap: { scale: 0.97 },
    transition: { duration: 0.15 },
};

/** Stagger-контейнер для списков */
export const staggerContainer = {
    animate: { transition: { staggerChildren: 0.04 } },
};

/** Stagger-дочерний элемент */
export const staggerItem = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.2 },
};

// ── v2 Extended Presets ──

/** Glass card — появление с мягким масштабом и blur */
export const glassCard = {
    initial: { opacity: 0, y: 10, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: 6, scale: 0.98 },
    transition: { ...springSmooth, opacity: { duration: 0.25 } },
};

/** Пульсирующая кнопка — для кнопки подключения */
export const buttonPulse = {
    whileHover: { scale: 1.05, transition: springBouncy },
    whileTap: { scale: 0.95, transition: { duration: 0.1 } },
};

/** Toggle switch preset */
export const toggleSwitch = {
    initial: false,
    transition: { ...springBouncy, duration: 0.25 },
};

/** Shimmer effect для загрузки */
export const shimmerEffect = {
    initial: { x: "-100%" },
    animate: { x: "100%" },
    transition: { duration: 1.5, ease: "easeInOut", repeat: Infinity },
};

