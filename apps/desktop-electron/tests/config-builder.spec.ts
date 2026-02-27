import { describe, expect, it } from "vitest";
import { ConfigBuilder } from "../electron/ipc/config-builder";
import type { AppSettings, DomainRule, ProcessRule, VpnNode } from "../electron/ipc/contracts";

const baseSettings: AppSettings = {
  autoStart: false,
  startMinimized: false,
  autoUpdate: true,
  useTunMode: false,
  killSwitch: false,
  allowTelemetry: false,
  dnsMode: "auto",
  subscriptionUserAgent: "auto",
  runtimePath: "",
  routeMode: "selected"
};

const vlessNode: VpnNode = {
  id: "node-vless",
  name: "VLESS",
  protocol: "vless",
  server: "1.1.1.1",
  port: 443,
  uri: "",
  metadata: {
    id: "11111111-1111-1111-1111-111111111111",
    security: "tls",
    type: "tcp",
    sni: "example.com"
  }
};

const hy2Node: VpnNode = {
  id: "node-hy2",
  name: "HY2",
  protocol: "hysteria2",
  server: "2.2.2.2",
  port: 443,
  uri: "",
  metadata: {
    password: "secret",
    sni: "example.com"
  }
};

describe("config-builder", () => {
  it("ставит корректный default route для Xray в selected/global", () => {
    const selectedConfig = JSON.parse(
      ConfigBuilder.buildXray(vlessNode, [], { ...baseSettings, routeMode: "selected" }, 10809, 10808)
    ) as { routing: { rules: Array<{ outboundTag?: string }> } };

    const globalConfig = JSON.parse(
      ConfigBuilder.buildXray(vlessNode, [], { ...baseSettings, routeMode: "global" }, 10809, 10808)
    ) as { routing: { rules: Array<{ outboundTag?: string }> } };

    expect(selectedConfig.routing.rules.at(-1)?.outboundTag).toBe("direct");
    expect(globalConfig.routing.rules.at(-1)?.outboundTag).toBe("proxy");
  });

  it("включает process rules в sing-box при TUN", () => {
    const processRules: ProcessRule[] = [{ id: "p1", process: "chrome.exe", mode: "vpn" }];
    const domainRules: DomainRule[] = [{ id: "d1", domain: "chatgpt.com", mode: "direct" }];

    const config = JSON.parse(
      ConfigBuilder.buildSingBox(
        hy2Node,
        domainRules,
        processRules,
        { ...baseSettings, useTunMode: true, routeMode: "selected" },
        10809
      )
    ) as any;

    const processRule = config.route.rules.find((r: any) => Array.isArray(r.process_name));
    const domainRule = config.route.rules.find((r: any) => Array.isArray(r.domain_suffix));

    expect(processRule?.process_name).toEqual(["chrome.exe"]);
    expect(processRule?.outbound).toBe("proxy");
    expect(domainRule?.domain_suffix).toEqual(["chatgpt.com"]);
    // route.final определяет default outbound
    expect(config.route.final).toBe("direct");
  });

  it("использует DNS через прокси в sing-box при dnsMode=auto (v1.12 формат)", () => {
    const config = JSON.parse(
      ConfigBuilder.buildSingBox(
        hy2Node, [], [], { ...baseSettings, dnsMode: "auto" }, 10809
      )
    ) as any;

    // v1.12: DNS серверы используют type + server вместо address
    const proxyDns = config.dns.servers.find((s: any) => s.tag === "proxy-dns");
    expect(proxyDns?.type).toBe("https");
    expect(proxyDns?.server).toBe("1.1.1.1");
    expect(proxyDns?.detour).toBe("proxy");
    expect(config.dns.final).toBe("proxy-dns");
  });

  it("использует route.final для sing-box global/selected", () => {
    const globalConfig = JSON.parse(
      ConfigBuilder.buildSingBox(
        hy2Node, [], [], { ...baseSettings, routeMode: "global" }, 10809
      )
    ) as { route: { final?: string } };

    const selectedConfig = JSON.parse(
      ConfigBuilder.buildSingBox(
        hy2Node, [], [], { ...baseSettings, routeMode: "selected" }, 10809
      )
    ) as { route: { final?: string } };

    expect(globalConfig.route.final).toBe("proxy");
    expect(selectedConfig.route.final).toBe("direct");
  });

  it("sing-box v1.12: sniff и hijack-dns через rule actions", () => {
    const config = JSON.parse(
      ConfigBuilder.buildSingBox(
        vlessNode, [], [], { ...baseSettings, routeMode: "global" }, 10809
      )
    ) as any;

    // Нет sniff в inbound
    const mixed = config.inbounds.find((i: any) => i.type === "mixed");
    expect(mixed?.sniff).toBeUndefined();

    // sniff и hijack-dns как rule actions
    const sniffRule = config.route.rules.find((r: any) => r.action === "sniff");
    const hijackRule = config.route.rules.find((r: any) => r.action === "hijack-dns");
    expect(sniffRule).toBeDefined();
    expect(hijackRule?.protocol).toBe("dns");

    // Нет block и dns outbound
    expect(config.outbounds.find((o: any) => o.type === "block")).toBeUndefined();
    expect(config.outbounds.find((o: any) => o.type === "dns")).toBeUndefined();
  });

  it("sing-box v1.12: block rules используют action: reject", () => {
    const domainRules: DomainRule[] = [
      { id: "d1", domain: "ads.com", mode: "block" },
      { id: "d2", domain: "vpn.com", mode: "vpn" }
    ];

    const config = JSON.parse(
      ConfigBuilder.buildSingBox(
        hy2Node, domainRules, [], { ...baseSettings, routeMode: "global" }, 10809
      )
    ) as any;

    const blockRule = config.route.rules.find((r: any) => r.domain_suffix?.[0] === "ads.com");
    const vpnRule = config.route.rules.find((r: any) => r.domain_suffix?.[0] === "vpn.com");
    expect(blockRule?.action).toBe("reject");
    expect(blockRule?.outbound).toBeUndefined();
    expect(vpnRule?.outbound).toBe("proxy");
  });

  it("sing-box TUN использует address[] вместо inet4_address (v1.10+)", () => {
    const config = JSON.parse(
      ConfigBuilder.buildSingBox(
        hy2Node, [], [], { ...baseSettings, useTunMode: true, routeMode: "global" }, 10809
      )
    ) as any;

    const tun = config.inbounds.find((i: any) => i.type === "tun");
    expect(tun?.address).toEqual(["172.19.0.1/30"]);
    expect(tun?.inet4_address).toBeUndefined();
  });

  it("добавляет alpn и utls fingerprint в TLS конфиг sing-box", () => {
    const config = JSON.parse(
      ConfigBuilder.buildSingBox(
        vlessNode, [], [], { ...baseSettings, routeMode: "global" }, 10809
      )
    ) as { outbounds: Array<{ tag?: string; tls?: { alpn?: string[]; utls?: { fingerprint?: string } } }> };

    const proxy = config.outbounds.find((o) => o.tag === "proxy");
    expect(proxy?.tls?.alpn).toEqual(["h2", "http/1.1"]);
    expect(proxy?.tls?.utls?.fingerprint).toBeTruthy();
  });

  // ═══ Edge cases ═══

  it("Trojan Xray: корректный outbound с паролем", () => {
    const trojanNode: VpnNode = {
      id: "node-trojan", name: "Trojan", protocol: "trojan",
      server: "3.3.3.3", port: 443, uri: "",
      metadata: { password: "trojan-pass", sni: "trojan.example.com" }
    };
    const config = JSON.parse(
      ConfigBuilder.buildXray(trojanNode, [], baseSettings, 10809, 10808)
    ) as any;

    const outbound = config.outbounds.find((o: any) => o.protocol === "trojan");
    expect(outbound?.settings?.servers?.[0]?.password).toBe("trojan-pass");
    expect(outbound?.streamSettings?.security).toBe("tls");
    expect(outbound?.streamSettings?.tlsSettings?.serverName).toBe("trojan.example.com");
  });

  it("VMess Xray: корректный outbound с alterId и security", () => {
    const vmessNode: VpnNode = {
      id: "node-vmess", name: "VMess", protocol: "vmess",
      server: "4.4.4.4", port: 443, uri: "",
      metadata: { id: "uuid-vmess", aid: "2", scy: "chacha20-poly1305", net: "ws", tls: "tls", sni: "vmess.com", path: "/ws" }
    };
    const config = JSON.parse(
      ConfigBuilder.buildXray(vmessNode, [], baseSettings, 10809, 10808)
    ) as any;

    const outbound = config.outbounds.find((o: any) => o.protocol === "vmess");
    expect(outbound?.settings?.vnext?.[0]?.users?.[0]?.alterId).toBe(2);
    expect(outbound?.settings?.vnext?.[0]?.users?.[0]?.security).toBe("chacha20-poly1305");
    expect(outbound?.streamSettings?.network).toBe("ws");
    expect(outbound?.streamSettings?.wsSettings?.path).toBe("/ws");
  });

  it("Shadowsocks Xray: method и password", () => {
    const ssNode: VpnNode = {
      id: "node-ss", name: "SS", protocol: "shadowsocks",
      server: "5.5.5.5", port: 8388, uri: "",
      metadata: { method: "chacha20-ietf-poly1305", password: "ss-secret" }
    };
    const config = JSON.parse(
      ConfigBuilder.buildXray(ssNode, [], baseSettings, 10809, 10808)
    ) as any;

    const outbound = config.outbounds.find((o: any) => o.protocol === "shadowsocks");
    expect(outbound?.settings?.servers?.[0]?.method).toBe("chacha20-ietf-poly1305");
    expect(outbound?.settings?.servers?.[0]?.password).toBe("ss-secret");
  });

  it("пустой metadata → fallback значения", () => {
    const emptyNode: VpnNode = {
      id: "node-empty", name: "Empty", protocol: "vless",
      server: "6.6.6.6", port: 443, uri: "",
      metadata: {}
    };
    const config = JSON.parse(
      ConfigBuilder.buildXray(emptyNode, [], baseSettings, 10809, 10808)
    ) as any;

    const outbound = config.outbounds.find((o: any) => o.protocol === "vless");
    expect(outbound?.settings?.vnext?.[0]?.users?.[0]?.id).toBe("");
    expect(outbound?.streamSettings?.network).toBe("tcp");
    expect(outbound?.streamSettings?.security).toBe("none");
  });

  it("DNS secure mode → серверы 8.8.8.8 и 1.1.1.1", () => {
    const config = JSON.parse(
      ConfigBuilder.buildXray(vlessNode, [], { ...baseSettings, dnsMode: "secure" }, 10809, 10808)
    ) as any;

    expect(config.dns?.servers).toContain("8.8.8.8");
    expect(config.dns?.servers).toContain("1.1.1.1");
  });

  it("DNS system mode → dns не определён (системный)", () => {
    const config = JSON.parse(
      ConfigBuilder.buildXray(vlessNode, [], { ...baseSettings, dnsMode: "system" }, 10809, 10808)
    ) as any;

    // system mode → dns undefined, используется системный DNS
    expect(config.dns).toBeUndefined();
  });

  it("sing-box TUN без process rules → нет process_name в правилах", () => {
    const config = JSON.parse(
      ConfigBuilder.buildSingBox(
        hy2Node, [], [], { ...baseSettings, useTunMode: true }, 10809
      )
    ) as any;

    const processRule = config.route.rules.find((r: any) => Array.isArray(r.process_name));
    expect(processRule).toBeUndefined();
  });

  it("Shadowsocks sing-box: outbound корректен", () => {
    const ssNode: VpnNode = {
      id: "node-ss-sb", name: "SS-SB", protocol: "shadowsocks",
      server: "7.7.7.7", port: 8388, uri: "",
      metadata: { method: "aes-256-gcm", password: "ss-pass" }
    };
    const config = JSON.parse(
      ConfigBuilder.buildSingBox(ssNode, [], [], baseSettings, 10809)
    ) as any;

    const proxy = config.outbounds.find((o: any) => o.tag === "proxy");
    expect(proxy?.type).toBe("shadowsocks");
    expect(proxy?.method).toBe("aes-256-gcm");
    expect(proxy?.password).toBe("ss-pass");
  });
});
