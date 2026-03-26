import { describe, expect, it } from "vitest";
import { computeAdaptiveProbeBudget } from "../renderer/src/lib/smart-connect";
import { type ServerConfig, selectServersForPingSweep } from "../renderer/src/store/slices/servers-slice";

type PingableServer = ServerConfig & { _host: string; _port: number };

function createServer(id: string, ping: number, protocol = "vless"): PingableServer {
  return {
    id,
    name: id,
    protocol,
    ping,
    load: null,
    countryCode: "us",
    _host: `${id}.example.com`,
    _port: 443
  };
}

describe("ping sweep selection", () => {
  it("computeAdaptiveProbeBudget усиливает sampling для degraded QUIC и уменьшает для стабильного default режима", () => {
    const degradedQuicBudget = computeAdaptiveProbeBudget({
      serverCount: 18,
      stage: "degraded",
      protocol: "hysteria2",
      currentLifecycle: "degraded",
      stabilityScore: 42,
      probeConfidence: 0.34
    });
    const stableDefaultBudget = computeAdaptiveProbeBudget({
      serverCount: 18,
      stage: "default_connected",
      protocol: "vless",
      currentLifecycle: "active",
      stabilityScore: 86,
      probeConfidence: 0.92
    });

    expect(degradedQuicBudget).toBeGreaterThan(stableDefaultBudget);
  });

  it("default connected mode пингует active node и только небольшой round-robin batch", () => {
    const servers = [
      createServer("active", 25),
      createServer("b", 30),
      createServer("c", 35),
      createServer("d", 40),
      createServer("e", 45)
    ];

    const firstSelection = selectServersForPingSweep(servers, {
      connectionMode: "default",
      isConnected: true,
      selectedServerId: "active",
      connectedServerId: "active",
      sweepOffset: 0,
      smartProbeBudget: 4,
      now: 1_000
    });
    const secondSelection = selectServersForPingSweep(servers, {
      connectionMode: "default",
      isConnected: true,
      selectedServerId: "active",
      connectedServerId: "active",
      sweepOffset: firstSelection.nextOffset,
      smartProbeBudget: 4,
      now: 2_000
    });

    expect(firstSelection.targets.map((server) => server.id)).toEqual(["active", "b", "c"]);
    expect(secondSelection.targets.map((server) => server.id)).toEqual(["active", "d", "e"]);
  });

  it("smart connected mode сохраняет active node и sampling shortlist кандидатов", () => {
    const servers = [
      createServer("active", 48, "vless"),
      { ...createServer("candidate-a", 33, "wireguard"), probeConfidence: 0.78, stabilityScore: 72 },
      { ...createServer("candidate-b", 29, "hysteria2"), probeConfidence: 0.44, stabilityScore: 58 },
      { ...createServer("candidate-c", 42, "trojan"), probeConfidence: 0.88, stabilityScore: 84 }
    ];

    const selection = selectServersForPingSweep(servers, {
      connectionMode: "smart",
      isConnected: true,
      selectedServerId: "active",
      connectedServerId: "active",
      sweepOffset: 0,
      smartProbeBudget: 3,
      now: 3_000
    });

    expect(selection.targets[0]?.id).toBe("active");
    expect(selection.targets.length).toBeLessThanOrEqual(4);
    expect(selection.targets.some((server) => server.id === "candidate-b")).toBe(true);
  });
});
