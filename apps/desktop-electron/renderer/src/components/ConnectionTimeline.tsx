/**
 * ConnectionTimeline — пошаговая анимация подключения
 *
 * Показывает этапы: Resolve → Connect → Establish → Protected
 * Каждый этап проигрывается с задержкой, создавая визуальный timeline.
 */
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle, Globe, Loader2, Lock, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "../lib/cn";

interface TimelineStep {
  id: string;
  label: string;
  icon: typeof Globe;
}

const STEPS: TimelineStep[] = [
  { id: "resolve", label: "Поиск сервера", icon: Globe },
  { id: "connect", label: "Подключение", icon: Wifi },
  { id: "secure", label: "Шифрование", icon: Lock },
  { id: "done", label: "Защищено", icon: CheckCircle },
];

interface Props {
  isConnecting: boolean;
  isConnected: boolean;
  serverName?: string;
}

export function ConnectionTimeline({ isConnecting, isConnected, serverName }: Props) {
  const [activeStep, setActiveStep] = useState(-1);

  useEffect(() => {
    if (!isConnecting) {
      if (isConnected) {
        setActiveStep(STEPS.length - 1); // All done
      } else {
        setActiveStep(-1);
      }
      return;
    }

    // Simulate step progression during connecting
    setActiveStep(0);
    const timers: NodeJS.Timeout[] = [];
    timers.push(setTimeout(() => setActiveStep(1), 600));
    timers.push(setTimeout(() => setActiveStep(2), 1400));
    return () => timers.forEach(clearTimeout);
  }, [isConnecting, isConnected]);

  if (activeStep < 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center gap-1.5 z-10"
      >
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const isActive = i === activeStep;
          const isDone = i < activeStep || (isConnected && i === STEPS.length - 1);
          const isPending = i > activeStep;

          return (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1, type: "spring", stiffness: 400, damping: 25 }}
              className="flex items-center gap-1.5"
            >
              <div
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold tracking-wide transition-all duration-300",
                  isDone && "text-emerald-400 bg-emerald-500/10",
                  isActive && !isDone && "text-brand bg-brand/10",
                  isPending && "text-white/20 bg-white/[0.02]"
                )}
              >
                {isActive && !isDone ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : isDone ? (
                  <CheckCircle className="w-3 h-3" />
                ) : (
                  <Icon className="w-3 h-3" />
                )}
                <span className="hidden sm:inline">{step.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "w-3 h-px transition-colors duration-500",
                    isDone ? "bg-emerald-500/40" : "bg-white/10"
                  )}
                />
              )}
            </motion.div>
          );
        })}
      </motion.div>
    </AnimatePresence>
  );
}
