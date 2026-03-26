import { describe, expect, it } from "vitest";
import {
  createQualityContextKey,
  restoreQualityFromCache,
  upsertQualityCache
} from "../renderer/src/lib/quality-cache";

describe("quality cache", () => {
  it("создаёт стабильный context key из DNS и kill switch профиля", () => {
    const defaultContext = createQualityContextKey({
      fakeDns: false,
      systemDnsServers: "",
      killSwitch: false
    });
    const customDnsContext = createQualityContextKey({
      fakeDns: true,
      systemDnsServers: "1.1.1.1,8.8.8.8",
      killSwitch: true
    });

    expect(defaultContext).toBe("auto-dns|system-default|kill-switch-off");
    expect(customDnsContext).toBe("secure-dns|system-custom|kill-switch-on");
  });

  it("persist + restore возвращает quality метрики только для совпадающего context", () => {
    const contextKey = createQualityContextKey({
      fakeDns: false,
      systemDnsServers: "",
      killSwitch: false
    });
    const server = upsertQualityCache(
      {
        ping: 31,
        lastPingAt: 10_000,
        stabilityScore: 82,
        probeConfidence: 0.88,
        recentPingSamples: [30, 32, 31],
        recentQualitySamples: [79, 81, 83]
      },
      contextKey,
      10_000
    );

    const restored = restoreQualityFromCache(
      {
        ping: 0,
        lastPingAt: null,
        stabilityScore: null,
        probeConfidence: null,
        qualityCache: server.qualityCache
      },
      contextKey,
      12_000
    );
    const wrongContextRestored = restoreQualityFromCache(
      {
        ping: 0,
        lastPingAt: null,
        stabilityScore: null,
        probeConfidence: null,
        qualityCache: server.qualityCache
      },
      "auto-dns|system-custom|kill-switch-off",
      12_000
    );

    expect(restored.ping).toBe(31);
    expect(restored.stabilityScore).toBeGreaterThan(70);
    expect(restored.probeConfidence).toBeGreaterThan(0.7);
    expect(wrongContextRestored.ping).toBe(0);
    expect(wrongContextRestored.stabilityScore).toBeNull();
  });

  it("старый cache мягко decay'ится и перестаёт быть жёстким сигналом", () => {
    const contextKey = createQualityContextKey({
      fakeDns: false,
      systemDnsServers: "",
      killSwitch: true
    });
    const server = upsertQualityCache(
      {
        ping: 29,
        lastPingAt: 20_000,
        stabilityScore: 90,
        probeConfidence: 0.96,
        degradationCount: 4
      },
      contextKey,
      20_000
    );

    const restored = restoreQualityFromCache(
      {
        ping: 0,
        lastPingAt: null,
        stabilityScore: null,
        probeConfidence: null,
        degradationCount: null,
        qualityCache: server.qualityCache
      },
      contextKey,
      20_000 + 48 * 60 * 60 * 1000
    );

    expect(restored.stabilityScore).not.toBe(90);
    expect(restored.probeConfidence).not.toBe(0.96);
    expect(restored.degradationCount).toBeLessThan(4);
  });
});
