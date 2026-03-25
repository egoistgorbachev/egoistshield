import { execFile, spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { findAvailablePort, waitForPort } from "./port-utils";
import { disableSystemProxy, enableSystemProxy } from "./system-proxy";

import { ConfigBuilder } from "./config-builder";
import type {
  AppSettings,
  DiagnosticResult,
  DomainRule,
  ProcessRule,
  RuntimeDiagnostic,
  RuntimeFailureReason,
  RuntimeKind,
  RuntimeLifecycle,
  RuntimeInstallResult,
  RuntimeStatus,
  StressResult,
  VpnNode
} from "./contracts";
import { KillSwitch } from "./kill-switch";
import logger, { formatRuntimeLogEvent } from "./logger";
import { RuntimeInstaller } from "./runtime-installer";

const execFileAsync = promisify(execFile);
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
  lifecycle: RuntimeLifecycle;
  diagnostic: RuntimeDiagnostic;
};

type RuntimeSession = Omit<RuntimeSnapshot, "lastError" | "lifecycle" | "diagnostic"> & {
  process: ReturnType<typeof spawn>;
  processGeneration: number;
  startedAt: string;
  proxyPort: number;
  nodeId: string;
  activeRuntimePath: string;
  runtimeKind: RuntimeKind;
};

type PreparedConnection = {
  effectiveSettings: AppSettings;
  resolvedRuntime: ResolvedRuntime;
  session: RuntimeSession;
};

type SessionCleanupOptions = {
  disableSystemProxy: boolean;
  clearKillSwitch: boolean;
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
    processRulesApplied: false,
    lifecycle: "idle",
    diagnostic: {
      reason: null,
      details: null,
      updatedAt: null,
      fallbackAttempted: false,
      fallbackTarget: null
    }
  };

  private readonly appRoot: string;
  private readonly userDataDir: string;
  private generationCounter = 0;
  private readonly expectedExits = new Set<number>();
  private lastSettings: AppSettings | null = null;
  private readonly installer: RuntimeInstaller;
  private readonly killSwitch: KillSwitch;
  private cachedIsAdmin: boolean | null = null;
  private operationMutex: Promise<unknown> = Promise.resolve();
  private readonly retiringSessions = new Map<number, { session: RuntimeSession; timer: NodeJS.Timeout }>();

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
    if (process.platform !== "win32") {
      this.cachedIsAdmin = true;
      return true;
    }
    try {
      const _result = await execFileAsync("net.exe", ["session"], { timeout: 2000, windowsHide: true });
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
      isMock: this.mockMode,
      pid: connected ? (this.snapshot.process?.pid ?? null) : null,
      startedAt: this.snapshot.startedAt,
      activeNodeId: this.snapshot.nodeId,
      lastError: this.snapshot.lastError,
      isAdmin: await this.isAdmin(),
      resolvedRuntimePath: this.snapshot.activeRuntimePath,
      runtimeKind: this.snapshot.runtimeKind,
      processRulesApplied: this.snapshot.processRulesApplied,
      proxyPort: this.snapshot.proxyPort,
      lifecycle: connected ? (this.snapshot.lifecycle === "failed" ? "active" : this.snapshot.lifecycle) : this.snapshot.lifecycle,
      diagnostic: { ...this.snapshot.diagnostic }
    };
  }

  private setLifecycle(nextLifecycle: RuntimeLifecycle): void {
    this.snapshot.lifecycle = nextLifecycle;
  }

  private logRuntimeEvent(
    level: "info" | "warn" | "error" | "debug",
    message: string,
    overrides?: Partial<Pick<RuntimeStatus, "activeNodeId" | "runtimeKind" | "proxyPort" | "lifecycle">> & {
      reason?: RuntimeFailureReason | null;
    }
  ): void {
    const payload = formatRuntimeLogEvent({
      timestamp: new Date().toISOString(),
      level,
      lifecycle: overrides?.lifecycle ?? this.snapshot.lifecycle,
      reason: overrides?.reason ?? this.snapshot.diagnostic.reason,
      message,
      nodeId: overrides?.activeNodeId ?? this.snapshot.nodeId,
      runtimeKind: overrides?.runtimeKind ?? this.snapshot.runtimeKind,
      proxyPort: overrides?.proxyPort ?? this.snapshot.proxyPort
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

  private clearDiagnostic(): void {
    this.snapshot.diagnostic = {
      reason: null,
      details: null,
      updatedAt: new Date().toISOString(),
      fallbackAttempted: false,
      fallbackTarget: null
    };
  }

  private setFailure(
    reason: RuntimeFailureReason,
    details: string,
    options?: { fallbackAttempted?: boolean; fallbackTarget?: RuntimeKind | null }
  ): void {
    this.snapshot.lastError = details;
    this.snapshot.lifecycle = "failed";
    this.snapshot.diagnostic = {
      reason,
      details,
      updatedAt: new Date().toISOString(),
      fallbackAttempted: options?.fallbackAttempted ?? false,
      fallbackTarget: options?.fallbackTarget ?? null
    };
    this.logRuntimeEvent("error", details, { reason, lifecycle: "failed" });
  }

  private getActiveSession(): RuntimeSession | null {
    const {
      process,
      processGeneration,
      startedAt,
      proxyPort,
      socksPort,
      configPath,
      nodeId,
      activeRuntimePath,
      runtimeKind,
      processRulesApplied
    } = this.snapshot;

    if (
      !process ||
      processGeneration === null ||
      !startedAt ||
      proxyPort === null ||
      !nodeId ||
      !activeRuntimePath ||
      !runtimeKind
    ) {
      return null;
    }

    return {
      process,
      processGeneration,
      startedAt,
      proxyPort,
      socksPort,
      configPath,
      nodeId,
      activeRuntimePath,
      runtimeKind,
      processRulesApplied
    };
  }

  private applyActiveSession(session: RuntimeSession): void {
    this.snapshot.process = session.process;
    this.snapshot.processGeneration = session.processGeneration;
    this.snapshot.startedAt = session.startedAt;
    this.snapshot.proxyPort = session.proxyPort;
    this.snapshot.socksPort = session.socksPort;
    this.snapshot.configPath = session.configPath;
    this.snapshot.nodeId = session.nodeId;
    this.snapshot.activeRuntimePath = session.activeRuntimePath;
    this.snapshot.runtimeKind = session.runtimeKind;
    this.snapshot.processRulesApplied = session.processRulesApplied;
    this.snapshot.lastError = null;
    this.snapshot.lifecycle = "active";
    this.clearDiagnostic();
    this.logRuntimeEvent("info", "Runtime session activated.", {
      activeNodeId: session.nodeId,
      runtimeKind: session.runtimeKind,
      proxyPort: session.proxyPort,
      lifecycle: "active",
      reason: null
    });
  }

  private clearActiveSession(lastError: string | null = null): void {
    this.snapshot.process = null;
    this.snapshot.processGeneration = null;
    this.snapshot.startedAt = null;
    this.snapshot.proxyPort = null;
    this.snapshot.socksPort = null;
    this.snapshot.configPath = null;
    this.snapshot.nodeId = null;
    this.snapshot.activeRuntimePath = null;
    this.snapshot.runtimeKind = null;
    this.snapshot.processRulesApplied = false;
    this.snapshot.lastError = lastError;
    this.snapshot.lifecycle = lastError ? "failed" : "idle";
    if (!lastError) {
      this.clearDiagnostic();
    }
  }

  private async flushRetiringSessions(): Promise<void> {
    const retirements = Array.from(this.retiringSessions.values());
    this.retiringSessions.clear();

    await Promise.all(
      retirements.map(async ({ session, timer }) => {
        clearTimeout(timer);
        await this.terminateSession(session, {
          disableSystemProxy: false,
          clearKillSwitch: false
        });
      })
    );
  }

  private scheduleSessionRetirement(session: RuntimeSession, graceMs: number): void {
    const existingRetirement = this.retiringSessions.get(session.processGeneration);
    if (existingRetirement) {
      clearTimeout(existingRetirement.timer);
    }

    const timer = setTimeout(() => {
      this.retiringSessions.delete(session.processGeneration);
      void this.terminateSession(session, {
        disableSystemProxy: false,
        clearKillSwitch: false
      });
    }, graceMs);

    this.retiringSessions.set(session.processGeneration, { session, timer });
  }

  private async terminateSession(session: RuntimeSession, options: SessionCleanupOptions): Promise<void> {
    const activeProcess = session.process;
    const activeGeneration = session.processGeneration;
    const activePid = activeProcess.pid;
    const wasMockRuntime = this.mockMode && session.activeRuntimePath === "mock";

    this.expectedExits.add(activeGeneration);

    const exitPromise = new Promise<void>((resolve) => {
      if (activeProcess.exitCode !== null) {
        resolve();
        return;
      }
      const onExit = () => {
        resolve();
      };
      activeProcess.once("exit", onExit);
      setTimeout(
        () => {
          activeProcess.removeListener("exit", onExit);
          resolve();
        },
        wasMockRuntime ? 300 : 3000
      );
    });

    activeProcess.kill();
    await exitPromise;

    if (!wasMockRuntime && activePid && activeProcess.exitCode === null) {
      try {
        spawnSync("taskkill", ["/F", "/PID", String(activePid)], { windowsHide: true, timeout: 2000 });
      } catch {
        /* ignore */
      }
      await delay(300);
    }

    const cleanupTasks: Promise<void>[] = [];

    if (session.configPath) {
      cleanupTasks.push(fs.rm(session.configPath, { force: true }).catch(() => {}));
    }

    if (options.disableSystemProxy && !this.mockMode) {
      cleanupTasks.push(disableSystemProxy());
    }

    if (options.clearKillSwitch && this.killSwitch.isActive()) {
      cleanupTasks.push(
        this.killSwitch.disable().catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn("Kill Switch disable failed:", msg);
        })
      );
    }

    await Promise.all(cleanupTasks);
  }

  private async activatePreparedConnection(
    prepared: PreparedConnection,
    previousSession: RuntimeSession | null
  ): Promise<RuntimeStatus> {
    const { effectiveSettings, resolvedRuntime, session } = prepared;
    let degradedReason: RuntimeFailureReason | null = null;
    let degradedDetails: string | null = null;

    if (effectiveSettings.killSwitch) {
      try {
        await this.killSwitch.enable(session.proxyPort, resolvedRuntime.runtimePath);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("Kill Switch enable failed:", msg);
        degradedReason = "kill_switch_failed";
        degradedDetails = `Kill Switch enable failed: ${msg}`;
      }
    } else if (this.killSwitch.isActive()) {
      await this.killSwitch.disable().catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("Kill Switch disable failed:", msg);
      });
    }

    try {
      await enableSystemProxy(session.proxyPort);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      degradedReason = degradedReason ?? "system_proxy_failed";
      degradedDetails = degradedDetails ?? `System proxy enable failed: ${msg}`;
    }

    this.applyActiveSession(session);
    this.lastSettings = effectiveSettings;

    if (previousSession) {
      this.scheduleSessionRetirement(previousSession, 5_000);
    }

    if (degradedReason && degradedDetails) {
      this.snapshot.lifecycle = "degraded";
      this.snapshot.lastError = degradedDetails;
      this.snapshot.diagnostic = {
        reason: degradedReason,
        details: degradedDetails,
        updatedAt: new Date().toISOString(),
        fallbackAttempted: false,
        fallbackTarget: null
      };
      this.logRuntimeEvent("warn", degradedDetails, { reason: degradedReason, lifecycle: "degraded" });
    }

    return this.status();
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

  public connect(
    node: VpnNode,
    domainRules: DomainRule[],
    processRules: ProcessRule[],
    settings: AppSettings
  ): Promise<RuntimeStatus> {
    return new Promise((resolve, reject) => {
      this.operationMutex = this.operationMutex
        .then(() => this._connect(node, domainRules, processRules, settings))
        .then(resolve)
        .catch(reject);
    });
  }

  private async _connect(
    node: VpnNode,
    domainRules: DomainRule[],
    processRules: ProcessRule[],
    settings: AppSettings
  ): Promise<RuntimeStatus> {
    this.setLifecycle(this.getActiveSession() ? "reconnecting" : "probing");
    this.clearDiagnostic();
    const previousSession = this.getActiveSession();
    const prepared = await this.prepareConnection(node, domainRules, processRules, settings);
    if (!prepared) {
      return this.status();
    }

    return this.activatePreparedConnection(prepared, previousSession);
  }

  private async prepareConnection(
    node: VpnNode,
    domainRules: DomainRule[],
    _processRules: ProcessRule[],
    settings: AppSettings
  ): Promise<PreparedConnection | null> {
    const preferredRuntime = this.getPreferredRuntimeKind(node);
    const effectiveSettings = { ...settings, useTunMode: false };
    const sanitizedProcessRules: ProcessRule[] = [];
    this.setLifecycle("probing");

    if (this.mockMode) {
      const child = spawn(process.execPath, ["-e", "setInterval(()=>{}, 100000);"], {
        windowsHide: true,
        stdio: "ignore"
      });
      const session: RuntimeSession = {
        process: child,
        processGeneration: ++this.generationCounter,
        startedAt: new Date().toISOString(),
        proxyPort: 10809,
        socksPort: null,
        configPath: null,
        nodeId: node.id,
        activeRuntimePath: "mock",
        runtimeKind: preferredRuntime,
        processRulesApplied: false
      };
      this.snapshot.lastError = null;
      this.snapshot.lifecycle = "active";
      this.clearDiagnostic();
      return {
        effectiveSettings,
        resolvedRuntime: { runtimeKind: preferredRuntime, runtimePath: "mock" },
        session
      };
    }

    let resolvedRuntime = await this.resolveRuntimePath(settings.runtimePath, preferredRuntime, false);

    if (!resolvedRuntime) {
      const installed = await (preferredRuntime === "xray"
        ? this.installer.installXray()
        : this.installer.installSingBox());
      if (!installed.ok) {
        this.setFailure("runtime_install_failed", `Runtime ${preferredRuntime} install failed: ${installed.message}`);
        return null;
      }
      resolvedRuntime = await this.resolveRuntimePath("", preferredRuntime, false);
    }

    if (!resolvedRuntime) {
      this.setFailure("runtime_not_found", `Runtime ${preferredRuntime} not found after install attempt.`);
      return null;
    }

    const proxyPort = await findAvailablePort(10809);
    const socksPort =
      resolvedRuntime.runtimeKind === "xray" ? await findAvailablePort(10808, new Set([proxyPort])) : proxyPort;
    const apiPort =
      resolvedRuntime.runtimeKind === "xray" ? await findAvailablePort(10085, new Set([proxyPort, socksPort])) : 0;

    const tempDir = path.join(os.tmpdir(), "EgoistShield", "runtime");
    await fs.mkdir(tempDir, { recursive: true });
    const configPath = path.join(tempDir, `config_${randomUUID()}.json`);

    try {
      this.setLifecycle("connecting");
      const configContent =
        resolvedRuntime.runtimeKind === "xray"
          ? ConfigBuilder.buildXray(node, domainRules, effectiveSettings, proxyPort, socksPort, apiPort)
          : ConfigBuilder.buildSingBox(node, domainRules, sanitizedProcessRules, effectiveSettings, proxyPort);

      await fs.writeFile(configPath, configContent, "utf8");

      const isDev = process.env.NODE_ENV === "development" || !!process.env.VITE_DEV_SERVER_URL;
      if (isDev) {
        const debugDir = path.join(this.userDataDir, "debug");
        await fs.mkdir(debugDir, { recursive: true }).catch(() => {});
        const debugPrefix = `${resolvedRuntime.runtimeKind}_${node.protocol}`;
        await fs.writeFile(path.join(debugDir, `${debugPrefix}_config.json`), configContent, "utf8").catch(() => {});
        await fs
          .writeFile(
            path.join(debugDir, `${debugPrefix}_node.json`),
            JSON.stringify(
              {
                id: node.id,
                name: node.name,
                protocol: node.protocol,
                server: node.server,
                port: node.port,
                runtimeKind: resolvedRuntime.runtimeKind,
                routeMode: effectiveSettings.routeMode,
                dnsMode: effectiveSettings.dnsMode,
                useTunMode: effectiveSettings.useTunMode,
                proxyPort,
                socksPort
              },
              null,
              2
            ),
            "utf8"
          )
          .catch(() => {});
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.setFailure("config_write_failed", `Failed to write config: ${msg}`);
      return null;
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
    const session: RuntimeSession = {
      process: child,
      processGeneration,
      startedAt: new Date().toISOString(),
      proxyPort,
      socksPort,
      configPath,
      nodeId: node.id,
      activeRuntimePath: resolvedRuntime.runtimePath,
      runtimeKind: resolvedRuntime.runtimeKind,
      processRulesApplied: false
    };

    child.stdout?.on("data", appendRuntimeOutput);
    child.stderr?.on("data", appendRuntimeOutput);

    const isDevLog = process.env.NODE_ENV === "development" || !!process.env.VITE_DEV_SERVER_URL;
    if (isDevLog) {
      const debugLogPath = path.join(this.userDataDir, "debug", `${resolvedRuntime.runtimeKind}_runtime.log`);
      const writeDebugLog = (chunk: Buffer): void => {
        fs.appendFile(debugLogPath, chunk.toString("utf8")).catch(() => {});
      };
      child.stdout?.on("data", writeDebugLog);
      child.stderr?.on("data", writeDebugLog);
    }

    let startupPhase = true;

    child.on("error", (error) => {
      if (this.snapshot.processGeneration === processGeneration) {
        const details = this.formatRuntimeOutput(runtimeOutput);
        this.setFailure(
          "runtime_start_failed",
          details ? `Runtime start error: ${error.message}. ${details}` : `Runtime start error: ${error.message}`
        );
      }
    });

    child.on("exit", (code, signal) => {
      const expected = this.expectedExits.delete(processGeneration);
      if (expected) {
        return;
      }

      if (this.snapshot.processGeneration === processGeneration) {
        const details = this.formatRuntimeOutput(runtimeOutput);
        const lastError = details
          ? `Runtime exited unexpectedly (code ${code ?? signal}): ${details}`
          : `Runtime exited unexpectedly (code ${code ?? signal})`;
        this.clearActiveSession(lastError);
        this.snapshot.diagnostic = {
          reason: "runtime_crashed",
          details: lastError,
          updatedAt: new Date().toISOString(),
          fallbackAttempted: false,
          fallbackTarget: null
        };
        this.logRuntimeEvent("error", lastError, { reason: "runtime_crashed", lifecycle: "failed" });

        if (!startupPhase) {
          this.emit("unexpected-exit", lastError);
        }
      }
    });

    this.setLifecycle("warmup");
    const ready = await waitForPort(proxyPort, 3000);
    if (!ready && child.exitCode !== null) {
      const canFallbackToXray = resolvedRuntime.runtimeKind === "sing-box" && !SINGBOX_PROTOCOLS.has(node.protocol);
      await this.terminateSession(session, {
        disableSystemProxy: false,
        clearKillSwitch: false
      });

      if (canFallbackToXray) {
        const fallbackSettings = { ...settings, useTunMode: false };
        this.snapshot.diagnostic = {
          reason: "runtime_crashed",
          details: `Runtime ${resolvedRuntime.runtimeKind} crashed during warmup, retrying with xray.`,
          updatedAt: new Date().toISOString(),
          fallbackAttempted: true,
          fallbackTarget: "xray"
        };
        this.snapshot.lifecycle = "reconnecting";
        this.logRuntimeEvent("warn", `Runtime ${resolvedRuntime.runtimeKind} crashed during warmup, retrying with xray.`, {
          reason: "runtime_crashed",
          lifecycle: "reconnecting",
          runtimeKind: resolvedRuntime.runtimeKind
        });
        return this.prepareConnection(node, domainRules, [], fallbackSettings);
      }

      if (SINGBOX_PROTOCOLS.has(node.protocol)) {
        const runtimeLog = this.formatRuntimeOutput(runtimeOutput);
        this.setFailure(
          "runtime_crashed",
          `Протокол ${node.protocol} требует sing-box, но runtime крашнулся при старте.${runtimeLog ? ` Лог: ${runtimeLog}` : ""}`
        );
      } else {
        this.setFailure("runtime_crashed", "Runtime exited immediately after start.");
      }
      return null;
    }

    if (!ready && child.exitCode === null) {
      const retryReady = await waitForPort(proxyPort, 2000);
      if (!retryReady) {
        await this.terminateSession(session, {
          disableSystemProxy: false,
          clearKillSwitch: false
        });
        this.setFailure(
          "runtime_port_unreachable",
          `Runtime запустился, но порт ${proxyPort} не доступен. Проверьте настройки сети.`
        );
        return null;
      }
    }

    startupPhase = false;
    this.snapshot.lastError = null;
    this.clearDiagnostic();

    return {
      effectiveSettings,
      resolvedRuntime,
      session
    };
  }

  public disconnect(): Promise<RuntimeStatus> {
    return new Promise((resolve, reject) => {
      this.operationMutex = this.operationMutex
        .then(() => this._disconnect())
        .then(resolve)
        .catch(reject);
    });
  }

  private async _disconnect(): Promise<RuntimeStatus> {
    this.setLifecycle("idle");
    const activeSession = this.getActiveSession();
    this.clearActiveSession();

    await this.flushRetiringSessions();

    if (activeSession) {
      await this.terminateSession(activeSession, {
        disableSystemProxy: !this.mockMode,
        clearKillSwitch: true
      });
    } else if (!this.mockMode) {
      await disableSystemProxy();
      if (this.killSwitch.isActive()) {
        await this.killSwitch.disable().catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn("Kill Switch disable failed:", msg);
        });
      }
    }

    await delay(200);
    this.logRuntimeEvent("info", "Runtime session disconnected.", {
      activeNodeId: activeSession?.nodeId ?? null,
      runtimeKind: activeSession?.runtimeKind ?? null,
      proxyPort: activeSession?.proxyPort ?? null,
      lifecycle: "idle",
      reason: null
    });

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
        message: "Нет активного подключения.",
        lifecycle: baseline.lifecycle,
        failureReason: baseline.diagnostic.reason
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
          sock.on("error", (err) => {
            sock.destroy();
            reject(err);
          });
          sock.on("timeout", () => {
            sock.destroy();
            reject(new Error("timeout"));
          });
        });
        samples.push(performance.now() - start);
      } catch {
        samples.push(-1); // потеря
      }
    }

    const successful = samples.filter((s) => s >= 0);
    const lost = samples.length - successful.length;
    const avg = successful.length > 0 ? successful.reduce((a, b) => a + b, 0) / successful.length : 0;
    const variance =
      successful.length > 1 ? successful.reduce((sum, s) => sum + (s - avg) ** 2, 0) / (successful.length - 1) : 0;
    const jitter = Math.sqrt(variance);

    return {
      ok: successful.length >= 3,
      latencyMs: Math.round(avg),
      jitterMs: Math.round(jitter),
      lossPercent: Math.round((lost / samples.length) * 100),
      runtimeReachable: successful.length > 0,
      message:
        successful.length >= 3
          ? "Подключение стабильно."
          : successful.length > 0
            ? "Обнаружены потери пакетов. Подключение нестабильно."
            : "Runtime недоступен. Проверьте настройки.",
      lifecycle: baseline.lifecycle,
      failureReason: baseline.diagnostic.reason
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

  private async mockConnect(node: VpnNode, runtimeKind: RuntimeKind): Promise<RuntimeStatus> {
    const child = spawn(process.execPath, ["-e", "setInterval(()=>{}, 100000);"], {
      windowsHide: true,
      stdio: "ignore"
    });
    this.snapshot.process = child;
    this.snapshot.processGeneration = ++this.generationCounter;
    this.snapshot.startedAt = new Date().toISOString();
    this.snapshot.nodeId = node.id;
    this.snapshot.proxyPort = null;
    this.snapshot.socksPort = null;
    this.snapshot.activeRuntimePath = "mock";
    this.snapshot.runtimeKind = runtimeKind;
    this.snapshot.lastError = null;
    this.snapshot.processRulesApplied = false;
    this.snapshot.lifecycle = "active";
    this.clearDiagnostic();
    return this.status();
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
      ? preferredKind === "xray"
        ? ["xray", "sing-box"]
        : ["sing-box", "xray"]
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
    return raw.trim().replace(/\s+/g, " ").slice(-700);
  }
}
