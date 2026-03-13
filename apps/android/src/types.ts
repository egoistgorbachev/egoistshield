/**
 * Shared types for EgoistShield Android.
 * Adapted from desktop-electron/shared/types.ts
 */

export type NodeProtocol =
  | 'vless'
  | 'vmess'
  | 'trojan'
  | 'shadowsocks'
  | 'socks'
  | 'http'
  | 'hysteria2'
  | 'tuic'
  | 'wireguard';

export type RuleMode = 'vpn' | 'direct' | 'block';

export interface VpnNode {
  id: string;
  name: string;
  protocol: NodeProtocol;
  server: string;
  port: number;
  uri: string;
  metadata: Record<string, string>;
  subscriptionId?: string;
  countryCode?: string;
  ping?: number;
}

export interface ServerConfig extends VpnNode {
  countryCode: string;
  ping: number | null;
}

export interface RuntimeStatus {
  connected: boolean;
  configPath: string | null;
}

export interface ImportResult {
  added: number;
  issues: string[];
}
