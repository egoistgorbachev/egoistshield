import type { AppSettings, SubscriptionUserAgent, VpnNode } from "./contracts";
import { createHash } from "node:crypto";
import { hostname } from "node:os";
import log from "electron-log";

const USER_AGENT_BY_PROFILE: Record<Exclude<SubscriptionUserAgent, "auto">, string> = {
  egoistshield: "EgoistShield/3.0",
  v2rayn: "v2rayN/6.0",
  singbox: "sing-box/1.10",
  nekobox: "NekoBox/1.0",
  mihomo: "Mihomo/1.19",
  "clash-verge": "clash-verge/2.0",
  "clash-for-windows": "ClashforWindows/0.20.39",
  shadowrocket: "Shadowrocket/2320",
  loon: "Loon/3.2.5",
  quantumultx: "Quantumult X/1.0.32",
  surge: "Surge/3029",
  curl: "curl/8.0"
};

const AUTO_PROFILE_ORDER: Array<Exclude<SubscriptionUserAgent, "auto">> = [
  "clash-for-windows",
  "v2rayn",
  "egoistshield"
];

export function getRequestProfiles(profile: SubscriptionUserAgent): Array<Exclude<SubscriptionUserAgent, "auto">> {
  return profile === "auto" ? AUTO_PROFILE_ORDER : [profile];
}

export function getAcceptHeader(profile: Exclude<SubscriptionUserAgent, "auto">): string {
  if (["mihomo", "clash-verge", "clash-for-windows", "surge"].includes(profile)) {
    return "text/yaml,text/plain;q=0.9,*/*;q=0.8";
  }
  return "text/plain,*/*;q=0.8";
}

export function getUserAgentString(profile: Exclude<SubscriptionUserAgent, "auto">): string {
  return USER_AGENT_BY_PROFILE[profile];
}

export function getSubscriptionUserAgent(settings: AppSettings): SubscriptionUserAgent {
  return settings.subscriptionUserAgent ?? "auto";
}

/**
 * Генерирует HWID (Hardware-ID) устройства.
 * Используется подписочными панелями (Marzban, 3X-UI, V2Board) для лимита устройств.
 * Формат совместим с v2rayN/Happ — SHA-256 хэш hostname.
 */
let _cachedHwid: string | null = null;
function getDeviceHwid(): string {
  if (_cachedHwid) return _cachedHwid;
  try {
    const raw = hostname() || "EgoistShield-Desktop";
    _cachedHwid = createHash("sha256").update(raw).digest("hex").substring(0, 32);
  } catch {
    _cachedHwid = "egoistshield-default-hwid-00000";
  }
  return _cachedHwid;
}

export function parseSubscriptionUserInfo(header: string | null): Record<string, number> | null {
  if (!header) return null;
  const result: Record<string, number> = {};
  for (const part of header.split(";")) {
    const [key, value] = part.split("=");
    if (key && value) {
      const num = Number.parseInt(value.trim(), 10);
      if (!Number.isNaN(num)) result[key.trim().toLowerCase()] = num;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

export function extractSubscriptionName(response: Response): string | null {
  const profileTitle = response.headers.get("profile-title") || response.headers.get("Profile-Title");
  if (profileTitle) {
    // Decode base64 encoded profile titles (e.g. "base64:8J+buCBMdW1heCBWUE4=")
    const base64Match = profileTitle.match(/^base64:(.+)$/i);
    if (base64Match?.[1]) {
      try {
        return Buffer.from(base64Match[1], "base64").toString("utf8").trim();
      } catch {}
    }
    return profileTitle.trim();
  }

  const cd = response.headers.get("content-disposition") || response.headers.get("Content-Disposition");
  if (cd) {
    const utf8Match = cd.match(/filename\*=(?:UTF-8''|utf-8'')([^;]+)/i);
    if (utf8Match?.[1]) {
      try {
        return decodeURIComponent(utf8Match[1]).replace(/\.[^.]+$/, "");
      } catch {}
    }
    const fnMatch = cd.match(/filename="?([^"\n;]+)"?/i);
    if (fnMatch?.[1]) return fnMatch[1].replace(/\.[^.]+$/, "").trim();
  }

  const subName = response.headers.get("subscription-name");
  if (subName) return subName.trim();

  return null;
}

export function buildNodeFingerprint(node: VpnNode): string {
  const authKey = node.metadata.id ?? node.metadata.password ?? node.metadata.username ?? "";
  return `${node.protocol}|${node.server}|${node.port}|${authKey}`;
}

export function uniqueNodes(existing: VpnNode[], incoming: VpnNode[]): VpnNode[] {
  const index = new Set(existing.map(buildNodeFingerprint));
  const result: VpnNode[] = [];
  for (const node of incoming) {
    const key = buildNodeFingerprint(node);
    if (!index.has(key)) {
      result.push(node);
      index.add(key);
    }
  }
  return result;
}

export async function readUrlText(
  url: string,
  profile: SubscriptionUserAgent
): Promise<{ text: string; userinfo: Record<string, number> | null; name: string | null }> {
  const profileKey: Exclude<SubscriptionUserAgent, "auto"> = profile === "auto" ? "v2rayn" : profile;
  const hwid = getDeviceHwid();

  log.info(`[readUrlText] Fetching ${url} with UA=${profileKey}, HWID=${hwid.substring(0, 8)}...`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": getUserAgentString(profileKey),
        Accept: getAcceptHeader(profileKey),
        "X-HWID": hwid
      },
      redirect: "follow"
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    log.info(`[readUrlText] Response: ${text.length} bytes`);

    if (!text.trim()) {
      throw new Error("Сервер вернул пустой ответ");
    }

    const userinfoHeader =
      response.headers.get("Subscription-Userinfo") || response.headers.get("subscription-userinfo");
    const userinfo = parseSubscriptionUserInfo(userinfoHeader);
    const name = extractSubscriptionName(response);

    return { text, userinfo, name };
  } finally {
    clearTimeout(timeout);
  }
}

