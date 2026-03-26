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
  RuntimeInstallResult,
  RuntimeKind,
  RuntimeLifecycle,
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
  fallbackTarget: RuntimeKind | null;
};

type SessionCleanupOptions = {
  disableSystemProxy: boolean;
  clearKillSwitch: boolean;
};

type ProxyProbeResult = {
  ok: boolean;
  successfulProbes: number;
  latencyMs: number;
  jitterMs: number;
  lossPercent: number;
  failureReason: RuntimeFailureReason | null;
  details: string | null;
};

type PendingHandoff = {
  nextSessionGeneration: number;
  previousSession: RuntimeSession;
  fallbackTarget: RuntimeKind | null;
  verifyTimer: NodeJS.Timeout;
};

const DEFAULT_RUNTIME_CANDIDATES: Record<RuntimeKind, string[]> = {
  xray: ["runtime\\xray\\xray.exe", "xray.exe"],
  "sing-box": ["runtime\\sing-box\\sing-box.exe", "sing-box.exe"]
};

const SINGBOX_PROTOCOLS = new Set<VpnNode["protocol"]>(["hysteria2", "tuic", "wireguard"]);
const DNS_FAILURE_PATTERNS = ["dns", "resolve", "lookup", "no such host", "server misbehaving"];
const TLS_FAILURE_PATTERNS = ["tls", "handshake", "x509", "certificate", "reality"];
const AUTH_FAILURE_PATTERNS = ["auth", "invalid user", "wrong password", "unauthorized", "forbidden"];
const QUIC_FAILURE_PATTERNS = ["quic", "udp", "no recent network activity"];
const NETWORK_FAILURE_PATTERNS = [
  "connection refused",
  "actively refused",
  "timed out",
  "timeout",
  "network is unreachable",
  "connection reset",
  "no route to host",
  "unreachable"
] as const;
const PREPARED_SESSION_PROBES = 3;
const PREPARED_SESSION_TIMEOUT_MS = 1_200;
const PREPARED_SESSION_MIN_SUCCESS = 2;
const HANDOFF_VERIFY_DELAY_MS = 2_500;
const HANDOFF_RETIRE_GRACE_MS = 8_000;
const HANDOFF_VERIFY_PROBES = 4;
const HANDOFF_VERIFY_TIMEOUT_MS = 1_200;
const HANDOFF_VERIFY_MIN_SUCCESS = 3;

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
  private readonly nodeRuntimePreferences = new Map<string, RuntimeKind>();
  private pendingHandoff: PendingHandoff | null = null;

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
      lifecycle: connected
        ? this.snapshot.lifecycle === "failed"
          ? "active"
          : this.snapshot.lifecycle
        : this.snapshot.lifecycle,
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

  private clearDiagnostic(options?: { fallbackAttempted?: boolean; fallbackTarget?: RuntimeKind | null }): void {
    this.snapshot.diagnostic = {
      reason: null,
      details: null,
      updatedAt: new Date().toISOString(),
      fallbackAttempted: options?.fallbackAttempted ?? false,
      fallbackTarget: options?.fallbackTarget ?? null
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

  private classifyFailureReason(
    rawOutput: string,
    stage: "start" | "warmup" | "active",
    node: VpnNode,
    runtimeKind: RuntimeKind
  ): RuntimeFailureReason {
    const normalizedOutput = rawOutput.toLowerCase();

    if (DNS_FAILURE_PATTERNS.some((pattern) => normalizedOutput.includes(pattern))) {
      return "dns_failed";
    }

    if (AUTH_FAILURE_PATTERNS.some((pattern) => normalizedOutput.includes(pattern))) {
      return "auth_rejected";
    }

    if (TLS_FAILURE_PATTERNS.some((pattern) => normalizedOutput.includes(pattern))) {
      return "tls_handshake_failed";
    }

    if (
      (node.protocol === "hysteria2" || node.protocol === "tuic" || runtimeKind === "sing-box") &&
      QUIC_FAILURE_PATTERNS.some((pattern) => normalizedOutput.includes(pattern))
    ) {
      return "quic_blocked";
    }

    if (NETWORK_FAILURE_PATTERNS.some((pattern) => normalizedOutput.includes(pattern))) {
      return stage === "active" ? "runtime_crashed" : "server_unreachable";
    }

    if (stage === "start") {
      return "runtime_start_failed";
    }

    if (stage === "warmup") {
      return "runtime_crashed";
    }

    return "runtime_crashed";
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

  private applyActiveSession(session: RuntimeSession, fallbackTarget: RuntimeKind | null = null): void {
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
    this.clearDiagnostic({ fallbackAttempted: fallbackTarget !== null, fallbackTarget });
    if (fallbackTarget) {
      this.nodeRuntimePreferences.set(session.nodeId, fallbackTarget);
    }
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

  private clearPendingHandoff(expectedGeneration?: number): PendingHandoff | null {
    if (!this.pendingHandoff) {
      return null;
    }

    if (typeof expectedGeneration === "number" && this.pendingHandoff.nextSessionGeneration !== expectedGeneration) {
      return null;
    }

    const pendingHandoff = this.pendingHandoff;
    clearTimeout(pendingHandoff.verifyTimer);
    this.pendingHandoff = null;
    return pendingHandoff;
  }

  private cancelSessionRetirement(processGeneration: number): RuntimeSession | null {
    const existingRetirement = this.retiringSessions.get(processGeneration);
    if (!existingRetirement) {
      return null;
    }

    clearTimeout(existingRetirement.timer);
    this.retiringSessions.delete(processGeneration);
    return existingRetirement.session;
  }

  private async probeRuntimePort(
    session: Pick<RuntimeSession, "proxyPort" | "activeRuntimePath">,
    options: { probes: number; timeoutMs: number; minimumSuccesses: number }
  ): Promise<ProxyProbeResult> {
    if (this.mockMode && session.activeRuntimePath === "mock") {
      return {
        ok: true,
        successfulProbes: options.probes,
        latencyMs: 0,
        jitterMs: 0,
        lossPercent: 0,
        failureReason: null,
        details: null
      };
    }

    const samples: number[] = [];
    for (let index = 0; index < options.probes; index += 1) {
      const startedAt = performance.now();
      try {
        await new Promise<void>((resolve, reject) => {
          const { createConnection } = require("node:net") as typeof import("node:net");
          const socket = createConnection(
            {
              host: "127.0.0.1",
              port: session.proxyPort,
              timeout: options.timeoutMs
            },
            () => {
              socket.destroy();
              resolve();
            }
          );
          socket.on("error", (error) => {
            socket.destroy();
            reject(error);
          });
          socket.on("timeout", () => {
            socket.destroy();
            reject(new Error("timeout"));
          });
        });
        samples.push(performance.now() - startedAt);
      } catch {
        samples.push(-1);
      }
    }

    const successfulSamples = samples.filter((sample) => sample >= 0);
    const averageLatency =
      successfulSamples.length > 0
        ? successfulSamples.reduce((total, sample) => total + sample, 0) / successfulSamples.length
        : 0;
    const variance =
      successfulSamples.length > 1
        ? successfulSamples.reduce((total, sample) => total + (sample - averageLatency) ** 2, 0) /
          (successfulSamples.length - 1)
        : 0;
    const jitterMs = Math.sqrt(variance);
    const lossPercent = Math.round(((samples.length - successfulSamples.length) / samples.length) * 100);
    const ok = successfulSamples.length >= options.minimumSuccesses;

    return {
      ok,
      successfulProbes: successfulSamples.length,
      latencyMs: Math.round(averageLatency),
      jitterMs: Math.round(jitterMs),
      lossPercent,
      failureReason: ok ? null : "runtime_port_unreachable",
      details: ok
        ? null
        : `Runtime port ${session.proxyPort} не подтвердил стабильность: ${successfulSamples.length}/${samples.length} успешных probe.`
    };
  }

  private async restorePreviousSession(
    session: RuntimeSession,
    reason: RuntimeFailureReason,
    details: string,
    fallbackTarget: RuntimeKind | null
  ): Promise<boolean> {
    if (session.process.exitCode !== null || session.process.killed) {
      return false;
    }

    const cleanupIssues: string[] = [];
    if (this.lastSettings?.killSwitch) {
      try {
        await this.killSwitch.enable(session.proxyPort, session.activeRuntimePath);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        cleanupIssues.push(`Kill Switch restore failed: ${message}`);
      }
    } else if (this.killSwitch.isActive()) {
      await this.killSwitch.disable().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        cleanupIssues.push(`Kill Switch disable failed: ${message}`);
      });
    }

    try {
      await enableSystemProxy(session.proxyPort);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      cleanupIssues.push(`System proxy restore failed: ${message}`);
    }

    this.applyActiveSession(session);
    const combinedDetails = [details, ...cleanupIssues].join(" ");
    this.snapshot.lifecycle = "degraded";
    this.snapshot.lastError = combinedDetails;
    this.snapshot.diagnostic = {
      reason,
      details: combinedDetails,
      updatedAt: new Date().toISOString(),
      fallbackAttempted: fallbackTarget !== null,
      fallbackTarget
    };
    this.logRuntimeEvent("warn", combinedDetails, {
      activeNodeId: session.nodeId,
      runtimeKind: session.runtimeKind,
      proxyPort: session.proxyPort,
      lifecycle: "degraded",
      reason
    });
    return true;
  }

  private beginPendingHandoff(
    nextSession: RuntimeSession,
    previousSession: RuntimeSession,
    fallbackTarget: RuntimeKind | null
  ): void {
    this.clearPendingHandoff();
    this.scheduleSessionRetirement(previousSession, HANDOFF_RETIRE_GRACE_MS);
    const verifyTimer = setTimeout(() => {
      void this.verifyPendingHandoff(nextSession.processGeneration);
    }, HANDOFF_VERIFY_DELAY_MS);
    this.pendingHandoff = {
      nextSessionGeneration: nextSession.processGeneration,
      previousSession,
      fallbackTarget,
      verifyTimer
    };
  }

  private async rollbackPendingHandoff(
    failedGeneration: number,
    reason: RuntimeFailureReason,
    details: string
  ): Promise<boolean> {
    const pendingHandoff = this.clearPendingHandoff(failedGeneration);
    if (!pendingHandoff) {
      return false;
    }

    const preservedSession =
      this.cancelSessionRetirement(pendingHandoff.previousSession.processGeneration) ?? pendingHandoff.previousSession;
    const activeSession = this.getActiveSession();
    if (activeSession && activeSession.processGeneration === failedGeneration) {
      await this.terminateSession(activeSession, {
        disableSystemProxy: false,
        clearKillSwitch: false
      });
    }

    return this.restorePreviousSession(preservedSession, reason, details, pendingHandoff.fallbackTarget);
  }

  private async verifyPendingHandoff(nextSessionGeneration: number): Promise<void> {
    const pendingHandoff = this.pendingHandoff;
    if (!pendingHandoff || pendingHandoff.nextSessionGeneration !== nextSessionGeneration) {
      return;
    }

    const activeSession = this.getActiveSession();
    if (!activeSession || activeSession.processGeneration !== nextSessionGeneration) {
      this.clearPendingHandoff(nextSessionGeneration);
      return;
    }

    const probeResult = await this.probeRuntimePort(activeSession, {
      probes: HANDOFF_VERIFY_PROBES,
      timeoutMs: HANDOFF_VERIFY_TIMEOUT_MS,
      minimumSuccesses: HANDOFF_VERIFY_MIN_SUCCESS
    });
    if (probeResult.ok && this.snapshot.lifecycle !== "failed") {
      this.clearPendingHandoff(nextSessionGeneration);
      this.logRuntimeEvent("info", "Make-before-break handoff verified.", {
        activeNodeId: activeSession.nodeId,
        runtimeKind: activeSession.runtimeKind,
        proxyPort: activeSession.proxyPort,
        lifecycle: this.snapshot.lifecycle,
        reason: null
      });
      return;
    }

    const details =
      probeResult.details ??
      `Новая сессия ${activeSession.nodeId} не прошла handoff verification. Возвращаем предыдущее соединение.`;
    await this.rollbackPendingHandoff(
      nextSessionGeneration,
      probeResult.failureReason ?? "runtime_port_unreachable",
      details
    );
  }

  private async flushRetiringSessions(): Promise<void> {
    this.clearPendingHandoff();
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

  private async handleUnexpectedSessionExit(
    processGeneration: number,
    reason: RuntimeFailureReason,
    lastError: string,
    startupPhase: boolean
  ): Promise<void> {
    const rolledBack = await this.rollbackPendingHandoff(processGeneration, reason, lastError);
    if (rolledBack) {
      return;
    }

    this.clearActiveSession(lastError);
    this.snapshot.diagnostic = {
      reason,
      details: lastError,
      updatedAt: new Date().toISOString(),
      fallbackAttempted: false,
      fallbackTarget: null
    };
    this.logRuntimeEvent("error", lastError, { reason, lifecycle: "failed" });

    if (!startupPhase) {
      this.emit("unexpected-exit", lastError);
    }
  }

  private async activatePreparedConnection(
    prepared: PreparedConnection,
    previousSession: RuntimeSession | null
  ): Promise<RuntimeStatus> {
    const { effectiveSettings, resolvedRuntime, session } = prepared;
    const preparedProbe = await this.probeRuntimePort(session, {
      probes: PREPARED_SESSION_PROBES,
      timeoutMs: PREPARED_SESSION_TIMEOUT_MS,
      minimumSuccesses: PREPARED_SESSION_MIN_SUCCESS
    });
    if (!preparedProbe.ok) {
      await this.terminateSession(session, {
        disableSystemProxy: false,
        clearKillSwitch: false
      });

      const preparedFailureReason = preparedProbe.failureReason ?? "runtime_port_unreachable";
      const preparedFailureDetails =
        preparedProbe.details ??
        `Runtime порт ${session.proxyPort} не готов для переключения. Сохраняем текущее соединение.`;
      if (previousSession) {
        const restored = await this.restorePreviousSession(
          previousSession,
          preparedFailureReason,
          preparedFailureDetails,
          prepared.fallbackTarget
        );
        if (restored) {
          return this.status();
        }
      }

      this.setFailure(preparedFailureReason, preparedFailureDetails, {
        fallbackAttempted: prepared.fallbackTarget !== null,
        fallbackTarget: prepared.fallbackTarget
      });
      return this.status();
    }

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

    this.applyActiveSession(session, prepared.fallbackTarget);
    this.lastSettings = effectiveSettings;

    if (previousSession) {
      this.beginPendingHandoff(session, previousSession, prepared.fallbackTarget);
    }

    if (degradedReason && degradedDetails) {
      this.snapshot.lifecycle = "degraded";
      this.snapshot.lastError = degradedDetails;
      this.snapshot.diagnostic = {
        reason: degradedReason,
        details: degradedDetails,
        updatedAt: new Date().toISOString(),
        fallbackAttempted: prepared.fallbackTarget !== null,
        fallbackTarget: prepared.fallbackTarget
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
    this.clearPendingHandoff();
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
    settings: AppSettings,
    fallbackTarget: RuntimeKind | null = null
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
        session,
        fallbackTarget
      };
    }

    let resolvedRuntime = await this.resolveRuntimePath(settings.runtimePath, preferredRuntime, true);

    if (!resolvedRuntime) {
      const installed = await (preferredRuntime === "xray"
        ? this.installer.installXray()
        : this.installer.installSingBox());
      if (!installed.ok) {
        this.setFailure("runtime_install_failed", `Runtime ${preferredRuntime} install failed: ${installed.message}`);
        return null;
      }
      resolvedRuntime = await this.resolveRuntimePath("", preferredRuntime, true);
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
        const reason = this.classifyFailureReason(
          `${error.message} ${details}`,
          "start",
          node,
          resolvedRuntime.runtimeKind
        );
        this.setFailure(
          reason,
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
        const reason = this.classifyFailureReason(
          details,
          startupPhase ? "warmup" : "active",
          node,
          resolvedRuntime.runtimeKind
        );
        const lastError = details
          ? `Runtime exited unexpectedly (code ${code ?? signal}): ${details}`
          : `Runtime exited unexpectedly (code ${code ?? signal})`;
        void this.handleUnexpectedSessionExit(processGeneration, reason, lastError, startupPhase);
      }
    });

    this.setLifecycle("warmup");
    const ready = await waitForPort(proxyPort, 3000);
    if (!ready && child.exitCode !== null) {
      const canFallbackToXray = resolvedRuntime.runtimeKind === "sing-box" && !SINGBOX_PROTOCOLS.has(node.protocol);
      const runtimeLog = this.formatRuntimeOutput(runtimeOutput);
      const classifiedReason = this.classifyFailureReason(runtimeLog, "warmup", node, resolvedRuntime.runtimeKind);
      await this.terminateSession(session, {
        disableSystemProxy: false,
        clearKillSwitch: false
      });

      if (canFallbackToXray) {
        const fallbackSettings = { ...settings, useTunMode: false };
        this.snapshot.diagnostic = {
          reason: classifiedReason,
          details: `Runtime ${resolvedRuntime.runtimeKind} failed during warmup, retrying with xray.`,
          updatedAt: new Date().toISOString(),
          fallbackAttempted: true,
          fallbackTarget: "xray"
        };
        this.snapshot.lifecycle = "reconnecting";
        this.logRuntimeEvent(
          "warn",
          `Runtime ${resolvedRuntime.runtimeKind} failed during warmup, retrying with xray.`,
          {
            reason: classifiedReason,
            lifecycle: "reconnecting",
            runtimeKind: resolvedRuntime.runtimeKind
          }
        );
        return this.prepareConnection(node, domainRules, [], fallbackSettings, "xray");
      }

      if (SINGBOX_PROTOCOLS.has(node.protocol)) {
        this.setFailure(
          classifiedReason,
          `Протокол ${node.protocol} требует sing-box, но runtime крашнулся при старте.${runtimeLog ? ` Лог: ${runtimeLog}` : ""}`
        );
      } else {
        this.setFailure(
          classifiedReason,
          runtimeLog
            ? `Runtime exited immediately after start. ${runtimeLog}`
            : "Runtime exited immediately after start."
        );
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
      session,
      fallbackTarget
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
    this.clearPendingHandoff();
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
    const preferredRuntime = this.nodeRuntimePreferences.get(node.id);
    if (preferredRuntime) {
      return preferredRuntime;
    }
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
