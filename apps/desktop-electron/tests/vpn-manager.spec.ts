import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, VpnNode } from "../electron/ipc/contracts";
import { VpnRuntimeManager } from "../electron/ipc/vpn-manager";

/** Typed accessor for private methods under test */
interface ManagerInternals {
  getPreferredRuntimeKind(node: VpnNode): string;
  classifyFailureReason(
    rawOutput: string,
    stage: "start" | "warmup" | "active",
    node: VpnNode,
    runtimeKind: "xray" | "sing-box"
  ): string;
  detectRuntimeKindByFilename(p: string): string | null;
  formatRuntimeOutput(raw: string): string;
  probeRuntimePort(
    session: { proxyPort: number; activeRuntimePath: string; nodeId?: string },
    options: { probes: number; timeoutMs: number; minimumSuccesses: number }
  ): Promise<{
    ok: boolean;
    successfulProbes: number;
    latencyMs: number;
    jitterMs: number;
    lossPercent: number;
    failureReason: string | null;
    details: string | null;
  }>;
  rollbackPendingHandoff(failedGeneration: number, reason: string, details: string): Promise<boolean>;
  getActiveSession(): { processGeneration: number; nodeId: string } | null;
  retiringSessions: Map<number, unknown>;
  nodeRuntimePreferences: Map<string, "xray" | "sing-box">;
  pendingHandoff: { nextSessionGeneration: number; previousSession: { nodeId: string } } | null;
}

const node: VpnNode = {
  id: "test-node",
  name: "Test VLESS",
  protocol: "vless",
  server: "127.0.0.1",
  port: 443,
  uri: "vless://uuid@127.0.0.1:443#Test",
  metadata: { id: "11111111-1111-1111-1111-111111111111" }
};

const hy2Node: VpnNode = {
  id: "test-hy2",
  name: "Test HY2",
  protocol: "hysteria2",
  server: "2.2.2.2",
  port: 443,
  uri: "",
  metadata: { password: "secret" }
};

const wgNode: VpnNode = {
  id: "test-wg",
  name: "Test WG",
  protocol: "wireguard",
  server: "3.3.3.3",
  port: 51820,
  uri: "",
  metadata: { privateKey: "key", publicKey: "pub" }
};

const secondNode: VpnNode = {
  id: "test-node-2",
  name: "Test VLESS DE",
  protocol: "vless",
  server: "127.0.0.2",
  port: 443,
  uri: "vless://uuid@127.0.0.2:443#Test2",
  metadata: { id: "22222222-2222-2222-2222-222222222222" }
};

const settings: AppSettings = {
  autoStart: false,
  startMinimized: false,
  autoUpdate: true,
  autoConnect: false,
  notifications: true,
  useTunMode: false,
  killSwitch: false,
  allowTelemetry: false,
  dnsMode: "auto",
  subscriptionUserAgent: "auto",
  runtimePath: "",
  routeMode: "global",
  zapretProfile: "General",
  zapretSuspendDuringVpn: true
};

describe("VpnRuntimeManager", () => {
  let manager: VpnRuntimeManager;
  let internal: ManagerInternals;

  beforeEach(() => {
    process.env.EGOISTSHIELD_MOCK_RUNTIME = "1";
    manager = new VpnRuntimeManager(process.cwd(), process.cwd());
    internal = manager as unknown as ManagerInternals;
  });

  // ── status() ──

  it("status() по умолчанию disconnected", async () => {
    const status = await manager.status();
    expect(status.connected).toBe(false);
    expect(status.proxyPort).toBeNull();
    expect(status.lifecycle).toBe("idle");
    expect(status.diagnostic.reason).toBeNull();
  });

  // ── getPreferredRuntimeKind() ──

  it("VLESS → xray", () => {
    expect(internal.getPreferredRuntimeKind(node)).toBe("xray");
  });

  it("hysteria2 → sing-box", () => {
    expect(internal.getPreferredRuntimeKind(hy2Node)).toBe("sing-box");
  });

  it("wireguard → sing-box", () => {
    expect(internal.getPreferredRuntimeKind(wgNode)).toBe("sing-box");
  });

  it("runtime preference memory влияет на xray-compatible узлы", () => {
    internal.nodeRuntimePreferences.set(node.id, "sing-box");
    expect(internal.getPreferredRuntimeKind(node)).toBe("sing-box");
  });

  it("runtime preference memory не ломает sing-box-only протоколы", () => {
    internal.nodeRuntimePreferences.set(hy2Node.id, "xray");
    expect(internal.getPreferredRuntimeKind(hy2Node)).toBe("sing-box");
  });

  // ── detectRuntimeKindByFilename() ──

  it("xray.exe → xray", () => {
    expect(internal.detectRuntimeKindByFilename("C:\\runtime\\xray.exe")).toBe("xray");
  });

  it("sing-box.exe → sing-box", () => {
    expect(internal.detectRuntimeKindByFilename("/usr/bin/sing-box")).toBe("sing-box");
  });

  it("unknown.exe → null", () => {
    expect(internal.detectRuntimeKindByFilename("unknown.exe")).toBeNull();
  });

  // ── formatRuntimeOutput() ──

  it("formatRuntimeOutput возвращает строку", () => {
    const longLine = "A".repeat(500);
    const result = internal.formatRuntimeOutput(longLine);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("classifyFailureReason распознаёт типовые причины warmup/start сбоев", () => {
    expect(internal.classifyFailureReason("failed to lookup host: no such host", "warmup", node, "xray")).toBe(
      "dns_failed"
    );
    expect(internal.classifyFailureReason("remote error: tls: handshake failure", "start", node, "xray")).toBe(
      "tls_handshake_failed"
    );
    expect(internal.classifyFailureReason("udp: no recent network activity", "warmup", hy2Node, "sing-box")).toBe(
      "quic_blocked"
    );
  });

  it("classifyFailureReason различает auth, route failure и runtime crash по стадии", () => {
    expect(internal.classifyFailureReason("authentication failed: invalid user", "warmup", node, "xray")).toBe(
      "auth_rejected"
    );
    expect(internal.classifyFailureReason("connectex: connection refused", "start", node, "xray")).toBe(
      "server_unreachable"
    );
    expect(internal.classifyFailureReason("connection reset by peer", "active", node, "xray")).toBe("runtime_crashed");
  });

  // ── mockConnect/disconnect ──

  it("mock connect → status connected", async () => {
    const status = await manager.connect(node, [], [], settings);
    expect(status.connected).toBe(true);
    expect(status.isMock).toBe(true);
    expect(status.proxyPort).toBe(10809);
    expect(status.resolvedRuntimePath).toBe("mock");
    expect(status.runtimeKind).toBe("xray");
    expect(status.processRulesApplied).toBe(false);
    expect(status.lifecycle).toBe("active");
    expect(status.diagnostic.reason).toBeNull();

    const currentStatus = await manager.status();
    expect(currentStatus.connected).toBe(true);
    expect(currentStatus.isMock).toBe(true);
    expect(currentStatus.resolvedRuntimePath).toBe("mock");
    expect(currentStatus.runtimeKind).toBe("xray");
    expect(currentStatus.lifecycle).toBe("active");
  });

  it("mock connect HY2 → sing-box", async () => {
    const status = await manager.connect(hy2Node, [], [], settings);
    expect(status.connected).toBe(true);
    expect(status.isMock).toBe(true);
    expect(status.resolvedRuntimePath).toBe("mock");
    expect(status.runtimeKind).toBe("sing-box");
  });

  it("повторный connect переключает activeNodeId на новый узел", async () => {
    // Arrange
    await manager.connect(node, [], [], settings);

    // Act
    const status = await manager.connect(secondNode, [], [], settings);

    // Assert
    expect(status.connected).toBe(true);
    expect(status.activeNodeId).toBe(secondNode.id);
    expect(status.runtimeKind).toBe("xray");
    expect(internal.retiringSessions.size).toBe(1);
    expect(internal.pendingHandoff?.previousSession.nodeId).toBe(node.id);

    await manager.disconnect();
  });

  it("make-before-break подтверждает handoff перед retire старой сессии", async () => {
    vi.useFakeTimers();
    try {
      await manager.connect(node, [], [], settings);
      await manager.connect(secondNode, [], [], settings);

      expect(internal.pendingHandoff?.previousSession.nodeId).toBe(node.id);
      expect(internal.retiringSessions.size).toBe(1);

      await vi.advanceTimersByTimeAsync(2_600);
      expect(internal.pendingHandoff).toBeNull();
      expect(internal.retiringSessions.size).toBe(1);

      await vi.advanceTimersByTimeAsync(6_000);
      expect(internal.retiringSessions.size).toBe(0);
    } finally {
      vi.useRealTimers();
      await manager.disconnect();
    }
  });

  it("если подготовленная новая сессия не проходит verification, текущее соединение сохраняется", async () => {
    const originalProbeRuntimePort = internal.probeRuntimePort.bind(internal);
    const probeSpy = vi.spyOn(internal, "probeRuntimePort").mockImplementation(async (session, options) => {
      if (session.nodeId === secondNode.id) {
        return {
          ok: false,
          successfulProbes: 1,
          latencyMs: 0,
          jitterMs: 0,
          lossPercent: 67,
          failureReason: "runtime_port_unreachable",
          details: "Prepared session did not pass stability verification."
        };
      }

      return originalProbeRuntimePort(session, options);
    });

    try {
      await manager.connect(node, [], [], settings);
      const status = await manager.connect(secondNode, [], [], settings);

      expect(status.connected).toBe(true);
      expect(status.activeNodeId).toBe(node.id);
      expect(status.lifecycle).toBe("degraded");
      expect(status.diagnostic.reason).toBe("runtime_port_unreachable");
      expect(status.lastError).toContain("Prepared session did not pass stability verification.");
    } finally {
      probeSpy.mockRestore();
      await manager.disconnect();
    }
  });

  it("если новый runtime срывается в handoff window, менеджер откатывается на предыдущую сессию", async () => {
    await manager.connect(node, [], [], settings);
    await manager.connect(secondNode, [], [], settings);

    const activeSession = internal.getActiveSession();
    expect(activeSession?.nodeId).toBe(secondNode.id);

    const rolledBack = await internal.rollbackPendingHandoff(
      activeSession?.processGeneration ?? -1,
      "runtime_crashed",
      "New runtime failed during handoff."
    );
    const status = await manager.status();

    expect(rolledBack).toBe(true);
    expect(status.connected).toBe(true);
    expect(status.activeNodeId).toBe(node.id);
    expect(status.lifecycle).toBe("degraded");
    expect(status.diagnostic.reason).toBe("runtime_crashed");
    expect(status.lastError).toContain("New runtime failed during handoff.");

    await manager.disconnect();
  });

  it("disconnect после connect → disconnected", async () => {
    await manager.connect(node, [], [], settings);
    const status = await manager.disconnect();
    expect(status.connected).toBe(false);
    expect(status.isMock).toBe(true);
    expect(status.resolvedRuntimePath).toBeNull();
    expect(status.runtimeKind).toBeNull();
    expect(status.proxyPort).toBeNull();
    expect(status.lifecycle).toBe("idle");
    expect(status.diagnostic.reason).toBeNull();
  });

  it("disconnect без connect → безопасно", async () => {
    const status = await manager.disconnect();
    expect(status.connected).toBe(false);
    expect(status.isMock).toBe(true);
  });

  // ── diagnose() ──

  it("diagnose без подключения → not ok", async () => {
    const result = await manager.diagnose();
    expect(result).toBeDefined();
    expect(result.ok).toBe(false);
    expect(result.runtimeReachable).toBe(false);
    expect(result.lifecycle).toBe("idle");
    expect(result.failureReason).toBeNull();
  });

  // ── stressTest() ──

  it("stressTest 3 цикла без ошибок", async () => {
    const result = await manager.stressTest(node, [], [], settings, 3);
    expect(result.connectSuccess).toBe(3);
    expect(result.disconnectSuccess).toBe(3);
    expect(result.errors).toHaveLength(0);
  });
});
