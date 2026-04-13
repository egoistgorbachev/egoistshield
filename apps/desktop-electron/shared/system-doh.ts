import {
	normalizeCustomDnsUrl,
	parseCustomDnsUrl,
} from "./secure-dns";

export const SYSTEM_DOH_LOCAL_PORT = 53;
export const SYSTEM_DOH_DEFAULT_LOCAL_ADDRESS = "127.0.0.2";

function isIpv4Octet(value: string): boolean {
	const parsed = Number.parseInt(value, 10);
	return Number.isInteger(parsed) && parsed >= 0 && parsed <= 255;
}

function isLoopbackAddress(value: string): boolean {
	const parts = value.split(".");
	if (parts.length !== 4 || parts[0] !== "127") {
		return false;
	}

	return parts.every(isIpv4Octet);
}

function wrapIpv6Host(value: string): string {
	return value.includes(":") && !value.startsWith("[") ? `[${value}]` : value;
}

export function normalizeSystemDohUrl(value: unknown, fallback = ""): string {
	return normalizeCustomDnsUrl(value, fallback);
}

export function parseSystemDohUrl(rawInput: string) {
	return parseCustomDnsUrl(rawInput);
}

export function normalizeSystemDohLocalAddress(
	value: unknown,
	fallback = "",
): string {
	if (typeof value !== "string") {
		return fallback;
	}

	const trimmed = value.trim();
	if (!trimmed) {
		return fallback;
	}

	return isLoopbackAddress(trimmed) ? trimmed : fallback;
}

export function buildSystemDohLoopbackCandidates(
	preferredAddress?: string | null,
): string[] {
	const candidates: string[] = [];
	const preferred = normalizeSystemDohLocalAddress(preferredAddress, "");

	if (preferred && preferred !== "127.0.0.1") {
		candidates.push(preferred);
	}

	for (let index = 2; index <= 15; index += 1) {
		const candidate = `127.0.0.${index}`;
		if (!candidates.includes(candidate)) {
			candidates.push(candidate);
		}
	}

	return candidates;
}

export function buildXrayLocalDohServerUrl(rawInput: string): string {
	const parsed = parseSystemDohUrl(rawInput);
	const wrappedHost = wrapIpv6Host(parsed.server);
	const portSegment = parsed.serverPort === 443 ? "" : `:${parsed.serverPort}`;

	return `https+local://${wrappedHost}${portSegment}${parsed.path}`;
}
