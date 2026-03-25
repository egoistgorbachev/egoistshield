import { describe, expect, it } from "vitest";
import {
  buildSmartProbeTargets,
  computeSmartScore,
  mergeSmartCandidates,
  rankFreshSmartCandidates,
  rankSmartCandidates,
  shouldSwitchToCandidate
} from "../renderer/src/lib/smart-connect";

describe("smart-connect helpers", () => {
  it("rankSmartCandidates сортирует доступные узлы по ping и отсекает исключённый id", () => {
    // Arrange
    const pingResults = [
      { id: "node-a", ping: 82 },
      { id: "node-b", ping: 31 },
      { id: "node-c", ping: Number.POSITIVE_INFINITY },
      { id: "node-d", ping: 24 },
      { id: "node-e", ping: -1 }
    ];

    // Act
    const ranked = rankSmartCandidates(pingResults, "node-b");

    // Assert
    expect(ranked).toEqual([
      { id: "node-d", ping: 24 },
      { id: "node-a", ping: 82 }
    ]);
  });

  it("rankSmartCandidates ограничивает число кандидатов", () => {
    // Arrange
    const pingResults = [
      { id: "node-a", ping: 52 },
      { id: "node-b", ping: 33 },
      { id: "node-c", ping: 21 },
      { id: "node-d", ping: 19 }
    ];

    // Act
    const ranked = rankSmartCandidates(pingResults, undefined, 2);

    // Assert
    expect(ranked).toEqual([
      { id: "node-d", ping: 19 },
      { id: "node-c", ping: 21 }
    ]);
  });

  it("rankFreshSmartCandidates использует только свежие измерения", () => {
    // Arrange
    const now = 50_000;
    const pingResults = [
      { id: "node-a", ping: 48, checkedAt: now - 2_000 },
      { id: "node-b", ping: 22, checkedAt: now - 20_000 },
      { id: "node-c", ping: 35, checkedAt: now - 1_000 }
    ];

    // Act
    const ranked = rankFreshSmartCandidates(pingResults, undefined, 3, now, 10_000);

    // Assert
    expect(ranked).toEqual([
      { id: "node-c", ping: 35, checkedAt: now - 1_000 },
      { id: "node-a", ping: 48, checkedAt: now - 2_000 }
    ]);
  });

  it("buildSmartProbeTargets сначала выбирает свежие и измеренные узлы", () => {
    // Arrange
    const now = 80_000;
    const pingResults = [
      { id: "node-a", ping: 90, checkedAt: now - 3_000 },
      { id: "node-b", ping: 30, checkedAt: now - 1_000 },
      { id: "node-c", ping: 0, checkedAt: now - 500 },
      { id: "node-d", ping: 55, checkedAt: now - 40_000 },
      { id: "node-e", ping: 0, checkedAt: null }
    ];

    // Act
    const targets = buildSmartProbeTargets(pingResults, undefined, 3, now, 10_000);

    // Assert
    expect(targets.map((target) => target.id)).toEqual(["node-b", "node-a", "node-d"]);
  });

  it("mergeSmartCandidates обновляет кандидата более свежим измерением", () => {
    // Arrange
    const merged = mergeSmartCandidates(
      [{ id: "node-a", ping: 65, checkedAt: 1_000 }],
      [
        { id: "node-a", ping: 42, checkedAt: 2_000 },
        { id: "node-b", ping: 31, checkedAt: 2_000 }
      ]
    );

    // Act
    const ranked = rankSmartCandidates(merged);

    // Assert
    expect(ranked).toEqual([
      { id: "node-b", ping: 31, checkedAt: 2_000 },
      { id: "node-a", ping: 42, checkedAt: 2_000 }
    ]);
  });

  it("computeSmartScore штрафует потери и недавние фейлы сильнее, чем небольшой выигрыш по ping", () => {
    // Arrange
    const now = 100_000;
    const stableCandidate = {
      id: "stable",
      ping: 42,
      jitterMs: 3,
      lossPercent: 0,
      failureCount: 0,
      checkedAt: now - 1_000
    };
    const unstableCandidate = {
      id: "unstable",
      ping: 28,
      jitterMs: 22,
      lossPercent: 7,
      failureCount: 2,
      lastFailureAt: now - 30_000,
      checkedAt: now - 1_000
    };

    // Act
    const stableScore = computeSmartScore(stableCandidate, now);
    const unstableScore = computeSmartScore(unstableCandidate, now);
    const ranked = rankSmartCandidates([unstableCandidate, stableCandidate], undefined, 2, now);

    // Assert
    expect(stableScore).toBeLessThan(unstableScore);
    expect(ranked[0]?.id).toBe("stable");
  });

  it("shouldSwitchToCandidate требует заметного абсолютного и относительного выигрыша", () => {
    // Arrange / Act / Assert
    expect(shouldSwitchToCandidate(120, 70)).toBe(true);
    expect(shouldSwitchToCandidate(70, 50)).toBe(false);
    expect(shouldSwitchToCandidate(120, 101)).toBe(false);
  });
});
