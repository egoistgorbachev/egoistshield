import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import http from "node:http";
import { Socket } from "node:net";
import path from "node:path";
import tls from "node:tls";
import { promisify } from "node:util";
import { type BrowserWindow, Notification, app, clipboard, dialog, ipcMain } from "electron";
import log from "electron-log";
import { updateTrayMenu } from "../main";
import type { ImportResult, PersistedState, RuntimeUpdateSummary, VpnNode } from "./contracts";
import { resolveImportPayload } from "./import-resolver";
import {
  AppIconInputSchema,
  GeoipInputSchema,
  ImportFileInputSchema,
  ImportTextInputSchema,
  PersistedStateSchema,
  PickFileFilterSchema,
  PingInputSchema,
  RenameNodeInputSchema,
  RenameSubscriptionInputSchema,
  StressTestInputSchema,
  SubscriptionUrlInputSchema
} from "./ipc-schemas";
import logger from "./logger";
import { parseNodesFromText } from "./node-parser";
import type { StateStore } from "./state-store";
import { getSubscriptionUserAgent, readUrlText, uniqueNodes } from "./subscription-utils";
import type { VpnRuntimeManager } from "./vpn-manager";

const execFileAsync = promisify(execFile);

export async function registerIpcHandlers(
  window: BrowserWindow,
  stateStore: StateStore,
  runtimeManager: VpnRuntimeManager
): Promise<void> {
  await stateStore.load();

  runtimeManager.on("unexpected-exit", async (lastError) => {
    logger.warn("[vpn] unexpected exit:", lastError);

    // Только уведомить пользователя — никаких auto-fallback-ов
    if (Notification.isSupported()) {
      new Notification({
        title: "EgoistShield: Соединение потеряно",
        body: lastError || "VPN-соединение разорвано."
      }).show();
    }

    updateTrayMenu(false);
  });

  ipcMain.handle("state:get", async () => {
    return stateStore.get();
  });

  ipcMain.handle("state:set", async (_event, rawState: unknown) => {
    const state = PersistedStateSchema.parse(rawState) as PersistedState;
    const persisted = await stateStore.set(state);
    if (process.platform === "win32") {
      try {
        app.setLoginItemSettings({
          openAtLogin: persisted.settings.autoStart,
          path: process.execPath,
          args: persisted.settings.startMinimized ? ["--minimized"] : []
        });
      } catch {
        // ignore
      }
    }
    return persisted;
  });

  // ── Helper: merge imported nodes + subscriptions into state ──
  function mergeImportResults(
    current: ReturnType<typeof stateStore.get>,
    nodes: VpnNode[],
    issues: string[],
    subscriptions: Array<{ url: string; name?: string | null; userinfo?: Record<string, number> | null }>
  ): { next: ReturnType<typeof stateStore.get>; result: ImportResult } {
    const newSubs = [...current.subscriptions];

    // Для каждой подписки — определяем или создаём subscriptionId
    const subIdByUrl = new Map<string, string>();
    for (const sub of subscriptions) {
      const idx = newSubs.findIndex((s) => s.url === sub.url);
      const subItem = {
        id: crypto.randomUUID(),
        url: sub.url,
        name: sub.name || null,
        enabled: true,
        lastUpdated: new Date().toISOString(),
        upload: sub.userinfo?.upload,
        download: sub.userinfo?.download,
        total: sub.userinfo?.total,
        expire: sub.userinfo?.expire
      };
      if (idx >= 0) {
        const existingId = newSubs[idx]?.id ?? subItem.id;
        newSubs[idx] = { ...newSubs[idx]!, ...subItem, id: existingId };
        subIdByUrl.set(sub.url, existingId);
      } else {
        newSubs.push(subItem);
        subIdByUrl.set(sub.url, subItem.id);
      }
    }

    // Тегируем ноды subscriptionId (первая подписка — единственная в стандартном flow)
    const defaultSubId = subscriptions.length === 1 ? subIdByUrl.get(subscriptions[0]!.url) : undefined;
    const taggedNodes = nodes.map((n) => ({
      ...n,
      subscriptionId: n.subscriptionId || defaultSubId
    }));

    const addedNodes = uniqueNodes(current.nodes, taggedNodes);

    const next = {
      ...current,
      nodes: [...current.nodes, ...addedNodes],
      subscriptions: newSubs,
      activeNodeId: current.activeNodeId ?? addedNodes[0]?.id ?? null
    };

    return { next, result: { added: addedNodes.length, subscriptionsAdded: subscriptions.length, issues } };
  }

  ipcMain.handle("import:text", async (_event, rawPayload: unknown) => {
    const payload = ImportTextInputSchema.parse(rawPayload);
    const current = stateStore.get();
    const profile = getSubscriptionUserAgent(current.settings);
    const { nodes, issues, subscriptions } = await resolveImportPayload(payload, (url) => readUrlText(url, profile));
    const { next, result } = mergeImportResults(current, nodes, issues, subscriptions);
    await stateStore.set(next);
    return result;
  });

  ipcMain.handle("import:file", async (_event, rawPath: unknown) => {
    const filePath = ImportFileInputSchema.parse(rawPath);
    const current = stateStore.get();
    const profile = getSubscriptionUserAgent(current.settings);
    const content = await fs.readFile(filePath, "utf8");
    const { nodes, issues, subscriptions } = await resolveImportPayload(content, (url) => readUrlText(url, profile));
    const { next, result } = mergeImportResults(current, nodes, issues, subscriptions);
    await stateStore.set(next);
    return result;
  });

  ipcMain.handle("subscription:refresh-one", async (_event, rawUrl: unknown) => {
    const url = SubscriptionUrlInputSchema.parse(rawUrl);
    const current = stateStore.get();
    const profile = getSubscriptionUserAgent(current.settings);
    const response = await readUrlText(url, profile);
    const { nodes, issues } = parseNodesFromText(response.text);

    // Найти ID подписки для тегирования
    const subItem = current.subscriptions.find((s) => s.url === url);
    const subId = subItem?.id;

    // Удаляем старые ноды этой подписки и добавляем свежие
    const otherNodes = subId ? current.nodes.filter((n) => n.subscriptionId !== subId) : current.nodes;
    const taggedNodes = nodes.map((n) => ({ ...n, subscriptionId: subId }));
    const freshNodes = [...otherNodes, ...taggedNodes];

    const next = {
      ...current,
      nodes: freshNodes,
      activeNodeId: current.activeNodeId && freshNodes.some((n) => n.id === current.activeNodeId)
        ? current.activeNodeId
        : freshNodes[0]?.id ?? null,
      subscriptions: current.subscriptions.map((item) =>
        item.url === url
          ? {
              ...item,
              name: response.name || item.name || null,
              lastUpdated: new Date().toISOString(),
              upload: response.userinfo?.upload ?? item.upload,
              download: response.userinfo?.download ?? item.download,
              total: response.userinfo?.total ?? item.total,
              expire: response.userinfo?.expire ?? item.expire
            }
          : item
      )
    };
    await stateStore.set(next);
    const result: ImportResult = { added: taggedNodes.length, subscriptionsAdded: 0, issues };
    return result;
  });

  ipcMain.handle("subscription:refresh-all", async () => {
    const current = stateStore.get();
    const profile = getSubscriptionUserAgent(current.settings);
    let totalAdded = 0;
    const issues: string[] = [];
    const refreshedSubs = new Map<string, { userinfo: Record<string, number> | null; nodes: VpnNode[] }>();

    const enabledSubs = current.subscriptions.filter((item) => item.enabled);
    const results = await Promise.allSettled(
      enabledSubs.map(async (sub) => {
        const response = await readUrlText(sub.url, profile);
        const parsed = parseNodesFromText(response.text);
        return { subId: sub.id, url: sub.url, nodes: parsed.nodes, issues: parsed.issues, userinfo: response.userinfo };
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        const { subId, url, nodes: parsedNodes, issues: parsedIssues, userinfo } = result.value;
        // Тегируем ноды subscriptionId
        const taggedNodes = parsedNodes.map((n) => ({ ...n, subscriptionId: subId }));
        refreshedSubs.set(url, { userinfo, nodes: taggedNodes });
        totalAdded += taggedNodes.length;
        issues.push(...parsedIssues.map((issue) => `[${url}] ${issue}`));
      } else {
        issues.push(`Не удалось обновить подписку: ${String(result.reason)}`);
      }
    }

    // Удаляем старые ноды обновлённых подписок, добавляем свежие
    const refreshedSubIds = new Set(
      enabledSubs
        .filter((s) => refreshedSubs.has(s.url))
        .map((s) => s.id)
    );
    let freshNodes = current.nodes.filter((n) => !n.subscriptionId || !refreshedSubIds.has(n.subscriptionId));
    for (const { nodes: taggedNodes } of refreshedSubs.values()) {
      freshNodes = [...freshNodes, ...taggedNodes];
    }

    const nowIso = new Date().toISOString();
    const next = {
      ...current,
      nodes: freshNodes,
      activeNodeId: current.activeNodeId && freshNodes.some((n) => n.id === current.activeNodeId)
        ? current.activeNodeId
        : freshNodes[0]?.id ?? null,
      subscriptions: current.subscriptions.map((item) => {
        const data = refreshedSubs.get(item.url);
        if (data) {
          return {
            ...item,
            lastUpdated: nowIso,
            upload: data.userinfo?.upload ?? item.upload,
            download: data.userinfo?.download ?? item.download,
            total: data.userinfo?.total ?? item.total,
            expire: data.userinfo?.expire ?? item.expire
          };
        }
        return item;
      })
    };
    await stateStore.set(next);
    const result: ImportResult = { added: totalAdded, subscriptionsAdded: 0, issues };
    return result;
  });

  ipcMain.handle("vpn:connect", async (_event, requestedNodeId?: string) => {
    const state = stateStore.get();

    // Приоритет: переданный nodeId > activeNodeId из state
    const targetNodeId = requestedNodeId || state.activeNodeId;
    const activeNode = state.nodes.find((node) => node.id === targetNodeId) ?? null;

    if (!activeNode) {
      logger.error("[vpn:connect] Node not found. targetNodeId:", targetNodeId, "requestedNodeId:", requestedNodeId, "stateActiveNodeId:", state.activeNodeId);
      return { ...(await runtimeManager.status()), lastError: `Узел не найден (ID: ${targetNodeId || "не указан"}). Выберите сервер.` };
    }

    // Синхронизируем activeNodeId в state если он отличается
    if (state.activeNodeId !== activeNode.id) {
      await stateStore.patch({ activeNodeId: activeNode.id });
    }

    logger.info("[vpn:connect] Connecting to:", activeNode.name, "id:", activeNode.id);

    const result = await runtimeManager.connect(activeNode, state.domainRules, state.processRules, state.settings);

    if (Notification.isSupported()) {
      const currentState = stateStore.get();
      const notificationsEnabled = currentState.settings.notifications !== false;
      if (notificationsEnabled) {
        if (result.connected) {
          new Notification({
            title: "EgoistShield: Защита включена",
            body: `Подключено к: ${activeNode.name}`,
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

    return result;
  });

  ipcMain.handle("vpn:status", async () => {
    return runtimeManager.status();
  });

  ipcMain.handle("vpn:diagnose", async () => {
    return runtimeManager.diagnose();
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

    return runtimeManager.stressTest(activeNode, state.domainRules, state.processRules, state.settings, iterations);
  });

  ipcMain.handle("app:is-admin", async () => runtimeManager.isAdmin());

  // GeoIP — определение страны по IP/хосту через бесплатный HTTPS API
  ipcMain.handle(
    "system:geoip",
    async (_event, rawHost: unknown): Promise<{ country: string; countryCode: string }> => {
      const host = GeoipInputSchema.parse(rawHost);
      try {
        const res = await fetch(`https://ipwho.is/${encodeURIComponent(host)}?fields=country,country_code,success`, {
          signal: AbortSignal.timeout(3000)
        });
        const data = await res.json();
        if (data.success && data.country_code) {
          return { country: data.country || "", countryCode: data.country_code.toLowerCase() };
        }
      } catch {
        /* timeout or network error */
      }
      return { country: "", countryCode: "un" };
    }
  );

  // ── DNS Leak Test ──
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
        const ipData = await ipRes.json() as { ip?: string };
        vpnIp = ipData.ip || null;
      } catch {
        // fallback: try without proxy
        try {
          const ipRes2 = await fetch("https://ipwho.is/?fields=ip", { signal: AbortSignal.timeout(5000) });
          const ipData2 = await ipRes2.json() as { ip?: string };
          vpnIp = ipData2.ip || null;
        } catch { /* ignore */ }
      }

      // 2. Проверяем DNS серверы (прямой запрос без прокси)
      const dnsServers: string[] = [];
      try {
        const dnsRes = await fetch("https://ipwho.is/?fields=ip,country_code", {
          signal: AbortSignal.timeout(5000)
        });
        const dnsData = await dnsRes.json() as { ip?: string };
        if (dnsData.ip) {
          dnsServers.push(dnsData.ip);
        }
      } catch { /* ignore */ }

      // 3. Делаем DNS запрос через VPN прокси
      const vpnDnsServers: string[] = [];
      try {
        const vpnDnsRes = await proxyFetch("https://ipwho.is/?fields=ip,country_code", {
          dispatcher,
          signal: AbortSignal.timeout(8000)
        });
        const vpnDnsData = await vpnDnsRes.json() as { ip?: string };
        if (vpnDnsData.ip) {
          vpnDnsServers.push(vpnDnsData.ip);
        }
      } catch { /* ignore */ }

      // Утечка: DNS запрос без прокси и через прокси идут с одного IP
      const leaked = dnsServers.length > 0 && vpnDnsServers.length > 0
        && dnsServers.some((dns) => vpnDnsServers.includes(dns))
        && dnsServers.some((dns) => dns !== vpnIp);

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

  const firstRunMarker = path.join(app.getPath("userData"), ".first-run-done");

  ipcMain.handle("app:is-first-run", async () => {
    try {
      await fs.access(firstRunMarker);
      return false;
    } catch {
      return true;
    }
  });

  ipcMain.handle("app:mark-first-run-done", async () => {
    await fs.writeFile(firstRunMarker, new Date().toISOString(), "utf8");
  });

  ipcMain.handle("runtime:install-xray", async () => {
    return runtimeManager.installXrayRuntime();
  });

  ipcMain.handle("runtime:install-all", async () => {
    const result: RuntimeUpdateSummary = await runtimeManager.installAllRuntimes();
    return result;
  });

  ipcMain.handle("system:pick-file", async (_event, rawFilters: unknown) => {
    const filters = PickFileFilterSchema.parse(rawFilters);
    const result = await dialog.showOpenDialog(window, {
      properties: ["openFile"],
      filters
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle("system:list-processes", async () => {
    if (process.platform === "win32") {
      try {
        const script = "Get-Process | Where-Object { $_.Path } | Select-Object Name, Path | ConvertTo-Json -Compress";
        const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], {
          maxBuffer: 1024 * 1024 * 10
        });
        let procs = JSON.parse(stdout);
        if (!Array.isArray(procs)) procs = [procs];

        const unique = new Map<string, { name: string; path: string }>();
        for (const p of procs) {
          const parsedName = `${p.Name.toLowerCase()}.exe`;
          if (!unique.has(parsedName)) {
            unique.set(parsedName, { name: `${p.Name}.exe`, path: p.Path });
          }
        }
        return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
      } catch (err) {
        log.error("List processes failed", err);
        return [];
      }
    }
    return [];
  });

  ipcMain.handle("system:get-app-icon", async (_event, rawExePath: unknown) => {
    const exePath = AppIconInputSchema.parse(rawExePath);
    try {
      const icon = await app.getFileIcon(exePath, { size: "normal" });
      return icon.toDataURL();
    } catch {
      return null;
    }
  });

  ipcMain.handle("vpn:ping", async (_event, rawHost: unknown, rawPort: unknown) => {
    const { host, port } = PingInputSchema.parse({ host: rawHost, port: rawPort });
    return new Promise<number>((resolve) => {
      const socket = new Socket();
      const start = Date.now();

      const timeout = setTimeout(() => {
        socket.destroy();
        resolve(-1);
      }, 3000);

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

  ipcMain.handle("vpn:ping-active-proxy", async () => {
    try {
      const status = await runtimeManager.status();
      if (!status.connected) return -1;

      // Ищем активный сервер для прямого TCP пинга
      const state = await stateStore.get();
      const activeNode = state.nodes.find((n) => n.id === state.activeNodeId);
      if (!activeNode) return -1;

      const host = activeNode.server;
      const port = activeNode.port;
      if (!host || !port || Number.isNaN(port)) return -1;

      // TCP connect ping — тот же метод что и в vpn:ping для серверов
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
    } catch {
      return -1;
    }
  });

  // ── Get real external IP + country through proxy ──
  ipcMain.handle("vpn:get-my-ip", async () => {
    const result: { ip: string | null; countryCode: string | null; error: string | null } = { ip: null, countryCode: null, error: null };

    // Helper: parse ipwho.is JSON response
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

    // Helper: direct fetch (no proxy)
    const directFetch = async () => {
      try {
        const res = await fetch("https://ipwho.is/?fields=ip,country_code", { signal: AbortSignal.timeout(5000) });
        parseIpWho(await res.text());
      } catch (e: unknown) {
        result.error = e instanceof Error ? e.message : "Direct fetch failed";
      }
    };

    // Helper: fetch through VPN proxy
    const proxyFetch = (proxyPort: number): Promise<void> =>
      new Promise((resolve) => {
        const proxyReq = http.request({
          host: "127.0.0.1",
          port: proxyPort,
          method: "CONNECT",
          path: "ipwho.is:443",
          timeout: 8000
        });

        proxyReq.on("connect", (_res, socket) => {
          const tlsSocket = tls.connect(
            { socket, servername: "ipwho.is", rejectUnauthorized: true },
            () => {
              tlsSocket.write(
                "GET /?fields=ip,country_code HTTP/1.1\r\n" +
                "Host: ipwho.is\r\n" +
                "Connection: close\r\n\r\n"
              );

              let body = "";
              let headersDone = false;
              tlsSocket.on("data", (chunk: Buffer) => {
                const str = chunk.toString();
                if (!headersDone) {
                  const idx = str.indexOf("\r\n\r\n");
                  if (idx >= 0) { headersDone = true; body += str.slice(idx + 4); }
                } else { body += str; }
              });

              tlsSocket.on("end", () => { parseIpWho(body); resolve(); });
              tlsSocket.on("error", (e: Error) => { result.error = e.message; resolve(); });
              setTimeout(() => { if (!tlsSocket.destroyed) { tlsSocket.destroy(); result.error = "Timeout"; resolve(); } }, 8000);
            }
          );
          tlsSocket.on("error", (e: Error) => { result.error = e.message; resolve(); });
        });

        proxyReq.on("error", (e: Error) => { result.error = e.message; resolve(); });
        proxyReq.on("timeout", () => { proxyReq.destroy(); result.error = "Timeout"; resolve(); });
        proxyReq.end();
      });

    try {
      const status = await runtimeManager.status();

      if (status.connected && status.proxyPort) {
        // Try proxy fetch with 1 retry
        await proxyFetch(status.proxyPort);
        if (!result.ip) {
          await new Promise(r => setTimeout(r, 1000));
          await proxyFetch(status.proxyPort);
        }
        // Fallback to direct if proxy fails
        if (!result.ip) await directFetch();
      } else {
        // Not connected — direct fetch with 1 retry
        await directFetch();
        if (!result.ip) {
          await new Promise(r => setTimeout(r, 1000));
          await directFetch();
        }
      }
    } catch (e: unknown) {
      result.error = e instanceof Error ? e.message : String(e);
    }

    return result;
  });

  // ── Speedtest: скачиваем файл через прокси для замера реальной скорости ──
  ipcMain.handle("vpn:speedtest", async () => {
    try {
      const status = await runtimeManager.status();
      if (!status.connected || !status.proxyPort) return { speed: 0, error: "Нет подключения" };

      // Используем HTTP CONNECT для HTTPS через прокси
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

              // Отправляем HTTP запрос вручную
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

              // Таймаут 30 секунд
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

  ipcMain.handle("window:minimize", async () => {
    window.minimize();
    return true;
  });

  ipcMain.handle("window:close", async () => {
    window.close();
    return true;
  });

  // ── Rename Subscription ──
  ipcMain.handle("subscription:rename", async (_event, rawUrl: unknown, rawName: unknown) => {
    const { url, newName } = RenameSubscriptionInputSchema.parse({ url: rawUrl, newName: rawName });
    const current = stateStore.get();
    const next = {
      ...current,
      subscriptions: current.subscriptions.map((s) => (s.url === url ? { ...s, name: newName } : s))
    };
    await stateStore.set(next);
    return true;
  });

  // ── Rename Node ──
  ipcMain.handle("node:rename", async (_event, rawId: unknown, rawName: unknown) => {
    const { id, newName } = RenameNodeInputSchema.parse({ id: rawId, newName: rawName });
    const current = stateStore.get();
    const next = {
      ...current,
      nodes: current.nodes.map((n) => (n.id === id ? { ...n, name: newName } : n))
    };
    await stateStore.set(next);
    return true;
  });

  // ── Read Clipboard (rate-limited + URI-filtered) ──
  let lastClipboardRead = 0;
  const CLIPBOARD_COOLDOWN_MS = 1000;
  const CLIPBOARD_URI_PATTERN = /^(vmess|vless|trojan|ss|ssr|hysteria2?|tuic|wg|wireguard|socks[45]?|https?):\/\//i;
  const CLIPBOARD_BASE64_PATTERN = /^[A-Za-z0-9+/=\r\n]{20,}$/;
  const CLIPBOARD_SUB_URL_PATTERN = /^https?:\/\/.+/i;

  ipcMain.handle("system:read-clipboard", async () => {
    const now = Date.now();
    if (now - lastClipboardRead < CLIPBOARD_COOLDOWN_MS) {
      return ""; // rate-limited
    }
    lastClipboardRead = now;

    const text = clipboard.readText().trim();
    if (!text) return "";

    // Разрешаем только VPN URI, subscription URL или base64-блоки
    if (
      CLIPBOARD_URI_PATTERN.test(text) ||
      CLIPBOARD_SUB_URL_PATTERN.test(text) ||
      CLIPBOARD_BASE64_PATTERN.test(text)
    ) {
      return text;
    }

    return ""; // содержимое не является VPN-конфигурацией
  });

  // ── Internet Fix ──
  ipcMain.handle("system:internet-fix", async () => {
    const { fullCleanup } = await import("./dns-cleanup");
    return fullCleanup();
  });
}
