/**
 * Zod-схемы для валидации IPC inputs.
 * Используются в handlers.ts для type-safe парсинга входящих данных из renderer.
 */

import { z } from "zod";

// ── Базовые типы ──

export const NodeProtocolSchema = z.enum([
  "vless", "vmess", "trojan", "shadowsocks",
  "socks", "http", "hysteria2", "tuic", "wireguard"
]);

export const RuleModeSchema = z.enum(["vpn", "direct", "block"]);
export const RouteModeSchema = z.enum(["global", "selected"]);
export const DnsModeSchema = z.enum(["auto", "secure", "system", "custom"]);

export const SubscriptionUserAgentSchema = z.enum([
  "auto", "egoistshield", "v2rayn", "singbox", "nekobox",
  "mihomo", "clash-verge", "clash-for-windows", "shadowrocket",
  "loon", "quantumultx", "surge", "curl"
]);

// ── Составные типы ──

export const VpnNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  protocol: NodeProtocolSchema,
  server: z.string(),
  port: z.number().int().min(1).max(65535),
  uri: z.string(),
  metadata: z.record(z.string(), z.string())
});

export const ProcessRuleSchema = z.object({
  id: z.string(),
  process: z.string(),
  mode: RuleModeSchema
});

export const DomainRuleSchema = z.object({
  id: z.string(),
  domain: z.string(),
  mode: RuleModeSchema
});

export const SubscriptionItemSchema = z.object({
  id: z.string(),
  url: z.string(),
  name: z.string().nullable().optional(),
  enabled: z.boolean(),
  lastUpdated: z.string().nullable(),
  upload: z.number().optional(),
  download: z.number().optional(),
  total: z.number().optional(),
  expire: z.number().optional()
});

export const AppSettingsSchema = z.object({
  autoStart: z.boolean(),
  startMinimized: z.boolean(),
  autoUpdate: z.boolean(),
  useTunMode: z.boolean(),
  killSwitch: z.boolean(),
  allowTelemetry: z.boolean(),
  dnsMode: DnsModeSchema,
  subscriptionUserAgent: SubscriptionUserAgentSchema,
  runtimePath: z.string(),
  routeMode: RouteModeSchema
});

export const PersistedStateSchema = z.object({
  nodes: z.array(VpnNodeSchema),
  activeNodeId: z.string().nullable(),
  subscriptions: z.array(SubscriptionItemSchema),
  processRules: z.array(ProcessRuleSchema),
  domainRules: z.array(DomainRuleSchema),
  settings: AppSettingsSchema
});

// ── IPC Input Schemas ──

/** import:text — текстовый payload (URI, base64, YAML) */
export const ImportTextInputSchema = z.string().min(1, "Payload не может быть пустым");

/** import:file — путь к файлу */
export const ImportFileInputSchema = z.string().min(1, "Путь к файлу не может быть пустым");

/** subscription:refresh-one — URL подписки */
export const SubscriptionUrlInputSchema = z.string().url("Некорректный URL подписки");

/** vpn:stress-test — количество итераций */
export const StressTestInputSchema = z.number().int().min(1).max(1000);

/** vpn:ping — хост и порт */
export const PingInputSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535)
});

/** system:pick-file — фильтры файлов */
export const PickFileFilterSchema = z.array(z.object({
  name: z.string(),
  extensions: z.array(z.string())
}));

/** system:geoip — хост для определения страны */
export const GeoipInputSchema = z.string().min(1, "Host не может быть пустым");

/** system:get-app-icon — путь к exe */
export const AppIconInputSchema = z.string().min(1);
