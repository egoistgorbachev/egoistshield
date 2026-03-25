/**
 * Единый источник типов для EgoistShield.
 * Импортируется как из electron/ (main), так и из renderer/ через реэкспорт.
 *
 * ⚠️ НЕ дублируйте эти типы — изменяйте только здесь.
 */

export type NodeProtocol =
  | "vless"
  | "vmess"
  | "trojan"
  | "shadowsocks"
  | "socks"
  | "http"
  | "hysteria2"
  | "tuic"
  | "wireguard";
export type RuleMode = "vpn" | "direct" | "block";
export type RouteMode = "global" | "selected";
export type SubscriptionUserAgent =
  | "auto"
  | "egoistshield"
  | "v2rayn"
  | "singbox"
  | "nekobox"
  | "mihomo"
  | "clash-verge"
  | "clash-for-windows"
  | "shadowrocket"
  | "loon"
  | "quantumultx"
  | "surge"
  | "curl";

export interface VpnNode {
  id: string;
  name: string;
  protocol: NodeProtocol;
  server: string;
  port: number;
  uri: string;
  metadata: Record<string, string>;
  /** ID подписки, из которой был импортирован узел. Undefined для вручную добавленных. */
  subscriptionId?: string;
}

export interface ProcessRule {
  id: string;
  process: string;
  mode: RuleMode;
}

export interface DomainRule {
  id: string;
  domain: string;
  mode: RuleMode;
}

export interface SubscriptionItem {
  id: string;
  url: string;
  name?: string | null;
  enabled: boolean;
  lastUpdated: string | null;
  upload?: number;
  download?: number;
  total?: number;
  expire?: number;
}

export interface AppSettings {
  autoStart: boolean;
  startMinimized: boolean;
  autoUpdate: boolean;
  autoConnect: boolean;
  notifications: boolean;
  useTunMode: boolean;
  killSwitch: boolean;
  allowTelemetry: boolean;
  dnsMode: "auto" | "secure" | "system" | "custom";
  systemDnsServers?: string;
  subscriptionUserAgent: SubscriptionUserAgent;
  runtimePath: string;
  routeMode: RouteMode;
}

export interface UsageRecord {
  id: string; // уникальный ID записи сессии
  timestamp: number; // время конца сессии
  serverId: string;
  ping: number; // средний пинг или последний
  down: number; // скачано байт
  up: number; // отдано байт
  durationSec: number; // длительность сессии в сек
}

export interface PersistedState {
  nodes: VpnNode[];
  activeNodeId: string | null;
  subscriptions: SubscriptionItem[];
  processRules: ProcessRule[];
  domainRules: DomainRule[];
  settings: AppSettings;
  usageHistory: UsageRecord[];
}

export type RuntimeKind = "xray" | "sing-box";
export type RuntimeLifecycle =
  | "idle"
  | "probing"
  | "connecting"
  | "warmup"
  | "active"
  | "degraded"
  | "reconnecting"
  | "failed";

export type RuntimeFailureReason =
  | "config_write_failed"
  | "runtime_install_failed"
  | "runtime_not_found"
  | "runtime_start_failed"
  | "runtime_crashed"
  | "runtime_port_unreachable"
  | "dns_failed"
  | "tcp_timeout"
  | "tls_handshake_failed"
  | "quic_blocked"
  | "auth_rejected"
  | "server_unreachable"
  | "kill_switch_failed"
  | "system_proxy_failed"
  | "unknown";

export interface RuntimeDiagnostic {
  reason: RuntimeFailureReason | null;
  details: string | null;
  updatedAt: string | null;
  fallbackAttempted: boolean;
  fallbackTarget: RuntimeKind | null;
}

export interface RuntimeLogSummary {
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  lifecycle: RuntimeLifecycle;
  reason: RuntimeFailureReason | null;
  message: string;
  nodeId: string | null;
  runtimeKind: RuntimeKind | null;
  proxyPort: number | null;
}

export interface RuntimeStatus {
  connected: boolean;
  isMock: boolean;
  pid: number | null;
  startedAt: string | null;
  activeNodeId: string | null;
  lastError: string | null;
  isAdmin: boolean;
  resolvedRuntimePath: string | null;
  runtimeKind: RuntimeKind | null;
  processRulesApplied: boolean;
  proxyPort: number | null;
  lifecycle: RuntimeLifecycle;
  diagnostic: RuntimeDiagnostic;
}

export interface RuntimeInstallResult {
  ok: boolean;
  message: string;
  runtimePath: string | null;
  runtimeKind: RuntimeKind;
  version: string | null;
  updated: boolean;
}

export interface RuntimeUpdateSummary {
  ok: boolean;
  message: string;
  results: RuntimeInstallResult[];
}

export interface DiagnosticResult {
  ok: boolean;
  latencyMs: number;
  jitterMs: number;
  lossPercent: number;
  runtimeReachable: boolean;
  message: string;
  lifecycle?: RuntimeLifecycle;
  failureReason?: RuntimeFailureReason | null;
}

export interface StressResult {
  iterations: number;
  connectSuccess: number;
  connectFailed: number;
  disconnectSuccess: number;
  disconnectFailed: number;
  errors: string[];
}

export interface ImportResult {
  added: number;
  subscriptionsAdded: number;
  issues: string[];
}
