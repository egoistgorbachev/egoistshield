import { describe, expect, it } from "vitest";
import {
  createSmartSwitchTracker,
  finalizeConnectionCandidates,
  planAutoSwitch,
  planInitialConnection
} from "../renderer/src/lib/smart-connect";

describe("smart orchestration planner", () => {
  it("planInitialConnection сначала отдаёт свежие кэшированные узлы, затем probe и fallback order", () => {
    const now = 75_000;
    const plan = planInitialConnection(
      [
        { id: "fresh-a", ping: 34, checkedAt: now - 700, protocol: "vless", successRate: 0.95 },
        { id: "fresh-b", ping: 29, checkedAt: now - 900, protocol: "trojan", successRate: 0.91 },
        { id: "stale-c", ping: 18, checkedAt: now - 30_000, protocol: "hysteria2", lossPercent: 6 },
        { id: "cooldown-d", ping: 12, checkedAt: now - 400, cooldownUntil: now + 30_000, protocol: "vless" }
      ],
      { now, limit: 3, probeBudget: 4 }
    );

    expect(plan.immediateCandidates.map((candidate) => candidate.id)).toEqual(["fresh-b", "fresh-a"]);
    expect(plan.probeCandidates.map((candidate) => candidate.id)).toEqual(["fresh-b", "fresh-a", "stale-c"]);
    expect(plan.fallbackCandidates.map((candidate) => candidate.id)).toEqual(["fresh-b", "fresh-a", "stale-c"]);
  });

  it("planner после probe выбирает реально стабильный узел вместо сырого fastest ping", () => {
    const now = 120_000;
    const ranked = finalizeConnectionCandidates(
      [
        { id: "raw-fast", ping: 17, protocol: "hysteria2", successRate: 0.72 },
        { id: "raw-stable", ping: 46, protocol: "vless", successRate: 0.96 }
      ],
      [
        {
          id: "raw-fast",
          ping: 21,
          checkedAt: now,
          protocol: "hysteria2",
          jitterMs: 20,
          lossPercent: 8,
          failureCount: 2,
          lastFailureAt: now - 10_000
        },
        {
          id: "raw-stable",
          ping: 40,
          checkedAt: now,
          protocol: "vless",
          jitterMs: 2,
          lossPercent: 0,
          successRate: 0.98,
          lastSuccessfulAt: now - 3_000
        }
      ],
      undefined,
      2,
      now
    );

    expect(ranked.map((candidate) => candidate.id)).toEqual(["raw-stable", "raw-fast"]);
  });

  it("planAutoSwitch использует единый tracker и не рекомендует switch при разовом улучшении", () => {
    const now = 180_000;
    const firstTracker = createSmartSwitchTracker();
    const candidates = [
      {
        id: "active",
        ping: 110,
        protocol: "vless",
        jitterMs: 17,
        lossPercent: 4,
        connectTimeMs: 205,
        successRate: 0.75
      },
      {
        id: "candidate",
        ping: 60,
        protocol: "vless",
        jitterMs: 4,
        lossPercent: 0,
        connectTimeMs: 84,
        successRate: 0.97
      }
    ];

    const firstPass = planAutoSwitch(candidates, "active", firstTracker, { now, currentLifecycle: "degraded" });
    const secondPass = planAutoSwitch(candidates, "active", firstPass.nextTracker, {
      now: now + 31_000,
      currentLifecycle: "degraded"
    });

    expect(firstPass.recommendedCandidate).toBeNull();
    expect(firstPass.nextTracker.candidateId).toBe("candidate");
    expect(secondPass.recommendedCandidate?.id).toBe("candidate");
  });

  it("planInitialConnection ограничивает sampling budget и добавляет exploration candidate вне top shortlist", () => {
    const now = 260_000;
    const plan = planInitialConnection(
      [
        { id: "active-top", ping: 28, checkedAt: now - 800, protocol: "vless", successRate: 0.96 },
        { id: "secondary-top", ping: 34, checkedAt: now - 1_100, protocol: "trojan", successRate: 0.92 },
        { id: "stale-a", ping: 39, checkedAt: now - 32_000, protocol: "wireguard", probeConfidence: 0.81 },
        { id: "stale-b", ping: 42, checkedAt: now - 96_000, protocol: "vless", probeConfidence: 0.12 },
        { id: "cooldown-node", ping: 18, checkedAt: now - 400, cooldownUntil: now + 45_000, protocol: "vless" }
      ],
      { now, limit: 2, probeBudget: 3 }
    );

    expect(plan.probeCandidates).toHaveLength(3);
    expect(plan.probeCandidates.map((candidate) => candidate.id)).toContain("stale-b");
    expect(plan.probeCandidates.map((candidate) => candidate.id)).not.toContain("cooldown-node");
  });
});
