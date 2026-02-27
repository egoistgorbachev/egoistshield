/**
 * Парсер Clash YAML подписок и Clash-формата прокси.
 */
import { parse as parseYaml } from "yaml";
import type { VpnNode } from "../contracts";
import {
    toStringSafe,
    toNumberSafe,
    buildNode,
    isUnsupportedEndpoint,
    buildUnsupportedEndpointIssue,
    buildVlessUri,
    buildVmessUriFromMetadata,
    CLASH_YAML_HINT_PATTERN,
} from "./parser-utils";

export function parseClashProxy(proxy: Record<string, unknown>): { node: VpnNode | null; issue: string | null } {
    const rawType = toStringSafe(proxy.type).trim().toLowerCase();
    const name = toStringSafe(proxy.name).trim() || "Без имени";
    const server = toStringSafe(proxy.server).trim();
    const port = toNumberSafe(proxy.port, NaN);

    if (!rawType) {
        return { node: null, issue: `Запись прокси без поля type (${name}).` };
    }

    if (!server || Number.isNaN(port) || port <= 0) {
        return { node: null, issue: `Прокси ${name}: некорректный server/port.` };
    }

    if (isUnsupportedEndpoint(name, server, port)) {
        return { node: null, issue: buildUnsupportedEndpointIssue(name, server, port) };
    }

    if (rawType === "vless") {
        const uuid = toStringSafe(proxy.uuid).trim();
        if (!uuid) {
            return { node: null, issue: `Прокси ${name}: для VLESS отсутствует uuid.` };
        }

        const metadata: Record<string, string> = {
            id: uuid,
            type: toStringSafe(proxy.network).trim() || "tcp"
        };

        const tls = proxy.tls === true;
        const sni = toStringSafe(proxy.servername).trim() || toStringSafe(proxy.sni).trim();
        if (tls) {
            metadata.security = "tls";
        } else {
            metadata.security = "none";
        }
        if (sni) {
            metadata.sni = sni;
        }

        const fp = toStringSafe(proxy["client-fingerprint"]).trim();
        if (fp) {
            metadata.fp = fp;
        }

        const flow = toStringSafe(proxy.flow).trim();
        if (flow) {
            metadata.flow = flow;
        }

        if (proxy["reality-opts"] && typeof proxy["reality-opts"] === "object") {
            const reality = proxy["reality-opts"] as Record<string, unknown>;
            const pbk = toStringSafe(reality["public-key"]).trim();
            const sid = toStringSafe(reality["short-id"]).trim();
            metadata.security = "reality";
            if (pbk) metadata.pbk = pbk;
            if (sid) metadata.sid = sid;
        }

        if (proxy["ws-opts"] && typeof proxy["ws-opts"] === "object") {
            const ws = proxy["ws-opts"] as Record<string, unknown>;
            const path = toStringSafe(ws.path).trim();
            if (path) metadata.path = path;
            if (ws.headers && typeof ws.headers === "object") {
                const headers = ws.headers as Record<string, unknown>;
                const host = toStringSafe(headers.Host).trim() || toStringSafe(headers.host).trim();
                if (host) metadata.host = host;
            }
        }

        const uri = buildVlessUri(server, port, name, metadata);
        return { node: buildNode("vless", name, server, port, uri, metadata), issue: null };
    }

    if (rawType === "vmess") {
        const uuid = toStringSafe(proxy.uuid).trim();
        if (!uuid) {
            return { node: null, issue: `Прокси ${name}: для VMESS отсутствует uuid.` };
        }

        const metadata: Record<string, string> = {
            v: "2",
            ps: name,
            add: server,
            port: String(port),
            id: uuid,
            aid: String(toNumberSafe(proxy.alterId, 0)),
            net: toStringSafe(proxy.network).trim() || "tcp",
            scy: toStringSafe(proxy.cipher).trim() || "auto"
        };

        if (proxy.tls === true) {
            metadata.tls = "tls";
        }

        const sni = toStringSafe(proxy.servername).trim() || toStringSafe(proxy.sni).trim();
        if (sni) {
            metadata.sni = sni;
        }

        const uri = `vmess://${Buffer.from(JSON.stringify(metadata), "utf8").toString("base64")}`;
        return { node: buildNode("vmess", name, server, port, uri, metadata), issue: null };
    }

    if (rawType === "trojan") {
        const password = toStringSafe(proxy.password).trim();
        if (!password) {
            return { node: null, issue: `Прокси ${name}: для Trojan отсутствует password.` };
        }

        const metadata: Record<string, string> = { password };
        const sni = toStringSafe(proxy.servername).trim() || toStringSafe(proxy.sni).trim();
        if (sni) metadata.sni = sni;

        const network = toStringSafe(proxy.network).trim();
        if (network) metadata.type = network;

        const params = new URLSearchParams();
        if (metadata.sni) params.set("sni", metadata.sni);
        if (metadata.type) params.set("type", metadata.type);
        const encodedName = encodeURIComponent(name);
        const uri = `trojan://${encodeURIComponent(password)}@${server}:${port}${params.size > 0 ? `?${params.toString()}` : ""}#${encodedName}`;

        return { node: buildNode("trojan", name, server, port, uri, metadata), issue: null };
    }

    if (rawType === "ss" || rawType === "shadowsocks") {
        const method = toStringSafe(proxy.cipher).trim();
        const password = toStringSafe(proxy.password).trim();
        if (!method || !password) {
            return { node: null, issue: `Прокси ${name}: для Shadowsocks отсутствует cipher/password.` };
        }

        const plain = `${method}:${password}@${server}:${port}`;
        const encoded = Buffer.from(plain, "utf8").toString("base64");
        const uri = `ss://${encoded}#${encodeURIComponent(name)}`;
        return { node: buildNode("shadowsocks", name, server, port, uri, { method, password }), issue: null };
    }

    if (rawType === "socks5" || rawType === "socks") {
        const metadata: Record<string, string> = {};
        const username = toStringSafe(proxy.username).trim();
        const password = toStringSafe(proxy.password).trim();
        if (username) metadata.username = username;
        if (password) metadata.password = password;
        const auth = username ? `${encodeURIComponent(username)}${password ? `:${encodeURIComponent(password)}` : ""}@` : "";
        const uri = `socks://${auth}${server}:${port}#${encodeURIComponent(name)}`;
        return { node: buildNode("socks", name, server, port, uri, metadata), issue: null };
    }

    if (rawType === "http") {
        const metadata: Record<string, string> = {};
        const username = toStringSafe(proxy.username).trim();
        const password = toStringSafe(proxy.password).trim();
        const tls = proxy.tls === true;
        if (username) metadata.username = username;
        if (password) metadata.password = password;
        metadata.tls = tls ? "true" : "false";
        const auth = username ? `${encodeURIComponent(username)}${password ? `:${encodeURIComponent(password)}` : ""}@` : "";
        const uri = `${tls ? "https" : "http"}://${auth}${server}:${port}#${encodeURIComponent(name)}`;
        return { node: buildNode("http", name, server, port, uri, metadata), issue: null };
    }

    if (rawType === "hysteria2" || rawType === "hy2") {
        const password = toStringSafe(proxy.password).trim();
        if (!password) {
            return { node: null, issue: `Прокси ${name}: для Hysteria2 отсутствует password.` };
        }

        const metadata: Record<string, string> = { password };
        const sni = toStringSafe(proxy.sni).trim() || toStringSafe(proxy.servername).trim();
        if (sni) metadata.sni = sni;
        if (proxy["skip-cert-verify"] === true || proxy.insecure === true) {
            metadata.insecure = "true";
        }
        const up = toStringSafe(proxy["up-mbps"]).trim() || toStringSafe(proxy.up).trim();
        const down = toStringSafe(proxy["down-mbps"]).trim() || toStringSafe(proxy.down).trim();
        if (up) metadata.up_mbps = up;
        if (down) metadata.down_mbps = down;
        const obfs = toStringSafe(proxy.obfs).trim();
        const obfsPassword = toStringSafe(proxy["obfs-password"]).trim();
        if (obfs) metadata.obfs = obfs;
        if (obfsPassword) metadata.obfs_password = obfsPassword;

        const params = new URLSearchParams();
        if (metadata.sni) params.set("sni", metadata.sni);
        if (metadata.insecure) params.set("insecure", metadata.insecure);
        if (metadata.up_mbps) params.set("upmbps", metadata.up_mbps);
        if (metadata.down_mbps) params.set("downmbps", metadata.down_mbps);
        if (metadata.obfs) params.set("obfs", metadata.obfs);
        if (metadata.obfs_password) params.set("obfs-password", metadata.obfs_password);
        const uri = `hysteria2://${encodeURIComponent(password)}@${server}:${port}${params.size > 0 ? `?${params.toString()}` : ""}#${encodeURIComponent(name)}`;
        return { node: buildNode("hysteria2", name, server, port, uri, metadata), issue: null };
    }

    if (rawType === "tuic") {
        const uuid = toStringSafe(proxy.uuid).trim();
        const password = toStringSafe(proxy.password).trim();
        if (!uuid || !password) {
            return { node: null, issue: `Прокси ${name}: для TUIC отсутствует uuid/password.` };
        }

        const metadata: Record<string, string> = {
            uuid,
            password
        };
        const sni = toStringSafe(proxy.sni).trim() || toStringSafe(proxy.servername).trim();
        if (sni) metadata.sni = sni;
        if (proxy["skip-cert-verify"] === true || proxy.insecure === true) {
            metadata.insecure = "true";
        }
        const cc = toStringSafe(proxy["congestion-controller"]).trim() || toStringSafe(proxy.congestion_control).trim();
        if (cc) metadata.congestion_control = cc;

        const params = new URLSearchParams();
        if (metadata.sni) params.set("sni", metadata.sni);
        if (metadata.insecure) params.set("insecure", metadata.insecure);
        if (metadata.congestion_control) params.set("congestion_control", metadata.congestion_control);
        const uri = `tuic://${encodeURIComponent(uuid)}:${encodeURIComponent(password)}@${server}:${port}${params.size > 0 ? `?${params.toString()}` : ""}#${encodeURIComponent(name)}`;
        return { node: buildNode("tuic", name, server, port, uri, metadata), issue: null };
    }

    if (rawType === "wireguard") {
        const privateKey = toStringSafe(proxy["private-key"]).trim() || toStringSafe(proxy.privateKey).trim();
        const publicKey = toStringSafe(proxy["public-key"]).trim() || toStringSafe(proxy.publicKey).trim();
        if (!privateKey || !publicKey) {
            return { node: null, issue: `Прокси ${name}: для WireGuard отсутствует private/public key.` };
        }
        const metadata: Record<string, string> = {
            private_key: privateKey,
            peer_public_key: publicKey
        };
        const address = toStringSafe(proxy.ip).trim() || toStringSafe(proxy.address).trim();
        if (address) metadata.local_address = address;
        const mtu = toStringSafe(proxy.mtu).trim();
        if (mtu) metadata.mtu = mtu;
        const preshared = toStringSafe(proxy["pre-shared-key"]).trim();
        if (preshared) metadata.pre_shared_key = preshared;

        const params = new URLSearchParams();
        params.set("publickey", publicKey);
        if (metadata.local_address) params.set("address", metadata.local_address);
        if (metadata.mtu) params.set("mtu", metadata.mtu);
        if (metadata.pre_shared_key) params.set("presharedkey", metadata.pre_shared_key);
        const uri = `wireguard://${encodeURIComponent(privateKey)}@${server}:${port}?${params.toString()}#${encodeURIComponent(name)}`;
        return { node: buildNode("wireguard", name, server, port, uri, metadata), issue: null };
    }

    return { node: null, issue: `Неподдерживаемый тип прокси в YAML: ${rawType} (${name}).` };
}

export function parseNodesFromClashYaml(payload: string): { matched: boolean; nodes: VpnNode[]; issues: string[] } {
    if (!CLASH_YAML_HINT_PATTERN.test(payload)) {
        return { matched: false, nodes: [], issues: [] };
    }

    try {
        const parsed = parseYaml(payload) as Record<string, unknown> | null;
        if (!parsed || typeof parsed !== "object") {
            return { matched: true, nodes: [], issues: ["YAML подписка пустая или повреждена."] };
        }

        const proxies = parsed.proxies;
        if (!Array.isArray(proxies)) {
            return {
                matched: true,
                nodes: [],
                issues: ["YAML подписка не содержит секцию proxies (или она пустая)."]
            };
        }

        const nodes: VpnNode[] = [];
        const issues: string[] = [];

        for (const entry of proxies) {
            if (!entry || typeof entry !== "object") {
                issues.push("Секция proxies содержит некорректную запись.");
                continue;
            }

            const { node, issue } = parseClashProxy(entry as Record<string, unknown>);
            if (node) {
                nodes.push(node);
            }
            if (issue) {
                issues.push(issue);
            }
        }

        return { matched: true, nodes, issues };
    } catch (error) {
        return { matched: true, nodes: [], issues: [`Ошибка чтения YAML подписки: ${String(error)}`] };
    }
}
