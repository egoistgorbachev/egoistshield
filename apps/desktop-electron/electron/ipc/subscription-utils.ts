import type { AppSettings, SubscriptionUserAgent, VpnNode, ImportResult } from "./contracts";
import { parseNodesFromText } from "./node-parser";

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
    "egoistshield", "v2rayn", "clash-for-windows", "shadowrocket", "surge",
    "singbox", "nekobox", "mihomo", "clash-verge", "loon", "quantumultx", "curl"
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

export function parseSubscriptionUserInfo(header: string | null): Record<string, number> | null {
    if (!header) return null;
    const result: Record<string, number> = {};
    for (const part of header.split(";")) {
        const [key, value] = part.split("=");
        if (key && value) {
            const num = parseInt(value.trim(), 10);
            if (!isNaN(num)) result[key.trim().toLowerCase()] = num;
        }
    }
    return Object.keys(result).length > 0 ? result : null;
}

export function extractSubscriptionName(response: Response): string | null {
    const profileTitle = response.headers.get("profile-title") || response.headers.get("Profile-Title");
    if (profileTitle) return profileTitle.trim();

    const cd = response.headers.get("content-disposition") || response.headers.get("Content-Disposition");
    if (cd) {
        const utf8Match = cd.match(/filename\*=(?:UTF-8''|utf-8'')([^;]+)/i);
        if (utf8Match) {
            try { return decodeURIComponent(utf8Match[1]).replace(/\.[^.]+$/, ''); } catch { }
        }
        const fnMatch = cd.match(/filename="?([^"\n;]+)"?/i);
        if (fnMatch) return fnMatch[1].replace(/\.[^.]+$/, '').trim();
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
    const profiles = getRequestProfiles(profile);
    const errors: string[] = [];
    let fallbackPlaceholder: string | null = null;
    let fallbackUnknown: string | null = null;
    let fallbackUnknownScore = Number.POSITIVE_INFINITY;
    let fallbackUserinfo: Record<string, number> | null = null;
    let fallbackName: string | null = null;
    const { isLikelyUnsupportedPlaceholderText } = await import("./node-parser");

    for (const item of profiles) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        try {
            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    "User-Agent": getUserAgentString(item),
                    Accept: getAcceptHeader(item)
                }
            });

            if (!response.ok) {
                errors.push(`${item}: HTTP ${response.status}`);
                continue;
            }

            const text = await response.text();
            const userinfoHeader = response.headers.get("Subscription-Userinfo") || response.headers.get("subscription-userinfo");
            const userinfo = parseSubscriptionUserInfo(userinfoHeader);
            const name = extractSubscriptionName(response);

            if (isLikelyUnsupportedPlaceholderText(text)) {
                if (!fallbackPlaceholder) {
                    fallbackPlaceholder = text;
                    fallbackUserinfo = userinfo;
                    fallbackName = name;
                }
                errors.push(`${item}: сервис вернул заглушку`);
                continue;
            }

            const parsed = parseNodesFromText(text);
            if (parsed.nodes.length > 0) return { text, userinfo, name };

            const unsupportedIssues = parsed.issues.filter(
                (issue) => issue.includes("заглушку") || issue.toLowerCase().includes("not supported")
            ).length;
            if (!fallbackUnknown || unsupportedIssues < fallbackUnknownScore) {
                fallbackUnknown = text;
                fallbackUnknownScore = unsupportedIssues;
                fallbackUserinfo = userinfo;
                fallbackName = name;
            }
            errors.push(`${item}: ответ получен, но валидных узлов не найдено`);
        } catch (error) {
            errors.push(`${item}: ${String(error)}`);
        } finally {
            clearTimeout(timeout);
        }
    }

    if (fallbackUnknown) return { text: fallbackUnknown, userinfo: fallbackUserinfo, name: fallbackName };
    if (fallbackPlaceholder) return { text: fallbackPlaceholder, userinfo: fallbackUserinfo, name: fallbackName };

    throw new Error(`Не удалось получить подписку: ${errors.join(" | ")}`);
}
