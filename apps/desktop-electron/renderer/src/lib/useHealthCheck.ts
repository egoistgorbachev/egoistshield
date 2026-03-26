import { useEffect, useRef } from "react";
import { useAppStore } from "../store/useAppStore";
import { getAPI } from "./api";

const HEALTH_CHECK_INTERVAL = 30_000;
const EARLY_HEALTH_CHECK_DELAYS_MS = [3_000, 10_000] as const;

/**
 * Хук мониторинга здоровья VPN-соединения.
 * Периодически проверяет, жив ли процесс рантайма и обновляет store.
 */
export function useHealthCheck() {
  const isConnected = useAppStore((state) => state.isConnected);
  const recordRuntimeHealth = useAppStore((state) => state.recordRuntimeHealth);
  const syncWithBackend = useAppStore((state) => state.syncWithBackend);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    if (!isConnected) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      return;
    }

    const check = async () => {
      const api = getAPI();
      if (!api) {
        return;
      }

      try {
        const status = await api.vpn.status();
        if (!status.connected && isConnected) {
          console.warn("[HealthCheck] Runtime disconnected unexpectedly, syncing state...");
          await syncWithBackend();
          return;
        }

        if (status.connected && status.activeNodeId) {
          const diagnosis = await api.vpn.diagnose();
          recordRuntimeHealth(status, diagnosis);
        }
      } catch {
        console.error("[HealthCheck] API unreachable");
      }
    };

    const earlyTimeouts = EARLY_HEALTH_CHECK_DELAYS_MS.map((delayMs) => setTimeout(() => void check(), delayMs));
    const intervalStart = setTimeout(() => {
      void check();
      intervalRef.current = setInterval(() => {
        void check();
      }, HEALTH_CHECK_INTERVAL);
    }, HEALTH_CHECK_INTERVAL);

    return () => {
      for (const timeout of earlyTimeouts) {
        clearTimeout(timeout);
      }
      clearTimeout(intervalStart);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isConnected, recordRuntimeHealth, syncWithBackend]);
}
