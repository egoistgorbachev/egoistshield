import { useEffect, useRef } from "react";
import { useAppStore } from "../store/useAppStore";
import { getAPI } from "./api";

const HEALTH_CHECK_INTERVAL = 30_000; // 30 секунд

/**
 * Хук мониторинга здоровья VPN-соединения.
 * Периодически проверяет, жив ли процесс рантайма и обновляет store.
 */
export function useHealthCheck() {
  const isConnected = useAppStore((s) => s.isConnected);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    if (!isConnected) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    const check = async () => {
      const api = getAPI();
      if (!api) return;
      try {
        const status = await api.vpn.status();
        // Если рантайм упал, но store считает, что подключены — синхронизируем
        if (!status.connected && isConnected) {
          console.warn("[HealthCheck] Runtime disconnected unexpectedly, syncing state...");
          useAppStore.getState().syncWithBackend();
          return;
        }

        if (status.lifecycle === "degraded" && status.lastError) {
          useAppStore.setState({ errorMessage: status.lastError });
        }

        if (status.connected && status.activeNodeId) {
          const diagnosis = await api.vpn.diagnose();
          useAppStore.setState((currentState) => ({
            activePing: diagnosis.runtimeReachable ? diagnosis.latencyMs : currentState.activePing,
            servers: currentState.servers.map((server) =>
              server.id === status.activeNodeId
                ? {
                    ...server,
                    ping: diagnosis.runtimeReachable ? diagnosis.latencyMs : server.ping,
                    lastPingAt: Date.now(),
                    jitterMs: diagnosis.jitterMs,
                    lossPercent: diagnosis.lossPercent
                  }
                : server
            )
          }));
        }
      } catch {
        // API недоступен — критическая потеря соединения
        console.error("[HealthCheck] API unreachable");
      }
    };

    // Первая проверка через 10с после подключения
    const startDelay = setTimeout(() => {
      check();
      intervalRef.current = setInterval(check, HEALTH_CHECK_INTERVAL);
    }, 10_000);

    return () => {
      clearTimeout(startDelay);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isConnected]);
}
