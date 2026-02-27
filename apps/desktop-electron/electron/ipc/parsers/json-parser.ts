/**
 * Парсеры JSON-конфигов: Xray outbound, sing-box outbound, JSON-подписки.
 */
import type { VpnNode } from "../contracts";
import {
    toStringSafe,
    toNumberSafe,
    buildNode,
    buildVlessUri,
    buildVmessUriFromMetadata,
} from "./parser-utils";
import { parseClashProxy } from "./clash-parser";
import { parseNodeUriDetailed } from "./uri-parsers";

export function parseXrayOutbound(outbound: Record<string, unknown>, index: number): { node: VpnNode | null; issue: string | null } {
    const protocol = toStringSafe(outbound.protocol).trim().toLowerCase();
    const tag = toStringSafe(outbound.tag).trim();
    const name = tag || `Xray outbound #${index + 1}`;

    if (!protocol) {
        return { node: null, issue: null };
    }
    if (["freedom", "blackhole", "dns", "direct", "block"].includes(protocol)) {
        return { node: null, issue: null };
    }

    const settings = (outbound.settings && typeof outbound.settings === "object")
        ? (outbound.settings as Record<string, unknown>)
        : {};
    const streamSettings = (outbound.streamSettings && typeof outbound.streamSettings === "object")
        ? (outbound.streamSettings as Record<string, unknown>)
        : {};

    if (protocol === "vless") {
        const vnext = Array.isArray(settings.vnext) ? settings.vnext[0] : null;
        if (!vnext || typeof vnext !== "object") {
            return { node: null, issue: `Xray outbound ${name}: отсутствует settings.vnext.` };
        }
        const record = vnext as Record<string, unknown>;
        const server = toStringSafe(record.address).trim();
        const port = toNumberSafe(record.port, NaN);
        const user = Array.isArray(record.users) ? record.users[0] : null;
        const userData = (user && typeof user === "object") ? (user as Record<string, unknown>) : {};
        const id = toStringSafe(userData.id).trim();
        if (!server || Number.isNaN(port) || port <= 0 || !id) {
            return { node: null, issue: `Xray outbound ${name}: некорректный VLESS endpoint.` };
        }

        const metadata: Record<string, string> = {
            id,
            type: toStringSafe(streamSettings.network).trim() || "tcp",
            security: toStringSafe(streamSettings.security).trim() || "none"
        };
        const flow = toStringSafe(userData.flow).trim();
        if (flow) metadata.flow = flow;
        const tlsSettings = (streamSettings.tlsSettings && typeof streamSettings.tlsSettings === "object")
            ? (streamSettings.tlsSettings as Record<string, unknown>)
            : {};
        const realitySettings = (streamSettings.realitySettings && typeof streamSettings.realitySettings === "object")
            ? (streamSettings.realitySettings as Record<string, unknown>)
            : {};
        const wsSettings = (streamSettings.wsSettings && typeof streamSettings.wsSettings === "object")
            ? (streamSettings.wsSettings as Record<string, unknown>)
            : {};

        const sni = toStringSafe(tlsSettings.serverName).trim() || toStringSafe(realitySettings.serverName).trim();
        if (sni) metadata.sni = sni;
        const fp = toStringSafe(tlsSettings.fingerprint).trim() || toStringSafe(realitySettings.fingerprint).trim();
        if (fp) metadata.fp = fp;
        const pbk = toStringSafe(realitySettings.publicKey).trim();
        const sid = toStringSafe(realitySettings.shortId).trim();
        if (pbk) metadata.pbk = pbk;
        if (sid) metadata.sid = sid;
        const path = toStringSafe(wsSettings.path).trim();
        if (path) metadata.path = path;
        const headers = (wsSettings.headers && typeof wsSettings.headers === "object")
            ? (wsSettings.headers as Record<string, unknown>)
            : {};
        const host = toStringSafe(headers.Host).trim() || toStringSafe(headers.host).trim();
        if (host) metadata.host = host;

        const uri = buildVlessUri(server, port, name, metadata);
        return { node: buildNode("vless", name, server, port, uri, metadata), issue: null };
    }

    if (protocol === "vmess") {
        const vnext = Array.isArray(settings.vnext) ? settings.vnext[0] : null;
        if (!vnext || typeof vnext !== "object") {
            return { node: null, issue: `Xray outbound ${name}: отсутствует settings.vnext.` };
        }
        const record = vnext as Record<string, unknown>;
        const server = toStringSafe(record.address).trim();
        const port = toNumberSafe(record.port, NaN);
        const user = Array.isArray(record.users) ? record.users[0] : null;
        const userData = (user && typeof user === "object") ? (user as Record<string, unknown>) : {};
        const id = toStringSafe(userData.id).trim();
        if (!server || Number.isNaN(port) || port <= 0 || !id) {
            return { node: null, issue: `Xray outbound ${name}: некорректный VMESS endpoint.` };
        }

        const metadata: Record<string, string> = {
            v: "2",
            ps: name,
            add: server,
            port: String(port),
            id,
            aid: String(toNumberSafe(userData.alterId, 0)),
            net: toStringSafe(streamSettings.network).trim() || "tcp",
            scy: toStringSafe(userData.security).trim() || "auto"
        };
        const tls = toStringSafe(streamSettings.security).trim() === "tls";
        if (tls) {
            metadata.tls = "tls";
        }
        const tlsSettings = (streamSettings.tlsSettings && typeof streamSettings.tlsSettings === "object")
            ? (streamSettings.tlsSettings as Record<string, unknown>)
            : {};
        const sni = toStringSafe(tlsSettings.serverName).trim();
        if (sni) metadata.sni = sni;

        const uri = buildVmessUriFromMetadata(metadata);
        return { node: buildNode("vmess", name, server, port, uri, metadata), issue: null };
    }

    if (protocol === "trojan") {
        const servers = Array.isArray(settings.servers) ? settings.servers[0] : null;
        if (!servers || typeof servers !== "object") {
            return { node: null, issue: `Xray outbound ${name}: отсутствует settings.servers.` };
        }
        const record = servers as Record<string, unknown>;
        const server = toStringSafe(record.address).trim();
        const port = toNumberSafe(record.port, NaN);
        const password = toStringSafe(record.password).trim();
        if (!server || Number.isNaN(port) || port <= 0 || !password) {
            return { node: null, issue: `Xray outbound ${name}: некорректный Trojan endpoint.` };
        }
        const metadata: Record<string, string> = { password };
        const tlsSettings = (streamSettings.tlsSettings && typeof streamSettings.tlsSettings === "object")
            ? (streamSettings.tlsSettings as Record<string, unknown>)
            : {};
        const sni = toStringSafe(tlsSettings.serverName).trim();
        if (sni) metadata.sni = sni;
        const network = toStringSafe(streamSettings.network).trim();
        if (network) metadata.type = network;
        const params = new URLSearchParams();
        if (metadata.sni) params.set("sni", metadata.sni);
        if (metadata.type) params.set("type", metadata.type);
        const uri = `trojan://${encodeURIComponent(password)}@${server}:${port}${params.size > 0 ? `?${params.toString()}` : ""}#${encodeURIComponent(name)}`;
        return { node: buildNode("trojan", name, server, port, uri, metadata), issue: null };
    }

    if (protocol === "shadowsocks") {
        const servers = Array.isArray(settings.servers) ? settings.servers[0] : null;
        if (!servers || typeof servers !== "object") {
            return { node: null, issue: `Xray outbound ${name}: отсутствует settings.servers.` };
        }
        const record = servers as Record<string, unknown>;
        const server = toStringSafe(record.address).trim();
        const port = toNumberSafe(record.port, NaN);
        const method = toStringSafe(record.method).trim();
        const password = toStringSafe(record.password).trim();
        if (!server || Number.isNaN(port) || port <= 0 || !method || !password) {
            return { node: null, issue: `Xray outbound ${name}: некорректный Shadowsocks endpoint.` };
        }
        const plain = `${method}:${password}@${server}:${port}`;
        const uri = `ss://${Buffer.from(plain, "utf8").toString("base64")}#${encodeURIComponent(name)}`;
        return { node: buildNode("shadowsocks", name, server, port, uri, { method, password }), issue: null };
    }

    if (protocol === "socks" || protocol === "http") {
        const servers = Array.isArray(settings.servers) ? settings.servers[0] : null;
        if (!servers || typeof servers !== "object") {
            return { node: null, issue: `Xray outbound ${name}: отсутствует settings.servers.` };
        }
        const record = servers as Record<string, unknown>;
        const server = toStringSafe(record.address).trim();
        const port = toNumberSafe(record.port, NaN);
        if (!server || Number.isNaN(port) || port <= 0) {
            return { node: null, issue: `Xray outbound ${name}: некорректный ${protocol.toUpperCase()} endpoint.` };
        }
        const user = Array.isArray(record.users) ? record.users[0] : null;
        const userData = (user && typeof user === "object") ? (user as Record<string, unknown>) : {};
        const username = toStringSafe(userData.user).trim();
        const pass = toStringSafe(userData.pass).trim();
        const metadata: Record<string, string> = {};
        if (username) metadata.username = username;
        if (pass) metadata.password = pass;
        if (protocol === "http") {
            const auth = username ? `${encodeURIComponent(username)}${pass ? `:${encodeURIComponent(pass)}` : ""}@` : "";
            const uri = `http://${auth}${server}:${port}#${encodeURIComponent(name)}`;
            return { node: buildNode("http", name, server, port, uri, metadata), issue: null };
        }
        const auth = username ? `${encodeURIComponent(username)}${pass ? `:${encodeURIComponent(pass)}` : ""}@` : "";
        const uri = `socks://${auth}${server}:${port}#${encodeURIComponent(name)}`;
        return { node: buildNode("socks", name, server, port, uri, metadata), issue: null };
    }

    return { node: null, issue: `Xray outbound ${name}: неподдерживаемый protocol ${protocol}.` };
}

export function parseSingBoxOutbound(outbound: Record<string, unknown>, index: number): { node: VpnNode | null; issue: string | null } {
    const type = toStringSafe(outbound.type).trim().toLowerCase();
    const tag = toStringSafe(outbound.tag).trim();
    const name = tag || `sing-box outbound #${index + 1}`;
    if (!type) {
        return { node: null, issue: null };
    }
    if (["direct", "block", "dns", "selector", "urltest"].includes(type)) {
        return { node: null, issue: null };
    }

    const server = toStringSafe(outbound.server).trim();
    const port = toNumberSafe(outbound.server_port, NaN);

    if (type === "vless") {
        const uuid = toStringSafe(outbound.uuid).trim();
        if (!server || Number.isNaN(port) || port <= 0 || !uuid) {
            return { node: null, issue: `sing-box outbound ${name}: некорректный VLESS endpoint.` };
        }
        const metadata: Record<string, string> = {
            id: uuid,
            security: "none",
            type: toStringSafe(outbound.network).trim() || "tcp"
        };
        const tls = (outbound.tls && typeof outbound.tls === "object") ? (outbound.tls as Record<string, unknown>) : {};
        const tlsEnabled = tls.enabled === true;
        if (tlsEnabled) metadata.security = "tls";
        const sni = toStringSafe(tls.server_name).trim();
        if (sni) metadata.sni = sni;
        const uri = buildVlessUri(server, port, name, metadata);
        return { node: buildNode("vless", name, server, port, uri, metadata), issue: null };
    }

    if (type === "vmess") {
        const uuid = toStringSafe(outbound.uuid).trim();
        if (!server || Number.isNaN(port) || port <= 0 || !uuid) {
            return { node: null, issue: `sing-box outbound ${name}: некорректный VMESS endpoint.` };
        }
        const metadata: Record<string, string> = {
            v: "2",
            ps: name,
            add: server,
            port: String(port),
            id: uuid,
            aid: "0",
            net: toStringSafe(outbound.network).trim() || "tcp",
            scy: toStringSafe(outbound.security).trim() || "auto"
        };
        const uri = buildVmessUriFromMetadata(metadata);
        return { node: buildNode("vmess", name, server, port, uri, metadata), issue: null };
    }

    if (type === "trojan") {
        const password = toStringSafe(outbound.password).trim();
        if (!server || Number.isNaN(port) || port <= 0 || !password) {
            return { node: null, issue: `sing-box outbound ${name}: некорректный Trojan endpoint.` };
        }
        const metadata: Record<string, string> = { password };
        const tls = (outbound.tls && typeof outbound.tls === "object") ? (outbound.tls as Record<string, unknown>) : {};
        const sni = toStringSafe(tls.server_name).trim();
        if (sni) metadata.sni = sni;
        const params = new URLSearchParams();
        if (metadata.sni) params.set("sni", metadata.sni);
        const uri = `trojan://${encodeURIComponent(password)}@${server}:${port}${params.size > 0 ? `?${params.toString()}` : ""}#${encodeURIComponent(name)}`;
        return { node: buildNode("trojan", name, server, port, uri, metadata), issue: null };
    }

    if (type === "shadowsocks") {
        const method = toStringSafe(outbound.method).trim();
        const password = toStringSafe(outbound.password).trim();
        if (!server || Number.isNaN(port) || port <= 0 || !method || !password) {
            return { node: null, issue: `sing-box outbound ${name}: некорректный Shadowsocks endpoint.` };
        }
        const plain = `${method}:${password}@${server}:${port}`;
        const uri = `ss://${Buffer.from(plain, "utf8").toString("base64")}#${encodeURIComponent(name)}`;
        return { node: buildNode("shadowsocks", name, server, port, uri, { method, password }), issue: null };
    }

    if (type === "socks" || type === "http") {
        if (!server || Number.isNaN(port) || port <= 0) {
            return { node: null, issue: `sing-box outbound ${name}: некорректный ${type.toUpperCase()} endpoint.` };
        }
        const username = toStringSafe(outbound.username).trim();
        const password = toStringSafe(outbound.password).trim();
        const metadata: Record<string, string> = {};
        if (username) metadata.username = username;
        if (password) metadata.password = password;
        const auth = username ? `${encodeURIComponent(username)}${password ? `:${encodeURIComponent(password)}` : ""}@` : "";
        if (type === "http") {
            const uri = `http://${auth}${server}:${port}#${encodeURIComponent(name)}`;
            return { node: buildNode("http", name, server, port, uri, metadata), issue: null };
        }
        const uri = `socks://${auth}${server}:${port}#${encodeURIComponent(name)}`;
        return { node: buildNode("socks", name, server, port, uri, metadata), issue: null };
    }

    if (type === "hysteria2") {
        const password = toStringSafe(outbound.password).trim();
        if (!server || Number.isNaN(port) || port <= 0 || !password) {
            return { node: null, issue: `sing-box outbound ${name}: некорректный Hysteria2 endpoint.` };
        }
        const metadata: Record<string, string> = { password };
        const tls = (outbound.tls && typeof outbound.tls === "object") ? (outbound.tls as Record<string, unknown>) : {};
        const sni = toStringSafe(tls.server_name).trim();
        if (sni) metadata.sni = sni;
        const uri = `hysteria2://${encodeURIComponent(password)}@${server}:${port}${metadata.sni ? `?sni=${encodeURIComponent(metadata.sni)}` : ""}#${encodeURIComponent(name)}`;
        return { node: buildNode("hysteria2", name, server, port, uri, metadata), issue: null };
    }

    if (type === "tuic") {
        const uuid = toStringSafe(outbound.uuid).trim();
        const password = toStringSafe(outbound.password).trim();
        if (!server || Number.isNaN(port) || port <= 0 || !uuid || !password) {
            return { node: null, issue: `sing-box outbound ${name}: некорректный TUIC endpoint.` };
        }
        const metadata: Record<string, string> = { uuid, password };
        const tls = (outbound.tls && typeof outbound.tls === "object") ? (outbound.tls as Record<string, unknown>) : {};
        const sni = toStringSafe(tls.server_name).trim();
        if (sni) metadata.sni = sni;
        const params = new URLSearchParams();
        if (metadata.sni) params.set("sni", metadata.sni);
        const uri = `tuic://${encodeURIComponent(uuid)}:${encodeURIComponent(password)}@${server}:${port}${params.size > 0 ? `?${params.toString()}` : ""}#${encodeURIComponent(name)}`;
        return { node: buildNode("tuic", name, server, port, uri, metadata), issue: null };
    }

    if (type === "wireguard") {
        const privateKey = toStringSafe(outbound.private_key).trim();
        const publicKey = toStringSafe(outbound.peer_public_key).trim();
        if (!server || Number.isNaN(port) || port <= 0 || !privateKey || !publicKey) {
            return { node: null, issue: `sing-box outbound ${name}: некорректный WireGuard endpoint.` };
        }
        const metadata: Record<string, string> = {
            private_key: privateKey,
            peer_public_key: publicKey
        };
        const params = new URLSearchParams();
        params.set("publickey", publicKey);
        const localAddress = Array.isArray(outbound.local_address) ? outbound.local_address[0] : null;
        const addressValue = toStringSafe(localAddress).trim();
        if (addressValue) {
            metadata.local_address = addressValue;
            params.set("address", addressValue);
        }
        const uri = `wireguard://${encodeURIComponent(privateKey)}@${server}:${port}?${params.toString()}#${encodeURIComponent(name)}`;
        return { node: buildNode("wireguard", name, server, port, uri, metadata), issue: null };
    }

    return { node: null, issue: `sing-box outbound ${name}: неподдерживаемый type ${type}.` };
}

export function parseNodesFromJson(payload: string): { matched: boolean; nodes: VpnNode[]; issues: string[] } {
    const trimmed = payload.trim();
    const looksLikeJson = trimmed.startsWith("{") || trimmed.startsWith("[");
    if (!looksLikeJson) {
        return { matched: false, nodes: [], issues: [] };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed);
    } catch (error) {
        return { matched: true, nodes: [], issues: [`Ошибка чтения JSON-конфига: ${String(error)}`] };
    }

    const nodes: VpnNode[] = [];
    const issues: string[] = [];

    const collectFromObject = (obj: Record<string, unknown>) => {
        if (Array.isArray(obj.proxies)) {
            for (const entry of obj.proxies) {
                if (!entry || typeof entry !== "object") {
                    issues.push("JSON proxies содержит некорректную запись.");
                    continue;
                }
                const { node, issue } = parseClashProxy(entry as Record<string, unknown>);
                if (node) nodes.push(node);
                if (issue) issues.push(issue);
            }
        }

        if (Array.isArray(obj.outbounds)) {
            for (let i = 0; i < obj.outbounds.length; i += 1) {
                const outbound = obj.outbounds[i];
                if (!outbound || typeof outbound !== "object") {
                    issues.push(`JSON outbounds[${i}] имеет некорректный формат.`);
                    continue;
                }
                const asRecord = outbound as Record<string, unknown>;
                const hasXrayProtocol = Boolean(toStringSafe(asRecord.protocol).trim());
                const parsedOutbound = hasXrayProtocol
                    ? parseXrayOutbound(asRecord, i)
                    : parseSingBoxOutbound(asRecord, i);
                if (parsedOutbound.node) nodes.push(parsedOutbound.node);
                if (parsedOutbound.issue) issues.push(parsedOutbound.issue);
            }
        }
    };

    if (Array.isArray(parsed)) {
        for (let i = 0; i < parsed.length; i += 1) {
            const entry = parsed[i];
            if (typeof entry === "string") {
                const detailed = parseNodeUriDetailed(entry);
                if (detailed.node) nodes.push(detailed.node);
                if (detailed.issue) issues.push(detailed.issue);
                continue;
            }
            if (entry && typeof entry === "object") {
                collectFromObject(entry as Record<string, unknown>);
            }
        }
    } else if (parsed && typeof parsed === "object") {
        collectFromObject(parsed as Record<string, unknown>);
    }

    if (nodes.length === 0 && issues.length === 0) {
        issues.push("JSON распознан, но поддерживаемых узлов не найдено.");
    }

    return { matched: true, nodes, issues };
}
