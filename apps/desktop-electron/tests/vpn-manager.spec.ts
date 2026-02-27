import { describe, expect, it, beforeEach } from "vitest";
import { VpnRuntimeManager } from "../electron/ipc/vpn-manager";
import type { AppSettings, DomainRule, ProcessRule, VpnNode } from "../electron/ipc/contracts";

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

const settings: AppSettings = {
    autoStart: false,
    startMinimized: false,
    autoUpdate: true,
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

    beforeEach(() => {
        process.env.EGOISTSHIELD_MOCK_RUNTIME = "1";
        manager = new VpnRuntimeManager(process.cwd(), process.cwd());
    });

    // ── status() ──

    it("status() по умолчанию disconnected", async () => {
        const status = await manager.status();
        expect(status.connected).toBe(false);
        expect(status.proxyPort).toBeNull();
    });

    // ── getPreferredRuntimeKind() ──

    it("VLESS → xray", () => {
        expect((manager as any).getPreferredRuntimeKind(node)).toBe("xray");
    });

    it("hysteria2 → sing-box", () => {
        expect((manager as any).getPreferredRuntimeKind(hy2Node)).toBe("sing-box");
    });

    it("wireguard → sing-box", () => {
        expect((manager as any).getPreferredRuntimeKind(wgNode)).toBe("sing-box");
    });

    // ── detectRuntimeKindByFilename() ──

    it("xray.exe → xray", () => {
        expect((manager as any).detectRuntimeKindByFilename("C:\\runtime\\xray.exe")).toBe("xray");
    });

    it("sing-box.exe → sing-box", () => {
        expect((manager as any).detectRuntimeKindByFilename("/usr/bin/sing-box")).toBe("sing-box");
    });

    it("unknown.exe → null", () => {
        expect((manager as any).detectRuntimeKindByFilename("unknown.exe")).toBeNull();
    });

    // ── formatRuntimeOutput() ──

    it("formatRuntimeOutput возвращает строку", () => {
        const longLine = "A".repeat(500);
        const result = (manager as any).formatRuntimeOutput(longLine);
        expect(typeof result).toBe("string");
        expect(result.length).toBeGreaterThan(0);
    });

    // ── mockConnect/disconnect ──

    it("mock connect → status connected", async () => {
        const status = await manager.connect(node, [], [], settings);
        expect(status.connected).toBe(true);
        expect(status.proxyPort).toBeNull(); // mock mode
        expect(status.runtimeKind).toBe("xray");
    });

    it("mock connect HY2 → sing-box", async () => {
        const status = await manager.connect(hy2Node, [], [], settings);
        expect(status.connected).toBe(true);
        expect(status.runtimeKind).toBe("sing-box");
    });

    it("disconnect после connect → disconnected", async () => {
        await manager.connect(node, [], [], settings);
        const status = await manager.disconnect();
        expect(status.connected).toBe(false);
        expect(status.proxyPort).toBeNull();
    });

    it("disconnect без connect → безопасно", async () => {
        const status = await manager.disconnect();
        expect(status.connected).toBe(false);
    });

    // ── diagnose() ──

    it("diagnose без подключения → not ok", async () => {
        const result = await manager.diagnose();
        expect(result).toBeDefined();
        expect(result.ok).toBe(false);
        expect(result.runtimeReachable).toBe(false);
    });

    // ── stressTest() ──

    it("stressTest 3 цикла без ошибок", async () => {
        const result = await manager.stressTest(node, [], [], settings, 3);
        expect(result.connectSuccess).toBe(3);
        expect(result.disconnectSuccess).toBe(3);
        expect(result.errors).toHaveLength(0);
    });
});
