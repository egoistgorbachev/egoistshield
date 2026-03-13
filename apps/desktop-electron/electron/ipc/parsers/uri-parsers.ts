/**
 * Парсеры URI-ссылок протоколов VPN.
 * Каждая функция принимает raw URI и возвращает VpnNode | null.
 */
import type { VpnNode } from "../contracts";
import { buildNode, buildUnsupportedEndpointIssue, decodeBase64Safe, isUnsupportedEndpoint } from "./parser-utils";

function parseVless(raw: string): VpnNode | null {
  const url = new URL(raw);
  const server = url.hostname;
  const port = Number(url.port || "443");
  if (!server || Number.isNaN(port) || port <= 0) {
    return null;
  }

  const metadata: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    metadata[key] = value;
  });
  metadata.id = decodeURIComponent(url.username);

  return buildNode("vless", decodeURIComponent(url.hash.replace(/^#/, "")), server, port, raw, metadata);
}

function parseTrojan(raw: string): VpnNode | null {
  const url = new URL(raw);
  const server = url.hostname;
  const port = Number(url.port || "443");
  if (!server || Number.isNaN(port) || port <= 0) {
    return null;
  }

  const metadata: Record<string, string> = { password: decodeURIComponent(url.username) };
  url.searchParams.forEach((value, key) => {
    metadata[key] = value;
  });

  return buildNode("trojan", decodeURIComponent(url.hash.replace(/^#/, "")), server, port, raw, metadata);
}

function parseShadowsocks(raw: string): VpnNode | null {
  const payload = raw.replace(/^ss:\/\//i, "");
  const hashIndex = payload.indexOf("#");
  const basePart = hashIndex >= 0 ? payload.slice(0, hashIndex) : payload;
  const name = hashIndex >= 0 ? decodeURIComponent(payload.slice(hashIndex + 1)) : "";
  const hostPart = basePart.includes("@") ? basePart : decodeBase64Safe(basePart);
  const [authPart, endpoint] = hostPart.split("@");
  if (!authPart || !endpoint) {
    return null;
  }

  const [method, password] = authPart.split(":");
  const [server, portText] = endpoint.split(":");
  const port = Number(portText);
  if (!method || !password || !server || Number.isNaN(port) || port <= 0) {
    return null;
  }

  return buildNode("shadowsocks", name, server, port, raw, { method, password });
}

function parseVmess(raw: string): VpnNode | null {
  const encoded = raw.replace(/^vmess:\/\//i, "").trim();
  const json = decodeBase64Safe(encoded);
  const obj = JSON.parse(json) as Record<string, string>;
  const server = obj.add ?? "";
  const port = Number(obj.port ?? "443");
  if (!server || Number.isNaN(port) || port <= 0) {
    return null;
  }

  return buildNode("vmess", obj.ps ?? "", server, port, raw, obj);
}

function parseSocksProxy(raw: string): VpnNode | null {
  const url = new URL(raw);
  const protocol = url.protocol.toLowerCase();
  if (protocol !== "socks:" && protocol !== "socks5:") {
    return null;
  }

  const server = url.hostname;
  const port = Number(url.port || "1080");
  if (!server || Number.isNaN(port) || port <= 0) {
    return null;
  }

  const metadata: Record<string, string> = {};
  const username = decodeURIComponent(url.username || "");
  const password = decodeURIComponent(url.password || "");
  if (username) metadata.username = username;
  if (password) metadata.password = password;

  return buildNode("socks", decodeURIComponent(url.hash.replace(/^#/, "")), server, port, raw, metadata);
}

function parseHttpProxy(raw: string): VpnNode | null {
  const url = new URL(raw);
  const protocol = url.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    return null;
  }

  const hasAuth = Boolean(url.username || url.password);
  const hasExplicitPort = Boolean(url.port);
  const hasPathOrQuery = Boolean((url.pathname && url.pathname !== "/") || url.search || url.hash);
  if (!hasAuth && !hasExplicitPort) {
    return null;
  }

  const server = url.hostname;
  const defaultPort = protocol === "https:" ? 443 : 80;
  const port = Number(url.port || String(defaultPort));
  if (!server || Number.isNaN(port) || port <= 0) {
    return null;
  }
  if (!hasAuth && hasPathOrQuery) {
    return null;
  }

  const metadata: Record<string, string> = {
    tls: protocol === "https:" ? "true" : "false"
  };
  const username = decodeURIComponent(url.username || "");
  const password = decodeURIComponent(url.password || "");
  if (username) metadata.username = username;
  if (password) metadata.password = password;

  return buildNode("http", decodeURIComponent(url.hash.replace(/^#/, "")), server, port, raw, metadata);
}

function parseHysteria2(raw: string): VpnNode | null {
  const normalizedRaw = raw.replace(/^hy2:\/\//i, "hysteria2://");
  const url = new URL(normalizedRaw);
  const server = url.hostname;
  const port = Number(url.port || "443");
  if (!server || Number.isNaN(port) || port <= 0) {
    return null;
  }

  const metadata: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    metadata[key] = value;
  });
  const password = decodeURIComponent(url.username || metadata.password || "");
  if (!password) {
    return null;
  }
  metadata.password = password;

  return buildNode("hysteria2", decodeURIComponent(url.hash.replace(/^#/, "")), server, port, raw, metadata);
}

function parseTuic(raw: string): VpnNode | null {
  const url = new URL(raw);
  const server = url.hostname;
  const port = Number(url.port || "443");
  if (!server || Number.isNaN(port) || port <= 0) {
    return null;
  }

  const metadata: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    metadata[key] = value;
  });

  const uuid = decodeURIComponent(url.username || metadata.uuid || "");
  const password = decodeURIComponent(url.password || metadata.password || "");
  if (!uuid || !password) {
    return null;
  }

  metadata.uuid = uuid;
  metadata.password = password;

  return buildNode("tuic", decodeURIComponent(url.hash.replace(/^#/, "")), server, port, raw, metadata);
}

function parseWireGuard(raw: string): VpnNode | null {
  const normalizedRaw = raw.replace(/^wg:\/\//i, "wireguard://");
  const url = new URL(normalizedRaw);
  const server = url.hostname;
  const port = Number(url.port || "51820");
  if (!server || Number.isNaN(port) || port <= 0) {
    return null;
  }

  const metadata: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    metadata[key] = value;
  });

  const privateKey = decodeURIComponent(url.username || metadata.private_key || metadata.privateKey || "");
  const publicKey = metadata.peer_public_key ?? metadata.public_key ?? metadata.publicKey ?? metadata.publickey ?? "";
  if (!privateKey || !publicKey) {
    return null;
  }

  metadata.private_key = privateKey;
  metadata.peer_public_key = publicKey;

  return buildNode("wireguard", decodeURIComponent(url.hash.replace(/^#/, "")), server, port, raw, metadata);
}

function unsupportedProtocolIssue(raw: string): string | null {
  const lower = raw.toLowerCase();
  if (lower.startsWith("ssr://")) {
    return "Получен протокол ShadowsocksR (SSR). Этот формат пока не поддерживается.";
  }
  return null;
}

/** Роутер: определяет протокол по URI и вызывает соответствующий парсер */
export function parseNodeUriDetailed(value: string): { node: VpnNode | null; issue: string | null } {
  const raw = value.trim();
  if (!raw) {
    return { node: null, issue: null };
  }

  try {
    let node: VpnNode | null = null;
    if (raw.startsWith("vless://")) {
      node = parseVless(raw);
    } else if (raw.startsWith("vmess://")) {
      node = parseVmess(raw);
    } else if (raw.startsWith("trojan://")) {
      node = parseTrojan(raw);
    } else if (raw.startsWith("ss://")) {
      node = parseShadowsocks(raw);
    } else if (raw.startsWith("socks://") || raw.startsWith("socks5://")) {
      node = parseSocksProxy(raw);
    } else if (raw.startsWith("http://") || raw.startsWith("https://")) {
      node = parseHttpProxy(raw);
    } else if (raw.startsWith("hy2://") || raw.startsWith("hysteria2://")) {
      node = parseHysteria2(raw);
    } else if (raw.startsWith("tuic://")) {
      node = parseTuic(raw);
    } else if (raw.startsWith("wireguard://") || raw.startsWith("wg://")) {
      node = parseWireGuard(raw);
    } else {
      const unsupported = unsupportedProtocolIssue(raw);
      if (unsupported) {
        return { node: null, issue: unsupported };
      }
    }

    if (!node) {
      return { node: null, issue: null };
    }

    if (isUnsupportedEndpoint(node.name, node.server, node.port)) {
      return { node: null, issue: buildUnsupportedEndpointIssue(node.name, node.server, node.port) };
    }

    return { node, issue: null };
  } catch {
    return { node: null, issue: `Ошибка разбора URI: ${raw.slice(0, 100)}` };
  }
}

export function parseNodeUri(value: string): VpnNode | null {
  return parseNodeUriDetailed(value).node;
}
