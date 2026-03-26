import type { AppSettings, DomainRule, ProcessRule, VpnNode } from "./contracts";

type XrayConfig = Record<string, unknown>;
type SingBoxConfig = Record<string, unknown>;
type ProtocolProfile = {
  xrayTlsAlpn?: string[];
  singBoxNetwork?: "tcp" | "udp";
  singBoxHopInterval?: string;
  tuicCongestionControl?: "cubic" | "new_reno" | "bbr";
  tuicHeartbeat?: string;
  tuicZeroRttHandshake?: boolean;
  tuicUdpRelayMode?: "native" | "quic";
  wireguardMtu?: number;
};

export namespace ConfigBuilder {
  export function buildXray(
    node: VpnNode,
    domainRules: DomainRule[],
    settings: AppSettings,
    httpPort: number,
    socksPort: number,
    apiPort: number
  ): string {
    const outbound = buildOutbound(node);
    const rules = buildRules(domainRules);

    const config: XrayConfig = {
      log: {
        loglevel: "warning"
      },
      stats: {},
      api: {
        tag: "api",
        services: ["StatsService"]
      },
      policy: {
        levels: {
          "0": {
            statsUserUplink: true,
            statsUserDownlink: true
          }
        },
        system: {
          statsInboundUplink: true,
          statsInboundDownlink: true,
          statsOutboundUplink: true,
          statsOutboundDownlink: true
        }
      },
      inbounds: [
        {
          tag: "socks-in",
          port: socksPort,
          listen: "127.0.0.1",
          protocol: "socks",
          settings: { udp: true },
          sniffing: { enabled: true, destOverride: ["http", "tls"] },
          streamSettings: { sockopt: { tcpFastOpen: true, tcpNoDelay: true } }
        },
        {
          tag: "http-in",
          port: httpPort,
          listen: "127.0.0.1",
          protocol: "http",
          sniffing: { enabled: true, destOverride: ["http", "tls"] },
          streamSettings: { sockopt: { tcpFastOpen: true, tcpNoDelay: true } }
        },
        {
          listen: "127.0.0.1",
          port: apiPort,
          protocol: "dokodemo-door",
          settings: { address: "127.0.0.1" },
          tag: "api"
        }
      ],
      outbounds: [
        {
          ...outbound,
          tag: "proxy",
          streamSettings: outbound.streamSettings
            ? { ...outbound.streamSettings, sockopt: { tcpFastOpen: true, tcpNoDelay: true } }
            : undefined
        },
        { tag: "direct", protocol: "freedom", settings: {} },
        { tag: "block", protocol: "blackhole", settings: {} }
      ],
      routing: {
        domainStrategy: settings.dnsMode === "secure" ? "IPOnDemand" : "AsIs",
        rules: [
          { inboundTag: ["api"], outboundTag: "api", type: "field" },
          ...rules,
          { type: "field", outboundTag: "direct", ip: ["geoip:private", "geoip:cn"] },
          { type: "field", outboundTag: "direct", domain: ["geosite:cn"] },
          buildDefaultXrayRule(settings.routeMode)
        ]
      },
      dns: buildDns(settings.dnsMode)
    };

    return JSON.stringify(config, null, 2);
  }

  export function buildSingBox(
    node: VpnNode,
    domainRules: DomainRule[],
    processRules: ProcessRule[],
    settings: AppSettings,
    mixedPort: number
  ): string {
    const outbound = buildSingBoxOutbound(node);
    const userRules = buildSingBoxRules(domainRules, processRules, settings.useTunMode);

    // sing-box 1.12 формат: sniff и dns hijack через rule actions
    const config: SingBoxConfig = {
      log: {
        level: "info",
        timestamp: true
      },
      dns: buildSingBoxDns(settings.dnsMode),
      inbounds: [
        {
          type: "mixed",
          tag: "mixed-in",
          listen: "127.0.0.1",
          listen_port: mixedPort
        }
      ],
      outbounds: [
        {
          ...outbound,
          tag: "proxy",
          // 1.12: domain_resolver для резолвинга домена VPN-сервера
          domain_resolver: { server: "bootstrap-dns", strategy: "prefer_ipv4" }
        },
        { type: "direct", tag: "direct" }
      ],
      route: {
        rules: [
          // 1.11+ sniff и hijack-dns через rule actions
          { action: "sniff" },
          { protocol: "dns", action: "hijack-dns" },
          ...userRules,
          { ip_is_private: true, outbound: "direct" }
        ],
        final: settings.routeMode === "global" ? "proxy" : "direct",
        auto_detect_interface: true,
        // 1.12: default domain resolver для всех outbounds без explicit domain_resolver
        default_domain_resolver: { server: "bootstrap-dns", strategy: "prefer_ipv4" }
      }
    };

    if (settings.useTunMode) {
      (config.inbounds as unknown[]).push({
        type: "tun",
        tag: "tun-in",
        interface_name: "egoist-tun",
        // 1.10+: inet4_address → address
        address: ["172.19.0.1/30"],
        auto_route: true,
        strict_route: true,
        stack: "system"
      });
    }

    return JSON.stringify(config, null, 2);
  }

  function buildOutbound(node: VpnNode): Record<string, unknown> {
    const m = node.metadata ?? {};
    const profile = getProtocolProfile(node);

    if (node.protocol === "vless") {
      return {
        protocol: "vless",
        settings: {
          vnext: [
            {
              address: node.server,
              port: node.port,
              users: [
                {
                  id: m.id ?? "",
                  encryption: "none",
                  flow: m.flow || (m.security === "reality" ? "xtls-rprx-vision" : undefined)
                }
              ]
            }
          ]
        },
        streamSettings: {
          network: m.type ?? "tcp",
          security: m.security ?? "none",
          tlsSettings:
            m.security === "tls"
              ? {
                  serverName: m.sni ?? node.server,
                  fingerprint: m.fp ?? "chrome",
                  alpn: profile.xrayTlsAlpn
                }
              : undefined,
          realitySettings:
            m.security === "reality"
              ? {
                  serverName: m.sni ?? node.server,
                  fingerprint: m.fp ?? "chrome",
                  publicKey: m.pbk ?? "",
                  shortId: m.sid ?? "",
                  spiderX: m.spx ?? "/"
                }
              : undefined,
          wsSettings:
            m.type === "ws" ? { path: m.path ?? "/", headers: m.host ? { Host: m.host } : undefined } : undefined,
          grpcSettings: m.type === "grpc" ? { serviceName: m.serviceName ?? "" } : undefined,
          httpSettings: m.type === "h2" ? { path: m.path ?? "/", host: m.host ? [m.host] : undefined } : undefined
        }
      };
    }

    if (node.protocol === "vmess") {
      return {
        protocol: "vmess",
        settings: {
          vnext: [
            {
              address: node.server,
              port: node.port,
              users: [{ id: m.id ?? "", alterId: Number(m.aid ?? "0"), security: m.scy ?? "auto" }]
            }
          ]
        },
        streamSettings: {
          network: m.net ?? "tcp",
          security: m.tls === "tls" ? "tls" : "none",
          tlsSettings:
            m.tls === "tls"
              ? {
                  serverName: m.sni ?? node.server,
                  alpn: profile.xrayTlsAlpn
                }
              : undefined,
          wsSettings:
            m.net === "ws" ? { path: m.path ?? "/", headers: m.host ? { Host: m.host } : undefined } : undefined,
          grpcSettings: m.net === "grpc" ? { serviceName: m.serviceName ?? "" } : undefined
        }
      };
    }

    if (node.protocol === "trojan") {
      return {
        protocol: "trojan",
        settings: {
          servers: [
            {
              address: node.server,
              port: node.port,
              password: m.password ?? ""
            }
          ]
        },
        streamSettings: {
          network: m.type ?? "tcp",
          security: "tls",
          tlsSettings: { serverName: m.sni ?? node.server, alpn: profile.xrayTlsAlpn },
          wsSettings:
            m.type === "ws" ? { path: m.path ?? "/", headers: m.host ? { Host: m.host } : undefined } : undefined,
          grpcSettings: m.type === "grpc" ? { serviceName: m.serviceName ?? "" } : undefined
        }
      };
    }

    if (node.protocol === "shadowsocks") {
      return {
        protocol: "shadowsocks",
        settings: {
          servers: [
            {
              address: node.server,
              port: node.port,
              method: m.method ?? "aes-128-gcm",
              password: m.password ?? ""
            }
          ]
        }
      };
    }

    if (node.protocol === "socks") {
      return {
        protocol: "socks",
        settings: {
          servers: [
            {
              address: node.server,
              port: node.port,
              users: m.username || m.password ? [{ user: m.username ?? "", pass: m.password ?? "" }] : undefined
            }
          ]
        }
      };
    }

    if (node.protocol === "http") {
      return {
        protocol: "http",
        settings: {
          servers: [
            {
              address: node.server,
              port: node.port,
              users: m.username || m.password ? [{ user: m.username ?? "", pass: m.password ?? "" }] : undefined
            }
          ]
        }
      };
    }

    return { protocol: "freedom", settings: {} };
  }

  function parseNumber(value: string | undefined, fallback: number): number {
    if (!value) return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function parseBool(value: string | undefined): boolean {
    return value ? ["1", "true", "yes", "on"].includes(value.toLowerCase()) : false;
  }

  function getProtocolProfile(node: VpnNode): ProtocolProfile {
    if (node.protocol === "hysteria2") {
      return {
        singBoxNetwork: "udp",
        singBoxHopInterval: "30s"
      };
    }

    if (node.protocol === "tuic") {
      return {
        singBoxNetwork: "udp",
        tuicCongestionControl: "bbr",
        tuicHeartbeat: "10s",
        tuicZeroRttHandshake: false,
        tuicUdpRelayMode: "native"
      };
    }

    if (node.protocol === "wireguard") {
      return {
        singBoxNetwork: "udp",
        wireguardMtu: 1408
      };
    }

    if (node.protocol === "vless" || node.protocol === "vmess" || node.protocol === "trojan") {
      const metadata = node.metadata ?? {};
      const network = node.protocol === "vmess" ? (metadata.net ?? "tcp") : (metadata.type ?? "tcp");
      const alpn = metadata.alpn
        ?.split(",")
        .map((value: string) => value.trim())
        .filter(Boolean);

      return {
        xrayTlsAlpn:
          alpn && alpn.length > 0 ? alpn : network === "grpc" || network === "h2" ? ["h2", "http/1.1"] : ["http/1.1"]
      };
    }

    return {};
  }

  function buildSingBoxOutbound(node: VpnNode): Record<string, unknown> {
    const m = node.metadata ?? {};
    const profile = getProtocolProfile(node);

    if (node.protocol === "vless") {
      const transport = buildSingBoxTransport(m);
      const tls = buildSingBoxTls(m, node.server);
      return {
        type: "vless",
        server: node.server,
        server_port: node.port,
        uuid: m.id ?? "",
        flow: m.flow || (m.security === "reality" ? "xtls-rprx-vision" : undefined),
        tls: tls,
        transport: transport
      };
    }

    if (node.protocol === "vmess") {
      const transport = buildSingBoxTransport(m, true);
      const tls =
        m.tls === "tls"
          ? {
              enabled: true,
              server_name: m.sni ?? node.server,
              insecure: parseBool(m.insecure)
            }
          : undefined;
      return {
        type: "vmess",
        server: node.server,
        server_port: node.port,
        uuid: m.id ?? "",
        alter_id: Number(m.aid ?? "0"),
        security: m.scy ?? "auto",
        tls: tls,
        transport: transport
      };
    }

    if (node.protocol === "trojan") {
      const transport = buildSingBoxTransport(m);
      return {
        type: "trojan",
        server: node.server,
        server_port: node.port,
        password: m.password ?? "",
        tls: {
          enabled: true,
          server_name: m.sni ?? node.server,
          insecure: parseBool(m.insecure)
        },
        transport: transport
      };
    }

    if (node.protocol === "shadowsocks") {
      return {
        type: "shadowsocks",
        server: node.server,
        server_port: node.port,
        method: m.method ?? "aes-128-gcm",
        password: m.password ?? ""
      };
    }

    if (node.protocol === "socks") {
      return {
        type: "socks",
        server: node.server,
        server_port: node.port,
        username: m.username || undefined,
        password: m.password || undefined
      };
    }

    if (node.protocol === "http") {
      return {
        type: "http",
        server: node.server,
        server_port: node.port,
        username: m.username || undefined,
        password: m.password || undefined
      };
    }

    if (node.protocol === "hysteria2") {
      return {
        type: "hysteria2",
        server: node.server,
        server_port: node.port,
        password: m.password ?? "",
        up_mbps: parseNumber(m.up_mbps ?? m.upmbps ?? m.up, 100),
        down_mbps: parseNumber(m.down_mbps ?? m.downmbps ?? m.down, 100),
        hop_interval: m.hop_interval ?? profile.singBoxHopInterval,
        network: m.network ?? profile.singBoxNetwork,
        tls: {
          enabled: true,
          server_name: m.sni ?? node.server,
          insecure: parseBool(m.insecure)
        },
        obfs: m.obfs ? { type: m.obfs, password: m.obfs_password ?? m["obfs-password"] ?? "" } : undefined
      };
    }

    if (node.protocol === "tuic") {
      return {
        type: "tuic",
        server: node.server,
        server_port: node.port,
        uuid: m.uuid ?? "",
        password: m.password ?? "",
        congestion_control: m.congestion_control ?? profile.tuicCongestionControl ?? "bbr",
        udp_relay_mode: m.udp_relay_mode ?? profile.tuicUdpRelayMode ?? "native",
        zero_rtt_handshake: parseBool(m.zero_rtt_handshake) || profile.tuicZeroRttHandshake === true,
        heartbeat: m.heartbeat ?? profile.tuicHeartbeat,
        network: m.network ?? profile.singBoxNetwork,
        tls: {
          enabled: true,
          server_name: m.sni ?? node.server,
          insecure: parseBool(m.insecure),
          alpn: (m.alpn ?? "")
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean)
        }
      };
    }

    if (node.protocol === "wireguard") {
      const localAddress = (m.local_address ?? m.address ?? "10.7.0.2/32")
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
      return {
        type: "wireguard",
        server: node.server,
        server_port: node.port,
        private_key: m.private_key ?? m.privateKey ?? "",
        peer_public_key: m.peer_public_key ?? m.public_key ?? m.publicKey ?? "",
        pre_shared_key: m.pre_shared_key ?? m.preshared_key ?? undefined,
        local_address: localAddress.length > 0 ? localAddress : ["10.7.0.2/32"],
        mtu: parseNumber(m.mtu, profile.wireguardMtu ?? 1408),
        network: m.network ?? profile.singBoxNetwork,
        reserved: m.reserved
          ? m.reserved
              .split(",")
              .map((s: string) => Number(s.trim()))
              .filter((n: number) => Number.isFinite(n))
          : undefined
      };
    }

    return { type: "direct" };
  }

  // Вспомогательные: TLS и Transport для sing-box VLESS/VMess/Trojan
  function buildSingBoxTls(m: Record<string, string>, server: string): Record<string, unknown> | undefined {
    const alpn = m.alpn
      ? m.alpn
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean)
      : ["h2", "http/1.1"];

    if (m.security === "reality") {
      return {
        enabled: true,
        server_name: m.sni ?? server,
        alpn,
        utls: { enabled: true, fingerprint: m.fp ?? "chrome" },
        reality: {
          enabled: true,
          public_key: m.pbk ?? "",
          short_id: m.sid ?? ""
        }
      };
    }
    if (m.security === "tls") {
      return {
        enabled: true,
        server_name: m.sni ?? server,
        alpn,
        insecure: parseBool(m.insecure),
        utls: m.fp ? { enabled: true, fingerprint: m.fp } : { enabled: true, fingerprint: "chrome" }
      };
    }
    return undefined;
  }

  function buildSingBoxTransport(m: Record<string, string>, isVmess = false): Record<string, unknown> | undefined {
    const network = isVmess ? (m.net ?? "tcp") : (m.type ?? "tcp");
    if (network === "ws") {
      return {
        type: "ws",
        path: m.path ?? "/",
        headers: m.host ? { Host: m.host } : undefined
      };
    }
    if (network === "grpc") {
      return {
        type: "grpc",
        service_name: m.serviceName ?? ""
      };
    }
    if (network === "h2") {
      return {
        type: "http",
        host: m.host ? [m.host] : undefined,
        path: m.path ?? "/"
      };
    }
    return undefined;
  }

  function buildRules(domainRules: DomainRule[]): Record<string, unknown>[] {
    const rules: Record<string, unknown>[] = [];

    // User rules
    for (const rule of domainRules) {
      rules.push({
        type: "field",
        domain: [rule.domain],
        outboundTag: rule.mode === "vpn" ? "proxy" : rule.mode === "block" ? "block" : "direct"
      });
    }

    return rules;
  }

  function buildSingBoxRules(
    domainRules: DomainRule[],
    processRules: ProcessRule[],
    useTunMode: boolean
  ): Record<string, unknown>[] {
    const rules: Record<string, unknown>[] = [];

    if (useTunMode) {
      for (const rule of processRules) {
        // 1.11+: block → action: "reject" вместо outbound
        if (rule.mode === "block") {
          rules.push({ process_name: [rule.process], action: "reject" });
        } else {
          rules.push({ process_name: [rule.process], outbound: rule.mode === "vpn" ? "proxy" : "direct" });
        }
      }
    }

    for (const rule of domainRules) {
      // 1.11+: block → action: "reject" вместо outbound
      if (rule.mode === "block") {
        rules.push({ domain_suffix: [rule.domain], action: "reject" });
      } else {
        rules.push({ domain_suffix: [rule.domain], outbound: rule.mode === "vpn" ? "proxy" : "direct" });
      }
    }

    return rules;
  }

  function buildDefaultXrayRule(mode: AppSettings["routeMode"]): Record<string, unknown> {
    return {
      type: "field",
      network: "tcp,udp",
      outboundTag: mode === "global" ? "proxy" : "direct"
    };
  }

  function buildDns(mode: AppSettings["dnsMode"]): Record<string, unknown> | undefined {
    if (mode === "secure") {
      return {
        servers: ["8.8.8.8", "1.1.1.1"]
      };
    }
    return undefined; // System DNS
  }

  function buildSingBoxDns(mode: AppSettings["dnsMode"]): Record<string, unknown> {
    // sing-box 1.12 формат: type + server вместо address

    if (mode === "system") {
      return {
        servers: [
          { tag: "system-dns", type: "local" },
          // bootstrap-dns нужен для domain_resolver в outbound
          { tag: "bootstrap-dns", type: "udp", server: "1.1.1.1" }
        ]
      };
    }

    // Для "auto", "secure", "custom" — DNS через прокси (обход блокировок)
    return {
      servers: [
        { tag: "proxy-dns", type: "https", server: "1.1.1.1", server_port: 443, detour: "proxy" },
        { tag: "direct-dns", type: "udp", server: "8.8.8.8" },
        { tag: "bootstrap-dns", type: "udp", server: "1.1.1.1" }
      ],
      final: "proxy-dns",
      strategy: "prefer_ipv4"
    };
  }
}
