import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { cn } from "../lib/cn";

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: string;
}

/**
 * Reusable accessible dialog component with focus trap,
 * Escape-to-close, backdrop click, and ARIA attributes.
 */
export function Dialog({ isOpen, onClose, title, children, maxWidth = "max-w-sm" }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousActiveRef = useRef<HTMLElement | null>(null);

  // Focus trap + Escape
  useEffect(() => {
    if (!isOpen) return;

    previousActiveRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable.item(0);
        const last = focusable.item(focusable.length - 1);
        if (!first || !last) return;

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);

    // Auto-focus first focusable element
    requestAnimationFrame(() => {
      const first = dialogRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      first?.focus();
    });

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousActiveRef.current?.focus();
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Dialog */}
          <motion.dialog
            ref={dialogRef}
            open
            aria-modal="true"
            aria-label={title}
            initial={{ scale: 0.95, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 20, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className={cn(
              "relative bg-void-card border border-white/10 rounded-modal shadow-2xl flex flex-col",
              maxWidth
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-white/5">
              <h3 className="font-bold text-lg text-white">{title}</h3>
              <button
                type="button"
                onClick={onClose}
                className="p-2 text-muted hover:text-white hover:bg-white/5 rounded-xl transition-colors"
                aria-label="Закрыть"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5">{children}</div>
          </motion.dialog>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
