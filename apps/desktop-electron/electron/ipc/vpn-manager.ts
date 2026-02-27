import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { EventEmitter } from "node:events";
import { enableSystemProxy, disableSystemProxy } from "./system-proxy";
import { findAvailablePort, waitForPort } from "./port-utils";



import type {
  AppSettings,
  DiagnosticResult,
  DomainRule,
  RuntimeInstallResult,
  ProcessRule,
  RuntimeStatus,
  StressResult,
  VpnNode
} from "./contracts";
import { ConfigBuilder } from "./config-builder";
import { RuntimeInstaller } from "./runtime-installer";
import { KillSwitch } from "./kill-switch";

const execFileAsync = promisify(execFile);

type RuntimeKind = "xray" | "sing-box";
type ResolvedRuntime = {
  runtimePath: string;
  runtimeKind: RuntimeKind;
};

type RuntimeSnapshot = {
  process: ReturnType<typeof spawn> | null;
  processGeneration: number | null;
  startedAt: string | null;
  proxyPort: number | null;
  socksPort: number | null;
  configPath: string | null;
  nodeId: string | null;
  lastError: string | null;
  activeRuntimePath: string | null;
  runtimeKind: RuntimeKind | null;
  processRulesApplied: boolean;
};

const DEFAULT_RUNTIME_CANDIDATES: Record<RuntimeKind, string[]> = {
  xray: ["runtime\\xray\\xray.exe", "xray.exe"],
  "sing-box": ["runtime\\sing-box\\sing-box.exe", "sing-box.exe"]
};

const SINGBOX_PROTOCOLS = new Set<VpnNode["protocol"]>(["hysteria2", "tuic", "wireguard"]);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class VpnRuntimeManager extends EventEmitter {
  private readonly mockMode: boolean;
  private readonly snapshot: RuntimeSnapshot = {
    process: null,
    processGeneration: null,
    startedAt: null,
    proxyPort: null,
    socksPort: null,
    configPath: null,
    nodeId: null,
    lastError: null,
    activeRuntimePath: null,
    runtimeKind: null,
    processRulesApplied: false
  };

  private readonly appRoot: string;
  private readonly userDataDir: string;
  private generationCounter = 0;
  private readonly expectedExits = new Set<number>();
  private lastSettings: AppSettings | null = null;
  private readonly installer: RuntimeInstaller;
  private readonly killSwitch: KillSwitch;
  private cachedIsAdmin: boolean | null = null;

  public constructor(appRoot: string, userDataDir: string) {
    super();
    this.appRoot = appRoot;
    this.userDataDir = userDataDir;
    const isTestEnv = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
    this.mockMode = process.env.EGOISTSHIELD_MOCK_RUNTIME === "1" && isTestEnv;
    this.installer = new RuntimeInstaller(appRoot, userDataDir);
    this.killSwitch = new KillSwitch();
  }

  public async isAdmin(): Promise<boolean> {
    if (this.cachedIsAdmin !== null) return this.cachedIsAdmin;
    if (process.platform !== "win32") { this.cachedIsAdmin = true; return true; }
    try {
      const result = await execFileAsync("net.exe", ["session"], { timeout: 2000, windowsHide: true });
      this.cachedIsAdmin = true;
    } catch {
      this.cachedIsAdmin = false;
    }
    return this.cachedIsAdmin;
  }

  public async status(): Promise<RuntimeStatus> {
    const connected =
      this.snapshot.process !== null && this.snapshot.process.exitCode === null && !this.snapshot.process.killed;

    return {
      connected,
      pid: connected ? this.snapshot.process?.pid ?? null : null,
      startedAt: this.snapshot.startedAt,
      activeNodeId: this.snapshot.nodeId,
      lastError: this.snapshot.lastError,
      isAdmin: await this.isAdmin(),
      resolvedRuntimePath: this.snapshot.activeRuntimePath,
      runtimeKind: this.snapshot.runtimeKind,
      processRulesApplied: this.snapshot.processRulesApplied,
      proxyPort: this.snapshot.proxyPort
    };
  }

  public async installXrayRuntime(): Promise<RuntimeInstallResult> {
    return this.installer.installXray();
  }

  public async installSingBoxRuntime(): Promise<RuntimeInstallResult> {
    return this.installer.installSingBox();
  }

  public async installAllRuntimes(): Promise<{ ok: boolean; message: string; results: RuntimeInstallResult[] }> {
    return this.installer.installAll();
  }

  public async connect(
    node: VpnNode,
    domainRules: DomainRule[],
    processRules: ProcessRule[],
    settings: AppSettings
  ): Promise<RuntimeStatus> {
    await this.disconnect();
    let preferredRuntime = this.getPreferredRuntimeKind(node);

    // Авто-переключение на sing-box при TUN mode или process rules
    // sing-box поддерживает TUN (full tunnel) и per-process routing
    if (preferredRuntime === "xray" && (settings.useTunMode || processRules.length > 0)) {
      // Проверяем доступность sing-box перед переключением
      const singboxAvailable = await this.resolveRuntimePath(settings.runtimePath, "sing-box", false);
      if (singboxAvailable) {
        preferredRuntime = "sing-box";
      }
      // Если sing-box недоступен — остаёмся на xray (system proxy fallback)
    }

    // ⚠️ TUN-режим требует прав администратора для создания виртуального сетевого интерфейса
    const effectiveSettings = { ...settings };

    if (effectiveSettings.useTunMode || (processRules.length > 0 && preferredRuntime === "sing-box")) {
      const admin = await this.isAdmin();
      if (!admin) {
        // Без admin TUN создание интерфейса провалится — sing-box крашнется.
        // Fallback: запускаем без TUN / process rules через system proxy.
        const isSingboxOnly = SINGBOX_PROTOCOLS.has(node.protocol);
        if (isSingboxOnly) {
          // hysteria2/tuic/wireguard требуют sing-box, но TUN без admin невозможен.
          // Продолжаем без TUN — sing-box будет работать через mixed-inbound + system proxy.
          effectiveSettings.useTunMode = false;
        } else {
          // Для xray-совместимых протоколов — откатываемся на xray + system proxy
          effectiveSettings.useTunMode = false;
          preferredRuntime = "xray";
        }
        this.snapshot.lastError = "TUN-режим требует запуска от имени администратора. Используется system proxy.";
      }
    }

    if (this.mockMode) {
      return this.mockConnect(node, preferredRuntime);
    }
    let resolvedRuntime = await this.resolveRuntimePath(settings.runtimePath, preferredRuntime, false);

    if (!resolvedRuntime) {
      const installed = await (preferredRuntime === "xray" ? this.installer.installXray() : this.installer.installSingBox());
      if (!installed.ok) {
        this.snapshot.lastError = `Runtime ${preferredRuntime} install failed: ${installed.message}`;
        return this.status();
      }
      resolvedRuntime = await this.resolveRuntimePath("", preferredRuntime, false);
    }

    if (!resolvedRuntime) {
      this.snapshot.lastError = `Runtime ${preferredRuntime} not found after install attempt.`;
      return this.status();
    }

    const proxyPort = await findAvailablePort(10809);
    const socksPort =
      resolvedRuntime.runtimeKind === "xray" ? await findAvailablePort(10808, new Set([proxyPort])) : proxyPort;

    // Если есть process rules + sing-box, принудительно включаем TUN
    // Без TUN sing-box не может маршрутизировать по имени процесса
    if (processRules.length > 0 && resolvedRuntime.runtimeKind === "sing-box" && (await this.isAdmin())) {
      effectiveSettings.useTunMode = true;
    }

    const tempDir = path.join(os.tmpdir(), "EgoistShield", "runtime");
    await fs.mkdir(tempDir, { recursive: true });
    const configPath = path.join(tempDir, `config_${randomUUID()}.json`);

    try {
      let configContent = "";
      if (resolvedRuntime.runtimeKind === "xray") {
        configContent = ConfigBuilder.buildXray(node, domainRules, effectiveSettings, proxyPort, socksPort);
      } else {
        configContent = ConfigBuilder.buildSingBox(node, domainRules, processRules, effectiveSettings, proxyPort);
      }
      await fs.writeFile(configPath, configContent, "utf8");

      // Debug: сохраняем копию конфига в debug папку
      const debugDir = path.join(this.userDataDir, "debug");
      await fs.mkdir(debugDir, { recursive: true }).catch(() => { });
      const debugPrefix = `${resolvedRuntime.runtimeKind}_${node.protocol}`;
      await fs.writeFile(path.join(debugDir, `${debugPrefix}_config.json`), configContent, "utf8").catch(() => { });
      await fs.writeFile(path.join(debugDir, `${debugPrefix}_node.json`), JSON.stringify({
        id: node.id, name: node.name, protocol: node.protocol,
        server: node.server, port: node.port, runtimeKind: resolvedRuntime.runtimeKind,
        routeMode: effectiveSettings.routeMode, dnsMode: effectiveSettings.dnsMode,
        useTunMode: effectiveSettings.useTunMode, proxyPort, socksPort
      }, null, 2), "utf8").catch(() => { });
    } catch (err: any) {
      this.snapshot.lastError = `Failed to write config: ${err.message}`;
      return this.status();
    }

    const runtimeArgs = ["run", "-c", configPath];
    let runtimeOutput = "";
    const appendRuntimeOutput = (chunk: Buffer): void => {
      runtimeOutput = `${runtimeOutput}${chunk.toString("utf8")}`.slice(-4000);
    };

    const child = spawn(resolvedRuntime.runtimePath, runtimeArgs, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
      cwd: path.dirname(resolvedRuntime.runtimePath)
    });

    const processGeneration = ++this.generationCounter;
    this.snapshot.process = child;
    this.snapshot.processGeneration = processGeneration;
    this.snapshot.startedAt = new Date().toISOString();
    this.snapshot.proxyPort = proxyPort;
    this.snapshot.socksPort = socksPort;
    this.snapshot.configPath = configPath;
    this.snapshot.nodeId = node.id;
    this.snapshot.activeRuntimePath = resolvedRuntime.runtimePath;
    this.snapshot.runtimeKind = resolvedRuntime.runtimeKind;
    this.snapshot.processRulesApplied = processRules.length > 0 && resolvedRuntime.runtimeKind === "sing-box" && effectiveSettings.useTunMode;
    this.snapshot.lastError = null;
    this.lastSettings = effectiveSettings;

    child.stdout?.on("data", appendRuntimeOutput);
    child.stderr?.on("data", appendRuntimeOutput);

    // Debug: пишем runtime output в лог-файл
    const debugLogPath = path.join(this.userDataDir, "debug", `${resolvedRuntime.runtimeKind}_runtime.log`);
    const writeDebugLog = (chunk: Buffer): void => {
      fs.appendFile(debugLogPath, chunk.toString("utf8")).catch(() => { });
    };
    child.stdout?.on("data", writeDebugLog);
    child.stderr?.on("data", writeDebugLog);

    child.on("error", (error) => {
      if (this.snapshot.processGeneration === processGeneration) {
        const details = this.formatRuntimeOutput(runtimeOutput);
        this.snapshot.lastError = details
          ? `Runtime start error: ${error.message}. ${details}`
          : `Runtime start error: ${error.message}`;
      }
    });

    let startupPhase = true; // Блокировка auto-reconnect при startup

    child.on("exit", (code, signal) => {
      const expected = this.expectedExits.delete(processGeneration);
      if (!expected && this.snapshot.processGeneration === processGeneration) {
        const details = this.formatRuntimeOutput(runtimeOutput);
        this.snapshot.lastError = details
          ? `Runtime exited unexpectedly (code ${code ?? signal}): ${details}`
          : `Runtime exited unexpectedly (code ${code ?? signal})`;
        this.snapshot.process = null;
        this.snapshot.processGeneration = null;
        this.snapshot.startedAt = null;
        this.snapshot.proxyPort = null;
        this.snapshot.socksPort = null;
        this.snapshot.processRulesApplied = false;

        // Не эмитим unexpected-exit во время startup — fallback обработает это в connect()
        if (!startupPhase) {
          this.emit("unexpected-exit", this.snapshot.lastError);
        }
      }
    });

    // Ждём пока runtime стартует — проверяем TCP-порт
    // TUN-режим инициализирует виртуальный интерфейс — даём больше времени
    const startupTimeoutMs = effectiveSettings.useTunMode ? 5000 : 3000;
    const ready = await waitForPort(proxyPort, startupTimeoutMs);
    if (!ready && child.exitCode !== null) {
      // Runtime крашнулся — пробуем fallback
      const canFallbackToXray = resolvedRuntime.runtimeKind === "sing-box"
        && !SINGBOX_PROTOCOLS.has(node.protocol);
      if (canFallbackToXray) {
        // Очищаем snapshot чтобы не зацикливать auto-reconnect
        this.expectedExits.add(processGeneration);
        this.snapshot.process = null;
        this.snapshot.processGeneration = null;
        this.snapshot.lastError = null;

        // Рекурсивный вызов с отключённым TUN (xray + system proxy)
        const fallbackSettings = { ...settings, useTunMode: false };
        return this.connect(node, domainRules, [], fallbackSettings);
      }

      // Для sing-box-only протоколов — формируем информативную ошибку
      if (SINGBOX_PROTOCOLS.has(node.protocol)) {
        const runtimeLog = this.formatRuntimeOutput(runtimeOutput);
        this.snapshot.lastError = `Протокол ${node.protocol} требует sing-box, но runtime крашнулся при старте.`
          + (runtimeLog ? ` Лог: ${runtimeLog}` : "")
          + (effectiveSettings.useTunMode ? " Попробуйте отключить TUN-режим или запустить от имени администратора." : "");
      } else {
        this.snapshot.lastError = this.snapshot.lastError ?? "Runtime exited immediately after start.";
      }
      return this.status();
    }
    if (!ready && child.exitCode === null) {
      // Runtime жив, но порт не открылся — вероятно TUN init замедлился
      // Дополнительная попытка с коротким timeout
      const retryReady = await waitForPort(proxyPort, 2000);
      if (!retryReady) {
        this.snapshot.lastError = `Runtime запустился, но порт ${proxyPort} не доступен. Проверьте настройки сети.`;
        // Не убиваем — оставляем шанс что порт откроется с задержкой
      }
    }

    // Startup завершён — теперь exit events будут нормально обрабатываться
    startupPhase = false;

    if (!effectiveSettings.useTunMode) {
      await enableSystemProxy(proxyPort);
    }

    // Kill Switch: если включён, активировать firewall-правила
    if (effectiveSettings.killSwitch && resolvedRuntime) {
      try {
        await this.killSwitch.enable(proxyPort, resolvedRuntime.runtimePath);
      } catch (err: any) {
        console.warn("Kill Switch enable failed:", err.message);
      }
    }

    return this.status();
  }

  public async disconnect(): Promise<RuntimeStatus> {
    const activeProcess = this.snapshot.process;
    const activeGeneration = this.snapshot.processGeneration;

    // Сбросить snapshot сразу для быстрого UI-отклика
    this.snapshot.process = null;
    this.snapshot.processGeneration = null;
    this.snapshot.startedAt = null;
    this.snapshot.proxyPort = null;
    this.snapshot.socksPort = null;
    this.snapshot.nodeId = null;
    this.snapshot.processRulesApplied = false;

    if (activeProcess && activeGeneration !== null) {
      this.expectedExits.add(activeGeneration);
      activeProcess.kill();
    }

    // Параллельно: удаляем конфиг + отключаем прокси + kill switch
    const cleanupTasks: Promise<void>[] = [];

    if (this.snapshot.configPath) {
      const cfgPath = this.snapshot.configPath;
      this.snapshot.configPath = null;
      cleanupTasks.push(fs.rm(cfgPath, { force: true }).catch(() => { }));
    }

    if (!this.mockMode) {
      cleanupTasks.push(disableSystemProxy());
    }

    if (this.killSwitch.isActive()) {
      cleanupTasks.push(
        this.killSwitch.disable().catch((err: any) => {
          console.warn("Kill Switch disable failed:", err.message);
        })
      );
    }

    await Promise.all(cleanupTasks);

    return this.status();
  }

  public async diagnose(): Promise<DiagnosticResult> {
    const baseline = await this.status();
    if (!baseline.connected || !this.snapshot.proxyPort) {
      return {
        ok: false,
        latencyMs: 0,
        jitterMs: 0,
        lossPercent: 100,
        runtimeReachable: false,
        message: "Нет активного подключения."
      };
    }

    const port = this.snapshot.proxyPort;
    const PROBES = 5;
    const TIMEOUT = 2000;
    const samples: number[] = [];

    for (let i = 0; i < PROBES; i++) {
      const start = performance.now();
      try {
        await new Promise<void>((resolve, reject) => {
          const { createConnection } = require("node:net") as typeof import("node:net");
          const sock = createConnection({ host: "127.0.0.1", port, timeout: TIMEOUT }, () => {
            sock.destroy();
            resolve();
          });
          sock.on("error", (err) => { sock.destroy(); reject(err); });
          sock.on("timeout", () => { sock.destroy(); reject(new Error("timeout")); });
        });
        samples.push(performance.now() - start);
      } catch {
        samples.push(-1); // потеря
      }
    }

    const successful = samples.filter(s => s >= 0);
    const lost = samples.length - successful.length;
    const avg = successful.length > 0
      ? successful.reduce((a, b) => a + b, 0) / successful.length
      : 0;
    const variance = successful.length > 1
      ? successful.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / (successful.length - 1)
      : 0;
    const jitter = Math.sqrt(variance);

    return {
      ok: successful.length >= 3,
      latencyMs: Math.round(avg),
      jitterMs: Math.round(jitter),
      lossPercent: Math.round((lost / samples.length) * 100),
      runtimeReachable: successful.length > 0,
      message: successful.length >= 3
        ? "Подключение стабильно."
        : successful.length > 0
          ? "Обнаружены потери пакетов. Подключение нестабильно."
          : "Runtime недоступен. Проверьте настройки."
    };
  }

  public async stressTest(
    node: VpnNode,
    domainRules: DomainRule[],
    processRules: ProcessRule[],
    settings: AppSettings,
    iterations: number
  ): Promise<StressResult> {
    const result: StressResult = {
      iterations,
      connectSuccess: 0,
      connectFailed: 0,
      disconnectSuccess: 0,
      disconnectFailed: 0,
      errors: []
    };

    for (let i = 0; i < iterations; i += 1) {
      const status = await this.connect(node, domainRules, processRules, settings);
      if (status.connected) {
        result.connectSuccess += 1;
      } else {
        result.connectFailed += 1;
        if (status.lastError) {
          result.errors.push(`Iteration ${i + 1}: ${status.lastError}`);
        }
      }

      const off = await this.disconnect();
      if (!off.connected) {
        result.disconnectSuccess += 1;
      } else {
        result.disconnectFailed += 1;
        result.errors.push(`Iteration ${i + 1}: disconnect incomplete.`);
      }
    }

    return result;
  }

  private mockConnect(node: VpnNode, runtimeKind: RuntimeKind): RuntimeStatus {
    const child = spawn(process.execPath, ["-e", "setInterval(()=>{}, 100000);"], {
      windowsHide: true,
      stdio: "ignore"
    });
    this.snapshot.process = child;
    this.snapshot.processGeneration = ++this.generationCounter;
    this.snapshot.startedAt = new Date().toISOString();
    this.snapshot.nodeId = node.id;
    this.snapshot.lastError = null;
    this.snapshot.processRulesApplied = true;
    return {
      connected: true,
      pid: child.pid!,
      startedAt: this.snapshot.startedAt,
      activeNodeId: node.id,
      lastError: null,
      isAdmin: true,
      resolvedRuntimePath: "mock",
      runtimeKind,
      processRulesApplied: true,
      proxyPort: null
    };
  }

  private getPreferredRuntimeKind(node: VpnNode): RuntimeKind {
    if (SINGBOX_PROTOCOLS.has(node.protocol)) return "sing-box";
    return "xray";
  }

  private async resolveRuntimePath(
    configuredPath: string,
    preferredKind: RuntimeKind = "xray",
    allowFallback = true
  ): Promise<ResolvedRuntime | null> {
    const normalizedConfiguredPath = this.normalizeBinaryPath(configuredPath);
    if (normalizedConfiguredPath) {
      try {
        await fs.access(normalizedConfiguredPath);
        const detectedKind = this.detectRuntimeKindByFilename(normalizedConfiguredPath);
        if (detectedKind) {
          if (allowFallback || detectedKind === preferredKind) {
            return { runtimePath: normalizedConfiguredPath, runtimeKind: detectedKind };
          }
        } else {
          return { runtimePath: normalizedConfiguredPath, runtimeKind: preferredKind };
        }
      } catch {
        // Continue fallback search.
      }
    }

    const exeDir = path.dirname(process.execPath);
    const kinds: RuntimeKind[] = allowFallback
      ? (preferredKind === "xray" ? ["xray", "sing-box"] : ["sing-box", "xray"])
      : [preferredKind];

    for (const kind of kinds) {
      const candidates = DEFAULT_RUNTIME_CANDIDATES[kind];
      for (const candidate of candidates) {
        const resolvedCandidates = [
          path.resolve(this.userDataDir, candidate),
          path.resolve(this.appRoot, candidate),
          path.resolve(exeDir, candidate)
        ];
        for (const resolved of resolvedCandidates) {
          try {
            await fs.access(resolved);
            return { runtimePath: resolved, runtimeKind: kind };
          } catch {
            // try next candidate
          }
        }
      }
    }
    return null;
  }

  private normalizeBinaryPath(p: string): string | null {
    const value = p.trim();
    if (!value) {
      return null;
    }
    if (path.isAbsolute(value)) {
      return path.normalize(value);
    }
    return path.resolve(this.userDataDir, value);
  }

  private detectRuntimeKindByFilename(p: string): RuntimeKind | null {
    const lower = p.toLowerCase();
    if (lower.includes("xray")) return "xray";
    if (lower.includes("sing-box")) return "sing-box";
    return null;
  }

  private formatRuntimeOutput(raw: string): string {
    return raw
      .trim()
      .replace(/\s+/g, " ")
      .slice(-700);
  }
}
