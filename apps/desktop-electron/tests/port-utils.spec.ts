import { describe, expect, it } from "vitest";
import { canBindPort, findAvailablePort, waitForPort } from "../electron/ipc/port-utils";

describe("port-utils", () => {
  it("findAvailablePort находит свободный порт", async () => {
    const port = await findAvailablePort(50000);
    expect(port).toBeGreaterThanOrEqual(50000);
    expect(port).toBeLessThanOrEqual(51000);
  });

  it("findAvailablePort пропускает taken порты", async () => {
    const taken = new Set([50000, 50001, 50002]);
    const port = await findAvailablePort(50000, taken);
    expect(taken.has(port)).toBe(false);
  });

  it("canBindPort возвращает true для свободного порта", async () => {
    const port = await findAvailablePort(50100);
    const result = await canBindPort(port);
    expect(result).toBe(true);
  });

  it("canBindPort возвращает false для занятого порта", async () => {
    const { createServer } = await import("node:net");
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;

    const result = await canBindPort(port);
    expect(result).toBe(false);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("waitForPort возвращает false при таймауте", async () => {
    // Порт 1 почти наверняка недоступен
    const result = await waitForPort(1, 300);
    expect(result).toBe(false);
  });
});
