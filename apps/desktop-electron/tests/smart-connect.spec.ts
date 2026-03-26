import { describe, expect, it } from "vitest";
import {
  buildSmartProbeTargets,
  computeCooldownUntil,
  computeSmartScore,
  createSmartSwitchTracker,
  finalizeConnectionCandidates,
  planAutoSwitch,
  planInitialConnection,
  rankFreshSmartCandidates,
  rankSmartCandidates,
  shouldSwitchToCandidate
} from "../renderer/src/lib/smart-connect";

describe("smart-connect helpers", () => {
  it("rankSmartCandidates ставит стабильный протокол выше более быстрого, но нестабильного кандидата", () => {
    const now = 100_000;
    const ranked = rankSmartCandidates(
      [
        {
          id: "quic-fast",
          ping: 24,
          protocol: "hysteria2",
          jitterMs: 18,
          lossPercent: 7,
          failureCount: 2,
          lastFailureAt: now - 20_000
        },
        {
          id: "tcp-stable",
          ping: 41,
          protocol: "vless",
          jitterMs: 4,
          lossPercent: 0,
          connectTimeMs: 55,
          timeToFirstByteMs: 52,
          successRate: 0.98,
          lastSuccessfulAt: now - 10_000
        }
      ],
      undefined,
      2,
      now
    );

    expect(ranked.map((candidate) => candidate.id)).toEqual(["tcp-stable", "quic-fast"]);
  });

  it("rankFreshSmartCandidates исключает узлы на quarantine", () => {
    const now = 50_000;
    const ranked = rankFreshSmartCandidates(
      [
        { id: "healthy", ping: 38, checkedAt: now - 1_000 },
        { id: "cooldown", ping: 18, checkedAt: now - 500, cooldownUntil: now + 60_000 }
      ],
      undefined,
      3,
      now,
      10_000
    );

    expect(ranked).toEqual([{ id: "healthy", ping: 38, checkedAt: now - 1_000 }]);
  });

  it("buildSmartProbeTargets сначала берёт свежие reachable узлы и пропускает quarantine", () => {
    const now = 80_000;
    const targets = buildSmartProbeTargets(
      [
        { id: "node-a", ping: 55, checkedAt: now - 800 },
        { id: "node-b", ping: 28, checkedAt: now - 2_000 },
        { id: "node-c", ping: 0, checkedAt: now - 1_000 },
        { id: "node-d", ping: 44, checkedAt: now - 35_000 },
        { id: "node-e", ping: 22, checkedAt: now - 900, cooldownUntil: now + 30_000 }
      ],
      undefined,
      3,
      now,
      10_000
    );

    expect(targets.map((candidate) => candidate.id)).toEqual(["node-b", "node-a", "node-d"]);
  });

  it("computeSmartScore учитывает runtime preference и недавний стабильный успех", () => {
    const now = 150_000;
    const neutralCandidate = {
      id: "neutral",
      ping: 36,
      protocol: "vless",
      connectTimeMs: 80,
      timeToFirstByteMs: 78,
      successRate: 0.88
    };
    const preferredCandidate = {
      ...neutralCandidate,
      id: "preferred",
      preferredRuntimeKind: "xray" as const,
      lastSuccessfulAt: now - 5_000
    };

    expect(computeSmartScore(preferredCandidate, now)).toBeLessThan(computeSmartScore(neutralCandidate, now));
  });

  it("computeSmartScore penalизирует только проблемную связку node + runtime", () => {
    const now = 160_000;
    const fallbackRecoveredCandidate = {
      id: "fallback-recovered",
      ping: 38,
      protocol: "vless",
      preferredRuntimeKind: "xray" as const,
      runtimePenaltyKind: "sing-box" as const,
      runtimePenaltyUntil: now + 120_000,
      lastSuccessfulAt: now - 2_000,
      successRate: 0.94
    };
    const stillPenalizedCandidate = {
      ...fallbackRecoveredCandidate,
      id: "still-penalized",
      runtimePenaltyKind: "xray" as const
    };

    expect(computeSmartScore(fallbackRecoveredCandidate, now)).toBeLessThan(
      computeSmartScore(stillPenalizedCandidate, now)
    );
  });

  it("shouldSwitchToCandidate в active режиме требует заметного выигрыша, а в degraded — мягче", () => {
    const currentCandidate = {
      id: "current",
      ping: 120,
      protocol: "vless",
      jitterMs: 18,
      lossPercent: 3,
      connectTimeMs: 200,
      successRate: 0.74
    };
    const slightlyBetterCandidate = {
      id: "slightly-better",
      ping: 96,
      protocol: "vless",
      jitterMs: 6,
      lossPercent: 0,
      connectTimeMs: 90,
      successRate: 0.94
    };

    expect(shouldSwitchToCandidate(currentCandidate, slightlyBetterCandidate, { currentLifecycle: "active" })).toBe(
      false
    );
    expect(shouldSwitchToCandidate(currentCandidate, slightlyBetterCandidate, { currentLifecycle: "degraded" })).toBe(
      true
    );
  });

  it("planAutoSwitch требует два подряд выигрыша и соблюдает dwell window", () => {
    const now = 200_000;
    const tracker = createSmartSwitchTracker();
    const candidates = [
      {
        id: "current",
        ping: 118,
        protocol: "vless",
        jitterMs: 22,
        lossPercent: 4,
        connectTimeMs: 210,
        successRate: 0.7
      },
      {
        id: "better",
        ping: 64,
        protocol: "vless",
        jitterMs: 5,
        lossPercent: 0,
        connectTimeMs: 88,
        successRate: 0.97
      }
    ];

    const firstPlan = planAutoSwitch(candidates, "current", tracker, { now, currentLifecycle: "degraded" });
    const secondPlan = planAutoSwitch(candidates, "current", firstPlan.nextTracker, {
      now: now + 30_000,
      currentLifecycle: "degraded"
    });
    const dwellPlan = planAutoSwitch(
      candidates,
      "current",
      { ...createSmartSwitchTracker(), lastSwitchAt: now },
      { now }
    );

    expect(firstPlan.recommendedCandidate).toBeNull();
    expect(firstPlan.nextTracker.consecutiveWins).toBe(1);
    expect(secondPlan.recommendedCandidate?.id).toBe("better");
    expect(dwellPlan.recommendedCandidate).toBeNull();
  });

  it("planAutoSwitch для low-confidence кандидата в active lifecycle требует дополнительное подтверждение", () => {
    const now = 220_000;
    const candidates = [
      {
        id: "active",
        ping: 142,
        protocol: "vless",
        jitterMs: 18,
        lossPercent: 3,
        connectTimeMs: 210,
        successRate: 0.82,
        stabilityScore: 66
      },
      {
        id: "burst-candidate",
        ping: 54,
        protocol: "vless",
        jitterMs: 2,
        lossPercent: 0,
        connectTimeMs: 62,
        successRate: 0.98,
        probeConfidence: 0.32,
        recentPingSamples: [53, 54, 55],
        recentQualitySamples: [81, 83, 84]
      }
    ];

    const firstPlan = planAutoSwitch(candidates, "active", createSmartSwitchTracker(), {
      now,
      currentLifecycle: "active"
    });
    const secondPlan = planAutoSwitch(candidates, "active", firstPlan.nextTracker, {
      now: now + 31_000,
      currentLifecycle: "active"
    });
    const thirdPlan = planAutoSwitch(candidates, "active", secondPlan.nextTracker, {
      now: now + 62_000,
      currentLifecycle: "active"
    });

    expect(firstPlan.recommendedCandidate).toBeNull();
    expect(secondPlan.recommendedCandidate).toBeNull();
    expect(thirdPlan.recommendedCandidate?.id).toBe("burst-candidate");
  });

  it("finalizeConnectionCandidates сохраняет measured стабильный узел выше raw низкого ping после probe", () => {
    const now = 250_000;
    const ranked = finalizeConnectionCandidates(
      [
        { id: "cached-fast", ping: 22, protocol: "hysteria2", successRate: 0.6, failureCount: 1 },
        { id: "cached-stable", ping: 47, protocol: "vless", successRate: 0.95 }
      ],
      [
        {
          id: "cached-fast",
          ping: 25,
          checkedAt: now,
          protocol: "hysteria2",
          jitterMs: 16,
          lossPercent: 6,
          failureCount: 2,
          lastFailureAt: now - 20_000
        },
        {
          id: "cached-stable",
          ping: 43,
          checkedAt: now,
          protocol: "vless",
          jitterMs: 3,
          lossPercent: 0,
          successRate: 0.98,
          lastSuccessfulAt: now - 5_000
        }
      ],
      undefined,
      2,
      now
    );

    expect(ranked.map((candidate) => candidate.id)).toEqual(["cached-stable", "cached-fast"]);
  });

  it("computeCooldownUntil увеличивает quarantine по повторным сбоям и ужесточает QUIC block", () => {
    const now = 500_000;
    const firstFailure = computeCooldownUntil(1, "server_unreachable", "vless", now);
    const secondFailure = computeCooldownUntil(2, "server_unreachable", "vless", now);
    const quicBlocked = computeCooldownUntil(1, "quic_blocked", "hysteria2", now);

    expect(firstFailure - now).toBe(60_000);
    expect(secondFailure - now).toBe(180_000);
    expect(quicBlocked - now).toBe(600_000);
  });

  it("planInitialConnection добавляет exploration sample вне основного shortlist", () => {
    const now = 610_000;
    const plan = planInitialConnection(
      [
        { id: "fresh-a", ping: 22, checkedAt: now - 400, protocol: "vless", probeConfidence: 0.92 },
        { id: "fresh-b", ping: 26, checkedAt: now - 600, protocol: "trojan", probeConfidence: 0.88 },
        { id: "stale-c", ping: 31, checkedAt: now - 40_000, protocol: "wireguard", probeConfidence: 0.8 },
        { id: "explore", ping: 35, checkedAt: now - 95_000, protocol: "vless", probeConfidence: 0.12 }
      ],
      { now, limit: 2, probeBudget: 3 }
    );

    expect(plan.immediateCandidates.map((candidate) => candidate.id)).toEqual(["fresh-a", "fresh-b"]);
    expect(plan.probeCandidates.map((candidate) => candidate.id)).toContain("explore");
  });

  it("rankSmartCandidates возвращает recovered узел после старого сбоя и успешных свежих probe", () => {
    const now = 700_000;
    const ranked = rankSmartCandidates(
      [
        {
          id: "recovered",
          ping: 31,
          protocol: "vless",
          failureCount: 1,
          lastFailureAt: now - 12 * 60_000,
          lastSuccessfulAt: now - 5_000,
          cooldownUntil: now - 1,
          probeConfidence: 0.86,
          stabilityScore: 82,
          recentPingSamples: [30, 32, 31],
          recentQualitySamples: [78, 81, 84]
        },
        {
          id: "neutral",
          ping: 38,
          protocol: "vless",
          successRate: 0.82,
          stabilityScore: 58,
          probeConfidence: 0.44
        }
      ],
      undefined,
      2,
      now
    );

    expect(ranked.map((candidate) => candidate.id)).toEqual(["recovered", "neutral"]);
  });
});
