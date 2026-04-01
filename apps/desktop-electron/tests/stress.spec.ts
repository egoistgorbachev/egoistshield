import { describe, expect, it } from "vitest";
import type { AppSettings, DomainRule, ProcessRule, VpnNode } from "../electron/ipc/contracts";
import { VpnRuntimeManager } from "../electron/ipc/vpn-manager";

const node: VpnNode = {
  id: "node-1",
  name: "Test",
  protocol: "vless",
  server: "127.0.0.1",
  port: 443,
  uri: "vless://11111111-1111-1111-1111-111111111111@127.0.0.1:443#Test",
  metadata: {
    id: "11111111-1111-1111-1111-111111111111"
  }
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

const domainRules: DomainRule[] = [];
const processRules: ProcessRule[] = [];

describe("vpn stress", () => {
  it("выполняет 5 циклов connect/disconnect в mock-режиме без ошибок", async () => {
    process.env.EGOISTSHIELD_MOCK_RUNTIME = "1";
    const manager = new VpnRuntimeManager(process.cwd(), process.cwd());
    const result = await manager.stressTest(node, domainRules, processRules, settings, 5);
    expect(result.connectSuccess).toBe(5);
    expect(result.disconnectSuccess).toBe(5);
    expect(result.errors.length).toBe(0);
  }, 15_000);
});
