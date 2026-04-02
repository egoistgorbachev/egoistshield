import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, FileText, FolderOpen, Info, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import type { RuntimeLogSummary } from "../../../electron/ipc/contracts";
import { getAPI } from "../lib/api";
import { cn } from "../lib/cn";

interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
}

type LogFilter = "all" | "info" | "warn" | "error";

const LEVEL_STYLES: Record<LogEntry["level"], { text: string; bg: string; icon: string }> = {
  info: { text: "text-blue-300", bg: "bg-blue-500/10", icon: "ℹ️" },
  debug: { text: "text-gray-400", bg: "bg-white/5", icon: "🔍" },
  warn: { text: "text-amber-400", bg: "bg-amber-500/10", icon: "⚠️" },
  error: { text: "text-red-400", bg: "bg-red-500/10", icon: "❌" }
};

const isLogLevel = (level: string): level is LogEntry["level"] => level in LEVEL_STYLES;

const toLogEntries = (entries: Array<{ timestamp: string; level: string; message: string }>): LogEntry[] =>
  entries.filter((entry): entry is LogEntry => isLogLevel(entry.level));

export function ConnectionLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [runtimeEvents, setRuntimeEvents] = useState<RuntimeLogSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<LogFilter>("all");
  const [expanded, setExpanded] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const api = getAPI();
      if (!api) {
        return;
      }

      const entries = await api.logs.getRecent(500);
      const runtimeSummary = await api.logs.getRuntimeSummary(50);
      setLogs(toLogEntries(entries));
      setRuntimeEvents(runtimeSummary);
      setLoaded(true);
    } catch (error: unknown) {
      console.error("Failed to load logs:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const openFolder = useCallback(async () => {
    const api = getAPI();
    if (!api) {
      return;
    }

    await api.logs.openFolder();
  }, []);

  const filteredLogs = useMemo(() => {
    if (filter === "all") return logs;
    return logs.filter((l) => l.level === filter);
  }, [logs, filter]);

  const counts = useMemo(() => {
    const c = { info: 0, warn: 0, error: 0, debug: 0 };
    for (const l of logs) c[l.level]++;
    return c;
  }, [logs]);

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => {
          setExpanded(!expanded);
          if (!loaded && !expanded) loadLogs();
        }}
        className="w-full flex items-center justify-between px-1 py-2 group"
      >
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-brand" />
          <span className="text-sm font-semibold text-white/90 group-hover:text-white transition-colors">
            Журнал подключений
          </span>
        </div>
        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-4 h-4 text-muted" />
        </motion.div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="overflow-hidden"
          >
            {/* Controls */}
            <div className="flex items-center gap-2 mb-3">
              {/* Filter pills */}
              <div className="flex gap-1 p-0.5 rounded-xl bg-white/[0.03] border border-white/5 flex-1">
                {(["all", "info", "warn", "error"] as LogFilter[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={cn(
                      "flex-1 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all uppercase tracking-wide",
                      filter === f ? "bg-brand/10 text-brand border border-brand/20" : "text-subtle hover:text-white/60"
                    )}
                  >
                    {f === "all" ? `Все (${logs.length})` : `${f} (${counts[f]})`}
                  </button>
                ))}
              </div>

              {/* Refresh */}
              <button
                type="button"
                onClick={loadLogs}
                disabled={loading}
                className="p-2 rounded-xl bg-white/5 border border-white/10 text-muted hover:text-white hover:bg-white/10 transition-all"
                title="Обновить логи"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              </button>

              {/* Open folder */}
              <button
                type="button"
                onClick={openFolder}
                className="p-2 rounded-xl bg-white/5 border border-white/10 text-muted hover:text-white hover:bg-white/10 transition-all"
                title="Открыть папку логов"
              >
                <FolderOpen className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Log entries */}
            {runtimeEvents.length > 0 && (
              <div className="mb-3 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted">Сводка ядра</div>
                <div className="space-y-2">
                  {runtimeEvents
                    .slice(-4)
                    .reverse()
                    .map((event) => (
                      <div
                        key={`${event.timestamp}-${event.lifecycle}-${event.reason ?? "none"}-${event.message}`}
                        className="flex items-start justify-between gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand">
                              {event.lifecycle}
                            </span>
                            {event.reason && (
                              <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                                {event.reason}
                              </span>
                            )}
                            {event.runtimeKind && (
                              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-white/65">
                                {event.runtimeKind}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-[11px] leading-relaxed text-white/75">{event.message}</p>
                        </div>
                        <span className="shrink-0 text-[10px] font-mono text-subtle">
                          {event.timestamp.split("T")[1]?.split(".")[0] ?? event.timestamp}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
            <div className="rounded-xl border border-white/5 bg-void/60 max-h-[300px] overflow-y-auto custom-scrollbar">
              {!loaded ? (
                <div className="flex items-center justify-center py-8 text-muted text-sm">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Загрузка...
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-muted text-sm">
                  <Info className="w-4 h-4 mr-2" />
                  {filter !== "all" ? "Нет записей для этого фильтра" : "Логи пусты"}
                </div>
              ) : (
                <div className="divide-y divide-white/[0.03]">
                  {filteredLogs.slice(-200).map((entry) => {
                    const style = LEVEL_STYLES[entry.level];
                    return (
                      <div
                        key={`${entry.timestamp}-${entry.level}-${entry.message}`}
                        className={cn(
                          "px-3 py-1.5 flex gap-2 text-[11px] hover:bg-white/[0.02] transition-colors",
                          style.bg
                        )}
                      >
                        <span className="text-subtle font-mono shrink-0 select-all">
                          {entry.timestamp.split(" ")[1]?.split(".")[0] || entry.timestamp}
                        </span>
                        <span className={cn("font-bold uppercase w-10 shrink-0 text-center", style.text)}>
                          {entry.level === "error"
                            ? "ERR"
                            : entry.level === "warn"
                              ? "WRN"
                              : entry.level === "debug"
                                ? "DBG"
                                : "INF"}
                        </span>
                        <span className="text-white/75 font-mono break-all flex-1 select-all whitespace-pre-wrap">
                          {entry.message}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {loaded && filteredLogs.length > 200 && (
              <p className="text-[10px] text-subtle mt-1 text-center">
                Показаны последние 200 из {filteredLogs.length} записей
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
