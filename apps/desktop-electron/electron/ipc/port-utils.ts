import { createConnection, createServer } from "node:net";

/** Найти свободный TCP-порт начиная с preferredPort */
export async function findAvailablePort(preferredPort: number, taken: Set<number> = new Set()): Promise<number> {
  for (let offset = 0; offset <= 100; offset += 1) {
    const candidate = preferredPort + offset;
    if (taken.has(candidate)) continue;
    if (await canBindPort(candidate)) return candidate;
  }

  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to obtain dynamic port.")));
        return;
      }
      const { port } = address;
      server.close((closeErr) => {
        if (closeErr) {
          reject(closeErr);
          return;
        }
        resolve(port);
      });
    });
  });
}

/** Проверить можно ли забиндить порт */
export async function canBindPort(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

/** Ждём пока TCP-порт станет доступен */
export async function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  const interval = 100;
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise<void>((resolve, reject) => {
        const sock = createConnection({ host: "127.0.0.1", port, timeout: 500 }, () => {
          sock.destroy();
          resolve();
        });
        sock.on("error", () => {
          sock.destroy();
          reject();
        });
        sock.on("timeout", () => {
          sock.destroy();
          reject();
        });
      });
      return true;
    } catch {
      await delay(interval);
    }
  }
  return false;
}
