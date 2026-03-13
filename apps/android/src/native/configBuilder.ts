/**
 * Config builder — generates sing-box JSON config from VpnNode.
 * Adapted from desktop-electron config-builder for mobile.
 */
import type { VpnNode } from '../types';

interface SingBoxConfig {
  log: { level: string };
  dns: { servers: Array<{ tag: string; address: string; detour?: string }> };
  inbounds: Array<Record<string, unknown>>;
  outbounds: Array<Record<string, unknown>>;
  route: Record<string, unknown>;
}

/**
 * Build a sing-box configuration for the given VPN node.
 */
export function buildSingBoxConfig(node: VpnNode): string {
  const config: SingBoxConfig = {
    log: { level: 'info' },
    dns: {
      servers: [
        { tag: 'remote', address: 'https://1.1.1.1/dns-query', detour: 'proxy' },
        { tag: 'local', address: '1.1.1.1' },
      ],
    },
    inbounds: [
      {
        type: 'tun',
        tag: 'tun-in',
        interface_name: 'egoist0',
        inet4_address: '172.19.0.1/30',
        mtu: 9000,
        auto_route: true,
        strict_route: true,
        stack: 'system',
        sniff: true,
        sniff_override_destination: true,
      },
    ],
    outbounds: [buildOutbound(node), { type: 'direct', tag: 'direct' }, { type: 'block', tag: 'block' }],
    route: {
      auto_detect_interface: true,
      final: 'proxy',
      rules: [
        { protocol: 'dns', outbound: 'dns-out' },
        { geoip: ['private'], outbound: 'direct' },
      ],
    },
  };

  // Add dns outbound
  (config.outbounds as Array<Record<string, unknown>>).push({ type: 'dns', tag: 'dns-out' });

  return JSON.stringify(config, null, 2);
}

function buildOutbound(node: VpnNode): Record<string, unknown> {
  const meta = node.metadata || {};
  const base = {
    tag: 'proxy',
    server: node.server,
    server_port: node.port,
  };

  switch (node.protocol) {
    case 'vless':
      return {
        ...base,
        type: 'vless',
        uuid: meta.uuid || meta.id || '',
        flow: meta.flow || '',
        tls: {
          enabled: true,
          server_name: meta.sni || meta.host || node.server,
          utls: { enabled: true, fingerprint: meta.fp || 'chrome' },
          reality: meta.security === 'reality'
            ? {
                enabled: true,
                public_key: meta.pbk || '',
                short_id: meta.sid || '',
              }
            : undefined,
        },
        transport: buildTransport(meta),
      };

    case 'vmess':
      return {
        ...base,
        type: 'vmess',
        uuid: meta.uuid || meta.id || '',
        alter_id: parseInt(meta.aid || '0', 10),
        security: meta.scy || 'auto',
        tls: meta.tls === 'tls'
          ? {
              enabled: true,
              server_name: meta.sni || meta.host || node.server,
            }
          : undefined,
        transport: buildTransport(meta),
      };

    case 'trojan':
      return {
        ...base,
        type: 'trojan',
        password: meta.password || '',
        tls: {
          enabled: true,
          server_name: meta.sni || meta.host || node.server,
        },
        transport: buildTransport(meta),
      };

    case 'shadowsocks':
      return {
        ...base,
        type: 'shadowsocks',
        method: meta.method || meta.cipher || 'aes-256-gcm',
        password: meta.password || '',
      };

    case 'hysteria2':
      return {
        ...base,
        type: 'hysteria2',
        password: meta.password || meta.auth || '',
        tls: {
          enabled: true,
          server_name: meta.sni || node.server,
          insecure: meta.insecure === '1' || meta.insecure === 'true',
        },
        up_mbps: parseInt(meta.up || '100', 10),
        down_mbps: parseInt(meta.down || '100', 10),
      };

    case 'tuic':
      return {
        ...base,
        type: 'tuic',
        uuid: meta.uuid || '',
        password: meta.password || '',
        congestion_control: meta.congestion_control || 'bbr',
        tls: {
          enabled: true,
          server_name: meta.sni || node.server,
          alpn: meta.alpn ? meta.alpn.split(',') : ['h3'],
        },
      };

    case 'wireguard':
      return {
        ...base,
        type: 'wireguard',
        private_key: meta.private_key || meta.privateKey || '',
        peer_public_key: meta.public_key || meta.publicKey || '',
        pre_shared_key: meta.pre_shared_key || meta.presharedKey || '',
        reserved: meta.reserved ? JSON.parse(meta.reserved) : undefined,
        mtu: parseInt(meta.mtu || '1280', 10),
      };

    default:
      return {
        ...base,
        type: 'socks',
        username: meta.username || '',
        password: meta.password || '',
      };
  }
}

function buildTransport(meta: Record<string, string>): Record<string, unknown> | undefined {
  const type = meta.type || meta.net;
  if (!type || type === 'tcp') return undefined;

  switch (type) {
    case 'ws':
      return {
        type: 'ws',
        path: meta.path || '/',
        headers: meta.host ? { Host: meta.host } : undefined,
      };
    case 'grpc':
      return {
        type: 'grpc',
        service_name: meta.serviceName || meta.path || '',
      };
    case 'h2':
    case 'http':
      return {
        type: 'http',
        host: meta.host ? [meta.host] : undefined,
        path: meta.path || '/',
      };
    default:
      return undefined;
  }
}
