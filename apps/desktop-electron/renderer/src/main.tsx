import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "react-error-boundary";
import { Toaster } from "sonner";
import { App } from "./App";

import "./styles/globals.css";

// Тема всегда dark
document.documentElement.setAttribute("data-theme", "dark");

function ErrorFallback({ error, resetErrorBoundary }: { error: unknown; resetErrorBoundary: () => void }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="w-full h-screen bg-surface-app flex flex-col items-center justify-center text-primary px-8">
      <div className="w-16 h-16 mb-6 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
        <span className="text-3xl">⚠️</span>
      </div>
      <h1 className="text-xl font-bold mb-2">Произошла непредвиденная ошибка</h1>
      <p className="text-sm text-secondary mb-6 text-center max-w-md leading-relaxed">{message}</p>
      <button
        type="button"
        onClick={resetErrorBoundary}
        className="px-6 py-2.5 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-400 font-bold text-sm hover:bg-orange-500/20 transition-colors"
      >
        Перезагрузить приложение
      </button>
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary FallbackComponent={ErrorFallback} onReset={() => window.location.reload()}>
        <App />
        <Toaster
          theme="dark"
          position="top-center"
          toastOptions={{
            style: {
              background: "rgba(10, 10, 15, 0.95)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              color: "#f1f5f9",
              backdropFilter: "blur(16px)"
            }
          }}
        />
      </ErrorBoundary>
    </StrictMode>
  );
}
