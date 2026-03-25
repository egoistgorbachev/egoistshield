export interface PingCandidate {
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
  protocol?: string | null;
}

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
  protocol?: string | null;
}

export const SMART_CONNECT_CANDIDATE_LIMIT = 3;
export const SMART_CONNECT_FRESH_TTL_MS = 15_000;
export const SMART_CONNECT_TIMEOUT_MS = 1_200;
export const SMART_CONNECT_PROBE_BUDGET = 12;
export const SMART_SWITCH_PROBE_BUDGET = 8;
const UNREACHABLE_SCORE = 50_000;
const RECENT_FAILURE_WINDOW_MS = 5 * 60_000;

function normalizeMetric(value: number | null | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isReachableCandidate(candidate: PingCandidate): boolean {
  return Number.isFinite(candidate.ping) && candidate.ping > 0;
}

export function toSmartCandidate(server: SmartServerLike): PingCandidate {
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
    protocol: server.protocol ?? null
  };
}

export function computeSmartScore(candidate: PingCandidate, now = Date.now()): number {
  const baseLatency = isReachableCandidate(candidate) ? candidate.ping : UNREACHABLE_SCORE;
  const jitterPenalty = normalizeMetric(candidate.jitterMs, 0) * 0.35;
  const lossPenalty = normalizeMetric(candidate.lossPercent, 0) * 25;
  const connectPenalty = normalizeMetric(candidate.connectTimeMs, candidate.ping > 0 ? candidate.ping : 0) * 0.15;
  const handshakePenalty = normalizeMetric(candidate.timeToFirstByteMs, 0) * 0.08;
  const failurePenalty = normalizeMetric(candidate.failureCount, 0) * 40;
  const successPenalty = (() => {
    const successRate = candidate.successRate;
    if (typeof successRate !== "number" || !Number.isFinite(successRate)) {
      return 0;
    }

    const normalized = successRate > 1 ? Math.max(0, Math.min(100, successRate)) / 100 : Math.max(0, successRate);
    return (1 - normalized) * 120;
  })();
  const recentFailurePenalty =
    typeof candidate.lastFailureAt === "number" && now - candidate.lastFailureAt <= RECENT_FAILURE_WINDOW_MS ? 90 : 0;

  return Math.round(
    baseLatency + jitterPenalty + lossPenalty + connectPenalty + handshakePenalty + failurePenalty + successPenalty + recentFailurePenalty
  );
}

function compareSmartCandidates(left: PingCandidate, right: PingCandidate, now = Date.now()): number {
  const leftScore = computeSmartScore(left, now);
  const rightScore = computeSmartScore(right, now);

  if (leftScore !== rightScore) {
    return leftScore - rightScore;
  }

  return left.ping - right.ping;
}

export function rankSmartCandidates(
  pingResults: PingCandidate[],
  excludeId?: string,
  limit = SMART_CONNECT_CANDIDATE_LIMIT,
  now = Date.now()
): PingCandidate[] {
  return pingResults
    .filter(isReachableCandidate)
    .filter((candidate) => candidate.id !== excludeId)
    .sort((left, right) => compareSmartCandidates(left, right, now))
    .slice(0, limit);
}

export function rankFreshSmartCandidates(
  pingResults: PingCandidate[],
  excludeId?: string,
  limit = SMART_CONNECT_CANDIDATE_LIMIT,
  now = Date.now(),
  freshnessTtlMs = SMART_CONNECT_FRESH_TTL_MS
): PingCandidate[] {
  return rankSmartCandidates(
    pingResults.filter((candidate) => {
      if (candidate.id === excludeId || !isReachableCandidate(candidate)) {
        return false;
      }

      if (typeof candidate.checkedAt !== "number") {
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
  candidates: PingCandidate[],
  excludeId?: string,
  budget = SMART_CONNECT_PROBE_BUDGET,
  now = Date.now(),
  freshnessTtlMs = SMART_CONNECT_FRESH_TTL_MS
): PingCandidate[] {
  const freshnessDeadline = now - freshnessTtlMs;

  return candidates
    .filter((candidate) => candidate.id !== excludeId)
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

export function mergeSmartCandidates(primary: PingCandidate[], secondary: PingCandidate[]): PingCandidate[] {
  const merged = new Map<string, PingCandidate>();

  for (const candidate of [...primary, ...secondary]) {
    const existing = merged.get(candidate.id);
    if (!existing) {
      merged.set(candidate.id, candidate);
      continue;
    }

    const existingFreshness = existing.checkedAt ?? 0;
    const nextFreshness = candidate.checkedAt ?? 0;
    if (
      nextFreshness > existingFreshness ||
      computeSmartScore(candidate, nextFreshness || Date.now()) < computeSmartScore(existing, existingFreshness || Date.now())
    ) {
      merged.set(candidate.id, candidate);
    }
  }

  return [...merged.values()];
}

export function shouldSwitchToCandidate(
  currentPing: number,
  candidatePing: number,
  currentScore?: number,
  candidateScore?: number
): boolean {
  if (!Number.isFinite(currentPing) || !Number.isFinite(candidatePing)) {
    return false;
  }

  const improvement = currentPing - candidatePing;
  const relativeGain = currentPing > 0 ? improvement / currentPing : 0;
  const scoreImprovement =
    typeof currentScore === "number" && typeof candidateScore === "number" ? currentScore - candidateScore : improvement;
  const scoreRelativeGain =
    typeof currentScore === "number" && currentScore > 0 && typeof candidateScore === "number"
      ? scoreImprovement / currentScore
      : relativeGain;

  return improvement >= 25 && relativeGain >= 0.25 && scoreImprovement >= 20 && scoreRelativeGain >= 0.18;
}
