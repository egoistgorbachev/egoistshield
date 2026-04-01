import { describe, expect, it } from "vitest";
import { buildRouteProbeResult, extractRouteProbeIp } from "../electron/ipc/route-probe";

describe("route-probe", () => {
  it("помечает обход VPN, когда прямой и VPN egress различаются", () => {
    expect(buildRouteProbeResult({ directIp: "203.0.113.10", vpnIp: "198.51.100.42" })).toEqual({
      bypassDetected: true,
      directIp: "203.0.113.10",
      vpnIp: "198.51.100.42",
      error: null
    });
  });

  it("возвращает ошибку, если не удалось определить VPN egress", () => {
    expect(buildRouteProbeResult({ directIp: "203.0.113.10", vpnIp: null })).toEqual({
      bypassDetected: false,
      directIp: "203.0.113.10",
      vpnIp: null,
      error: "Не удалось определить VPN egress-маршрут."
    });
  });

  it("нормализует IP из ответа внешнего сервиса", () => {
    expect(extractRouteProbeIp({ ip: " 198.51.100.42 " })).toBe("198.51.100.42");
    expect(extractRouteProbeIp({ ip: "" })).toBeNull();
    expect(extractRouteProbeIp({})).toBeNull();
  });
});
