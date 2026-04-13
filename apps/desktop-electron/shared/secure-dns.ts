import { isValidIpLiteral } from "./system-dns";

export type EffectiveDnsMode = "auto" | "secure" | "custom";

export interface SecureDnsStateLike {
	fakeDns: boolean;
	customDnsUrl?: string | null;
}

export interface ParsedCustomDnsUrl {
	url: string;
	server: string;
	serverPort: number;
	path: string;
	hostnameRequiresResolver: boolean;
}

function unwrapBracketedHost(value: string): string {
	if (value.startsWith("[") && value.endsWith("]")) {
		return value.slice(1, -1);
	}

	return value;
}

export function normalizeCustomDnsUrl(value: unknown, fallback = ""): string {
	if (typeof value !== "string") {
		return fallback;
	}

	const trimmed = value.trim();
	return trimmed || fallback;
}

export function isSecureDnsEnabledMode(
	value: string | null | undefined,
): boolean {
	return value === "secure" || value === "custom";
}

export function getEffectiveDnsMode(
	options: SecureDnsStateLike,
): EffectiveDnsMode {
	if (!options.fakeDns) {
		return "auto";
	}

	return normalizeCustomDnsUrl(options.customDnsUrl, "").length > 0
		? "custom"
		: "secure";
}

export function createSecureDnsContextProfile(
	options: SecureDnsStateLike,
): string {
	if (!options.fakeDns) {
		return "auto-dns";
	}

	const customDnsUrl = normalizeCustomDnsUrl(options.customDnsUrl, "");
	if (!customDnsUrl) {
		return "secure-dns";
	}

	return `custom-dns:${encodeURIComponent(customDnsUrl)}`;
}

export function parseCustomDnsUrl(rawInput: string): ParsedCustomDnsUrl {
	const input = normalizeCustomDnsUrl(rawInput, "");
	if (!input) {
		throw new Error("Укажите DoH URL.");
	}

	let parsed: URL;
	try {
		parsed = new URL(input);
	} catch {
		throw new Error("Некорректный URL защищённого DNS.");
	}

	if (parsed.protocol !== "https:") {
		throw new Error(
			"Сейчас поддерживаются только DoH URL вида https://host[:port]/dns-query.",
		);
	}

	if (!parsed.hostname) {
		throw new Error("В DoH URL отсутствует хост.");
	}

	if (parsed.username || parsed.password) {
		throw new Error("DoH URL с логином или паролем не поддерживается.");
	}

	const server = unwrapBracketedHost(parsed.hostname);
	const serverPort = parsed.port ? Number.parseInt(parsed.port, 10) : 443;
	if (!Number.isInteger(serverPort) || serverPort < 1 || serverPort > 65535) {
		throw new Error("Некорректный порт в DoH URL.");
	}

	const normalizedPath =
		parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "/dns-query";
	const path = `${normalizedPath}${parsed.search}`;
	const url = `${parsed.protocol}//${parsed.host}${path}`;

	return {
		url,
		server,
		serverPort,
		path,
		hostnameRequiresResolver: !isValidIpLiteral(server),
	};
}
