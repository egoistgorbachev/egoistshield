import { AlertTriangle, RefreshCw } from "lucide-react";
import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Глобальный Error Boundary — ловит ошибки рендеринга и предотвращает краш всего приложения.
 * Показывает дружелюбный UI с возможностью перезагрузки.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Перехвачена ошибка рендеринга:", error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6">
            <AlertTriangle className="w-10 h-10 text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-white/90 mb-2">Что-то пошло не так</h2>
          <p className="text-sm text-muted max-w-sm mb-2">Произошла непредвиденная ошибка.</p>
          {this.state.error && (
            <pre className="text-xs text-red-400/70 bg-red-500/5 border border-red-500/10 rounded-xl p-3 max-w-md overflow-auto mb-6 font-mono">
              {this.state.error.message}
            </pre>
          )}
          <button
            type="button"
            onClick={this.handleReload}
            className="px-6 py-3 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 font-bold rounded-xl border border-orange-500/30 transition-all flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> Попробовать снова
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
