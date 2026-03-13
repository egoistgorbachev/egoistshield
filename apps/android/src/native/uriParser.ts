/**
 * VPN URI parser — parses vless://, vmess://, trojan://, ss:// etc. into VpnNode objects.
 * Adapted from desktop-electron/electron/ipc/node-parser.ts
 */
import type { VpnNode, NodeProtocol } from '../types';

function generateId(): string {
  return 'xxxx-xxxx-xxxx'.replace(/x/g, () =>
    Math.floor(Math.random() * 16).toString(16)
  );
}

/**
 * Parse a text blob containing VPN URIs (one per line) into VpnNode array.
 */
export function parseVpnText(text: string): { nodes: VpnNode[]; issues: string[] } {
  const nodes: VpnNode[] = [];
  const issues: string[] = [];
  const lines = text.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    try {
      const node = parseUri(line);
      if (node) {
        nodes.push(node);
      } else {
        issues.push(`Unsupported: ${line.substring(0, 50)}`);
      }
    } catch (e) {
      issues.push(`Parse error: ${line.substring(0, 40)} — ${e}`);
    }
  }

  return { nodes, issues };
}

/**
 * Parse a single VPN URI into a VpnNode.
 */
export function parseUri(uri: string): VpnNode | null {
  const trimmed = uri.trim();
  if (!trimmed) return null;

  // Base64-encoded vmess://
  if (trimmed.startsWith('vmess://')) return parseVmess(trimmed);
  if (trimmed.startsWith('vless://')) return parseVless(trimmed);
  if (trimmed.startsWith('trojan://')) return parseTrojan(trimmed);
  if (trimmed.startsWith('ss://')) return parseShadowsocks(trimmed);
  if (trimmed.startsWith('hysteria2://') || trimmed.startsWith('hy2://')) return parseHysteria2(trimmed);
  if (trimmed.startsWith('tuic://')) return parseTuic(trimmed);
  if (trimmed.startsWith('wireguard://') || trimmed.startsWith('wg://')) return parseWireguard(trimmed);

  return null;
}

function parseVless(uri: string): VpnNode {
  const url = new URL(uri);
  const params = Object.fromEntries(url.searchParams.entries());
  const name = decodeURIComponent(url.hash.slice(1) || `VLESS ${url.hostname}`);

  return {
    id: generateId(),
    name,
    protocol: 'vless',
    server: url.hostname,
    port: parseInt(url.port || '443', 10),
    uri,
    metadata: {
      uuid: url.username,
      ...params,
    },
  };
}

function parseVmess(uri: string): VpnNode {
  const b64 = uri.replace('vmess://', '');
  let json: Record<string, string>;

  try {
    json = JSON.parse(atob(b64));
  } catch {
    // Try URL-safe base64
    json = JSON.parse(atob(b64.replace(/-/g, '+').replace(/_/g, '/')));
  }

  return {
    id: generateId(),
    name: json.ps || json.remarks || `VMess ${json.add}`,
    protocol: 'vmess',
    server: json.add || json.host || '',
    port: parseInt(json.port || '443', 10),
    uri,
    metadata: {
      uuid: json.id || '',
      aid: json.aid || '0',
      scy: json.scy || 'auto',
      type: json.net || 'tcp',
      host: json.host || '',
      path: json.path || '',
      tls: json.tls || '',
      sni: json.sni || '',
    },
  };
}

function parseTrojan(uri: string): VpnNode {
  const url = new URL(uri);
  const params = Object.fromEntries(url.searchParams.entries());
  const name = decodeURIComponent(url.hash.slice(1) || `Trojan ${url.hostname}`);

  return {
    id: generateId(),
    name,
    protocol: 'trojan',
    server: url.hostname,
    port: parseInt(url.port || '443', 10),
    uri,
    metadata: {
      password: decodeURIComponent(url.username),
      ...params,
    },
  };
}

function parseShadowsocks(uri: string): VpnNode {
  let data = uri.replace('ss://', '');
  const hashIdx = data.indexOf('#');
  let name = '';
  if (hashIdx !== -1) {
    name = decodeURIComponent(data.slice(hashIdx + 1));
    data = data.slice(0, hashIdx);
  }

  // Try SIP002 format: base64(method:password)@host:port
  const atIdx = data.indexOf('@');
  let method = 'aes-256-gcm';
  let password = '';
  let server = '';
  let port = 443;

  if (atIdx !== -1) {
    const userinfo = atob(data.slice(0, atIdx));
    const colonIdx = userinfo.indexOf(':');
    method = userinfo.slice(0, colonIdx);
    password = userinfo.slice(colonIdx + 1);
    const hostPart = data.slice(atIdx + 1);
    const lastColon = hostPart.lastIndexOf(':');
    server = hostPart.slice(0, lastColon);
    port = parseInt(hostPart.slice(lastColon + 1), 10);
  } else {
    // Legacy base64 format
    const decoded = atob(data);
    const match = decoded.match(/^(.+?):(.+?)@(.+?):(\d+)$/);
    if (match) {
      method = match[1];
      password = match[2];
      server = match[3];
      port = parseInt(match[4], 10);
    }
  }

  return {
    id: generateId(),
    name: name || `SS ${server}`,
    protocol: 'shadowsocks',
    server,
    port,
    uri,
    metadata: { method, password },
  };
}

function parseHysteria2(uri: string): VpnNode {
  const normalized = uri.replace('hy2://', 'hysteria2://');
  const url = new URL(normalized);
  const params = Object.fromEntries(url.searchParams.entries());
  const name = decodeURIComponent(url.hash.slice(1) || `Hysteria2 ${url.hostname}`);

  return {
    id: generateId(),
    name,
    protocol: 'hysteria2',
    server: url.hostname,
    port: parseInt(url.port || '443', 10),
    uri,
    metadata: {
      password: decodeURIComponent(url.username),
      ...params,
    },
  };
}

function parseTuic(uri: string): VpnNode {
  const url = new URL(uri);
  const params = Object.fromEntries(url.searchParams.entries());
  const name = decodeURIComponent(url.hash.slice(1) || `TUIC ${url.hostname}`);
  const [uuid, password] = decodeURIComponent(url.username).split(':');

  return {
    id: generateId(),
    name,
    protocol: 'tuic',
    server: url.hostname,
    port: parseInt(url.port || '443', 10),
    uri,
    metadata: {
      uuid: uuid || '',
      password: password || decodeURIComponent(url.password || ''),
      ...params,
    },
  };
}

function parseWireguard(uri: string): VpnNode {
  const normalized = uri.replace('wg://', 'wireguard://');
  const url = new URL(normalized);
  const params = Object.fromEntries(url.searchParams.entries());
  const name = decodeURIComponent(url.hash.slice(1) || `WG ${url.hostname}`);

  return {
    id: generateId(),
    name,
    protocol: 'wireguard',
    server: url.hostname,
    port: parseInt(url.port || '51820', 10),
    uri,
    metadata: {
      private_key: decodeURIComponent(url.username),
      ...params,
    },
  };
}

/**
 * Detect country code from server name/remark.
 */
export function detectCountryCode(name: string): string {
  const countryMap: Record<string, string> = {
    'russia': 'ru', 'россия': 'ru', 'moscow': 'ru', 'москва': 'ru', 'ru': 'ru',
    'germany': 'de', 'германия': 'de', 'frankfurt': 'de', 'de': 'de',
    'netherlands': 'nl', 'нидерланды': 'nl', 'amsterdam': 'nl', 'nl': 'nl',
    'usa': 'us', 'us': 'us', 'united states': 'us', 'сша': 'us', 'america': 'us',
    'uk': 'gb', 'united kingdom': 'gb', 'london': 'gb', 'великобритания': 'gb', 'gb': 'gb',
    'france': 'fr', 'франция': 'fr', 'paris': 'fr', 'fr': 'fr',
    'japan': 'jp', 'япония': 'jp', 'tokyo': 'jp', 'jp': 'jp',
    'singapore': 'sg', 'сингапур': 'sg', 'sg': 'sg',
    'canada': 'ca', 'канада': 'ca', 'ca': 'ca',
    'australia': 'au', 'австралия': 'au', 'au': 'au',
    'finland': 'fi', 'финляндия': 'fi', 'fi': 'fi', 'helsinki': 'fi',
    'turkey': 'tr', 'турция': 'tr', 'tr': 'tr', 'istanbul': 'tr',
    'hong kong': 'hk', 'hk': 'hk', 'гонконг': 'hk',
    'korea': 'kr', 'kr': 'kr', 'корея': 'kr', 'seoul': 'kr',
    'india': 'in', 'in': 'in', 'индия': 'in',
    'brazil': 'br', 'br': 'br', 'бразилия': 'br',
    'ukraine': 'ua', 'ua': 'ua', 'украина': 'ua', 'киев': 'ua',
    'poland': 'pl', 'pl': 'pl', 'польша': 'pl', 'warsaw': 'pl',
    'sweden': 'se', 'se': 'se', 'швеция': 'se',
    'switzerland': 'ch', 'ch': 'ch', 'швейцария': 'ch',
    'italy': 'it', 'it': 'it', 'италия': 'it',
    'spain': 'es', 'es': 'es', 'испания': 'es',
    'czech': 'cz', 'cz': 'cz', 'чехия': 'cz', 'prague': 'cz',
    'romania': 'ro', 'ro': 'ro', 'румыния': 'ro',
    'latvia': 'lv', 'lv': 'lv', 'латвия': 'lv',
    'kazakh': 'kz', 'kz': 'kz', 'казахстан': 'kz',
  };

  const lower = name.toLowerCase();
  // Check flag emojis
  const flagMatch = name.match(/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/);
  if (flagMatch) {
    const code = String.fromCharCode(
      flagMatch[0].codePointAt(0)! - 0x1F1E6 + 65,
      flagMatch[0].codePointAt(2)! - 0x1F1E6 + 65
    ).toLowerCase();
    return code;
  }

  for (const [key, code] of Object.entries(countryMap)) {
    if (lower.includes(key)) return code;
  }
  return 'un';
}
