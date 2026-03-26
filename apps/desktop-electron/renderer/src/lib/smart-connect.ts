import type { RuntimeFailureReason, RuntimeKind, RuntimeLifecycle } from "../../../shared/types";

export interface SmartCandidateHealth {
  id: string;
  ping: number;
  checkedAt?: number | null;
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
  protocol?: string | null;
  stabilityScore?: number | null;
  probeConfidence?: number | null;
  runtimePenaltyUntil?: number | null;
  runtimePenaltyKind?: RuntimeKind | null;
  recentPingSamples?: number[] | null;
  recentQualitySamples?: number[] | null;
  degradationCount?: number | null;
}

export type PingCandidate = SmartCandidateHealth;

export interface SmartServerLike {
  id: string;
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
  protocol?: string | null;
  stabilityScore?: number | null;
  probeConfidence?: number | null;
  runtimePenaltyUntil?: number | null;
  runtimePenaltyKind?: RuntimeKind | null;
  recentPingSamples?: number[] | null;
  recentQualitySamples?: number[] | null;
  degradationCount?: number | null;
}

export interface SmartSwitchTracker {
  candidateId: string | null;
  consecutiveWins: number;
  lastSwitchAt: number | null;
}

export interface SmartInitialConnectionPlan {
  immediateCandidates: SmartCandidateHealth[];
  probeCandidates: SmartCandidateHealth[];
  fallbackCandidates: SmartCandidateHealth[];
}

export interface SmartAutoSwitchPlan {
  leadingCandidate: SmartCandidateHealth | null;
  recommendedCandidate: SmartCandidateHealth | null;
  nextTracker: SmartSwitchTracker;
}

export type SmartProbeStage = "initial" | "monitor" | "degraded" | "default_connected" | "idle";

type ProtocolTuningProfile = {
  jitterPenalty: number;
  lossPenalty: number;
  connectPenalty: number;
  handshakePenalty: number;
  failurePenalty: number;
  successPenalty: number;
  stabilityReward: number;
  confidencePenalty: number;
  driftPenalty: number;
  qualityPenalty: number;
  degradationPenalty: number;
};

const DEFAULT_PROTOCOL_PROFILE: ProtocolTuningProfile = {
  jitterPenalty: 0.32,
  lossPenalty: 24,
  connectPenalty: 0.14,
  handshakePenalty: 0.08,
  failurePenalty: 42,
  successPenalty: 130,
  stabilityReward: 0.6,
  confidencePenalty: 48,
  driftPenalty: 0.24,
  qualityPenalty: 1.1,
  degradationPenalty: 32
};

export const SMART_CONNECT_CANDIDATE_LIMIT = 3;
export const SMART_CONNECT_FRESH_TTL_MS = 15_000;
export const SMART_CONNECT_TIMEOUT_MS = 1_200;
export const SMART_CONNECT_PROBE_BUDGET = 12;
export const SMART_SWITCH_PROBE_BUDGET = 8;
export const SMART_SWITCH_DWELL_MS = 90_000;
export const SMART_SWITCH_REQUIRED_WINS = 2;
export const SMART_HEALTH_DEGRADATION_JITTER_MS = 25;
export const SMART_HEALTH_DEGRADATION_LOSS_PERCENT = 4;
export const SMART_HISTORY_SAMPLE_LIMIT = 6;

const UNREACHABLE_SCORE = 50_000;
const QUARANTINE_STEPS_MS = [60_000, 180_000, 600_000] as const;
const RECENT_FAILURE_WINDOW_MS = 5 * 60_000;
const RECENT_SUCCESS_WINDOW_MS = 4 * 60_000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeMetric(value: number | null | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeSuccessRate(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value > 1 ? clamp(value / 100, 0, 1) : clamp(value, 0, 1);
}

function normalizeConfidence(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0.35;
  }

  return clamp(value, 0.05, 1);
}

function normalizeQuality(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return clamp(value, 0, 100);
}

function normalizeHistory(values: number[] | number | null | undefined): number[] {
  if (Array.isArray(values)) {
    return values.filter((value) => Number.isFinite(value));
  }

  if (typeof values === "number" && Number.isFinite(values)) {
    return [values];
  }

  return [];
}

export function appendRecentSample(
  history: number[] | null | undefined,
  value: number,
  limit = SMART_HISTORY_SAMPLE_LIMIT
): number[] {
  const normalizedHistory = normalizeHistory(history);
  return [...normalizedHistory.slice(-(limit - 1)), value];
}

export function computeHistoryMedian(values: number[] | number | null | undefined): number | null {
  const normalizedValues = normalizeHistory(values);
  if (normalizedValues.length === 0) {
    return null;
  }

  const sortedValues = [...normalizedValues].sort((left, right) => left - right);
  const middleIndex = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 === 1) {
    return sortedValues[middleIndex] ?? null;
  }

  const leftValue = sortedValues[middleIndex - 1];
  const rightValue = sortedValues[middleIndex];
  if (leftValue === undefined || rightValue === undefined) {
    return null;
  }

  return (leftValue + rightValue) / 2;
}

function computeTrendDrift(candidate: SmartCandidateHealth): number {
  const medianPing = computeHistoryMedian(candidate.recentPingSamples);
  if (medianPing === null || !Number.isFinite(candidate.ping)) {
    return 0;
  }

  return Math.abs(candidate.ping - medianPing);
}

function getProtocolProfile(protocol: string | null | undefined): ProtocolTuningProfile {
  if (protocol === "wireguard") {
    return {
      jitterPenalty: 0.52,
      lossPenalty: 36,
      connectPenalty: 0.06,
      handshakePenalty: 0.03,
      failurePenalty: 48,
      successPenalty: 118,
      stabilityReward: 0.68,
      confidencePenalty: 54,
      driftPenalty: 0.3,
      qualityPenalty: 1.25,
      degradationPenalty: 34
    };
  }

  if (protocol === "hysteria2" || protocol === "tuic") {
    return {
      jitterPenalty: 0.62,
      lossPenalty: 44,
      connectPenalty: 0.11,
      handshakePenalty: 0.12,
      failurePenalty: 52,
      successPenalty: 136,
      stabilityReward: 0.62,
      confidencePenalty: 58,
      driftPenalty: 0.34,
      qualityPenalty: 1.4,
      degradationPenalty: 40
    };
  }

  if (protocol === "vless" || protocol === "vmess" || protocol === "trojan") {
    return {
      jitterPenalty: 0.28,
      lossPenalty: 22,
      connectPenalty: 0.23,
      handshakePenalty: 0.17,
      failurePenalty: 44,
      successPenalty: 142,
      stabilityReward: 0.7,
      confidencePenalty: 42,
      driftPenalty: 0.18,
      qualityPenalty: 1.05,
      degradationPenalty: 26
    };
  }

  if (protocol === "shadowsocks" || protocol === "socks" || protocol === "http") {
    return {
      jitterPenalty: 0.25,
      lossPenalty: 18,
      connectPenalty: 0.18,
      handshakePenalty: 0.08,
      failurePenalty: 36,
      successPenalty: 120,
      stabilityReward: 0.56,
      confidencePenalty: 38,
      driftPenalty: 0.16,
      qualityPenalty: 0.92,
      degradationPenalty: 24
    };
  }

  return DEFAULT_PROTOCOL_PROFILE;
}

function isQuicProtocol(protocol: string | null | undefined): boolean {
  return protocol === "hysteria2" || protocol === "tuic";
}

function isTcpHandshakeProtocol(protocol: string | null | undefined): boolean {
  return protocol === "vless" || protocol === "vmess" || protocol === "trojan";
}

function isReachableCandidate(candidate: SmartCandidateHealth): boolean {
  return Number.isFinite(candidate.ping) && candidate.ping > 0;
}

function getFailureReasonPenalty(candidate: SmartCandidateHealth): number {
  switch (candidate.lastFailureReason) {
    case "auth_rejected":
      return 380;
    case "quic_blocked":
      return isQuicProtocol(candidate.protocol) ? 260 : 110;
    case "tls_handshake_failed":
      return 180;
    case "dns_failed":
      return 150;
    case "server_unreachable":
    case "runtime_port_unreachable":
      return 170;
    case "runtime_crashed":
    case "runtime_start_failed":
      return 140;
    case "kill_switch_failed":
    case "system_proxy_failed":
      return 60;
    default:
      return 0;
  }
}

function getRecentSuccessReward(candidate: SmartCandidateHealth, now: number): number {
  if (typeof candidate.lastSuccessfulAt !== "number") {
    return 0;
  }

  const elapsed = now - candidate.lastSuccessfulAt;
  if (elapsed > RECENT_SUCCESS_WINDOW_MS) {
    return 0;
  }

  return 60 - Math.min(45, Math.round((elapsed / RECENT_SUCCESS_WINDOW_MS) * 60));
}

export function createSmartSwitchTracker(): SmartSwitchTracker {
  return {
    candidateId: null,
    consecutiveWins: 0,
    lastSwitchAt: null
  };
}

export function isCandidateCoolingDown(candidate: SmartCandidateHealth, now = Date.now()): boolean {
  return typeof candidate.cooldownUntil === "number" && candidate.cooldownUntil > now;
}

function isRuntimePenaltyActive(candidate: SmartCandidateHealth, now = Date.now()): boolean {
  if (typeof candidate.runtimePenaltyUntil !== "number" || candidate.runtimePenaltyUntil <= now) {
    return false;
  }

  if (!candidate.runtimePenaltyKind || !candidate.preferredRuntimeKind) {
    return true;
  }

  return candidate.runtimePenaltyKind === candidate.preferredRuntimeKind;
}

export function computeQuarantineDurationMs(
  nextFailureCount: number,
  reason?: RuntimeFailureReason | null,
  protocol?: string | null
): number {
  const stepIndex = Math.max(0, Math.min(QUARANTINE_STEPS_MS.length - 1, nextFailureCount - 1));
  const baseDuration = QUARANTINE_STEPS_MS[stepIndex] ?? QUARANTINE_STEPS_MS[QUARANTINE_STEPS_MS.length - 1] ?? 600_000;

  if (reason === "auth_rejected") {
    return Math.max(baseDuration, 10 * 60_000);
  }

  if ((reason === "quic_blocked" || reason === "runtime_crashed") && isQuicProtocol(protocol)) {
    return Math.max(baseDuration, 10 * 60_000);
  }

  return baseDuration;
}

export function computeCooldownUntil(
  nextFailureCount: number,
  reason?: RuntimeFailureReason | null,
  protocol?: string | null,
  now = Date.now()
): number {
  return now + computeQuarantineDurationMs(nextFailureCount, reason, protocol);
}

export function computeAdaptiveProbeBudget(options: {
  serverCount: number;
  stage: SmartProbeStage;
  protocol?: string | null;
  currentLifecycle?: RuntimeLifecycle | null;
  stabilityScore?: number | null;
  probeConfidence?: number | null;
}): number {
  const { serverCount, stage, protocol, currentLifecycle } = options;
  const stabilityScore = normalizeMetric(options.stabilityScore, 50);
  const probeConfidence = normalizeConfidence(options.probeConfidence);

  let budget =
    stage === "initial"
      ? 5
      : stage === "degraded"
        ? 6
        : stage === "monitor"
          ? 3
          : stage === "default_connected"
            ? 2
            : 4;

  if (serverCount >= 12) {
    budget += 1;
  }

  if (serverCount >= 24) {
    budget += 1;
  }

  if (isQuicProtocol(protocol)) {
    budget += stage === "degraded" || currentLifecycle === "degraded" ? 2 : 1;
  } else if (isTcpHandshakeProtocol(protocol)) {
    budget += probeConfidence < 0.55 ? 1 : 0;
  } else if (protocol === "wireguard") {
    budget += currentLifecycle === "degraded" ? 1 : 0;
  }

  if (stage === "monitor" && stabilityScore >= 78 && probeConfidence >= 0.7) {
    budget -= 1;
  }

  if (stage === "default_connected" && stabilityScore >= 82) {
    budget = Math.max(1, budget - 1);
  }

  if (probeConfidence < 0.4) {
    budget += 1;
  }

  return clamp(budget, 1, Math.min(SMART_CONNECT_PROBE_BUDGET, Math.max(2, serverCount)));
}

export function toSmartCandidate(server: SmartServerLike): SmartCandidateHealth {
  return {
    id: server.id,
    ping: server.ping,
    checkedAt: server.lastPingAt ?? null,
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
    protocol: server.protocol ?? null,
    stabilityScore: server.stabilityScore ?? null,
    probeConfidence: server.probeConfidence ?? null,
    runtimePenaltyUntil: server.runtimePenaltyUntil ?? null,
    runtimePenaltyKind: server.runtimePenaltyKind ?? null,
    recentPingSamples: normalizeHistory(server.recentPingSamples),
    recentQualitySamples: normalizeHistory(server.recentQualitySamples),
    degradationCount: server.degradationCount ?? null
  };
}

export function computeSmartScore(candidate: SmartCandidateHealth, now = Date.now()): number {
  const baseLatency = isReachableCandidate(candidate) ? candidate.ping : UNREACHABLE_SCORE;
  const profile = getProtocolProfile(candidate.protocol);
  const successRate = normalizeSuccessRate(candidate.successRate);
  const failureCount = normalizeMetric(candidate.failureCount, 0);
  const jitterPenalty = normalizeMetric(candidate.jitterMs, 0) * profile.jitterPenalty;
  const lossPenalty = normalizeMetric(candidate.lossPercent, 0) * profile.lossPenalty;
  const connectPenalty =
    normalizeMetric(candidate.connectTimeMs, candidate.ping > 0 ? candidate.ping : 0) * profile.connectPenalty;
  const handshakePenalty = normalizeMetric(candidate.timeToFirstByteMs, 0) * profile.handshakePenalty;
  const failurePenalty = failureCount * profile.failurePenalty;
  const successPenalty = successRate === null ? 0 : (1 - successRate) * profile.successPenalty;
  const recentFailurePenalty =
    typeof candidate.lastFailureAt === "number" && now - candidate.lastFailureAt <= RECENT_FAILURE_WINDOW_MS ? 90 : 0;
  const reasonPenalty = getFailureReasonPenalty(candidate);
  const cooldownPenalty = isCandidateCoolingDown(candidate, now) ? 7_500 : 0;
  const runtimePenalty = isRuntimePenaltyActive(candidate, now) ? 180 : 0;
  const runtimePreferenceReward = candidate.preferredRuntimeKind ? 18 : 0;
  const recentSuccessReward = getRecentSuccessReward(candidate, now);
  const stabilityReward = normalizeMetric(candidate.stabilityScore, 50) * profile.stabilityReward;
  const confidencePenalty = (1 - normalizeConfidence(candidate.probeConfidence)) * profile.confidencePenalty;
  const trendDriftPenalty = computeTrendDrift(candidate) * profile.driftPenalty;
  const medianQuality = normalizeQuality(computeHistoryMedian(candidate.recentQualitySamples));
  const qualityPenalty = medianQuality === null ? 0 : Math.max(0, 75 - medianQuality) * profile.qualityPenalty;
  const degradationPenalty = normalizeMetric(candidate.degradationCount, 0) * profile.degradationPenalty;

  return Math.round(
    baseLatency +
      jitterPenalty +
      lossPenalty +
      connectPenalty +
      handshakePenalty +
      failurePenalty +
      successPenalty +
      recentFailurePenalty +
      reasonPenalty +
      cooldownPenalty +
      runtimePenalty +
      confidencePenalty +
      trendDriftPenalty +
      qualityPenalty +
      degradationPenalty -
      runtimePreferenceReward -
      recentSuccessReward -
      stabilityReward
  );
}

function compareSmartCandidates(left: SmartCandidateHealth, right: SmartCandidateHealth, now: number): number {
  const scoreDelta = computeSmartScore(left, now) - computeSmartScore(right, now);
  if (scoreDelta !== 0) {
    return scoreDelta;
  }

  return left.ping - right.ping;
}

function getEligibleCandidates(
  candidates: SmartCandidateHealth[],
  excludeId: string | undefined,
  now: number
): SmartCandidateHealth[] {
  return candidates.filter((candidate) => candidate.id !== excludeId && !isCandidateCoolingDown(candidate, now));
}

export function rankSmartCandidates(
  candidates: SmartCandidateHealth[],
  excludeId?: string,
  limit = SMART_CONNECT_CANDIDATE_LIMIT,
  now = Date.now()
): SmartCandidateHealth[] {
  return getEligibleCandidates(candidates, excludeId, now)
    .filter(isReachableCandidate)
    .sort((left, right) => compareSmartCandidates(left, right, now))
    .slice(0, limit);
}

export function rankFreshSmartCandidates(
  candidates: SmartCandidateHealth[],
  excludeId?: string,
  limit = SMART_CONNECT_CANDIDATE_LIMIT,
  now = Date.now(),
  freshnessTtlMs = SMART_CONNECT_FRESH_TTL_MS
): SmartCandidateHealth[] {
  return rankSmartCandidates(
    getEligibleCandidates(candidates, excludeId, now).filter((candidate) => {
      if (!isReachableCandidate(candidate) || typeof candidate.checkedAt !== "number") {
        return false;
      }

      return now - candidate.checkedAt <= freshnessTtlMs;
    }),
    excludeId,
    limit,
    now
  );
}

export function buildSmartProbeTargets(
  candidates: SmartCandidateHealth[],
  excludeId?: string,
  budget = SMART_CONNECT_PROBE_BUDGET,
  now = Date.now(),
  freshnessTtlMs = SMART_CONNECT_FRESH_TTL_MS
): SmartCandidateHealth[] {
  const freshnessDeadline = now - freshnessTtlMs;

  return getEligibleCandidates(candidates, excludeId, now)
    .sort((left, right) => {
      const leftFresh = typeof left.checkedAt === "number" && left.checkedAt >= freshnessDeadline;
      const rightFresh = typeof right.checkedAt === "number" && right.checkedAt >= freshnessDeadline;
      const leftReachable = isReachableCandidate(left);
      const rightReachable = isReachableCandidate(right);

      if (leftReachable !== rightReachable) {
        return leftReachable ? -1 : 1;
      }

      if (leftFresh !== rightFresh) {
        return leftFresh ? -1 : 1;
      }

      return compareSmartCandidates(left, right, now);
    })
    .slice(0, budget);
}

function dedupeCandidates(candidates: SmartCandidateHealth[], limit: number): SmartCandidateHealth[] {
  const deduped = new Map<string, SmartCandidateHealth>();
  for (const candidate of candidates) {
    if (!deduped.has(candidate.id)) {
      deduped.set(candidate.id, candidate);
    }
  }

  return [...deduped.values()].slice(0, limit);
}

function pickExplorationCandidate(
  candidates: SmartCandidateHealth[],
  excludedIds: Set<string>,
  now: number
): SmartCandidateHealth | null {
  const eligibleCandidates = candidates
    .filter((candidate) => !excludedIds.has(candidate.id))
    .filter(
      (candidate) =>
        candidate.checkedAt === null ||
        candidate.checkedAt === undefined ||
        now - (candidate.checkedAt ?? 0) > SMART_CONNECT_FRESH_TTL_MS
    )
    .filter((candidate) => !isCandidateCoolingDown(candidate, now))
    .filter(isReachableCandidate)
    .sort((left, right) => {
      const leftCheckedAt = left.checkedAt ?? 0;
      const rightCheckedAt = right.checkedAt ?? 0;
      if (leftCheckedAt !== rightCheckedAt) {
        return leftCheckedAt - rightCheckedAt;
      }

      const leftConfidence = normalizeConfidence(left.probeConfidence);
      const rightConfidence = normalizeConfidence(right.probeConfidence);
      if (leftConfidence !== rightConfidence) {
        return leftConfidence - rightConfidence;
      }

      return compareSmartCandidates(left, right, now);
    });

  return eligibleCandidates[0] ?? null;
}

export function planInitialConnection(
  candidates: SmartCandidateHealth[],
  options?: {
    excludeId?: string;
    limit?: number;
    probeBudget?: number;
    now?: number;
    freshnessTtlMs?: number;
  }
): SmartInitialConnectionPlan {
  const now = options?.now ?? Date.now();
  const limit = options?.limit ?? SMART_CONNECT_CANDIDATE_LIMIT;
  const freshnessTtlMs = options?.freshnessTtlMs ?? SMART_CONNECT_FRESH_TTL_MS;
  const immediateCandidates = rankFreshSmartCandidates(candidates, options?.excludeId, limit, now, freshnessTtlMs);
  const probeBudget = options?.probeBudget ?? (immediateCandidates.length > 0 ? 6 : SMART_CONNECT_PROBE_BUDGET);
  const topProbeCandidates = buildSmartProbeTargets(
    candidates,
    options?.excludeId,
    Math.max(1, probeBudget - 1),
    now,
    freshnessTtlMs
  );
  const explorationCandidate = pickExplorationCandidate(
    candidates,
    new Set([
      ...(options?.excludeId ? [options.excludeId] : []),
      ...topProbeCandidates.map((candidate) => candidate.id)
    ]),
    now
  );
  const probeCandidates = dedupeCandidates(
    explorationCandidate ? [...topProbeCandidates, explorationCandidate] : topProbeCandidates,
    probeBudget
  );
  const fallbackCandidates = rankSmartCandidates(candidates, options?.excludeId, limit, now);

  return {
    immediateCandidates,
    probeCandidates,
    fallbackCandidates
  };
}

export function mergeSmartCandidates(
  primary: SmartCandidateHealth[],
  secondary: SmartCandidateHealth[],
  now = Date.now()
): SmartCandidateHealth[] {
  const merged = new Map<string, SmartCandidateHealth>();

  for (const candidate of [...primary, ...secondary]) {
    const existing = merged.get(candidate.id);
    if (!existing) {
      merged.set(candidate.id, candidate);
      continue;
    }

    const existingFreshness = existing.checkedAt ?? 0;
    const nextFreshness = candidate.checkedAt ?? 0;
    if (nextFreshness > existingFreshness || computeSmartScore(candidate, now) < computeSmartScore(existing, now)) {
      merged.set(candidate.id, { ...existing, ...candidate });
      continue;
    }

    merged.set(candidate.id, { ...candidate, ...existing });
  }

  return [...merged.values()];
}

export function finalizeConnectionCandidates(
  cachedCandidates: SmartCandidateHealth[],
  measuredCandidates: SmartCandidateHealth[],
  excludeId?: string,
  limit = SMART_CONNECT_CANDIDATE_LIMIT,
  now = Date.now()
): SmartCandidateHealth[] {
  return rankSmartCandidates(mergeSmartCandidates(cachedCandidates, measuredCandidates, now), excludeId, limit, now);
}

export function shouldSwitchToCandidate(
  currentCandidate: SmartCandidateHealth,
  candidate: SmartCandidateHealth,
  options?: { currentLifecycle?: RuntimeLifecycle | null; now?: number }
): boolean {
  const now = options?.now ?? Date.now();
  if (!isReachableCandidate(candidate) || isCandidateCoolingDown(candidate, now)) {
    return false;
  }

  if (!isReachableCandidate(currentCandidate)) {
    return true;
  }

  const currentScore = computeSmartScore(currentCandidate, now);
  const candidateScore = computeSmartScore(candidate, now);
  const scoreImprovement = currentScore - candidateScore;
  const pingImprovement = currentCandidate.ping - candidate.ping;
  const scoreRelativeGain = currentScore > 0 ? scoreImprovement / currentScore : 0;
  const pingRelativeGain = currentCandidate.ping > 0 ? pingImprovement / currentCandidate.ping : 0;
  const lifecycle = options?.currentLifecycle ?? "active";
  const isRelaxedSwitch = lifecycle === "degraded" || lifecycle === "failed";
  const currentStability = normalizeMetric(currentCandidate.stabilityScore, 55);
  const candidateConfidence = normalizeConfidence(candidate.probeConfidence);
  const candidateDrift = computeTrendDrift(candidate);

  let minimumScoreImprovement = isRelaxedSwitch ? 18 : 55;
  let minimumRelativeGain = isRelaxedSwitch ? 0.1 : 0.22;
  let minimumPingImprovement = isRelaxedSwitch ? 10 : 25;
  let minimumPingRelativeGain = isRelaxedSwitch ? 0.08 : 0.18;

  if (!isRelaxedSwitch && currentStability >= 78) {
    minimumScoreImprovement += 18;
    minimumRelativeGain += 0.05;
    minimumPingImprovement += 8;
    minimumPingRelativeGain += 0.04;
  }

  if (candidateConfidence < 0.55) {
    minimumScoreImprovement += 14;
    minimumRelativeGain += 0.03;
  }

  if (!isRelaxedSwitch && candidateDrift >= 18) {
    return false;
  }

  return (
    scoreImprovement >= minimumScoreImprovement &&
    scoreRelativeGain >= minimumRelativeGain &&
    pingImprovement >= minimumPingImprovement &&
    pingRelativeGain >= minimumPingRelativeGain
  );
}

export function planAutoSwitch(
  candidates: SmartCandidateHealth[],
  currentCandidateId: string,
  tracker: SmartSwitchTracker,
  options?: {
    now?: number;
    currentLifecycle?: RuntimeLifecycle | null;
    limit?: number;
    requiredWins?: number;
    dwellMs?: number;
  }
): SmartAutoSwitchPlan {
  const now = options?.now ?? Date.now();
  const dwellMs = options?.dwellMs ?? SMART_SWITCH_DWELL_MS;
  const baseRequiredWins = options?.requiredWins ?? SMART_SWITCH_REQUIRED_WINS;
  const limit = options?.limit ?? SMART_CONNECT_CANDIDATE_LIMIT;

  if (typeof tracker.lastSwitchAt === "number" && now - tracker.lastSwitchAt < dwellMs) {
    return {
      leadingCandidate: null,
      recommendedCandidate: null,
      nextTracker: tracker
    };
  }

  const currentCandidate = candidates.find((candidate) => candidate.id === currentCandidateId);
  if (!currentCandidate) {
    return {
      leadingCandidate: null,
      recommendedCandidate: null,
      nextTracker: createSmartSwitchTracker()
    };
  }

  const rankedCandidates = rankSmartCandidates(candidates, currentCandidateId, limit, now);
  const leadingCandidate = rankedCandidates[0] ?? null;
  if (
    !leadingCandidate ||
    !shouldSwitchToCandidate(currentCandidate, leadingCandidate, {
      currentLifecycle: options?.currentLifecycle,
      now
    })
  ) {
    return {
      leadingCandidate,
      recommendedCandidate: null,
      nextTracker: {
        ...tracker,
        candidateId: null,
        consecutiveWins: 0
      }
    };
  }

  const confidencePenaltyWins =
    options?.currentLifecycle === "active" && normalizeConfidence(leadingCandidate.probeConfidence) < 0.6 ? 1 : 0;
  const adaptiveRequiredWins = Math.max(baseRequiredWins, baseRequiredWins + confidencePenaltyWins);
  const consecutiveWins = tracker.candidateId === leadingCandidate.id ? tracker.consecutiveWins + 1 : 1;
  const nextTracker: SmartSwitchTracker = {
    candidateId: leadingCandidate.id,
    consecutiveWins,
    lastSwitchAt: tracker.lastSwitchAt
  };

  return {
    leadingCandidate,
    recommendedCandidate: consecutiveWins >= adaptiveRequiredWins ? leadingCandidate : null,
    nextTracker
  };
}
