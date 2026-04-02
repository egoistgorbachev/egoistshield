/**
 * VPN IPC Handlers — vpn:connect, vpn:disconnect, vpn:status, vpn:diagnose,
 * vpn:stress-test, vpn:route-probe, vpn:ping, vpn:ping-active-proxy,
 * vpn:get-my-ip, vpn:speedtest
 */
import http from "node:http";
import { Socket } from "node:net";
import tls from "node:tls";
import { Notification, ipcMain } from "electron";
import { updateTrayMenu } from "../main";
import type { RouteProbeResult, RuntimeStatus } from "./contracts";
import type { IpcContext } from "./ipc-context";
import { PingInputSchema, StressTestInputSchema } from "./ipc-schemas";
import logger, { formatRuntimeLogEvent } from "./logger";
import { buildRouteProbeResult, extractRouteProbeIp } from "./route-probe";

const ACTIVE_PROXY_PING_CACHE_TTL_MS = 2_000;
const ROUTE_PROBE_ENDPOINT = "https://ipwho.is/?fields=ip,success";
const IS_TEST_MOCK_RUNTIME =
  process.env.EGOISTSHIELD_MOCK_RUNTIME === "1" &&
  (process.env.NODE_ENV === "test" || process.env.VITEST === "true");

let activeProxyPingInFlight: Promise<number> | null = null;
let activeProxyPingLastValue = -1;
let activeProxyPingLastMeasuredAt = 0;

type ProbeResponse = {
  ok: boolean;
  status?: number;
  json(): Promise<unknown>;
};

function logVpnStatusEvent(level: "info" | "warn" | "error" | "debug", message: string, status: RuntimeStatus): void {
  const payload = formatRuntimeLogEvent({
    timestamp: new Date().toISOString(),
    level,
    lifecycle: status.lifecycle,
    reason: status.diagnostic.reason,
    message,
    nodeId: status.activeNodeId,
    runtimeKind: status.runtimeKind,
    proxyPort: status.proxyPort
  });

  if (level === "error") {
    logger.error(payload);
    return;
  }

  if (level === "warn") {
    logger.warn(payload);
    return;
  }

  if (level === "debug") {
    logger.debug(payload);
    return;
  }

  logger.info(payload);
}

async function fetchRouteProbeIp(label: "direct" | "proxy", request: () => Promise<ProbeResponse>): Promise<string | null> {
  try {
    const response = await request();
    if (!response.ok) {
      logger.debug(`[vpn:route-probe] ${label} probe returned HTTP ${response.status ?? "unknown"}`);
      return null;
    }

    return extractRouteProbeIp(await response.json());
  } catch (error: unknown) {
    logger.debug(`[vpn:route-probe] ${label} probe failed:`, error);
    return null;
  }
}

export function registerVpnHandlers({ stateStore, runtimeManager, zapretManager }: IpcContext): void {
  ipcMain.handle("vpn:connect", async (_event, requestedNodeId?: string) => {
    const state = stateStore.get();

    // Приоритет: переданный nodeId > activeNodeId из state
    const targetNodeId = requestedNodeId || state.activeNodeId;
    const activeNode = state.nodes.find((node) => node.id === targetNodeId) ?? null;

    if (!activeNode) {
      logger.error(
        "[vpn:connect] Node not found. targetNodeId:",
        targetNodeId,
        "requestedNodeId:",
        requestedNodeId,
        "stateActiveNodeId:",
        state.activeNodeId
      );
      return {
        ...(await runtimeManager.status()),
        lastError: `Узел не найден (ID: ${targetNodeId || "не указан"}). Выберите сервер.`,
        lifecycle: "failed" as const,
        diagnostic: {
          reason: "server_unreachable" as const,
          details: `Узел не найден (ID: ${targetNodeId || "не указан"}). Выберите сервер.`,
          updatedAt: new Date().toISOString(),
          fallbackAttempted: false,
          fallbackTarget: null
        }
      };
    }

    logger.info("[vpn:connect] Connecting to:", activeNode.name, "id:", activeNode.id);

    if (!IS_TEST_MOCK_RUNTIME) {
      try {
        await zapretManager.prepareForVpn(state.settings.zapretSuspendDuringVpn);
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Не удалось безопасно приостановить Zapret перед запуском VPN.";
        logger.warn("[vpn:connect] Zapret suspend failed:", error);
        return {
          ...(await runtimeManager.status()),
          lastError: message,
          lifecycle: "failed" as const,
          diagnostic: {
            reason: "runtime_start_failed" as const,
            details: message,
            updatedAt: new Date().toISOString(),
            fallbackAttempted: false,
            fallbackTarget: null
          }
        };
      }
    }

    const result = await runtimeManager.connect(activeNode, state.domainRules, [], {
      ...state.settings,
      useTunMode: false
    });

    if (!IS_TEST_MOCK_RUNTIME && !result.connected && state.settings.zapretSuspendDuringVpn) {
      try {
        await zapretManager.restoreAfterVpnIfNeeded(
          state.settings.zapretSuspendDuringVpn,
          state.settings.zapretProfile
        );
      } catch (error: unknown) {
        logger.warn("[vpn:connect] Failed to restore Zapret after unsuccessful VPN connect:", error);
      }
    }

    if (result.connected && result.activeNodeId === activeNode.id && state.activeNodeId !== activeNode.id) {
      await stateStore.patch({ activeNodeId: activeNode.id });
    }

    if (Notification.isSupported()) {
      const currentState = stateStore.get();
      const notificationsEnabled = currentState.settings.notifications !== false;
      const connectedNode =
        currentState.nodes.find((node) => node.id === result.activeNodeId) ??
        currentState.nodes.find((node) => node.id === activeNode.id) ??
        activeNode;
      if (notificationsEnabled) {
        if (result.connected && result.activeNodeId === activeNode.id) {
          new Notification({
            title: "EgoistShield: Защита включена",
            body: `Подключено к: ${activeNode.name}`,
            silent: true
          }).show();
        } else if (result.connected && connectedNode) {
          new Notification({
            title: "EgoistShield: Переключение отменено",
            body: `Сохранено текущее соединение: ${connectedNode.name}`,
            silent: true
          }).show();
        } else if (result.lastError) {
          new Notification({
            title: "EgoistShield: Ошибка",
            body: `${activeNode.name}: ${result.lastError}`
          }).show();
        }
      }
    }

    updateTrayMenu(result.connected);
    logVpnStatusEvent(result.connected ? "info" : "warn", "vpn:connect completed", result);

    return result;
  });

  ipcMain.handle("vpn:disconnect", async () => {
    const result = await runtimeManager.disconnect();
    const state = stateStore.get();

    if (!IS_TEST_MOCK_RUNTIME && state.settings.zapretSuspendDuringVpn) {
      try {
        await zapretManager.restoreAfterVpnIfNeeded(
          state.settings.zapretSuspendDuringVpn,
          state.settings.zapretProfile
        );
      } catch (error: unknown) {
        logger.warn("[vpn:disconnect] Failed to restore Zapret service:", error);
      }
    }

    if (Notification.isSupported()) {
      const currentState = stateStore.get();
      const notificationsEnabled = currentState.settings.notifications !== false;
      if (notificationsEnabled) {
        new Notification({
          title: "EgoistShield: Отключено",
          body: "VPN отключён. Трафик не защищён.",
          silent: true
        }).show();
      }
    }

    updateTrayMenu(false);
    logVpnStatusEvent("info", "vpn:disconnect completed", result);

    return result;
  });

  ipcMain.handle("vpn:status", async () => {
    return runtimeManager.status();
  });

  ipcMain.handle("vpn:diagnose", async () => {
    const result = await runtimeManager.diagnose();
    logger.debug(
      formatRuntimeLogEvent({
        timestamp: new Date().toISOString(),
        level: "debug",
        lifecycle: result.lifecycle ?? "failed",
        reason: result.failureReason ?? null,
        message: result.message,
        nodeId: null,
        runtimeKind: null,
        proxyPort: null
      })
    );
    return result;
  });

  ipcMain.handle("vpn:stress-test", async (_event, rawIterations: unknown) => {
    const iterations = StressTestInputSchema.parse(rawIterations);
    const state = stateStore.get();
    const activeNode = state.nodes.find((node) => node.id === state.activeNodeId) ?? null;
    if (!activeNode) {
      return {
        iterations,
        connectSuccess: 0,
        connectFailed: iterations,
        disconnectSuccess: 0,
        disconnectFailed: 0,
        errors: ["Нет активного узла для стресс-теста."]
      };
    }

    return runtimeManager.stressTest(
      activeNode,
      state.domainRules,
      [],
      { ...state.settings, useTunMode: false },
      iterations
    );
  });

  // Route probe: сравниваем прямой egress и egress через локальный VPN proxy.
  const handleRouteProbe = async (): Promise<RouteProbeResult> => {
    try {
      const status = await runtimeManager.status();
      if (!status.connected) {
        return { bypassDetected: false, directIp: null, vpnIp: null, error: "VPN не подключён" };
      }

      const proxyPort = status.proxyPort ?? 10808;
      const { ProxyAgent, fetch: proxyFetch } = await import("undici");
      const dispatcher = new ProxyAgent(`http://127.0.0.1:${proxyPort}`);

      const directIp = await fetchRouteProbeIp("direct", () =>
        fetch(ROUTE_PROBE_ENDPOINT, { signal: AbortSignal.timeout(5000) })
      );
      const vpnIp = await fetchRouteProbeIp("proxy", () =>
        proxyFetch(ROUTE_PROBE_ENDPOINT, {
          dispatcher,
          signal: AbortSignal.timeout(8000)
        }) as Promise<ProbeResponse>
      );

      return buildRouteProbeResult({ directIp, vpnIp });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Ошибка проверки сетевого маршрута";
      return { bypassDetected: false, directIp: null, vpnIp: null, error: msg };
    }
  };

  ipcMain.handle("vpn:route-probe", handleRouteProbe);
  ipcMain.handle("vpn:dns-leak-test", handleRouteProbe);

  // TCP Ping
  ipcMain.handle("vpn:ping", async (_event, rawHost: unknown, rawPort: unknown, rawTimeoutMs?: unknown) => {
    const { host, port, timeoutMs } = PingInputSchema.parse({ host: rawHost, port: rawPort, timeoutMs: rawTimeoutMs });
    const effectiveTimeoutMs = timeoutMs ?? 3000;
    return new Promise<number>((resolve) => {
      const socket = new Socket();
      const start = Date.now();

      const timeout = setTimeout(() => {
        socket.destroy();
        resolve(-1);
      }, effectiveTimeoutMs);

      socket.on("connect", () => {
        clearTimeout(timeout);
        const latency = Date.now() - start;
        socket.destroy();
        resolve(latency);
      });

      socket.on("error", () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(-1);
      });

      socket.connect(port, host);
    });
  });

  // Ping active proxy (3 samples, median)
  ipcMain.handle("vpn:ping-active-proxy", async () => {
    const now = Date.now();
    if (activeProxyPingInFlight) {
      return activeProxyPingInFlight;
    }

    if (now - activeProxyPingLastMeasuredAt < ACTIVE_PROXY_PING_CACHE_TTL_MS) {
      return activeProxyPingLastValue;
    }

    activeProxyPingInFlight = (async (): Promise<number> => {
      try {
        const status = await runtimeManager.status();
        if (!status.connected) {
          activeProxyPingLastValue = -1;
          activeProxyPingLastMeasuredAt = Date.now();
          return -1;
        }

        const state = await stateStore.get();
        const activeNode = state.nodes.find((n) => n.id === state.activeNodeId);
        if (!activeNode) {
          activeProxyPingLastValue = -1;
          activeProxyPingLastMeasuredAt = Date.now();
          return -1;
        }

        const host = activeNode.server;
        const port = activeNode.port;
        if (!host || !port || Number.isNaN(port)) {
          activeProxyPingLastValue = -1;
          activeProxyPingLastMeasuredAt = Date.now();
          return -1;
        }

        const doPing = (): Promise<number> =>
          new Promise((resolve) => {
            const socket = new Socket();
            const start = performance.now();

            const timeout = setTimeout(() => {
              socket.destroy();
              resolve(-1);
            }, 3000);

            socket.on("connect", () => {
              clearTimeout(timeout);
              resolve(Math.round(performance.now() - start));
              socket.destroy();
            });

            socket.on("error", () => {
              clearTimeout(timeout);
              socket.destroy();
              resolve(-1);
            });

            socket.connect(port, host);
          });

        // 3 замера, медиана
        const samples: number[] = [];
        for (let i = 0; i < 3; i++) {
          const p = await doPing();
          if (p > 0) samples.push(p);
        }

        if (samples.length === 0) {
          activeProxyPingLastValue = -1;
          activeProxyPingLastMeasuredAt = Date.now();
          return -1;
        }

        samples.sort((a, b) => a - b);
        const result = samples[Math.floor(samples.length / 2)] ?? samples[0] ?? -1;
        activeProxyPingLastValue = result;
        activeProxyPingLastMeasuredAt = Date.now();
        return result;
      } catch (error: unknown) {
        logger.debug("[vpn:ping-active-proxy] Ping failed:", error);
        activeProxyPingLastValue = -1;
        activeProxyPingLastMeasuredAt = Date.now();
        return -1;
      } finally {
        activeProxyPingInFlight = null;
      }
    })();

    return activeProxyPingInFlight;
  });

  // Get real external IP + country through proxy
  ipcMain.handle("vpn:get-my-ip", async () => {
    const result: { ip: string | null; countryCode: string | null; error: string | null } = {
      ip: null,
      countryCode: null,
      error: null
    };

    const parseIpWho = (body: string) => {
      try {
        const data = JSON.parse(body);
        if (data.ip) result.ip = data.ip;
        if (data.country_code) result.countryCode = data.country_code.toLowerCase();
        result.error = null;
      } catch {
        result.error = "Parse error";
      }
    };

    const directFetch = async () => {
      try {
        const res = await fetch("https://ipwho.is/?fields=ip,country_code", { signal: AbortSignal.timeout(5000) });
        parseIpWho(await res.text());
      } catch (e: unknown) {
        result.error = e instanceof Error ? e.message : "Direct fetch failed";
      }
    };

    const proxyFetchFn = (proxyPort: number): Promise<void> =>
      new Promise((resolve) => {
        const proxyReq = http.request({
          host: "127.0.0.1",
          port: proxyPort,
          method: "CONNECT",
          path: "ipwho.is:443",
          timeout: 8000
        });

        proxyReq.on("connect", (_res, socket) => {
          const tlsSocket = tls.connect({ socket, servername: "ipwho.is", rejectUnauthorized: true }, () => {
            tlsSocket.write(
              "GET /?fields=ip,country_code HTTP/1.1\r\n" + "Host: ipwho.is\r\n" + "Connection: close\r\n\r\n"
            );

            let body = "";
            let headersDone = false;
            tlsSocket.on("data", (chunk: Buffer) => {
              const str = chunk.toString();
              if (!headersDone) {
                const idx = str.indexOf("\r\n\r\n");
                if (idx >= 0) {
                  headersDone = true;
                  body += str.slice(idx + 4);
                }
              } else {
                body += str;
              }
            });

            tlsSocket.on("end", () => {
              parseIpWho(body);
              resolve();
            });
            tlsSocket.on("error", (e: Error) => {
              result.error = e.message;
              resolve();
            });
            setTimeout(() => {
              if (!tlsSocket.destroyed) {
                tlsSocket.destroy();
                result.error = "Timeout";
                resolve();
              }
            }, 8000);
          });
          tlsSocket.on("error", (e: Error) => {
            result.error = e.message;
            resolve();
          });
        });

        proxyReq.on("error", (e: Error) => {
          result.error = e.message;
          resolve();
        });
        proxyReq.on("timeout", () => {
          proxyReq.destroy();
          result.error = "Timeout";
          resolve();
        });
        proxyReq.end();
      });

    try {
      const status = await runtimeManager.status();

      if (status.connected && status.proxyPort) {
        await proxyFetchFn(status.proxyPort);
        if (!result.ip) {
          await new Promise((r) => setTimeout(r, 1000));
          await proxyFetchFn(status.proxyPort);
        }
        if (!result.ip) await directFetch();
      } else {
        await directFetch();
        if (!result.ip) {
          await new Promise((r) => setTimeout(r, 1000));
          await directFetch();
        }
      }
    } catch (e: unknown) {
      result.error = e instanceof Error ? e.message : String(e);
    }

    return result;
  });

  // Speedtest: скачиваем файл через прокси для замера реальной скорости
  ipcMain.handle("vpn:speedtest", async () => {
    try {
      const status = await runtimeManager.status();
      if (!status.connected || !status.proxyPort) return { speed: 0, error: "Нет подключения" };

      return new Promise<{ speed: number; bytes?: number; timeMs?: number; error: string | null }>((resolve) => {
        const proxyReq = http.request({
          host: "127.0.0.1",
          port: status.proxyPort,
          method: "CONNECT",
          path: "speed.cloudflare.com:443",
          timeout: 10000
        });

        proxyReq.on("connect", (_res, socket) => {
          const tlsSocket = tls.connect(
            {
              socket,
              servername: "speed.cloudflare.com",
              rejectUnauthorized: true
            },
            () => {
              const start = Date.now();
              let totalBytes = 0;

              tlsSocket.write(
                "GET /__down?bytes=50000000 HTTP/1.1\r\n" +
                  "Host: speed.cloudflare.com\r\n" +
                  "Connection: close\r\n\r\n"
              );

              let headersParsed = false;
              let buf = Buffer.alloc(0);

              tlsSocket.on("data", (chunk: Buffer) => {
                if (!headersParsed) {
                  buf = Buffer.concat([buf, chunk]);
                  const idx = buf.indexOf("\r\n\r\n");
                  if (idx >= 0) {
                    headersParsed = true;
                    const bodyStart = buf.slice(idx + 4);
                    totalBytes += bodyStart.length;
                  }
                } else {
                  totalBytes += chunk.length;
                }
              });

              tlsSocket.on("end", () => {
                const elapsedMs = Date.now() - start;
                const elapsedSec = elapsedMs / 1000;
                const speedMbps = Number.parseFloat(((totalBytes * 8) / (elapsedSec * 1_000_000)).toFixed(2));
                resolve({ speed: speedMbps, bytes: totalBytes, timeMs: elapsedMs, error: null });
              });

              tlsSocket.on("error", (e: Error) => {
                resolve({ speed: 0, error: e.message || "TLS error" });
              });

              // Таймаут 60 секунд
              setTimeout(() => {
                if (!tlsSocket.destroyed) {
                  const elapsedMs = Date.now() - start;
                  const elapsedSec = elapsedMs / 1000;
                  const speedMbps = Number.parseFloat(((totalBytes * 8) / (elapsedSec * 1_000_000)).toFixed(2));
                  tlsSocket.destroy();
                  resolve({ speed: speedMbps, bytes: totalBytes, timeMs: elapsedMs, error: null });
                }
              }, 60000);
            }
          );

          tlsSocket.on("error", (e: Error) => {
            resolve({ speed: 0, error: e.message || "TLS handshake failed" });
          });
        });

        proxyReq.on("error", (e: Error) => {
          resolve({ speed: 0, error: e.message || "Proxy connection failed" });
        });

        proxyReq.on("timeout", () => {
          proxyReq.destroy();
          resolve({ speed: 0, error: "Proxy timeout" });
        });

        proxyReq.end();
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { speed: 0, error: msg || "Ошибка теста" };
    }
  });
}
