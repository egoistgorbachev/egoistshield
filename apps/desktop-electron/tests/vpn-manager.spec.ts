import { beforeEach, describe, expect, it } from "vitest";
import type { AppSettings, VpnNode } from "../electron/ipc/contracts";
import { VpnRuntimeManager } from "../electron/ipc/vpn-manager";

/** Typed accessor for private methods under test */
interface ManagerInternals {
  getPreferredRuntimeKind(node: VpnNode): string;
  detectRuntimeKindByFilename(p: string): string | null;
  formatRuntimeOutput(raw: string): string;
  retiringSessions: Map<number, unknown>;
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
  routeMode: "global"
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
