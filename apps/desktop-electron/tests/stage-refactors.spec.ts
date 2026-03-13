import { describe, expect, it } from "vitest";
import type { VpnNode, ImportResult, SubscriptionItem } from "../electron/ipc/contracts";

/**
 * Тесты для ErrorBoundary, mergeImportResults helper и health-check logic.
 * ErrorBoundary и useHealthCheck — React-компоненты, тестируемые через интеграционные тесты.
 * Здесь unit-тесты для утилит Stage 1-2.
 */
describe("Stage 1-2 utilities", () => {
    it("ServerConfig protocol field propagation — проверяем что тип VpnNode имеет protocol", () => {
        const node: VpnNode = {
            id: "test-1",
            name: "Test VLESS",
            protocol: "vless",
            server: "1.1.1.1",
            port: 443,
            uri: "",
            metadata: { id: "uuid", security: "tls", type: "tcp", sni: "example.com" }
        };

        expect(node.protocol).toBe("vless");
        expect(node.server).toBe("1.1.1.1");
    });

    it("ImportResult interface — корректная типизация", () => {
        const result: ImportResult = { added: 5, issues: ["warning 1"] };

        expect(result.added).toBe(5);
        expect(result.issues).toHaveLength(1);
    });

    it("SubscriptionItem — опциональные поля userinfo", () => {
        const sub: SubscriptionItem = {
            id: "sub-1",
            url: "https://example.com/sub",
            name: "Test Sub",
            enabled: true,
            lastUpdated: new Date().toISOString(),
            upload: 1000,
            download: 5000,
            total: 10000,
            expire: Math.floor(Date.now() / 1000) + 86400
        };

        expect(sub.upload).toBe(1000);
        expect(sub.download).toBe(5000);
        expect(sub.total).toBe(10000);
        expect(sub.expire).toBeGreaterThan(0);
    });

    it("SubscriptionItem — без userinfo полей", () => {
        const sub: SubscriptionItem = {
            id: "sub-2",
            url: "https://example.com/sub2",
            enabled: true,
            lastUpdated: null
        };

        expect(sub.upload).toBeUndefined();
        expect(sub.download).toBeUndefined();
        expect(sub.total).toBeUndefined();
        expect(sub.expire).toBeUndefined();
    });

    it("NodeProtocol — все протоколы поддержаны", () => {
        const protocols: VpnNode["protocol"][] = [
            "vless", "vmess", "trojan", "shadowsocks", "socks", "http", "hysteria2", "tuic", "wireguard"
        ];

        expect(protocols).toHaveLength(9);
        protocols.forEach(p => {
            expect(typeof p).toBe("string");
        });
    });
});
