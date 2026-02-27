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
    useTunMode: boolean;
    killSwitch: boolean;
    allowTelemetry: boolean;
    dnsMode: "auto" | "secure" | "system" | "custom";
    subscriptionUserAgent: SubscriptionUserAgent;
    runtimePath: string;
    routeMode: RouteMode;
}

export interface PersistedState {
    nodes: VpnNode[];
    activeNodeId: string | null;
    subscriptions: SubscriptionItem[];
    processRules: ProcessRule[];
    domainRules: DomainRule[];
    settings: AppSettings;
}

export interface RuntimeStatus {
    connected: boolean;
    pid: number | null;
    startedAt: string | null;
    activeNodeId: string | null;
    lastError: string | null;
    isAdmin: boolean;
    resolvedRuntimePath: string | null;
    runtimeKind: "xray" | "sing-box" | null;
    processRulesApplied: boolean;
    proxyPort: number | null;
}

export interface RuntimeInstallResult {
    ok: boolean;
    message: string;
    runtimePath: string | null;
    runtimeKind: "xray" | "sing-box";
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
    issues: string[];
}
