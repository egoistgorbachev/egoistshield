/**
 * Утилиты для парсинга нод — base64, URI extraction, построение VpnNode.
 */
import { randomUUID } from "node:crypto";
import type { NodeProtocol, VpnNode } from "../contracts";

export const URI_PATTERN = /(vless|vmess|trojan|ss|socks5?|https?|hy2|hysteria2|tuic|wireguard|wg):\/\/[^\s<>"'`]+/gi;
export const SUBSCRIPTION_URL_PATTERN = /^https?:\/\/\S+$/i;
export const CLASH_YAML_HINT_PATTERN = /(^|\n)\s*(proxies|proxy-groups|rules|rule-providers|tun|dns)\s*:/im;

export function decodeBase64Safe(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
}

export function extractKnownUris(payload: string): string[] {
  const matches = payload.match(URI_PATTERN);
  return matches ? matches.map((item) => item.trim()) : [];
}

export function isLikelyBase64Block(raw: string): boolean {
  const value = raw.trim();
  if (value.length < 16) {
    return false;
  }
  return /^[A-Za-z0-9+/=_-]+$/.test(value);
}

export function tryDecodeSubscriptionBlock(raw: string): string[] {
  if (!isLikelyBase64Block(raw)) {
    return [];
  }

  try {
    const decoded = decodeBase64Safe(raw.trim());
    return extractKnownUris(decoded);
  } catch {
    return [];
  }
}

export function toStringSafe(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function toNumberSafe(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return fallback;
}

export function buildNode(
  protocol: NodeProtocol,
  name: string,
  server: string,
  port: number,
  uri: string,
  metadata: Record<string, string>
): VpnNode {
  return {
    id: randomUUID(),
    name: name.trim() || `${protocol.toUpperCase()}-${server}:${port}`,
    protocol,
    server: server.trim(),
    port,
    uri,
    metadata
  };
}

export function buildUnsupportedEndpointIssue(name: string, server: string, port: number): string {
  return `Сервис вернул заглушку «${name || "App not supported"}» (${server}:${port}). Этот формат/профиль не поддерживается провайдером для текущего клиента.`;
}

export function isUnsupportedEndpoint(name: string, server: string, port: number): boolean {
  const lowerName = name.toLowerCase();
  return (
    (server === "0.0.0.0" && port <= 1) ||
    lowerName.includes("app not supported") ||
    lowerName.includes("not supported")
  );
}

export function isLikelyUnsupportedPlaceholderText(payload: string): boolean {
  const raw = payload.trim();
  if (!raw) {
    return false;
  }

  const lower = raw.toLowerCase();
  if (lower.includes("app not supported") && (lower.includes("0.0.0.0") || lower.includes("server:"))) {
    return true;
  }

  if (/@0\.0\.0\.0:1/i.test(raw)) {
    return true;
  }

  if (isLikelyBase64Block(raw)) {
    try {
      const decoded = decodeBase64Safe(raw);
      const decodedLower = decoded.toLowerCase();
      if (decodedLower.includes("app not supported") || /@0\.0\.0\.0:1/i.test(decoded)) {
        return true;
      }
    } catch {
      // ignore
    }
  }

  return false;
}

export function isSubscriptionUrl(value: string): boolean {
  return SUBSCRIPTION_URL_PATTERN.test(value.trim());
}

export function buildNodeFingerprint(node: VpnNode): string {
  const authKey = node.metadata.id ?? node.metadata.password ?? node.metadata.username ?? "";
  return `${node.protocol}|${node.server}|${node.port}|${authKey}`;
}

export function dedupeNodes(nodes: VpnNode[]): VpnNode[] {
  const seen = new Set<string>();
  const unique: VpnNode[] = [];
  for (const node of nodes) {
    const key = buildNodeFingerprint(node);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(node);
  }
  return unique;
}

export function buildVlessUri(server: string, port: number, name: string, metadata: Record<string, string>): string {
  const params = new URLSearchParams();
  if (metadata.security) params.set("security", metadata.security);
  if (metadata.type) params.set("type", metadata.type);
  if (metadata.sni) params.set("sni", metadata.sni);
  if (metadata.pbk) params.set("pbk", metadata.pbk);
  if (metadata.sid) params.set("sid", metadata.sid);
  if (metadata.fp) params.set("fp", metadata.fp);
  if (metadata.flow) params.set("flow", metadata.flow);
  if (metadata.path) params.set("path", metadata.path);
  if (metadata.host) params.set("host", metadata.host);
  const query = params.toString();
  const encodedName = encodeURIComponent(name || `VLESS-${server}:${port}`);
  return `vless://${metadata.id ?? ""}@${server}:${port}${query ? `?${query}` : ""}#${encodedName}`;
}

export function buildVmessUriFromMetadata(metadata: Record<string, string>): string {
  return `vmess://${Buffer.from(JSON.stringify(metadata), "utf8").toString("base64")}`;
}
