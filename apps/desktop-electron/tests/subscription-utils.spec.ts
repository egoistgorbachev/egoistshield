import { describe, expect, it } from "vitest";
import {
    getRequestProfiles,
    getAcceptHeader,
    getUserAgentString,
    getSubscriptionUserAgent,
    parseSubscriptionUserInfo,
    extractSubscriptionName,
    buildNodeFingerprint,
    uniqueNodes,
} from "../electron/ipc/subscription-utils";
import type { AppSettings, VpnNode } from "../electron/ipc/contracts";

// ── getRequestProfiles ──

describe("getRequestProfiles", () => {
    it("auto → возвращает все профили", () => {
        const profiles = getRequestProfiles("auto");
        expect(profiles.length).toBe(3);
        expect(profiles[0]).toBe("clash-for-windows");
    });

    it("конкретный профиль → массив с одним элементом", () => {
        expect(getRequestProfiles("v2rayn")).toEqual(["v2rayn"]);
        expect(getRequestProfiles("singbox")).toEqual(["singbox"]);
    });
});

// ── getAcceptHeader ──

describe("getAcceptHeader", () => {
    it("clash-like → yaml accept", () => {
        expect(getAcceptHeader("mihomo")).toContain("text/yaml");
        expect(getAcceptHeader("clash-verge")).toContain("text/yaml");
        expect(getAcceptHeader("surge")).toContain("text/yaml");
    });

    it("обычный профиль → text/plain", () => {
        expect(getAcceptHeader("v2rayn")).toBe("text/plain,*/*;q=0.8");
        expect(getAcceptHeader("singbox")).toBe("text/plain,*/*;q=0.8");
    });
});

// ── getUserAgentString ──

describe("getUserAgentString", () => {
    it("возвращает строку для каждого профиля", () => {
        expect(getUserAgentString("egoistshield")).toContain("EgoistShield");
        expect(getUserAgentString("v2rayn")).toContain("v2rayN");
        expect(getUserAgentString("curl")).toContain("curl");
    });
});

// ── getSubscriptionUserAgent ──

describe("getSubscriptionUserAgent", () => {
    it("есть subscriptionUserAgent → возвращает его", () => {
        const settings = { subscriptionUserAgent: "singbox" } as AppSettings;
        expect(getSubscriptionUserAgent(settings)).toBe("singbox");
    });

    it("нет subscriptionUserAgent → auto", () => {
        const settings = {} as AppSettings;
        expect(getSubscriptionUserAgent(settings)).toBe("auto");
    });
});

// ── parseSubscriptionUserInfo ──

describe("parseSubscriptionUserInfo", () => {
    it("парсит стандартный заголовок", () => {
        const result = parseSubscriptionUserInfo("upload=1024; download=2048; total=10240; expire=1700000000");
        expect(result).toEqual({
            upload: 1024,
            download: 2048,
            total: 10240,
            expire: 1700000000,
        });
    });

    it("null → null", () => {
        expect(parseSubscriptionUserInfo(null)).toBeNull();
    });

    it("пустая строка → null", () => {
        expect(parseSubscriptionUserInfo("")).toBeNull();
    });

    it("невалидные значения → пропуск", () => {
        const result = parseSubscriptionUserInfo("upload=abc; download=2048");
        expect(result).toEqual({ download: 2048 });
    });
});

// ── extractSubscriptionName ──

describe("extractSubscriptionName", () => {
    it("profile-title → название подписки", () => {
        const response = new Response("", {
            headers: { "profile-title": "MyProvider VPN" },
        });
        expect(extractSubscriptionName(response)).toBe("MyProvider VPN");
    });

    it("content-disposition filename → имя без расширения", () => {
        const response = new Response("", {
            headers: { "content-disposition": 'attachment; filename="ProviderX.txt"' },
        });
        expect(extractSubscriptionName(response)).toBe("ProviderX");
    });

    it("content-disposition filename* UTF-8 → декодированное имя", () => {
        const response = new Response("", {
            headers: { "content-disposition": "attachment; filename*=UTF-8''My%20Provider.yaml" },
        });
        expect(extractSubscriptionName(response)).toBe("My Provider");
    });

    it("subscription-name → название", () => {
        const response = new Response("", {
            headers: { "subscription-name": "Premium Plan" },
        });
        expect(extractSubscriptionName(response)).toBe("Premium Plan");
    });

    it("нет заголовков → null", () => {
        const response = new Response("");
        expect(extractSubscriptionName(response)).toBeNull();
    });
});

// ── buildNodeFingerprint ──

describe("buildNodeFingerprint", () => {
    it("уникальный fingerprint для узла", () => {
        const node: VpnNode = {
            id: "test-1",
            name: "Test",
            protocol: "vless",
            server: "1.2.3.4",
            port: 443,
            uri: "vless://uuid@1.2.3.4:443",
            metadata: { id: "uuid-123" },
        };
        expect(buildNodeFingerprint(node)).toBe("vless|1.2.3.4|443|uuid-123");
    });

    it("fallback на password если нет id", () => {
        const node: VpnNode = {
            id: "test-2",
            name: "Test",
            protocol: "trojan",
            server: "5.6.7.8",
            port: 443,
            uri: "trojan://pass@5.6.7.8:443",
            metadata: { password: "secret" },
        };
        expect(buildNodeFingerprint(node)).toBe("trojan|5.6.7.8|443|secret");
    });
});

// ── uniqueNodes ──

describe("uniqueNodes", () => {
    const makeNode = (id: string, server: string): VpnNode => ({
        id,
        name: id,
        protocol: "vless",
        server,
        port: 443,
        uri: `vless://uuid@${server}:443`,
        metadata: { id: "uuid" },
    });

    it("фильтрует дубликаты", () => {
        const existing = [makeNode("1", "1.1.1.1")];
        const incoming = [makeNode("2", "1.1.1.1"), makeNode("3", "2.2.2.2")];
        const result = uniqueNodes(existing, incoming);
        expect(result).toHaveLength(1);
        expect(result[0].server).toBe("2.2.2.2");
    });

    it("пустой existing → все incoming", () => {
        const incoming = [makeNode("1", "1.1.1.1"), makeNode("2", "2.2.2.2")];
        expect(uniqueNodes([], incoming)).toHaveLength(2);
    });

    it("пустой incoming → пустой результат", () => {
        const existing = [makeNode("1", "1.1.1.1")];
        expect(uniqueNodes(existing, [])).toHaveLength(0);
    });

    it("дедуплицирует внутри incoming", () => {
        const incoming = [makeNode("1", "3.3.3.3"), makeNode("2", "3.3.3.3")];
        expect(uniqueNodes([], incoming)).toHaveLength(1);
    });
});
