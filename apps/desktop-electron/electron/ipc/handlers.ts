import { app, BrowserWindow, dialog, ipcMain, Notification } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { updateTrayMenu } from "../main";
import type {
  AppSettings,
  ImportResult,
  PersistedState,
  RuntimeUpdateSummary,
  SubscriptionUserAgent,
  VpnNode
} from "./contracts";
import { resolveImportPayload } from "./import-resolver";
import { parseNodesFromText } from "./node-parser";
import { StateStore } from "./state-store";
import { VpnRuntimeManager } from "./vpn-manager";
import { Socket } from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  getSubscriptionUserAgent,
  readUrlText,
  uniqueNodes,
  parseSubscriptionUserInfo
} from "./subscription-utils";
import {
  PersistedStateSchema,
  ImportTextInputSchema,
  ImportFileInputSchema,
  SubscriptionUrlInputSchema,
  StressTestInputSchema,
  PingInputSchema,
  PickFileFilterSchema,
  GeoipInputSchema,
  AppIconInputSchema
} from "./ipc-schemas";

const execFileAsync = promisify(execFile);

export async function registerIpcHandlers(
  window: BrowserWindow,
  stateStore: StateStore,
  runtimeManager: VpnRuntimeManager
): Promise<void> {
  await stateStore.load();

  runtimeManager.on("unexpected-exit", async (lastError) => {
    const state = stateStore.get();
    const crashedNode = state.nodes.find((node) => node.id === state.activeNodeId) ?? null;
    if (!state.activeNodeId || state.nodes.length <= 1) return;

    const currentIndex = state.nodes.findIndex(n => n.id === state.activeNodeId);
    const nextNode = state.nodes[(currentIndex + 1) % state.nodes.length];

    if (nextNode) {
      await stateStore.set({ ...state, activeNodeId: nextNode.id });
      window.webContents.send("fallback-triggered", { nextNodeId: nextNode.id, error: lastError });

      const res = await runtimeManager.connect(nextNode, state.domainRules, state.processRules, state.settings);
      updateTrayMenu(res.connected);

      if (Notification.isSupported()) {
        new Notification({
          title: "EgoistShield: Auto-Fallback",
          body: `Разрыв связи. Переключение на узел: ${nextNode.name}`,
          silent: true
        }).show();
      }
    }
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

  ipcMain.handle("import:text", async (_event, rawPayload: unknown) => {
    const payload = ImportTextInputSchema.parse(rawPayload);
    const current = stateStore.get();
    const profile = getSubscriptionUserAgent(current.settings);
    const { nodes, issues, subscriptions } = await resolveImportPayload(payload, (url) => readUrlText(url, profile));
    const addedNodes = uniqueNodes(current.nodes, nodes);

    const newSubs = [...current.subscriptions];
    for (const sub of subscriptions) {
      const idx = newSubs.findIndex(s => s.url === sub.url);
      const subItem = {
        id: crypto.randomUUID(),
        url: sub.url,
        name: (sub as { name?: string }).name || null,
        enabled: true,
        lastUpdated: new Date().toISOString(),
        upload: sub.userinfo?.upload,
        download: sub.userinfo?.download,
        total: sub.userinfo?.total,
        expire: sub.userinfo?.expire
      };
      if (idx >= 0) {
        newSubs[idx] = { ...newSubs[idx], ...subItem, id: newSubs[idx].id };
      } else {
        newSubs.push(subItem);
      }
    }

    const next = {
      ...current,
      nodes: [...current.nodes, ...addedNodes],
      subscriptions: newSubs,
      activeNodeId: current.activeNodeId ?? addedNodes[0]?.id ?? null
    };

    await stateStore.set(next);
    const result: ImportResult = { added: addedNodes.length, issues };
    return result;
  });

  ipcMain.handle("import:file", async (_event, rawPath: unknown) => {
    const filePath = ImportFileInputSchema.parse(rawPath);
    const current = stateStore.get();
    const profile = getSubscriptionUserAgent(current.settings);
    const content = await fs.readFile(filePath, "utf8");
    const { nodes, issues, subscriptions } = await resolveImportPayload(content, (url) => readUrlText(url, profile));
    const addedNodes = uniqueNodes(current.nodes, nodes);

    const newSubs = [...current.subscriptions];
    for (const sub of subscriptions) {
      const idx = newSubs.findIndex(s => s.url === sub.url);
      const subItem = {
        id: crypto.randomUUID(),
        url: sub.url,
        enabled: true,
        lastUpdated: new Date().toISOString(),
        upload: sub.userinfo?.upload,
        download: sub.userinfo?.download,
        total: sub.userinfo?.total,
        expire: sub.userinfo?.expire
      };
      if (idx >= 0) {
        newSubs[idx] = { ...newSubs[idx], ...subItem, id: newSubs[idx].id };
      } else {
        newSubs.push(subItem);
      }
    }

    const next = {
      ...current,
      nodes: [...current.nodes, ...addedNodes],
      subscriptions: newSubs,
      activeNodeId: current.activeNodeId ?? addedNodes[0]?.id ?? null
    };
    await stateStore.set(next);
    const result: ImportResult = { added: addedNodes.length, issues };
    return result;
  });

  ipcMain.handle("subscription:refresh-one", async (_event, rawUrl: unknown) => {
    const url = SubscriptionUrlInputSchema.parse(rawUrl);
    const current = stateStore.get();
    const profile = getSubscriptionUserAgent(current.settings);
    const response = await readUrlText(url, profile);
    const { nodes, issues } = parseNodesFromText(response.text);
    const addedNodes = uniqueNodes(current.nodes, nodes);
    const next = {
      ...current,
      nodes: [...current.nodes, ...addedNodes],
      activeNodeId: current.activeNodeId ?? addedNodes[0]?.id ?? null,
      subscriptions: current.subscriptions.map((item) =>
        item.url === url ? {
          ...item,
          name: response.name || item.name || null,
          lastUpdated: new Date().toISOString(),
          upload: response.userinfo?.upload ?? item.upload,
          download: response.userinfo?.download ?? item.download,
          total: response.userinfo?.total ?? item.total,
          expire: response.userinfo?.expire ?? item.expire
        } : item
      )
    };
    await stateStore.set(next);
    const result: ImportResult = { added: addedNodes.length, issues };
    return result;
  });

  ipcMain.handle("subscription:refresh-all", async () => {
    const current = stateStore.get();
    const profile = getSubscriptionUserAgent(current.settings);
    let totalAdded = 0;
    const issues: string[] = [];
    let nodes = [...current.nodes];
    const refreshedSubs = new Map<string, Record<string, number> | null>();

    for (const sub of current.subscriptions.filter((item) => item.enabled)) {
      try {
        const response = await readUrlText(sub.url, profile);
        const parsed = parseNodesFromText(response.text);
        const added = uniqueNodes(nodes, parsed.nodes);
        nodes = [...nodes, ...added];
        totalAdded += added.length;
        refreshedSubs.set(sub.url, response.userinfo);
        issues.push(...parsed.issues.map((issue) => `[${sub.url}] ${issue}`));
      } catch (error) {
        issues.push(`Не удалось обновить подписку ${sub.url}: ${String(error)}`);
      }
    }

    const nowIso = new Date().toISOString();
    const next = {
      ...current,
      nodes,
      activeNodeId: current.activeNodeId ?? nodes[0]?.id ?? null,
      subscriptions: current.subscriptions.map((item) => {
        if (refreshedSubs.has(item.url)) {
          const userinfo = refreshedSubs.get(item.url);
          return {
            ...item,
            lastUpdated: nowIso,
            upload: userinfo?.upload ?? item.upload,
            download: userinfo?.download ?? item.download,
            total: userinfo?.total ?? item.total,
            expire: userinfo?.expire ?? item.expire
          };
        }
        return item;
      })
    };
    await stateStore.set(next);
    const result: ImportResult = { added: totalAdded, issues };
    return result;
  });

  ipcMain.handle("vpn:connect", async () => {
    const state = stateStore.get();
    const activeNode = state.nodes.find((node) => node.id === state.activeNodeId) ?? null;
    if (!activeNode) {
      return { ...(await runtimeManager.status()), lastError: "Выберите активный узел перед подключением." };
    }

    const result = await runtimeManager.connect(activeNode, state.domainRules, state.processRules, state.settings);

    if (Notification.isSupported()) {
      if (result.connected) {
        new Notification({
          title: "EgoistShield: Защита включена",
          body: `Успешное подключение к узлу: ${activeNode.name}`,
          silent: true
        }).show();
      } else if (result.lastError) {
        new Notification({
          title: "EgoistShield: Ошибка подключения",
          body: result.lastError
        }).show();
      }
    }

    updateTrayMenu(result.connected);

    return result;
  });

  ipcMain.handle("vpn:disconnect", async () => {
    const result = await runtimeManager.disconnect();

    if (Notification.isSupported()) {
      new Notification({
        title: "EgoistShield: Отключено",
        body: "Ваше интернет-соединение больше не защищается.",
        silent: true
      }).show();
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
  ipcMain.handle("system:geoip", async (_event, rawHost: unknown): Promise<{ country: string; countryCode: string }> => {
    const host = GeoipInputSchema.parse(rawHost);
    try {
      const res = await fetch(`https://ipwho.is/${encodeURIComponent(host)}?fields=country,country_code,success`, {
        signal: AbortSignal.timeout(3000)
      });
      const data = await res.json();
      if (data.success && data.country_code) {
        return { country: data.country || "", countryCode: data.country_code.toLowerCase() };
      }
    } catch { /* timeout or network error */ }
    return { country: "", countryCode: "un" };
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
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle("system:list-processes", async () => {
    if (process.platform === "win32") {
      try {
        const script = `Get-Process | Where-Object { $_.Path } | Select-Object Name, Path | ConvertTo-Json -Compress`;
        const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], { maxBuffer: 1024 * 1024 * 10 });
        let procs = JSON.parse(stdout);
        if (!Array.isArray(procs)) procs = [procs];

        const unique = new Map<string, { name: string, path: string }>();
        for (const p of procs) {
          const parsedName = p.Name.toLowerCase() + ".exe";
          if (!unique.has(parsedName)) {
            unique.set(parsedName, { name: p.Name + ".exe", path: p.Path });
          }
        }
        return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
      } catch (err) {
        console.error("List processes failed", err);
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
      const activeNode = state.nodes.find(n => n.id === state.activeNodeId);
      if (!activeNode) return -1;

      const host = activeNode.server;
      const port = activeNode.port;
      if (!host || !port || isNaN(port)) return -1;

      // TCP connect ping — тот же метод что и в vpn:ping для серверов
      const doPing = (): Promise<number> => new Promise((resolve) => {
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

  // ── Speedtest: скачиваем файл через прокси для замера реальной скорости ──
  ipcMain.handle("vpn:speedtest", async () => {
    try {
      const status = await runtimeManager.status();
      if (!status.connected || !status.proxyPort) return { speed: 0, error: "Нет подключения" };

      const http = require("http") as typeof import("http");

      // Используем HTTP CONNECT для HTTPS через прокси
      return new Promise<{ speed: number, bytes?: number, timeMs?: number, error: string | null }>((resolve) => {
        const proxyReq = http.request({
          host: "127.0.0.1",
          port: status.proxyPort,
          method: "CONNECT",
          path: "speed.cloudflare.com:443",
          timeout: 10000
        });

        proxyReq.on("connect", (_res, socket) => {
          const tls = require("tls") as typeof import("tls");
          const tlsSocket = tls.connect({
            socket,
            servername: "speed.cloudflare.com",
            rejectUnauthorized: true
          }, () => {
            const start = Date.now();
            let totalBytes = 0;

            // Отправляем HTTP запрос вручную
            tlsSocket.write(
              "GET /__down?bytes=10000000 HTTP/1.1\r\n" +
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
              const speedMbps = parseFloat(((totalBytes * 8) / (elapsedSec * 1_000_000)).toFixed(2));
              resolve({ speed: speedMbps, bytes: totalBytes, timeMs: elapsedMs, error: null });
            });

            tlsSocket.on("error", (e: any) => {
              resolve({ speed: 0, error: e.message || "TLS error" });
            });

            // Таймаут 30 секунд
            setTimeout(() => {
              if (!tlsSocket.destroyed) {
                const elapsedMs = Date.now() - start;
                const elapsedSec = elapsedMs / 1000;
                const speedMbps = parseFloat(((totalBytes * 8) / (elapsedSec * 1_000_000)).toFixed(2));
                tlsSocket.destroy();
                resolve({ speed: speedMbps, bytes: totalBytes, timeMs: elapsedMs, error: null });
              }
            }, 30000);
          });

          tlsSocket.on("error", (e: any) => {
            resolve({ speed: 0, error: e.message || "TLS handshake failed" });
          });
        });

        proxyReq.on("error", (e: any) => {
          resolve({ speed: 0, error: e.message || "Proxy connection failed" });
        });

        proxyReq.on("timeout", () => {
          proxyReq.destroy();
          resolve({ speed: 0, error: "Proxy timeout" });
        });

        proxyReq.end();
      });
    } catch (e: any) {
      return { speed: 0, error: e.message || "Ошибка теста" };
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
}
