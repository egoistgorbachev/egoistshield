import { describe, expect, it } from "vitest";
import { ConfigBuilder } from "../electron/ipc/config-builder";
import type {
	AppSettings,
	DomainRule,
	ProcessRule,
	VpnNode,
} from "../electron/ipc/contracts";

type XrayRoutingRule = {
	outboundTag?: string;
};

type XrayOutboundUser = {
	id?: string;
	alterId?: number;
	security?: string;
};

type XrayOutboundServer = {
	password?: string;
	method?: string;
};

type XrayOutbound = {
	protocol?: string;
	settings?: {
		servers?: XrayOutboundServer[];
		vnext?: Array<{
			users?: XrayOutboundUser[];
		}>;
	};
	streamSettings?: {
		security?: string;
		network?: string;
		tlsSettings?: {
			serverName?: string;
			alpn?: string[];
		};
		wsSettings?: {
			path?: string;
		};
	};
};

type XrayConfig = {
	routing: {
		rules: XrayRoutingRule[];
	};
	outbounds: XrayOutbound[];
	dns?: {
		servers?: string[];
	};
};

type SingBoxRouteRule = {
	process_name?: string[];
	domain_suffix?: string[];
	outbound?: string;
	action?: string;
	protocol?: string;
};

type SingBoxDnsServer = {
	tag?: string;
	type?: string;
	server?: string;
	server_port?: number;
	path?: string;
	detour?: string;
	domain_resolver?: {
		server?: string;
		strategy?: string;
	};
};

type SingBoxInbound = {
	type?: string;
	sniff?: unknown;
	address?: string[];
	inet4_address?: unknown;
};

type SingBoxOutbound = {
	tag?: string;
	type?: string;
	method?: string;
	password?: string;
	tls?: {
		alpn?: string[];
		utls?: {
			fingerprint?: string;
		};
	};
	network?: string;
	hop_interval?: string;
	congestion_control?: string;
	udp_relay_mode?: string;
	zero_rtt_handshake?: boolean;
	heartbeat?: string;
	mtu?: number;
};

type SingBoxConfig = {
	route: {
		rules: SingBoxRouteRule[];
		final?: string;
	};
	dns: {
		servers: SingBoxDnsServer[];
		final?: string;
	};
	inbounds: SingBoxInbound[];
	outbounds: SingBoxOutbound[];
};

const XRAY_HTTP_PORT = 10809;
const XRAY_SOCKS_PORT = 10808;
const XRAY_API_PORT = 10885;
const SING_BOX_MIXED_PORT = 10809;

const parseXrayConfig = (config: string): XrayConfig =>
	JSON.parse(config) as XrayConfig;
const parseSingBoxConfig = (config: string): SingBoxConfig =>
	JSON.parse(config) as SingBoxConfig;

const baseSettings: AppSettings = {
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
	routeMode: "selected",
	zapretProfile: "General",
	zapretSuspendDuringVpn: true,
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
		sni: "example.com",
	},
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
		sni: "example.com",
	},
};

describe("config-builder", () => {
	it("ставит корректный default route для Xray в selected/global", () => {
		const selectedConfig = parseXrayConfig(
			ConfigBuilder.buildXray(
				vlessNode,
				[],
				{ ...baseSettings, routeMode: "selected" },
				XRAY_HTTP_PORT,
				XRAY_SOCKS_PORT,
				XRAY_API_PORT,
			),
		);
		const globalConfig = parseXrayConfig(
			ConfigBuilder.buildXray(
				vlessNode,
				[],
				{ ...baseSettings, routeMode: "global" },
				XRAY_HTTP_PORT,
				XRAY_SOCKS_PORT,
				XRAY_API_PORT,
			),
		);

		expect(selectedConfig.routing.rules.at(-1)?.outboundTag).toBe("direct");
		expect(globalConfig.routing.rules.at(-1)?.outboundTag).toBe("proxy");
	});

	it("включает process rules в sing-box при TUN", () => {
		const processRules: ProcessRule[] = [
			{ id: "p1", process: "chrome.exe", mode: "vpn" },
		];
		const domainRules: DomainRule[] = [
			{ id: "d1", domain: "chatgpt.com", mode: "direct" },
		];
		const config = parseSingBoxConfig(
			ConfigBuilder.buildSingBox(
				hy2Node,
				domainRules,
				processRules,
				{ ...baseSettings, useTunMode: true, routeMode: "selected" },
				SING_BOX_MIXED_PORT,
			),
		);

		const processRule = config.route.rules.find((rule) =>
			Array.isArray(rule.process_name),
		);
		const domainRule = config.route.rules.find((rule) =>
			Array.isArray(rule.domain_suffix),
		);

		expect(processRule?.process_name).toEqual(["chrome.exe"]);
		expect(processRule?.outbound).toBe("proxy");
		expect(domainRule?.domain_suffix).toEqual(["chatgpt.com"]);
		expect(config.route.final).toBe("direct");
	});

	it("использует DNS через прокси в sing-box при dnsMode=auto (v1.12 формат)", () => {
		const config = parseSingBoxConfig(
			ConfigBuilder.buildSingBox(
				hy2Node,
				[],
				[],
				{ ...baseSettings, dnsMode: "auto" },
				SING_BOX_MIXED_PORT,
			),
		);
		const proxyDns = config.dns.servers.find(
			(server) => server.tag === "proxy-dns",
		);

		expect(proxyDns?.type).toBe("https");
		expect(proxyDns?.server).toBe("1.1.1.1");
		expect(proxyDns?.detour).toBe("proxy");
		expect(config.dns.final).toBe("proxy-dns");
	});

	it("использует route.final для sing-box global/selected", () => {
		const globalConfig = parseSingBoxConfig(
			ConfigBuilder.buildSingBox(
				hy2Node,
				[],
				[],
				{ ...baseSettings, routeMode: "global" },
				SING_BOX_MIXED_PORT,
			),
		);
		const selectedConfig = parseSingBoxConfig(
			ConfigBuilder.buildSingBox(
				hy2Node,
				[],
				[],
				{ ...baseSettings, routeMode: "selected" },
				SING_BOX_MIXED_PORT,
			),
		);

		expect(globalConfig.route.final).toBe("proxy");
		expect(selectedConfig.route.final).toBe("direct");
	});

	it("sing-box v1.12: sniff и hijack-dns через rule actions", () => {
		const config = parseSingBoxConfig(
			ConfigBuilder.buildSingBox(
				vlessNode,
				[],
				[],
				{ ...baseSettings, routeMode: "global" },
				SING_BOX_MIXED_PORT,
			),
		);

		const mixed = config.inbounds.find((inbound) => inbound.type === "mixed");
		const sniffRule = config.route.rules.find(
			(rule) => rule.action === "sniff",
		);
		const hijackRule = config.route.rules.find(
			(rule) => rule.action === "hijack-dns",
		);

		expect(mixed?.sniff).toBeUndefined();
		expect(sniffRule).toBeDefined();
		expect(hijackRule?.protocol).toBe("dns");
		expect(
			config.outbounds.find((outbound) => outbound.type === "block"),
		).toBeUndefined();
		expect(
			config.outbounds.find((outbound) => outbound.type === "dns"),
		).toBeUndefined();
	});

	it("sing-box v1.12: block rules используют action: reject", () => {
		const domainRules: DomainRule[] = [
			{ id: "d1", domain: "ads.com", mode: "block" },
			{ id: "d2", domain: "vpn.com", mode: "vpn" },
		];
		const config = parseSingBoxConfig(
			ConfigBuilder.buildSingBox(
				hy2Node,
				domainRules,
				[],
				{ ...baseSettings, routeMode: "global" },
				SING_BOX_MIXED_PORT,
			),
		);

		const blockRule = config.route.rules.find(
			(rule) => rule.domain_suffix?.[0] === "ads.com",
		);
		const vpnRule = config.route.rules.find(
			(rule) => rule.domain_suffix?.[0] === "vpn.com",
		);

		expect(blockRule?.action).toBe("reject");
		expect(blockRule?.outbound).toBeUndefined();
		expect(vpnRule?.outbound).toBe("proxy");
	});

	it("sing-box TUN использует address[] вместо inet4_address (v1.10+)", () => {
		const config = parseSingBoxConfig(
			ConfigBuilder.buildSingBox(
				hy2Node,
				[],
				[],
				{ ...baseSettings, useTunMode: true, routeMode: "global" },
				SING_BOX_MIXED_PORT,
			),
		);

		const tun = config.inbounds.find((inbound) => inbound.type === "tun");
		expect(tun?.address).toEqual(["172.19.0.1/30"]);
		expect(tun?.inet4_address).toBeUndefined();
	});

	it("добавляет alpn и utls fingerprint в TLS конфиг sing-box", () => {
		const config = parseSingBoxConfig(
			ConfigBuilder.buildSingBox(
				vlessNode,
				[],
				[],
				{ ...baseSettings, routeMode: "global" },
				SING_BOX_MIXED_PORT,
			),
		);

		const proxy = config.outbounds.find((outbound) => outbound.tag === "proxy");
		expect(proxy?.tls?.alpn).toEqual(["h2", "http/1.1"]);
		expect(proxy?.tls?.utls?.fingerprint).toBeTruthy();
	});

	it("Trojan Xray: корректный outbound с паролем", () => {
		const trojanNode: VpnNode = {
			id: "node-trojan",
			name: "Trojan",
			protocol: "trojan",
			server: "3.3.3.3",
			port: 443,
			uri: "",
			metadata: { password: "trojan-pass", sni: "trojan.example.com" },
		};
		const config = parseXrayConfig(
			ConfigBuilder.buildXray(
				trojanNode,
				[],
				baseSettings,
				XRAY_HTTP_PORT,
				XRAY_SOCKS_PORT,
				XRAY_API_PORT,
			),
		);

		const outbound = config.outbounds.find(
			(outboundItem) => outboundItem.protocol === "trojan",
		);
		expect(outbound?.settings?.servers?.[0]?.password).toBe("trojan-pass");
		expect(outbound?.streamSettings?.security).toBe("tls");
		expect(outbound?.streamSettings?.tlsSettings?.serverName).toBe(
			"trojan.example.com",
		);
	});

	it("VMess Xray: корректный outbound с alterId и security", () => {
		const vmessNode: VpnNode = {
			id: "node-vmess",
			name: "VMess",
			protocol: "vmess",
			server: "4.4.4.4",
			port: 443,
			uri: "",
			metadata: {
				id: "uuid-vmess",
				aid: "2",
				scy: "chacha20-poly1305",
				net: "ws",
				tls: "tls",
				sni: "vmess.com",
				path: "/ws",
			},
		};
		const config = parseXrayConfig(
			ConfigBuilder.buildXray(
				vmessNode,
				[],
				baseSettings,
				XRAY_HTTP_PORT,
				XRAY_SOCKS_PORT,
				XRAY_API_PORT,
			),
		);

		const outbound = config.outbounds.find(
			(outboundItem) => outboundItem.protocol === "vmess",
		);
		expect(outbound?.settings?.vnext?.[0]?.users?.[0]?.alterId).toBe(2);
		expect(outbound?.settings?.vnext?.[0]?.users?.[0]?.security).toBe(
			"chacha20-poly1305",
		);
		expect(outbound?.streamSettings?.network).toBe("ws");
		expect(outbound?.streamSettings?.wsSettings?.path).toBe("/ws");
		expect(outbound?.streamSettings?.tlsSettings?.alpn).toEqual(["http/1.1"]);
	});

	it("Shadowsocks Xray: method и password", () => {
		const ssNode: VpnNode = {
			id: "node-ss",
			name: "SS",
			protocol: "shadowsocks",
			server: "5.5.5.5",
			port: 8388,
			uri: "",
			metadata: { method: "chacha20-ietf-poly1305", password: "ss-secret" },
		};
		const config = parseXrayConfig(
			ConfigBuilder.buildXray(
				ssNode,
				[],
				baseSettings,
				XRAY_HTTP_PORT,
				XRAY_SOCKS_PORT,
				XRAY_API_PORT,
			),
		);

		const outbound = config.outbounds.find(
			(outboundItem) => outboundItem.protocol === "shadowsocks",
		);
		expect(outbound?.settings?.servers?.[0]?.method).toBe(
			"chacha20-ietf-poly1305",
		);
		expect(outbound?.settings?.servers?.[0]?.password).toBe("ss-secret");
	});

	it("пустой metadata → fallback значения", () => {
		const emptyNode: VpnNode = {
			id: "node-empty",
			name: "Empty",
			protocol: "vless",
			server: "6.6.6.6",
			port: 443,
			uri: "",
			metadata: {},
		};
		const config = parseXrayConfig(
			ConfigBuilder.buildXray(
				emptyNode,
				[],
				baseSettings,
				XRAY_HTTP_PORT,
				XRAY_SOCKS_PORT,
				XRAY_API_PORT,
			),
		);

		const outbound = config.outbounds.find(
			(outboundItem) => outboundItem.protocol === "vless",
		);
		expect(outbound?.settings?.vnext?.[0]?.users?.[0]?.id).toBe("");
		expect(outbound?.streamSettings?.network).toBe("tcp");
		expect(outbound?.streamSettings?.security).toBe("none");
	});

	it("DNS secure mode → серверы 8.8.8.8 и 1.1.1.1", () => {
		const config = parseXrayConfig(
			ConfigBuilder.buildXray(
				vlessNode,
				[],
				{ ...baseSettings, dnsMode: "secure" },
				XRAY_HTTP_PORT,
				XRAY_SOCKS_PORT,
				XRAY_API_PORT,
			),
		);

		expect(config.dns?.servers).toContain("8.8.8.8");
		expect(config.dns?.servers).toContain("1.1.1.1");
	});

	it("DNS custom mode → Xray использует переданный DoH URL целиком", () => {
		const config = parseXrayConfig(
			ConfigBuilder.buildXray(
				vlessNode,
				[],
				{
					...baseSettings,
					dnsMode: "custom",
					customDnsUrl: "https://dns.astronia.space:8443/dns-query/b4bb465a",
				},
				XRAY_HTTP_PORT,
				XRAY_SOCKS_PORT,
				XRAY_API_PORT,
			),
		);

		expect(config.dns?.servers).toEqual([
			"https://dns.astronia.space:8443/dns-query/b4bb465a",
		]);
	});

	it("DNS system mode → dns не определён (системный)", () => {
		const config = parseXrayConfig(
			ConfigBuilder.buildXray(
				vlessNode,
				[],
				{ ...baseSettings, dnsMode: "system" },
				XRAY_HTTP_PORT,
				XRAY_SOCKS_PORT,
				XRAY_API_PORT,
			),
		);

		expect(config.dns).toBeUndefined();
	});

	it("DNS custom mode → sing-box раскладывает DoH URL на host, port, path и bootstrap resolver", () => {
		const config = parseSingBoxConfig(
			ConfigBuilder.buildSingBox(
				hy2Node,
				[],
				[],
				{
					...baseSettings,
					dnsMode: "custom",
					customDnsUrl: "https://dns.astronia.space:8443/dns-query/b4bb465a",
				},
				SING_BOX_MIXED_PORT,
			),
		);
		const proxyDns = config.dns.servers.find(
			(server) => server.tag === "proxy-dns",
		);

		expect(proxyDns?.type).toBe("https");
		expect(proxyDns?.server).toBe("dns.astronia.space");
		expect(proxyDns?.server_port).toBe(8443);
		expect(proxyDns?.path).toBe("/dns-query/b4bb465a");
		expect(proxyDns?.detour).toBe("proxy");
		expect(proxyDns?.domain_resolver?.server).toBe("bootstrap-dns");
		expect(config.dns.final).toBe("proxy-dns");
	});

	it("sing-box TUN без process rules → нет process_name в правилах", () => {
		const config = parseSingBoxConfig(
			ConfigBuilder.buildSingBox(
				hy2Node,
				[],
				[],
				{ ...baseSettings, useTunMode: true },
				SING_BOX_MIXED_PORT,
			),
		);

		const processRule = config.route.rules.find((rule) =>
			Array.isArray(rule.process_name),
		);
		expect(processRule).toBeUndefined();
	});

	it("Shadowsocks sing-box: outbound корректен", () => {
		const ssNode: VpnNode = {
			id: "node-ss-sb",
			name: "SS-SB",
			protocol: "shadowsocks",
			server: "7.7.7.7",
			port: 8388,
			uri: "",
			metadata: { method: "aes-256-gcm", password: "ss-pass" },
		};
		const config = parseSingBoxConfig(
			ConfigBuilder.buildSingBox(
				ssNode,
				[],
				[],
				baseSettings,
				SING_BOX_MIXED_PORT,
			),
		);

		const proxy = config.outbounds.find((outbound) => outbound.tag === "proxy");
		expect(proxy?.type).toBe("shadowsocks");
		expect(proxy?.method).toBe("aes-256-gcm");
		expect(proxy?.password).toBe("ss-pass");
	});

	it("Hysteria2 sing-box: профиль фиксирует UDP и hop interval", () => {
		const config = parseSingBoxConfig(
			ConfigBuilder.buildSingBox(
				hy2Node,
				[],
				[],
				baseSettings,
				SING_BOX_MIXED_PORT,
			),
		);
		const proxy = config.outbounds.find((outbound) => outbound.tag === "proxy");

		expect(proxy?.type).toBe("hysteria2");
		expect(proxy?.network).toBe("udp");
		expect(proxy?.hop_interval).toBe("30s");
	});

	it("TUIC sing-box: профиль включает heartbeat и zero-rtt policy", () => {
		const tuicNode: VpnNode = {
			id: "node-tuic",
			name: "TUIC",
			protocol: "tuic",
			server: "8.8.4.4",
			port: 443,
			uri: "",
			metadata: {
				uuid: "11111111-1111-1111-1111-111111111111",
				password: "tuic-secret",
			},
		};
		const config = parseSingBoxConfig(
			ConfigBuilder.buildSingBox(
				tuicNode,
				[],
				[],
				{ ...baseSettings, routeMode: "global" },
				SING_BOX_MIXED_PORT,
			),
		);
		const proxy = config.outbounds.find((outbound) => outbound.tag === "proxy");

		expect(proxy?.type).toBe("tuic");
		expect(proxy?.network).toBe("udp");
		expect(proxy?.heartbeat).toBe("10s");
		expect(proxy?.zero_rtt_handshake).toBe(false);
		expect(proxy?.udp_relay_mode).toBe("native");
	});

	it("WireGuard sing-box: профиль использует MTU 1408 по умолчанию", () => {
		const wgNode: VpnNode = {
			id: "node-wg",
			name: "WG",
			protocol: "wireguard",
			server: "9.9.9.9",
			port: 51820,
			uri: "",
			metadata: {
				privateKey: "private",
				publicKey: "public",
			},
		};
		const config = parseSingBoxConfig(
			ConfigBuilder.buildSingBox(
				wgNode,
				[],
				[],
				baseSettings,
				SING_BOX_MIXED_PORT,
			),
		);
		const proxy = config.outbounds.find((outbound) => outbound.tag === "proxy");

		expect(proxy?.type).toBe("wireguard");
		expect(proxy?.mtu).toBe(1408);
		expect(proxy?.network).toBe("udp");
	});
});
