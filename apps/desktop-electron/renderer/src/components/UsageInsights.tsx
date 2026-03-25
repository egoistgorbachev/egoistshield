import { motion } from "framer-motion";
import { Activity, Clock, Download, Globe } from "lucide-react";
import { useEffect, useState } from "react";
import type { UsageRecord } from "../../../shared/types";
import { getAPI } from "../lib/api";
import { cn } from "../lib/cn";

function useUsageHistory(): { history: UsageRecord[]; loading: boolean } {
  const [history, setHistory] = useState<UsageRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const fetchHistory = async (): Promise<void> => {
      try {
        const api = getAPI();
        if (api?.usage?.getHistory) {
          const data = await api.usage.getHistory();
          if (mounted) {
            setHistory(data || []);
          }
        }
      } catch (error: unknown) {
        console.error("Failed to load usage history", error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };
    void fetchHistory();
    return () => {
      mounted = false;
    };
  }, []);

  return { history, loading };
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}с`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}м`;
  const h = Math.floor(m / 60);
  const leftM = m % 60;
  return `${h}ч ${leftM}м`;
}

function formatBytesStats(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function UsageInsights({ className }: { className?: string }) {
  const { history, loading } = useUsageHistory();

  if (loading || history.length === 0) return null;

  // Рассчитываем статистику за последние 7 дней
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const recentHistory = history.filter((record) => record.timestamp >= weekAgo);
  if (recentHistory.length === 0) return null;

  let totalDuration = 0;
  let totalData = 0;
  let totalPing = 0;
  let pingCount = 0;

  const serverCounts: Record<string, number> = {};

  for (const record of recentHistory) {
    totalDuration += record.durationSec;
    totalData += record.down + record.up;
    if (record.ping > 0) {
      totalPing += record.ping;
      pingCount++;
    }
    serverCounts[record.serverId] = (serverCounts[record.serverId] || 0) + 1;
  }

  const avgPing = pingCount > 0 ? Math.round(totalPing / pingCount) : 0;
  const uniqueServerCount = Object.keys(serverCounts).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex flex-col gap-3 w-full border border-white/[0.05] bg-white/[0.02] p-4 rounded-2xl",
        "backdrop-blur-md shadow-card",
        className
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <Activity className="w-4 h-4 justify-center text-brand" />
        <h3 className="text-[13px] font-bold uppercase tracking-wider text-white/90">Статистика за неделю</h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Инфо карточки */}
        <div className="flex items-center gap-3 bg-white/[0.03] rounded-xl p-3 border border-white/[0.02]">
          <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] text-muted font-medium mb-0.5">ВРЕМЯ</span>
            <span className="text-sm font-bold text-white/90 font-mono-metric">{formatDuration(totalDuration)}</span>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-white/[0.03] rounded-xl p-3 border border-white/[0.02]">
          <div className="h-8 w-8 rounded-lg bg-cyan-500/10 flex items-center justify-center shrink-0">
            <Download className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] text-muted font-medium mb-0.5">ТРАФИК</span>
            <span className="text-sm font-bold text-white/90 font-mono-metric">{formatBytesStats(totalData)}</span>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-white/[0.03] rounded-xl p-3 border border-white/[0.02]">
          <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
            <Activity className="w-4 h-4 text-violet-400" />
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] text-muted font-medium mb-0.5">СР. PING</span>
            <span className="text-sm font-bold text-white/90 font-mono-metric">
              {avgPing > 0 ? `${avgPing} мс` : "—"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-white/[0.03] rounded-xl p-3 border border-white/[0.02]">
          <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
            <Globe className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] text-muted font-medium mb-0.5">СЕАНСОВ</span>
            <span className="text-sm font-bold text-white/90 font-mono-metric truncate">{recentHistory.length}</span>
          </div>
        </div>

        <div className="col-span-2 flex items-center justify-between rounded-xl border border-white/[0.02] bg-white/[0.03] px-3 py-2.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">Уникальных узлов</span>
          <span className="text-sm font-bold text-white/90 font-mono-metric">{uniqueServerCount}</span>
        </div>
      </div>
    </motion.div>
  );
}
