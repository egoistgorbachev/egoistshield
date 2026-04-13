import type { StateCreator } from "zustand";
/**
 * Servers Slice — Серверы, пинг, CRUD, подписки, Smart Connect orchestration
 */
import type {
	DiagnosticResult,
	RuntimeFailureReason,
	RuntimeKind,
	RuntimeLifecycle,
	RuntimeStatus,
} from "../../../../electron/ipc/contracts";
import {
	isSecureDnsEnabledMode,
	normalizeCustomDnsUrl,
} from "../../../../shared/secure-dns";
import {
	normalizeSystemDohLocalAddress,
	normalizeSystemDohUrl,
} from "../../../../shared/system-doh";
import { getAPI } from "../../lib/api";
import { detectCountry } from "../../lib/country-detector";
import {
	type QualityCacheEntry,
	createQualityContextKey,
	restoreQualityFromCache,
	upsertQualityCache,
} from "../../lib/quality-cache";
import {
	SMART_CONNECT_CANDIDATE_LIMIT,
	SMART_CONNECT_PROBE_BUDGET,
	SMART_CONNECT_TIMEOUT_MS,
	SMART_HEALTH_DEGRADATION_JITTER_MS,
	SMART_HEALTH_DEGRADATION_LOSS_PERCENT,
	type SmartCandidateHealth,
	type SmartSwitchTracker,
	appendRecentSample,
	computeAdaptiveProbeBudget,
	computeCooldownUntil,
	createSmartSwitchTracker,
	finalizeConnectionCandidates,
	mergeSmartCandidates,
	planAutoSwitch,
	planInitialConnection,
	toSmartCandidate,
} from "../../lib/smart-connect";
import type { ConnectionMode } from "./connection-slice";
import type { SettingsSlice } from "./settings-slice";

export interface ServerConfig {
	id: string;
	name: string;
	protocol: string;
	ping: number;
	load: number | null;
	countryCode: string;
	countryName?: string;
	recommended?: boolean;
	pinned?: boolean;
	security?: string;
	premium?: boolean;
	_host?: string;
	_port?: number;
	lastPingAt?: number | null;
	jitterMs?: number | null;
	lossPercent?: number | null;
	connectTimeMs?: number | null;
	timeToFirstByteMs?: number | null;
	successRate?: number | null;
	failureCount?: number | null;
	lastFailureAt?: number | null;
	lastFailureReason?: RuntimeFailureReason | null;
	cooldownUntil?: number | null;
	preferredRuntimeKind?: RuntimeKind | null;
	lastSuccessfulAt?: number | null;
	stabilityScore?: number | null;
	probeConfidence?: number | null;
	runtimePenaltyUntil?: number | null;
	runtimePenaltyKind?: RuntimeKind | null;
	recentPingSamples?: number[] | null;
	recentQualitySamples?: number[] | null;
	degradationCount?: number | null;
	qualityCache?: QualityCacheEntry[] | null;
}

export interface SubscriptionConfig {
	id: string;
	url: string;
	name?: string | null;
	enabled: boolean;
	lastUpdated: string | null;
	upload?: number;
	download?: number;
	total?: number;
	expire?: number;
}

type PingableServer = ServerConfig & { _host: string; _port: number };
type GeoIpServer = ServerConfig & { _host: string };
type PingProbeResult = { id: string; ping: number; checkedAt: number };
type SmartMonitorTrigger = "timer" | "degraded";

const DEFAULT_STABILITY_SCORE = 50;
const DEFAULT_PROBE_CONFIDENCE = 0.35;
const PARTIAL_REENTRY_COOLDOWN_MS = 20_000;
const SMART_MONITOR_FAST_DELAY_MS = 3_000;
const SMART_MONITOR_WARM_DELAY_MS = 10_000;
const SMART_MONITOR_INTERVAL_MS = 30_000;
const DEFAULT_CONNECTED_BACKGROUND_SAMPLE = 2;
const DEFAULT_IDLE_BACKGROUND_SAMPLE = 4;

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function normalizeSuccessRate(value: number | null | undefined): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return 0.5;
	}

	return clamp(value > 1 ? value / 100 : value, 0, 1);
}

function normalizeScore(
	value: number | null | undefined,
	fallback: number,
): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return fallback;
	}

	return value;
}

function nextProbeConfidence(
	previous: number | null | undefined,
	outcome: "success" | "failure" | "boost",
): number {
	const baseConfidence = clamp(
		normalizeScore(previous, DEFAULT_PROBE_CONFIDENCE),
		0.05,
		1,
	);
	if (outcome === "boost") {
		return clamp(baseConfidence + 0.18, 0.05, 1);
	}

	if (outcome === "success") {
		return clamp(baseConfidence + 0.12, 0.05, 1);
	}

	return clamp(baseConfidence - 0.18, 0.05, 1);
}

function computeQualityScore(metrics: {
	ping: number;
	jitterMs?: number | null;
	lossPercent?: number | null;
	connectTimeMs?: number | null;
	timeToFirstByteMs?: number | null;
}): number {
	const latencyPenalty = Math.min(55, Math.max(0, metrics.ping) * 0.32);
	const jitterPenalty = normalizeScore(metrics.jitterMs, 0) * 0.8;
	const lossPenalty = normalizeScore(metrics.lossPercent, 0) * 7;
	const connectPenalty = normalizeScore(metrics.connectTimeMs, 0) * 0.08;
	const handshakePenalty = normalizeScore(metrics.timeToFirstByteMs, 0) * 0.05;
	return Math.round(
		clamp(
			100 -
				latencyPenalty -
				jitterPenalty -
				lossPenalty -
				connectPenalty -
				handshakePenalty,
			0,
			100,
		),
	);
}

function computeStabilityScore(
	server: Partial<ServerConfig>,
	qualityScore: number,
	successRate: number | null | undefined,
	degradationCount: number | null | undefined,
): number {
	const previousScore = clamp(
		normalizeScore(server.stabilityScore, DEFAULT_STABILITY_SCORE),
		0,
		100,
	);
	const normalizedSuccessRate = normalizeSuccessRate(successRate);
	const degradationPenalty = Math.min(
		18,
		normalizeScore(degradationCount, 0) * 4,
	);
	const targetScore = clamp(
		qualityScore * 0.62 + normalizedSuccessRate * 38 - degradationPenalty,
		0,
		100,
	);
	return Math.round(previousScore * 0.45 + targetScore * 0.55);
}

function reduceCooldownAfterSuccessfulProbe(
	cooldownUntil: number | null | undefined,
	now: number,
): number | null {
	if (typeof cooldownUntil !== "number" || cooldownUntil <= now) {
		return null;
	}

	return Math.min(cooldownUntil, now + PARTIAL_REENTRY_COOLDOWN_MS);
}

function shouldPenalizeRuntime(reason: RuntimeFailureReason | null): boolean {
	return (
		reason === "runtime_crashed" ||
		reason === "runtime_start_failed" ||
		reason === "runtime_port_unreachable" ||
		reason === "quic_blocked" ||
		reason === "tls_handshake_failed"
	);
}

function decayDegradationCount(value: number | null | undefined): number {
	return Math.max(0, Math.round(normalizeScore(value, 0) * 0.6));
}

function getFallbackSourceRuntime(status: RuntimeStatus): RuntimeKind | null {
	if (
		!status.diagnostic.fallbackAttempted ||
		!status.diagnostic.fallbackTarget
	) {
		return null;
	}

	return status.diagnostic.fallbackTarget === "xray" ? "sing-box" : "xray";
}

function clearRecoveredRuntimePenalty(
	server: ServerConfig,
	runtimeKind: RuntimeKind | null,
	now: number,
): Pick<ServerConfig, "runtimePenaltyKind" | "runtimePenaltyUntil"> {
	if (runtimeKind && server.runtimePenaltyKind === runtimeKind) {
		return {
			runtimePenaltyKind: null,
			runtimePenaltyUntil: null,
		};
	}

	if (
		typeof server.runtimePenaltyUntil === "number" &&
		server.runtimePenaltyUntil <= now
	) {
		return {
			runtimePenaltyKind: null,
			runtimePenaltyUntil: null,
		};
	}

	return {
		runtimePenaltyKind: server.runtimePenaltyKind ?? null,
		runtimePenaltyUntil: server.runtimePenaltyUntil ?? null,
	};
}

function getQualityContextForState(options: {
	fakeDns: boolean;
	customDnsUrl: string;
	systemDnsServers: string;
	killSwitch: boolean;
}): string {
	return createQualityContextKey(options);
}

function restoreServersForQualityContext(
	servers: ServerConfig[],
	qualityContextKey: string,
	now = Date.now(),
): ServerConfig[] {
	return servers.map((server) =>
		restoreQualityFromCache(server, qualityContextKey, now),
	);
}

function persistServerQualitySnapshots(
	servers: ServerConfig[],
	qualityContextKey: string,
	touchedServerIds: readonly string[],
	now = Date.now(),
): ServerConfig[] {
	const touchedIds = new Set(touchedServerIds);
	if (touchedIds.size === 0) {
		return servers;
	}

	return servers.map((server) =>
		touchedIds.has(server.id)
			? upsertQualityCache(server, qualityContextKey, now)
			: server,
	);
}

function isPingableServer(server: ServerConfig): server is PingableServer {
	return (
		typeof server._host === "string" &&
		server._host.length > 0 &&
		typeof server._port === "number"
	);
}

function isGeoIpServer(server: ServerConfig): server is GeoIpServer {
	return typeof server._host === "string" && server._host.length > 0;
}

function dedupePingTargets(servers: PingableServer[]): PingableServer[] {
	const deduped = new Map<string, PingableServer>();
	for (const server of servers) {
		if (!deduped.has(server.id)) {
			deduped.set(server.id, server);
		}
	}

	return [...deduped.values()];
}

function getRotatedServers(
	servers: PingableServer[],
	offset: number,
): PingableServer[] {
	if (servers.length === 0) {
		return [];
	}

	const normalizedOffset =
		((offset % servers.length) + servers.length) % servers.length;
	return [
		...servers.slice(normalizedOffset),
		...servers.slice(0, normalizedOffset),
	];
}

export function selectServersForPingSweep(
	servers: PingableServer[],
	options: {
		activeOnly?: boolean;
		connectionMode: ConnectionMode;
		isConnected: boolean;
		selectedServerId: string;
		connectedServerId: string;
		sweepOffset: number;
		smartProbeBudget: number;
		now: number;
	},
): { targets: PingableServer[]; nextOffset: number } {
	const activeServerId = options.connectedServerId || options.selectedServerId;
	const activeServer = servers.find((server) => server.id === activeServerId);
	const remainingServers = servers.filter(
		(server) => server.id !== activeServerId,
	);

	if (options.activeOnly) {
		return {
			targets: activeServer ? [activeServer] : [],
			nextOffset: options.sweepOffset,
		};
	}

	if (options.connectionMode === "smart" && options.isConnected) {
		const probePlan = planInitialConnection(servers.map(toSmartCandidate), {
			excludeId: activeServer?.id,
			now: options.now,
			limit: SMART_CONNECT_CANDIDATE_LIMIT,
			probeBudget: options.smartProbeBudget,
		});
		const probeTargets = probePlan.probeCandidates
			.map((candidate) => servers.find((server) => server.id === candidate.id))
			.filter((server): server is PingableServer => !!server);

		return {
			targets: dedupePingTargets(
				activeServer ? [activeServer, ...probeTargets] : probeTargets,
			),
			nextOffset: options.sweepOffset,
		};
	}

	const sampleSize = options.isConnected
		? DEFAULT_CONNECTED_BACKGROUND_SAMPLE
		: DEFAULT_IDLE_BACKGROUND_SAMPLE;
	const rotatedServers = getRotatedServers(
		remainingServers,
		options.sweepOffset,
	);
	const sampledServers = rotatedServers.slice(
		0,
		Math.min(sampleSize, rotatedServers.length),
	);

	return {
		targets: dedupePingTargets(
			activeServer ? [activeServer, ...sampledServers] : sampledServers,
		),
		nextOffset:
			remainingServers.length > 0
				? (options.sweepOffset + Math.max(1, sampledServers.length)) %
					remainingServers.length
				: 0,
	};
}

async function pingServers(
	servers: PingableServer[],
	timeoutMs: number,
	batchSize: number,
): Promise<PingProbeResult[]> {
	const api = getAPI();
	if (!api || servers.length === 0) {
		return [];
	}

	const results: PingProbeResult[] = [];

	for (let index = 0; index < servers.length; index += batchSize) {
		const chunk = servers.slice(index, index + batchSize);
		const chunkResults = await Promise.all(
			chunk.map(async (server) => {
				try {
					const ping = await api.system.ping(
						server._host,
						server._port,
						timeoutMs,
					);
					return { id: server.id, ping, checkedAt: Date.now() };
				} catch {
					return { id: server.id, ping: -1, checkedAt: Date.now() };
				}
			}),
		);

		results.push(...chunkResults);
	}

	return results;
}

function createConnectTimeoutStatus(): RuntimeStatus {
	return {
		connected: false,
		isMock: false,
		pid: null,
		startedAt: null,
		activeNodeId: null,
		lastError: "Превышено время ожидания ответа от VPN-ядра. Попробуйте снова.",
		isAdmin: false,
		resolvedRuntimePath: null,
		runtimeKind: null,
		processRulesApplied: false,
		proxyPort: null,
		lifecycle: "failed",
		diagnostic: {
			reason: "tcp_timeout",
			details: "Превышено время ожидания ответа от VPN-ядра. Попробуйте снова.",
			updatedAt: new Date().toISOString(),
			fallbackAttempted: false,
			fallbackTarget: null,
		},
	};
}

async function connectWithTimeout(nodeId: string): Promise<RuntimeStatus> {
	const api = getAPI();
	if (!api) {
		throw new Error("Бэкенд не доступен.");
	}

	const connectPromise = api.vpn.connect(nodeId);
	const timeoutPromise = new Promise<RuntimeStatus>((resolve) =>
		setTimeout(() => resolve(createConnectTimeoutStatus()), 15_000),
	);

	return Promise.race([connectPromise, timeoutPromise]);
}

function createMeasuredCandidate(
	server: ServerConfig | undefined,
	result: PingProbeResult,
): SmartCandidateHealth {
	return {
		...toSmartCandidate(server ?? { id: result.id, ping: result.ping }),
		ping: result.ping,
		checkedAt: result.checkedAt,
	};
}

function applyPingProbeResults(
	servers: ServerConfig[],
	probeResults: PingProbeResult[],
): ServerConfig[] {
	const resultMap = new Map(probeResults.map((result) => [result.id, result]));

	return servers.map((server) => {
		const result = resultMap.get(server.id);
		if (!result) {
			return server;
		}

		const probeSucceeded = result.ping > 0;
		const nextPing = probeSucceeded ? result.ping : 0;
		const qualityScore = computeQualityScore({
			ping: probeSucceeded ? result.ping : Math.max(server.ping, 250),
			jitterMs: server.jitterMs,
			lossPercent: server.lossPercent,
			connectTimeMs: server.connectTimeMs,
			timeToFirstByteMs: server.timeToFirstByteMs,
		});

		return {
			...server,
			ping: nextPing,
			lastPingAt: result.checkedAt,
			stabilityScore: probeSucceeded
				? computeStabilityScore(
						server,
						qualityScore,
						server.successRate,
						server.degradationCount,
					)
				: Math.max(
						0,
						computeStabilityScore(
							server,
							qualityScore,
							server.successRate,
							server.degradationCount,
						) - 10,
					),
			probeConfidence: nextProbeConfidence(
				server.probeConfidence,
				probeSucceeded ? "success" : "failure",
			),
			recentPingSamples: probeSucceeded
				? appendRecentSample(server.recentPingSamples ?? null, result.ping)
				: (server.recentPingSamples ?? null),
			recentQualitySamples: appendRecentSample(
				server.recentQualitySamples ?? null,
				qualityScore,
			),
			cooldownUntil: probeSucceeded
				? reduceCooldownAfterSuccessfulProbe(
						server.cooldownUntil,
						result.checkedAt,
					)
				: (server.cooldownUntil ?? null),
		};
	});
}

function getExistingServerHealth(
	server: ServerConfig | undefined,
): Partial<ServerConfig> {
	if (!server) {
		return {};
	}

	return {
		ping: server.ping,
		lastPingAt: server.lastPingAt ?? null,
		jitterMs: server.jitterMs ?? null,
		lossPercent: server.lossPercent ?? null,
		connectTimeMs: server.connectTimeMs ?? null,
		timeToFirstByteMs: server.timeToFirstByteMs ?? null,
		successRate: server.successRate ?? null,
		failureCount: server.failureCount ?? null,
		lastFailureAt: server.lastFailureAt ?? null,
		lastFailureReason: server.lastFailureReason ?? null,
		cooldownUntil: server.cooldownUntil ?? null,
		preferredRuntimeKind: server.preferredRuntimeKind ?? null,
		lastSuccessfulAt: server.lastSuccessfulAt ?? null,
		stabilityScore: server.stabilityScore ?? null,
		probeConfidence: server.probeConfidence ?? null,
		runtimePenaltyUntil: server.runtimePenaltyUntil ?? null,
		runtimePenaltyKind: server.runtimePenaltyKind ?? null,
		recentPingSamples: server.recentPingSamples ?? null,
		recentQualitySamples: server.recentQualitySamples ?? null,
		degradationCount: server.degradationCount ?? null,
		qualityCache: server.qualityCache ?? null,
	};
}

function shouldRegisterFailure(
	server: ServerConfig,
	reason: RuntimeFailureReason | null,
	now: number,
): boolean {
	if (!reason) {
		return false;
	}

	if (server.lastFailureReason !== reason) {
		return true;
	}

	return (
		typeof server.lastFailureAt !== "number" ||
		now - server.lastFailureAt > 45_000
	);
}

function updateFailureState(
	server: ServerConfig,
	reason: RuntimeFailureReason | null,
	now: number,
	nextSuccessRate: number,
	connectTimeMs?: number,
	runtimeKind?: RuntimeKind | null,
	degradationIncrement = 0,
): ServerConfig {
	const failureReason = reason ?? "unknown";
	const registeredFailure = shouldRegisterFailure(server, failureReason, now);
	const nextFailureCount = registeredFailure
		? (server.failureCount ?? 0) + 1
		: (server.failureCount ?? 0);
	const qualityScore = computeQualityScore({
		ping: server.ping > 0 ? server.ping : 250,
		jitterMs: server.jitterMs,
		lossPercent: server.lossPercent,
		connectTimeMs: connectTimeMs ?? server.connectTimeMs,
		timeToFirstByteMs: server.timeToFirstByteMs,
	});
	const nextDegradationCount =
		(server.degradationCount ?? 0) + degradationIncrement + 1;
	const applyRuntimePenalty =
		shouldPenalizeRuntime(failureReason) &&
		runtimeKind !== null &&
		runtimeKind !== undefined;
	const runtimePenaltyUntil = applyRuntimePenalty
		? computeCooldownUntil(
				Math.max(1, nextFailureCount),
				failureReason,
				server.protocol,
				now,
			)
		: (server.runtimePenaltyUntil ?? null);

	return {
		...server,
		connectTimeMs: connectTimeMs ?? server.connectTimeMs ?? null,
		timeToFirstByteMs: connectTimeMs ?? server.timeToFirstByteMs ?? null,
		successRate: nextSuccessRate,
		failureCount: nextFailureCount,
		lastFailureAt: now,
		lastFailureReason: failureReason,
		cooldownUntil: computeCooldownUntil(
			Math.max(1, nextFailureCount),
			failureReason,
			server.protocol,
			now,
		),
		stabilityScore: Math.max(
			0,
			computeStabilityScore(
				server,
				Math.max(0, qualityScore - 18),
				nextSuccessRate,
				nextDegradationCount,
			) - 6,
		),
		probeConfidence: nextProbeConfidence(server.probeConfidence, "failure"),
		recentQualitySamples: appendRecentSample(
			server.recentQualitySamples ?? null,
			Math.max(0, qualityScore - 24),
		),
		runtimePenaltyKind: applyRuntimePenalty
			? runtimeKind
			: (server.runtimePenaltyKind ?? null),
		runtimePenaltyUntil,
		degradationCount: nextDegradationCount,
	};
}

function applyConnectionOutcome(
	servers: ServerConfig[],
	serverId: string,
	status: RuntimeStatus,
	connectTimeMs: number,
	now: number,
): ServerConfig[] {
	return servers.map((server) => {
		if (server.id !== serverId) {
			return server;
		}

		const currentSuccessRate = server.successRate ?? 1;
		const qualityScore = computeQualityScore({
			ping: server.ping > 0 ? server.ping : 200,
			jitterMs: server.jitterMs,
			lossPercent: server.lossPercent,
			connectTimeMs,
			timeToFirstByteMs: connectTimeMs,
		});
		if (status.connected && status.activeNodeId === serverId) {
			const nextSuccessRate = Math.min(1, currentSuccessRate * 0.8 + 0.2);
			const fallbackSourceRuntime = getFallbackSourceRuntime(status);
			const runtimePenalty =
				fallbackSourceRuntime !== null
					? {
							runtimePenaltyKind: fallbackSourceRuntime,
							runtimePenaltyUntil: computeCooldownUntil(
								Math.max(1, server.failureCount ?? 1),
								"runtime_crashed",
								server.protocol,
								now,
							),
						}
					: clearRecoveredRuntimePenalty(
							server,
							status.runtimeKind ?? null,
							now,
						);
			return {
				...server,
				connectTimeMs,
				timeToFirstByteMs: connectTimeMs,
				successRate: nextSuccessRate,
				failureCount: Math.max(0, (server.failureCount ?? 0) - 1),
				preferredRuntimeKind:
					status.diagnostic.fallbackTarget ??
					status.runtimeKind ??
					server.preferredRuntimeKind ??
					null,
				lastSuccessfulAt: now,
				stabilityScore: computeStabilityScore(
					server,
					qualityScore,
					nextSuccessRate,
					decayDegradationCount(server.degradationCount),
				),
				probeConfidence: nextProbeConfidence(server.probeConfidence, "boost"),
				recentQualitySamples: appendRecentSample(
					server.recentQualitySamples ?? null,
					qualityScore,
				),
				recentPingSamples:
					server.ping > 0
						? appendRecentSample(server.recentPingSamples ?? null, server.ping)
						: (server.recentPingSamples ?? null),
				degradationCount: decayDegradationCount(server.degradationCount),
				cooldownUntil:
					status.lifecycle === "active" && !status.diagnostic.reason
						? null
						: (server.cooldownUntil ?? null),
				lastFailureReason:
					status.lifecycle === "active" && !status.diagnostic.reason
						? null
						: (server.lastFailureReason ?? null),
				lastFailureAt:
					status.lifecycle === "active" && !status.diagnostic.reason
						? null
						: (server.lastFailureAt ?? null),
				...runtimePenalty,
			};
		}

		return updateFailureState(
			server,
			status.diagnostic.reason,
			now,
			Math.max(0, currentSuccessRate * 0.7),
			connectTimeMs,
			status.runtimeKind ?? null,
		);
	});
}

function applyRuntimeHealthUpdate(
	servers: ServerConfig[],
	status: RuntimeStatus,
	diagnosis: DiagnosticResult,
	now: number,
): ServerConfig[] {
	return servers.map((server) => {
		if (server.id !== status.activeNodeId) {
			return server;
		}

		const nextBase: ServerConfig = {
			...server,
			ping: diagnosis.runtimeReachable ? diagnosis.latencyMs : server.ping,
			lastPingAt: now,
			jitterMs: diagnosis.jitterMs,
			lossPercent: diagnosis.lossPercent,
			preferredRuntimeKind:
				status.runtimeKind ?? server.preferredRuntimeKind ?? null,
			recentPingSamples: diagnosis.runtimeReachable
				? appendRecentSample(
						server.recentPingSamples ?? null,
						diagnosis.latencyMs,
					)
				: (server.recentPingSamples ?? null),
		};
		const qualityScore = computeQualityScore({
			ping: diagnosis.runtimeReachable
				? diagnosis.latencyMs
				: Math.max(server.ping, 220),
			jitterMs: diagnosis.jitterMs,
			lossPercent: diagnosis.lossPercent,
			connectTimeMs: server.connectTimeMs,
			timeToFirstByteMs: server.timeToFirstByteMs,
		});

		const isStable = diagnosis.ok && status.lifecycle === "active";
		if (isStable) {
			return {
				...nextBase,
				successRate: Math.min(1, (server.successRate ?? 1) * 0.85 + 0.15),
				failureCount: Math.max(0, (server.failureCount ?? 0) - 1),
				lastSuccessfulAt: now,
				cooldownUntil: null,
				lastFailureReason: null,
				lastFailureAt: null,
				stabilityScore: computeStabilityScore(
					server,
					qualityScore,
					Math.min(1, (server.successRate ?? 1) * 0.85 + 0.15),
					decayDegradationCount(server.degradationCount),
				),
				probeConfidence: nextProbeConfidence(server.probeConfidence, "success"),
				recentQualitySamples: appendRecentSample(
					server.recentQualitySamples ?? null,
					qualityScore,
				),
				degradationCount: decayDegradationCount(server.degradationCount),
				...clearRecoveredRuntimePenalty(
					server,
					status.runtimeKind ?? null,
					now,
				),
			};
		}

		const nextSuccessRate = Math.max(0, (server.successRate ?? 1) * 0.82);
		const failureReason =
			status.diagnostic.reason ??
			diagnosis.failureReason ??
			server.lastFailureReason ??
			"unknown";
		return updateFailureState(
			nextBase,
			failureReason,
			now,
			nextSuccessRate,
			server.connectTimeMs ?? undefined,
			status.runtimeKind ?? null,
			shouldAttemptDegradedSwitch(status, diagnosis) ? 1 : 0,
		);
	});
}

function shouldAttemptDegradedSwitch(
	status: RuntimeStatus,
	diagnosis: DiagnosticResult,
): boolean {
	if (status.lifecycle === "degraded" || !diagnosis.ok) {
		return true;
	}

	return (
		diagnosis.lossPercent >= SMART_HEALTH_DEGRADATION_LOSS_PERCENT ||
		diagnosis.jitterMs >= SMART_HEALTH_DEGRADATION_JITTER_MS
	);
}

export interface ServersSlice {
	selectedServerId: string;
	servers: ServerConfig[];
	subscriptions: SubscriptionConfig[];
	_pingInterval: NodeJS.Timeout | null;
	_pingSweepOffset: number;
	_smartMonitorInterval: NodeJS.Timeout | null;
	_smartMonitorFastTimeout: NodeJS.Timeout | null;
	_smartMonitorWarmTimeout: NodeJS.Timeout | null;
	_smartSwitchTracker: SmartSwitchTracker;
	_runtimeLifecycle: RuntimeLifecycle | null;
	_runtimeFailureReason: RuntimeFailureReason | null;

	setSelectedServer: (id: string) => void;
	connectToServer: (id: string) => Promise<void>;
	addServer: (server: ServerConfig) => void;
	removeServer: (id: string) => void;
	togglePinServer: (id: string) => void;
	refreshSubscription: (url: string) => Promise<void>;
	removeSubscription: (url: string) => Promise<void>;
	renameSubscription: (url: string, newName: string) => Promise<void>;
	renameServer: (id: string, newName: string) => Promise<void>;
	refreshAllSubscriptions: () => Promise<void>;
	syncWithBackend: () => Promise<void>;
	installRuntime: () => Promise<void>;
	testAllPings: (activeOnly?: boolean) => Promise<void>;
	smartConnect: () => Promise<void>;
	startPingLoop: () => void;
	stopPingLoop: () => void;
	startSmartModeMonitoring: () => void;
	stopSmartModeMonitoring: () => void;
	evaluateSmartSwitch: (trigger?: SmartMonitorTrigger) => Promise<void>;
	recordRuntimeHealth: (
		status: RuntimeStatus,
		diagnosis: DiagnosticResult,
	) => void;
}

export const createServersSlice: StateCreator<
	ServersSlice & {
		isConnected: boolean;
		isConnecting: boolean;
		isDisconnecting: boolean;
		connectedServerId: string;
		errorMessage: string | null;
		sessionStartTime: number | null;
		sessionBytesRx: number;
		sessionBytesTx: number;
		toggleConnection: () => Promise<void>;
		connectionMode: ConnectionMode;
		activePing: number | null;
	} & Pick<
			SettingsSlice,
			| "fakeDns"
			| "killSwitch"
			| "autoUpdate"
			| "autoConnect"
			| "notifications"
			| "autoStart"
			| "systemDnsServers"
			| "customDnsUrl"
			| "systemDohEnabled"
			| "systemDohUrl"
			| "systemDohLocalAddress"
		>,
	[],
	[],
	ServersSlice
> = (set, get) => ({
	selectedServerId: "",
	servers: [],
	subscriptions: [],
	_pingInterval: null,
	_pingSweepOffset: 0,
	_smartMonitorInterval: null,
	_smartMonitorFastTimeout: null,
	_smartMonitorWarmTimeout: null,
	_smartSwitchTracker: createSmartSwitchTracker(),
	_runtimeLifecycle: null,
	_runtimeFailureReason: null,

	setSelectedServer: async (id) => {
		set({ selectedServerId: id });
	},

	connectToServer: async (id) => {
		const api = getAPI();
		if (!api) {
			set({ errorMessage: "Бэкенд не доступен." });
			return;
		}

		const startedAt = Date.now();
		const wasConnected = get().isConnected;
		set({
			selectedServerId: id,
			isConnecting: true,
			isDisconnecting: wasConnected,
			errorMessage: null,
		});

		try {
			const status = await connectWithTimeout(id);
			const finishedAt = Date.now();
			const connectTimeMs = finishedAt - startedAt;
			const stateForContext = get();
			const qualityContextKey = getQualityContextForState({
				fakeDns: stateForContext.fakeDns,
				customDnsUrl: stateForContext.customDnsUrl,
				systemDnsServers: stateForContext.systemDnsServers,
				killSwitch: stateForContext.killSwitch,
			});
			const nextServers = persistServerQualitySnapshots(
				applyConnectionOutcome(
					get().servers,
					id,
					status,
					connectTimeMs,
					finishedAt,
				),
				qualityContextKey,
				[id, status.activeNodeId ?? id],
				finishedAt,
			);

			if (status.connected && status.activeNodeId === id) {
				const nextTracker =
					get().connectionMode === "smart"
						? {
								candidateId: null,
								consecutiveWins: 0,
								lastSwitchAt: finishedAt,
							}
						: get()._smartSwitchTracker;

				set({
					isConnected: true,
					isConnecting: false,
					isDisconnecting: false,
					connectedServerId: id,
					errorMessage: status.lastError,
					sessionStartTime: Date.now(),
					sessionBytesRx: 0,
					sessionBytesTx: 0,
					servers: nextServers,
					_smartSwitchTracker: nextTracker,
					_runtimeLifecycle: status.lifecycle,
					_runtimeFailureReason: status.diagnostic.reason,
				});

				if (get().connectionMode === "smart") {
					get().startSmartModeMonitoring();
				} else {
					get().stopSmartModeMonitoring();
				}
				return;
			}

			if (status.connected && status.activeNodeId) {
				set({
					isConnected: true,
					isConnecting: false,
					isDisconnecting: false,
					connectedServerId: status.activeNodeId,
					errorMessage:
						status.lastError || "Не удалось переключиться на выбранный сервер",
					sessionStartTime: get().sessionStartTime,
					sessionBytesRx: get().sessionBytesRx,
					sessionBytesTx: get().sessionBytesTx,
					servers: nextServers,
					_runtimeLifecycle: status.lifecycle,
					_runtimeFailureReason: status.diagnostic.reason,
					_smartSwitchTracker: createSmartSwitchTracker(),
				});
				return;
			}

			set({
				isConnected: false,
				isConnecting: false,
				isDisconnecting: false,
				connectedServerId: "",
				errorMessage: status.lastError || "Ошибка подключения",
				sessionStartTime: null,
				sessionBytesRx: 0,
				sessionBytesTx: 0,
				servers: nextServers,
				_runtimeLifecycle: status.lifecycle,
				_runtimeFailureReason: status.diagnostic.reason,
				_smartSwitchTracker: createSmartSwitchTracker(),
			});
			get().stopSmartModeMonitoring();
		} catch (error: unknown) {
			const message =
				error instanceof Error ? error.message : "Ошибка подключения";
			const now = Date.now();
			const status = createConnectTimeoutStatus();
			const stateForContext = get();
			const qualityContextKey = getQualityContextForState({
				fakeDns: stateForContext.fakeDns,
				customDnsUrl: stateForContext.customDnsUrl,
				systemDnsServers: stateForContext.systemDnsServers,
				killSwitch: stateForContext.killSwitch,
			});
			const nextServers = persistServerQualitySnapshots(
				applyConnectionOutcome(get().servers, id, status, now - startedAt, now),
				qualityContextKey,
				[id],
				now,
			);

			set({
				isConnected: false,
				isConnecting: false,
				isDisconnecting: false,
				connectedServerId: "",
				errorMessage: message,
				sessionStartTime: null,
				sessionBytesRx: 0,
				sessionBytesTx: 0,
				servers: nextServers,
				_runtimeLifecycle: "failed",
				_runtimeFailureReason: "tcp_timeout",
				_smartSwitchTracker: createSmartSwitchTracker(),
			});
			get().stopSmartModeMonitoring();
		}
	},

	addServer: (server) =>
		set((state) => ({ servers: [...state.servers, server] })),

	removeServer: async (id) => {
		set((state) => ({
			servers: state.servers.filter((server) => server.id !== id),
		}));
		const api = getAPI();
		if (!api) {
			return;
		}

		const currentState = await api.state.get();
		await api.state.set({
			...currentState,
			nodes: currentState.nodes.filter((node) => node.id !== id),
			activeNodeId:
				currentState.activeNodeId === id ? null : currentState.activeNodeId,
		});

		const state = get();
		if (state.selectedServerId === id) {
			set({ selectedServerId: state.servers[0]?.id || "" });
		}
	},

	togglePinServer: async (id) => {
		set((state) => ({
			servers: state.servers.map((server) =>
				server.id === id ? { ...server, pinned: !server.pinned } : server,
			),
		}));

		const api = getAPI();
		if (!api) {
			return;
		}

		const currentState = await api.state.get();
		const updatedNodes = currentState.nodes.map((node) => {
			if (node.id === id) {
				return {
					...node,
					metadata: {
						...node.metadata,
						pinned: node.metadata?.pinned === "true" ? "false" : "true",
					},
				};
			}

			return node;
		});

		await api.state.set({ ...currentState, nodes: updatedNodes });
	},

	refreshSubscription: async (url) => {
		const api = getAPI();
		if (!api) {
			return;
		}

		await api.subscription.refreshOne(url);
		await get().syncWithBackend();
	},

	removeSubscription: async (url) => {
		const api = getAPI();
		if (!api) {
			return;
		}

		const currentState = await api.state.get();
		const subscriptionToRemove = currentState.subscriptions.find(
			(subscription) => subscription.url === url,
		);
		const subscriptionId = subscriptionToRemove?.id;
		const filteredNodes = subscriptionId
			? currentState.nodes.filter(
					(node) => node.subscriptionId !== subscriptionId,
				)
			: currentState.nodes;

		await api.state.set({
			...currentState,
			subscriptions: currentState.subscriptions.filter(
				(subscription) => subscription.url !== url,
			),
			nodes: filteredNodes,
			activeNodeId: filteredNodes.some(
				(node) => node.id === currentState.activeNodeId,
			)
				? currentState.activeNodeId
				: (filteredNodes[0]?.id ?? null),
		});

		await get().syncWithBackend();
	},

	renameSubscription: async (url, newName) => {
		set((state) => ({
			subscriptions: state.subscriptions.map((subscription) =>
				subscription.url === url
					? { ...subscription, name: newName }
					: subscription,
			),
		}));

		const api = getAPI();
		if (api) {
			await api.subscription.rename(url, newName);
		}
	},

	renameServer: async (id, newName) => {
		set((state) => ({
			servers: state.servers.map((server) =>
				server.id === id ? { ...server, name: newName } : server,
			),
		}));

		const api = getAPI();
		if (api) {
			await api.node.rename(id, newName);
		}
	},

	refreshAllSubscriptions: async () => {
		const api = getAPI();
		if (!api) {
			return;
		}

		await api.subscription.refreshAll();
		await get().syncWithBackend();
	},

	syncWithBackend: async () => {
		const api = getAPI();
		if (!api) {
			return;
		}

		const state = await api.state.get();
		const previousServers = new Map(
			get().servers.map((server) => [server.id, server]),
		);
		const mappedServers: ServerConfig[] = state.nodes.map((node) => {
			const extractedCountry = detectCountry(node.name || "");
			const rawLoad = node.metadata?.load;
			const parsedLoad = rawLoad ? Number.parseInt(rawLoad, 10) : null;
			const cachedServer = previousServers.get(node.id);

			return {
				...getExistingServerHealth(cachedServer),
				id: node.id,
				name: node.name || `${node.protocol} node`,
				protocol: node.protocol || "unknown",
				ping: cachedServer?.ping ?? 0,
				load:
					parsedLoad !== null && Number.isFinite(parsedLoad)
						? parsedLoad
						: null,
				countryCode: extractedCountry,
				recommended: false,
				pinned: node.metadata?.pinned === "true",
				security:
					node.metadata?.security || (node.metadata?.flow ? "reality" : ""),
				premium:
					node.metadata?.premium === "true" ||
					!!node.name?.toLowerCase().match(/premium|vip|pro|plus/i),
				_host: node.server,
				_port: node.port,
			};
		});
		const qualityContextKey = getQualityContextForState({
			fakeDns: isSecureDnsEnabledMode(state.settings.dnsMode),
			customDnsUrl: normalizeCustomDnsUrl(state.settings.customDnsUrl, ""),
			systemDnsServers: state.settings.systemDnsServers ?? "",
			killSwitch: state.settings.killSwitch,
		});
		const hydratedServers = restoreServersForQualityContext(
			mappedServers,
			qualityContextKey,
		);

		const currentUiSelection = get().selectedServerId;
		const uiSelectionValid =
			currentUiSelection &&
			hydratedServers.some((server) => server.id === currentUiSelection);

		set({
			servers: hydratedServers,
			subscriptions: state.subscriptions || [],
			selectedServerId: uiSelectionValid
				? currentUiSelection
				: state.activeNodeId || hydratedServers[0]?.id || "",
			fakeDns: isSecureDnsEnabledMode(state.settings.dnsMode),
			killSwitch: state.settings.killSwitch,
			autoUpdate: state.settings.autoUpdate,
			autoConnect: state.settings.autoConnect,
			notifications: state.settings.notifications,
			autoStart: state.settings.autoStart,
			systemDnsServers: state.settings.systemDnsServers ?? "",
			customDnsUrl: normalizeCustomDnsUrl(state.settings.customDnsUrl, ""),
			systemDohEnabled: state.settings.systemDohEnabled ?? false,
			systemDohUrl: normalizeSystemDohUrl(state.settings.systemDohUrl, ""),
			systemDohLocalAddress: normalizeSystemDohLocalAddress(
				state.settings.systemDohLocalAddress,
				"",
			),
		});

		get().testAllPings();
		get().startPingLoop();

		(async () => {
			const geoApi = getAPI();
			if (!geoApi?.system?.geoip) {
				return;
			}

			const unknownServers = get().servers.filter(
				(server): server is GeoIpServer =>
					server.countryCode === "un" && isGeoIpServer(server),
			);
			for (let index = 0; index < unknownServers.length; index += 5) {
				const chunk = unknownServers.slice(index, index + 5);
				const results = await Promise.allSettled(
					chunk.map(async (server) => {
						const geo = await geoApi.system.geoip(server._host);
						return {
							id: server.id,
							countryCode: geo.countryCode,
							country: geo.country,
						};
					}),
				);

				const updates = new Map<
					string,
					{ countryCode: string; country: string }
				>();
				for (const result of results) {
					if (
						result.status === "fulfilled" &&
						result.value.countryCode &&
						result.value.countryCode !== "un"
					) {
						updates.set(result.value.id, {
							countryCode: result.value.countryCode,
							country: result.value.country,
						});
					}
				}

				if (updates.size > 0) {
					set({
						servers: get().servers.map((server) => {
							const update = updates.get(server.id);
							return update
								? {
										...server,
										countryCode: update.countryCode,
										countryName: update.country,
									}
								: server;
						}),
					});
				}
			}
		})();
	},

	startPingLoop: () => {
		if (get()._pingInterval) {
			return;
		}

		void get().testAllPings();
		const interval = setInterval(() => {
			if (typeof document !== "undefined" && document.hidden) {
				return;
			}

			const state = get();
			void state.testAllPings(
				state.connectionMode === "smart" && state.isConnected,
			);
		}, 2_000);

		set({ _pingInterval: interval });
	},

	stopPingLoop: () => {
		const pingInterval = get()._pingInterval;
		if (!pingInterval) {
			return;
		}

		clearInterval(pingInterval);
		set({ _pingInterval: null });
	},

	startSmartModeMonitoring: () => {
		const state = get();
		if (
			!state.isConnected ||
			state.connectionMode !== "smart" ||
			state._smartMonitorInterval ||
			state._smartMonitorFastTimeout ||
			state._smartMonitorWarmTimeout
		) {
			return;
		}

		const fastTimeout = setTimeout(() => {
			void get().evaluateSmartSwitch("timer");
		}, SMART_MONITOR_FAST_DELAY_MS);

		const warmupTimeout = setTimeout(() => {
			void get().evaluateSmartSwitch("timer");
		}, SMART_MONITOR_WARM_DELAY_MS);

		const interval = setInterval(() => {
			if (typeof document !== "undefined" && document.hidden) {
				return;
			}

			void get().evaluateSmartSwitch("timer");
		}, SMART_MONITOR_INTERVAL_MS);

		set({
			_smartMonitorFastTimeout: fastTimeout,
			_smartMonitorWarmTimeout: warmupTimeout,
			_smartMonitorInterval: interval,
		});
	},

	stopSmartModeMonitoring: () => {
		const state = get();
		const smartMonitorFastTimeout = state._smartMonitorFastTimeout;
		const smartMonitorWarmTimeout = state._smartMonitorWarmTimeout;
		const smartMonitorInterval = state._smartMonitorInterval;
		if (smartMonitorFastTimeout) {
			clearTimeout(smartMonitorFastTimeout);
		}
		if (smartMonitorWarmTimeout) {
			clearTimeout(smartMonitorWarmTimeout);
		}
		if (smartMonitorInterval) {
			clearInterval(smartMonitorInterval);
		}

		set({
			_smartMonitorFastTimeout: null,
			_smartMonitorWarmTimeout: null,
			_smartMonitorInterval: null,
			_smartSwitchTracker: createSmartSwitchTracker(),
		});
	},

	testAllPings: async (activeOnly?: boolean) => {
		const state = get();
		const qualityContextKey = getQualityContextForState({
			fakeDns: state.fakeDns,
			customDnsUrl: state.customDnsUrl,
			systemDnsServers: state.systemDnsServers,
			killSwitch: state.killSwitch,
		});
		const servers = restoreServersForQualityContext(
			state.servers,
			qualityContextKey,
		).filter(
			(server): server is PingableServer =>
				server.id !== "smart-optimal" && isPingableServer(server),
		);
		if (servers.length === 0) {
			return;
		}

		const activeServer = servers.find(
			(server) =>
				server.id === (state.connectedServerId || state.selectedServerId),
		);
		const smartProbeBudget = computeAdaptiveProbeBudget({
			serverCount: servers.length,
			stage:
				state.connectionMode === "smart" && state.isConnected
					? state._runtimeLifecycle === "degraded" ||
						state._runtimeFailureReason !== null
						? "degraded"
						: "monitor"
					: state.isConnected
						? "default_connected"
						: "idle",
			currentLifecycle: state._runtimeLifecycle,
			protocol: activeServer?.protocol,
			stabilityScore: activeServer?.stabilityScore,
			probeConfidence: activeServer?.probeConfidence,
		});
		const selection = selectServersForPingSweep(servers, {
			activeOnly,
			connectionMode: state.connectionMode,
			isConnected: state.isConnected,
			selectedServerId: state.selectedServerId,
			connectedServerId: state.connectedServerId,
			sweepOffset: state._pingSweepOffset,
			smartProbeBudget,
			now: Date.now(),
		});
		const serversToPing = selection.targets;

		if (serversToPing.length === 0) {
			return;
		}

		const pingResults = await pingServers(serversToPing, 3_000, 5);
		set((currentState) => ({
			servers: persistServerQualitySnapshots(
				applyPingProbeResults(currentState.servers, pingResults),
				qualityContextKey,
				pingResults.map((result) => result.id),
				Date.now(),
			),
			_pingSweepOffset: selection.nextOffset,
		}));
	},

	smartConnect: async () => {
		const state = get();
		const qualityContextKey = getQualityContextForState({
			fakeDns: state.fakeDns,
			customDnsUrl: state.customDnsUrl,
			systemDnsServers: state.systemDnsServers,
			killSwitch: state.killSwitch,
		});
		const servers = restoreServersForQualityContext(
			state.servers,
			qualityContextKey,
		).filter(isPingableServer);
		if (servers.length === 0) {
			return;
		}

		const now = Date.now();
		const cachedCandidates = servers.map(toSmartCandidate);
		const initialProbeBudget = computeAdaptiveProbeBudget({
			serverCount: servers.length,
			stage: "initial",
		});
		const initialPlan = planInitialConnection(cachedCandidates, {
			now,
			limit: SMART_CONNECT_CANDIDATE_LIMIT,
			probeBudget: initialProbeBudget,
		});

		const probeTargets = initialPlan.probeCandidates
			.map((candidate) => servers.find((server) => server.id === candidate.id))
			.filter((server): server is PingableServer => !!server);

		const probeResults = await pingServers(
			probeTargets,
			SMART_CONNECT_TIMEOUT_MS,
			Math.max(1, Math.min(5, probeTargets.length)),
		);

		if (probeResults.length > 0) {
			set((currentState) => ({
				servers: persistServerQualitySnapshots(
					applyPingProbeResults(currentState.servers, probeResults),
					qualityContextKey,
					probeResults.map((result) => result.id),
					now,
				),
			}));
		}

		const measuredCandidates = probeResults.map((result) =>
			createMeasuredCandidate(
				servers.find((server) => server.id === result.id),
				result,
			),
		);

		const attemptOrder = finalizeConnectionCandidates(
			cachedCandidates,
			measuredCandidates,
			undefined,
			SMART_CONNECT_CANDIDATE_LIMIT,
			now,
		);
		const fallbackCandidates =
			attemptOrder.length > 0 ? attemptOrder : initialPlan.fallbackCandidates;

		for (const candidate of fallbackCandidates) {
			await get().connectToServer(candidate.id);
			const currentState = get();
			if (
				currentState.isConnected &&
				currentState.connectedServerId === candidate.id
			) {
				return;
			}
		}
	},

	evaluateSmartSwitch: async (trigger = "timer") => {
		const state = get();
		if (
			!state.isConnected ||
			state.connectionMode !== "smart" ||
			state.isConnecting ||
			state.isDisconnecting ||
			!state.connectedServerId
		) {
			return;
		}

		const qualityContextKey = getQualityContextForState({
			fakeDns: state.fakeDns,
			customDnsUrl: state.customDnsUrl,
			systemDnsServers: state.systemDnsServers,
			killSwitch: state.killSwitch,
		});
		const servers = restoreServersForQualityContext(
			state.servers,
			qualityContextKey,
		).filter(isPingableServer);
		if (servers.length <= 1) {
			return;
		}

		const now = Date.now();
		const cachedCandidates = servers.map(toSmartCandidate);
		const connectedServer = servers.find(
			(server) => server.id === state.connectedServerId,
		);
		const switchProbeBudget = computeAdaptiveProbeBudget({
			serverCount: servers.length,
			stage: trigger === "degraded" ? "degraded" : "monitor",
			currentLifecycle: state._runtimeLifecycle,
			protocol: connectedServer?.protocol,
			stabilityScore: connectedServer?.stabilityScore,
			probeConfidence: connectedServer?.probeConfidence,
		});
		const probePlan = planInitialConnection(cachedCandidates, {
			excludeId: state.connectedServerId,
			now,
			limit: SMART_CONNECT_CANDIDATE_LIMIT,
			probeBudget: Math.min(switchProbeBudget, SMART_CONNECT_PROBE_BUDGET),
		});

		const probeTargets = probePlan.probeCandidates
			.map((candidate) => servers.find((server) => server.id === candidate.id))
			.filter((server): server is PingableServer => !!server);

		const probeResults = await pingServers(
			probeTargets,
			SMART_CONNECT_TIMEOUT_MS,
			Math.max(1, Math.min(switchProbeBudget, probeTargets.length)),
		);

		if (probeResults.length > 0) {
			set((currentState) => ({
				servers: persistServerQualitySnapshots(
					applyPingProbeResults(currentState.servers, probeResults),
					qualityContextKey,
					probeResults.map((result) => result.id),
					now,
				),
			}));
		}

		const measuredCandidates = probeResults.map((result) =>
			createMeasuredCandidate(
				servers.find((server) => server.id === result.id),
				result,
			),
		);
		const mergedCandidates = mergeSmartCandidates(
			cachedCandidates,
			measuredCandidates,
			now,
		);
		const switchPlan = planAutoSwitch(
			mergedCandidates,
			state.connectedServerId,
			state._smartSwitchTracker,
			{
				now,
				currentLifecycle: state._runtimeLifecycle,
			},
		);

		if (!switchPlan.recommendedCandidate) {
			set({ _smartSwitchTracker: switchPlan.nextTracker });
			return;
		}

		if (
			trigger === "timer" &&
			state._runtimeLifecycle === "active" &&
			state._runtimeFailureReason === null
		) {
			const connectedServer = state.servers.find(
				(server) => server.id === state.connectedServerId,
			);
			const hasCurrentDegradation =
				(connectedServer?.lossPercent ?? 0) >=
					SMART_HEALTH_DEGRADATION_LOSS_PERCENT ||
				(connectedServer?.jitterMs ?? 0) >= SMART_HEALTH_DEGRADATION_JITTER_MS;

			if (!hasCurrentDegradation) {
				set({ _smartSwitchTracker: switchPlan.nextTracker });
				return;
			}
		}

		await get().connectToServer(switchPlan.recommendedCandidate.id);
		const afterSwitchState = get();
		if (
			afterSwitchState.isConnected &&
			afterSwitchState.connectedServerId === switchPlan.recommendedCandidate.id
		) {
			set({
				_smartSwitchTracker: {
					candidateId: null,
					consecutiveWins: 0,
					lastSwitchAt: Date.now(),
				},
			});
			return;
		}

		set({ _smartSwitchTracker: createSmartSwitchTracker() });
	},

	recordRuntimeHealth: (status, diagnosis) => {
		const now = Date.now();
		const stateForContext = get();
		const qualityContextKey = getQualityContextForState({
			fakeDns: stateForContext.fakeDns,
			customDnsUrl: stateForContext.customDnsUrl,
			systemDnsServers: stateForContext.systemDnsServers,
			killSwitch: stateForContext.killSwitch,
		});
		set((currentState) => ({
			activePing: diagnosis.runtimeReachable
				? diagnosis.latencyMs
				: currentState.activePing,
			errorMessage:
				status.lifecycle === "degraded" && status.lastError
					? status.lastError
					: currentState.errorMessage,
			_runtimeLifecycle: status.lifecycle,
			_runtimeFailureReason:
				status.diagnostic.reason ?? diagnosis.failureReason ?? null,
			servers: status.activeNodeId
				? persistServerQualitySnapshots(
						applyRuntimeHealthUpdate(
							currentState.servers,
							status,
							diagnosis,
							now,
						),
						qualityContextKey,
						[status.activeNodeId],
						now,
					)
				: currentState.servers,
		}));

		if (
			get().connectionMode === "smart" &&
			status.activeNodeId &&
			shouldAttemptDegradedSwitch(status, diagnosis)
		) {
			void get().evaluateSmartSwitch("degraded");
		}
	},

	installRuntime: async () => {
		const api = getAPI();
		if (!api) {
			return;
		}

		try {
			await api.runtime.installAll();
		} catch (error: unknown) {
			console.error("Failed to install runtime", error);
		}
	},
});
