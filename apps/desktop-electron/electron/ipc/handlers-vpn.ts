/**
 * VPN IPC Handlers — vpn:connect, vpn:disconnect, vpn:status, vpn:diagnose,
 * vpn:stress-test, vpn:dns-leak-test, vpn:ping, vpn:ping-active-proxy,
 * vpn:get-my-ip, vpn:speedtest
 */
import http from "node:http";
import { Socket } from "node:net";
import tls from "node:tls";
import { Notification, ipcMain } from "electron";
import { updateTrayMenu } from "../main";
import type { RuntimeStatus } from "./contracts";
import type { IpcContext } from "./ipc-context";
import { PingInputSchema, StressTestInputSchema } from "./ipc-schemas";
import logger, { formatRuntimeLogEvent } from "./logger";

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

export function registerVpnHandlers({ stateStore, runtimeManager }: IpcContext): void {
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

    const result = await runtimeManager.connect(activeNode, state.domainRules, [], {
      ...state.settings,
      useTunMode: false
    });

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

  // DNS Leak Test
  ipcMain.handle("vpn:dns-leak-test", async () => {
    try {
      const status = await runtimeManager.status();
      if (!status.connected) {
        return { leaked: false, dnsServers: [], vpnIp: null, error: "VPN не подключён" };
      }

      const proxyPort = status.proxyPort || 10808;
      const { ProxyAgent, fetch: proxyFetch } = await import("undici");
      const dispatcher = new ProxyAgent(`http://127.0.0.1:${proxyPort}`);

      // 1. Получаем VPN exit IP
      let vpnIp: string | null = null;
      try {
        const ipRes = await proxyFetch("https://ipwho.is/?fields=ip", {
          dispatcher,
          signal: AbortSignal.timeout(8000)
        });
        const ipData = (await ipRes.json()) as { ip?: string };
        vpnIp = ipData.ip || null;
      } catch (error: unknown) {
        logger.debug("[vpn:dns-leak-test] Proxy exit IP fetch failed, trying direct fallback:", error);
        // fallback: try without proxy
        try {
          const ipRes2 = await fetch("https://ipwho.is/?fields=ip", { signal: AbortSignal.timeout(5000) });
          const ipData2 = (await ipRes2.json()) as { ip?: string };
          vpnIp = ipData2.ip || null;
        } catch (fallbackError: unknown) {
          logger.debug("[vpn:dns-leak-test] Direct exit IP fallback failed:", fallbackError);
        }
      }

      // 2. Проверяем DNS серверы (прямой запрос без прокси)
      const dnsServers: string[] = [];
      try {
        const dnsRes = await fetch("https://ipwho.is/?fields=ip,country_code", {
          signal: AbortSignal.timeout(5000)
        });
        const dnsData = (await dnsRes.json()) as { ip?: string };
        if (dnsData.ip) {
          dnsServers.push(dnsData.ip);
        }
      } catch (error: unknown) {
        logger.debug("[vpn:dns-leak-test] Direct DNS probe failed:", error);
      }

      // 3. Делаем DNS запрос через VPN прокси
      const vpnDnsServers: string[] = [];
      try {
        const vpnDnsRes = await proxyFetch("https://ipwho.is/?fields=ip,country_code", {
          dispatcher,
          signal: AbortSignal.timeout(8000)
        });
        const vpnDnsData = (await vpnDnsRes.json()) as { ip?: string };
        if (vpnDnsData.ip) {
          vpnDnsServers.push(vpnDnsData.ip);
        }
      } catch (error: unknown) {
        logger.debug("[vpn:dns-leak-test] Proxy DNS probe failed:", error);
      }

      // Утечка: DNS запрос без прокси и через прокси идут с одного IP
      const leaked =
        dnsServers.length > 0 &&
        vpnDnsServers.length > 0 &&
        dnsServers.some((dns) => vpnDnsServers.includes(dns)) &&
        dnsServers.some((dns) => dns !== vpnIp);

      return {
        leaked,
        dnsServers: [...new Set([...dnsServers])],
        vpnIp,
        error: null
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Ошибка тестирования DNS";
      return { leaked: false, dnsServers: [], vpnIp: null, error: msg };
    }
  });

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
    try {
      const status = await runtimeManager.status();
      if (!status.connected) return -1;

      const state = await stateStore.get();
      const activeNode = state.nodes.find((n) => n.id === state.activeNodeId);
      if (!activeNode) return -1;

      const host = activeNode.server;
      const port = activeNode.port;
      if (!host || !port || Number.isNaN(port)) return -1;

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

      if (samples.length === 0) return -1;
      samples.sort((a, b) => a - b);
      return samples[Math.floor(samples.length / 2)];
    } catch (error: unknown) {
      logger.debug("[vpn:ping-active-proxy] Ping failed:", error);
      return -1;
    }
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
