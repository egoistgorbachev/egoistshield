import { AnimatePresence, motion } from "framer-motion";
import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { ShieldLogo } from "../components/ShieldLogo";
import { useAppStore } from "../store/useAppStore";

type Step = "welcome" | "setup" | "done";
type DragRegionStyle = CSSProperties & { WebkitAppRegion: "drag" };
const DRAG_REGION_STYLE: DragRegionStyle = { WebkitAppRegion: "drag" };

// ─── Animated particles for premium ambience (CSS-based for performance) ───
function FloatingParticles() {
  const particles = Array.from({ length: 8 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 3 + 1,
    duration: Math.random() * 6 + 4,
    delay: Math.random() * 3,
    dx: (Math.random() - 0.5) * 20,
    dy: -(Math.random() * 20 + 10),
    opacity: 0.15 + Math.random() * 0.25
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full animate-float-particle"
          style={
            {
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              background: `rgba(var(--es-brand), ${p.opacity})`,
              animationDelay: `${p.delay}s`,
              "--particle-duration": `${p.duration}s`,
              "--particle-dx": `${p.dx}px`,
              "--particle-dy": `${p.dy}px`,
              "--particle-opacity": `${p.opacity}`
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

// ─── Step 1: Welcome ───
function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <motion.div
      key="welcome"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, y: -30 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="flex flex-col items-center justify-center h-full gap-6 px-10 text-center"
    >
      {/* Logo with entrance animation */}
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
        className="w-40 h-40"
      >
        <ShieldLogo className="w-full h-full" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.5 }}
        className="space-y-3"
      >
        <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-brand-light via-brand to-brand-light bg-clip-text text-transparent">
          Добро пожаловать
        </h1>
        <p className="text-lg text-muted max-w-xs leading-relaxed">
          в <span className="font-bold text-white/90">EgoistShield</span> — локальный клиент для защищённых подключений
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.5 }}
        className="space-y-2 mt-2"
      >
        {["Импорт через ссылку, файл и буфер обмена", "Встроенные сетевые компоненты", "Ручная проверка обновлений и диагностика"].map((text, i) => (
          <motion.div
            key={text}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.1 + i * 0.15, duration: 0.4 }}
            className="flex items-center gap-3 text-sm text-muted"
          >
            <span className="w-5 h-5 rounded-full bg-gradient-to-br from-brand to-brand-light flex items-center justify-center text-[10px] text-white font-black shrink-0">
              ✓
            </span>
            {text}
          </motion.div>
        ))}
      </motion.div>

      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.6, duration: 0.5 }}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.95 }}
        onClick={onNext}
        className="mt-4 px-10 py-3.5 rounded-2xl font-black text-base text-white relative overflow-hidden cursor-pointer border-0 outline-none"
        style={{
          background: "linear-gradient(135deg, rgb(var(--es-brand-light)), rgb(var(--es-brand)))",
          boxShadow: "0 8px 32px rgba(var(--es-brand),0.4), inset 0 1px 0 rgba(255,255,255,0.1)"
        }}
      >
        <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent" />
        <span className="relative z-10">Начать настройку</span>
      </motion.button>
    </motion.div>
  );
}

// ─── Step 2: Setup / Progress ───
function SetupStep({ onComplete }: { onComplete: () => void }) {
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("Подготовка...");
  const installRuntime = useAppStore((s) => s.installRuntime);
  const syncWithBackend = useAppStore((s) => s.syncWithBackend);
  const progressRef = useRef(0);
  const updateProgress = useCallback((nextProgress: number): void => {
    progressRef.current = nextProgress;
    setProgress(nextProgress);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const steps = [
      { at: 10, text: "Подготовка приложения..." },
      { at: 25, text: "Установка Xray runtime..." },
      { at: 50, text: "Настройка сетевых модулей..." },
      { at: 70, text: "Проверка локальной конфигурации..." },
      { at: 85, text: "Синхронизация локального состояния..." },
      { at: 95, text: "Финальная проверка..." },
      { at: 100, text: "Готово" }
    ];

    async function run(): Promise<void> {
      // Animate progress smoothly, pausing at key points for real work
      for (const step of steps) {
        if (cancelled) {
          return;
        }
        // Animate from current to step.at
        setStatusText(step.text);

        // Do real work at specific points
        if (step.at === 25) {
          try {
            await installRuntime();
          } catch (error: unknown) {
            console.warn("[Onboarding] Runtime installation failed", error);
          }
        }
        if (step.at === 85) {
          try {
            await syncWithBackend();
          } catch (error: unknown) {
            console.warn("[Onboarding] Backend sync failed", error);
          }
        }

        // Smooth animate to target
        const start = performance.now();
        const duration = step.at === 100 ? 400 : 600 + Math.random() * 400;
        const from = progressRef.current;

        await new Promise<void>((resolve) => {
          function tick(): void {
            if (cancelled) {
              resolve();
              return;
            }
            const elapsed = performance.now() - start;
            const t = Math.min(elapsed / duration, 1);
            const eased = 1 - (1 - t) ** 3;
            updateProgress(from + (step.at - from) * eased);
            if (t < 1) {
              requestAnimationFrame(tick);
            } else {
              resolve();
            }
          }
          requestAnimationFrame(tick);
        });

        // Small delay between steps for visual breathing room
        if (step.at < 100) {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 200 + Math.random() * 300);
          });
        }
      }

      if (!cancelled) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 600);
        });
        onComplete();
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [installRuntime, onComplete, syncWithBackend, updateProgress]);

  return (
    <motion.div
      key="setup"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -30 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center justify-center h-full gap-8 px-12"
    >
      {/* Pulsing shield */}
      <motion.div
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
        className="w-28 h-28"
      >
        <ShieldLogo className="w-full h-full" />
      </motion.div>

      <div className="w-full max-w-xs space-y-4">
        <h2 className="text-xl font-black text-center text-white/90">Настраиваем EgoistShield</h2>

        {/* Progress bar */}
        <div className="relative h-3 rounded-full bg-white/5 overflow-hidden border border-white/10">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${progress}%`,
              background: "linear-gradient(90deg, rgb(var(--es-brand-light)), rgb(var(--es-brand)))",
              boxShadow: "0 0 20px rgba(var(--es-brand), 0.5)"
            }}
            transition={{ duration: 0.1 }}
          />
          {/* Shimmer effect */}
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)",
              backgroundSize: "200% 100%"
            }}
            animate={{ backgroundPosition: ["-200% 0", "200% 0"] }}
            transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
          />
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">{statusText}</span>
          <span className="font-mono font-bold text-brand">{Math.round(progress)}%</span>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Step 3: Done ───
function DoneStep({ onFinish }: { onFinish: () => void }) {
  return (
    <motion.div
      key="done"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="flex flex-col items-center justify-center h-full gap-6 px-10 text-center"
    >
      {/* Success burst */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 12, delay: 0.1 }}
        className="relative w-32 h-32"
      >
        {/* Glow ring */}
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(var(--es-brand),0.25) 0%, transparent 70%)"
          }}
          animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0.2, 0.5] }}
          transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
        />
        <ShieldLogo className="w-full h-full" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="space-y-2"
      >
        <h1 className="text-2xl font-black bg-gradient-to-r from-brand-light to-brand bg-clip-text text-transparent">
          Приложение готово
        </h1>
        <p className="text-sm text-muted max-w-xs leading-relaxed">
          EgoistShield готов к первому запуску. Добавьте серверы и выберите нужный режим подключения.
        </p>
      </motion.div>

      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.5 }}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.95 }}
        onClick={onFinish}
        className="group mt-2 px-10 py-3.5 rounded-2xl font-black text-base text-white relative overflow-hidden cursor-pointer border-0 outline-none flex items-center justify-center gap-2"
        style={{
          background: "linear-gradient(135deg, rgb(var(--es-brand-light)), rgb(var(--es-brand)))",
          boxShadow: "0 8px 32px rgba(var(--es-brand),0.4), inset 0 1px 0 rgba(255,255,255,0.1)"
        }}
      >
        <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent" />
        <span className="relative z-10">Начать</span>
        <svg
          aria-hidden="true"
          focusable="false"
          className="w-5 h-5 relative z-10 group-hover:translate-x-1 transition-transform"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" className="opacity-40" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      </motion.button>
    </motion.div>
  );
}

// ─── Onboarding Orchestrator ───
export function Onboarding() {
  const [step, setStep] = useState<Step>("welcome");
  const completeFirstRun = useAppStore((s) => s.completeFirstRun);

  const handleFinish = useCallback(async () => {
    await completeFirstRun();
  }, [completeFirstRun]);

  return (
    <div className="relative w-full h-screen bg-surface-app overflow-hidden flex flex-col">
      {/* Ambient background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(800px 500px at 30% 20%, rgba(var(--es-brand), 0.12), transparent 60%),
            radial-gradient(600px 400px at 70% 80%, rgba(var(--es-brand), 0.08), transparent 55%)
          `
        }}
      />
      <FloatingParticles />

      {/* Draggable titlebar zone */}
      <div className="h-10 w-full shrink-0" style={DRAG_REGION_STYLE} />

      {/* Content area */}
      <div className="flex-1 relative z-10">
        <AnimatePresence mode="wait">
          {step === "welcome" && <WelcomeStep onNext={() => setStep("setup")} />}
          {step === "setup" && <SetupStep onComplete={() => setStep("done")} />}
          {step === "done" && <DoneStep onFinish={handleFinish} />}
        </AnimatePresence>
      </div>

      {/* Step indicators */}
      <div className="flex items-center justify-center gap-2 pb-6">
        {(["welcome", "setup", "done"] as Step[]).map((s) => (
          <motion.div
            key={s}
            className="rounded-full"
            style={{
              width: step === s ? 24 : 8,
              height: 8,
              background:
                step === s
                  ? "linear-gradient(90deg, rgb(var(--es-brand-light)), rgb(var(--es-brand)))"
                  : "rgba(255, 255, 255, 0.12)"
            }}
            animate={{ width: step === s ? 24 : 8 }}
            transition={{ duration: 0.3 }}
          />
        ))}
      </div>
    </div>
  );
}
