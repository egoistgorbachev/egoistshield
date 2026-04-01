import type { RouteProbeResult } from "../../shared/types";

export interface RouteProbeSnapshot {
  directIp: string | null;
  vpnIp: string | null;
}

export function extractRouteProbeIp(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = (payload as { ip?: unknown }).ip;
  if (typeof candidate !== "string") {
    return null;
  }

  const trimmed = candidate.trim();
  return trimmed || null;
}

export function buildRouteProbeResult({ directIp, vpnIp }: RouteProbeSnapshot): RouteProbeResult {
  if (!vpnIp) {
    return {
      bypassDetected: false,
      directIp,
      vpnIp: null,
      error: "Не удалось определить VPN egress-маршрут."
    };
  }

  if (!directIp) {
    return {
      bypassDetected: false,
      directIp: null,
      vpnIp,
      error: "Не удалось определить прямой egress-маршрут."
    };
  }

  return {
    bypassDetected: directIp !== vpnIp,
    directIp,
    vpnIp,
    error: null
  };
}
