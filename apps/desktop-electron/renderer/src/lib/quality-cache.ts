import type { RuntimeFailureReason, RuntimeKind } from "../../../shared/types";

export interface QualityCacheEntry {
  contextKey: string;
  updatedAt: number;
  ping?: number;
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
}

export interface QualityCachedServerLike {
  ping: number;
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

const QUALITY_CACHE_LIMIT = 6;
const QUALITY_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const QUALITY_CACHE_DECAY_START_MS = 12 * 60 * 60 * 1000;
const QUALITY_CACHE_DECAY_FULL_MS = 72 * 60 * 60 * 1000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitizeHistory(values: number[] | null | undefined): number[] | null {
  if (!Array.isArray(values)) {
    return null;
  }

  const sanitizedValues = values.filter((value) => Number.isFinite(value));
  return sanitizedValues.length > 0 ? sanitizedValues : null;
}

function snapshotServerQuality(server: QualityCachedServerLike, contextKey: string, now: number): QualityCacheEntry {
  return {
    contextKey,
    updatedAt: now,
    ping: Number.isFinite(server.ping) ? server.ping : 0,
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
    recentPingSamples: sanitizeHistory(server.recentPingSamples),
    recentQualitySamples: sanitizeHistory(server.recentQualitySamples),
    degradationCount: server.degradationCount ?? null
  };
}

function decayMetric(value: number | null | undefined, ageMs: number, floorMultiplier: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  if (ageMs <= QUALITY_CACHE_DECAY_START_MS) {
    return value;
  }

  const ageAfterDecayStart = ageMs - QUALITY_CACHE_DECAY_START_MS;
  const decayRange = Math.max(1, QUALITY_CACHE_DECAY_FULL_MS - QUALITY_CACHE_DECAY_START_MS);
  const progress = clamp(ageAfterDecayStart / decayRange, 0, 1);
  const multiplier = 1 - (1 - floorMultiplier) * progress;
  return Math.round(value * multiplier * 100) / 100;
}

export function createQualityContextKey(options: {
  fakeDns: boolean;
  systemDnsServers: string;
  killSwitch: boolean;
}): string {
  const dnsProfile = options.systemDnsServers.trim().length > 0 ? "system-custom" : "system-default";
  const secureDnsProfile = options.fakeDns ? "secure-dns" : "auto-dns";
  const killSwitchProfile = options.killSwitch ? "kill-switch-on" : "kill-switch-off";
  return [secureDnsProfile, dnsProfile, killSwitchProfile].join("|");
}

export function upsertQualityCache<T extends QualityCachedServerLike>(
  server: T,
  contextKey: string,
  now = Date.now()
): T {
  const currentSnapshot = snapshotServerQuality(server, contextKey, now);
  const remainingEntries = (server.qualityCache ?? []).filter((entry) => entry.contextKey !== contextKey);
  const nextEntries = [currentSnapshot, ...remainingEntries]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, QUALITY_CACHE_LIMIT);

  return {
    ...server,
    qualityCache: nextEntries
  };
}

export function restoreQualityFromCache<T extends QualityCachedServerLike>(
  server: T,
  contextKey: string,
  now = Date.now()
): T {
  const cacheEntry = (server.qualityCache ?? []).find((entry) => entry.contextKey === contextKey);
  if (!cacheEntry) {
    return server;
  }

  const ageMs = now - cacheEntry.updatedAt;
  if (ageMs > QUALITY_CACHE_TTL_MS) {
    return server;
  }

  const baseLastPingAt = server.lastPingAt ?? 0;
  const cacheLastPingAt = cacheEntry.lastPingAt ?? 0;
  const shouldHydratePing = cacheLastPingAt > baseLastPingAt || baseLastPingAt === 0;

  return {
    ...server,
    ping: shouldHydratePing && typeof cacheEntry.ping === "number" ? cacheEntry.ping : server.ping,
    lastPingAt: shouldHydratePing ? (cacheEntry.lastPingAt ?? server.lastPingAt ?? null) : (server.lastPingAt ?? null),
    jitterMs: cacheEntry.jitterMs ?? server.jitterMs ?? null,
    lossPercent: cacheEntry.lossPercent ?? server.lossPercent ?? null,
    connectTimeMs: cacheEntry.connectTimeMs ?? server.connectTimeMs ?? null,
    timeToFirstByteMs: cacheEntry.timeToFirstByteMs ?? server.timeToFirstByteMs ?? null,
    successRate: cacheEntry.successRate ?? server.successRate ?? null,
    failureCount: cacheEntry.failureCount ?? server.failureCount ?? null,
    lastFailureAt: cacheEntry.lastFailureAt ?? server.lastFailureAt ?? null,
    lastFailureReason: cacheEntry.lastFailureReason ?? server.lastFailureReason ?? null,
    cooldownUntil: cacheEntry.cooldownUntil ?? server.cooldownUntil ?? null,
    preferredRuntimeKind: cacheEntry.preferredRuntimeKind ?? server.preferredRuntimeKind ?? null,
    lastSuccessfulAt: cacheEntry.lastSuccessfulAt ?? server.lastSuccessfulAt ?? null,
    stabilityScore: decayMetric(cacheEntry.stabilityScore, ageMs, 0.65) ?? server.stabilityScore ?? null,
    probeConfidence: decayMetric(cacheEntry.probeConfidence, ageMs, 0.55) ?? server.probeConfidence ?? null,
    runtimePenaltyUntil: cacheEntry.runtimePenaltyUntil ?? server.runtimePenaltyUntil ?? null,
    runtimePenaltyKind: cacheEntry.runtimePenaltyKind ?? server.runtimePenaltyKind ?? null,
    recentPingSamples: sanitizeHistory(cacheEntry.recentPingSamples) ?? sanitizeHistory(server.recentPingSamples),
    recentQualitySamples:
      sanitizeHistory(cacheEntry.recentQualitySamples) ?? sanitizeHistory(server.recentQualitySamples),
    degradationCount: decayMetric(cacheEntry.degradationCount, ageMs, 0.4) ?? server.degradationCount ?? null
  };
}
