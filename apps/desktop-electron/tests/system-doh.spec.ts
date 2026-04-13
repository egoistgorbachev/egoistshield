import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSystemDohXrayConfig, SystemDohManager } from "../electron/ipc/system-doh-manager";
import {
  buildSystemDohLoopbackCandidates,
  buildXrayLocalDohServerUrl,
  normalizeSystemDohLocalAddress
} from "../shared/system-doh";

interface RuntimeInfo {
  sourceDir: string;
  runtimePath: string;
  version: string | null;
}

interface ManagedState {
  pid: number | null;
  startedAt: string;
  localAddress: string;
  localPort: number;
  url: string;
}

interface ManagerInternals {
  ensureManagedRuntimeInstalled(): Promise<RuntimeInfo>;
  getSourceRuntimeInfo(): Promise<RuntimeInfo | null>;
  writeManagedState(state: ManagedState): Promise<void>;
  readManagedState(): Promise<ManagedState | null>;
}

const tempRoots: string[] = [];

afterEach(async () => {
  while (tempRoots.length > 0) {
    const target = tempRoots.pop();
    if (target) {
      await fs.rm(target, { recursive: true, force: true });
    }
  }
  vi.restoreAllMocks();
});

describe("system-doh helpers", () => {
  it("принимает только loopback IPv4 адреса", () => {
    expect(normalizeSystemDohLocalAddress("127.0.0.2", "")).toBe("127.0.0.2");
    expect(normalizeSystemDohLocalAddress("127.0.1.15", "")).toBe("127.0.1.15");
    expect(normalizeSystemDohLocalAddress("127.0.0.1", "")).toBe("127.0.0.1");
    expect(normalizeSystemDohLocalAddress("192.168.1.1", "")).toBe("");
    expect(normalizeSystemDohLocalAddress("localhost", "")).toBe("");
  });

  it("строит набор кандидатов без 127.0.0.1 и с приоритетом сохранённого адреса", () => {
    expect(buildSystemDohLoopbackCandidates("127.0.0.4").slice(0, 4)).toEqual([
      "127.0.0.4",
      "127.0.0.2",
      "127.0.0.3",
      "127.0.0.5"
    ]);
    expect(buildSystemDohLoopbackCandidates("127.0.0.1").slice(0, 3)).toEqual([
      "127.0.0.2",
      "127.0.0.3",
      "127.0.0.4"
    ]);
  });

  it("конвертирует пользовательский DoH URL в формат Xray https+local", () => {
    expect(buildXrayLocalDohServerUrl("https://dns.astronia.space:8443/dns-query/b4bb465a")).toBe(
      "https+local://dns.astronia.space:8443/dns-query/b4bb465a"
    );
    expect(buildXrayLocalDohServerUrl("https://1.1.1.1/dns-query?dns=abc")).toBe(
      "https+local://1.1.1.1/dns-query?dns=abc"
    );
  });

  it("собирает DNS-only конфиг Xray для loopback System DoH", () => {
    const config = JSON.parse(
      buildSystemDohXrayConfig({
        url: "https://dns.astronia.space:8443/dns-query/b4bb465a",
        localAddress: "127.0.0.2",
        logPath: "C:/logs/system-doh.log"
      })
    ) as {
      inbounds: Array<{ listen?: string; port?: number; protocol?: string }>;
      outbounds: Array<{ tag?: string; protocol?: string }>;
      dns?: { servers?: string[] };
      routing?: { rules?: Array<{ inboundTag?: string[]; outboundTag?: string }> };
    };

    expect(config.inbounds[0]).toMatchObject({
      listen: "127.0.0.2",
      port: 53,
      protocol: "dokodemo-door"
    });
    expect(config.outbounds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tag: "dns-out", protocol: "dns" }),
        expect.objectContaining({ tag: "direct", protocol: "freedom" })
      ])
    );
    expect(config.dns?.servers).toEqual(["https+local://dns.astronia.space:8443/dns-query/b4bb465a"]);
    expect(config.routing?.rules?.[0]).toMatchObject({
      inboundTag: ["dns-in"],
      outboundTag: "dns-out"
    });
  });
});

describe("SystemDohManager", () => {
  it("копирует bundled xray в managed runtime и сохраняет версию", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "egoist-system-doh-runtime-"));
    tempRoots.push(tempRoot);

    const resourcesPath = path.join(tempRoot, "resources");
    const appPath = path.join(tempRoot, "app");
    const userDataDir = path.join(tempRoot, "user-data");
    const sourceDir = path.join(resourcesPath, "runtime", "xray");
    const sourceRuntimePath = path.join(sourceDir, "xray.exe");

    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(sourceRuntimePath, "fake-xray-runtime", "utf8");
    await fs.writeFile(path.join(sourceDir, "VERSION.txt"), "1.9.7\n", "utf8");

    const manager = new SystemDohManager(resourcesPath, appPath, userDataDir) as unknown as ManagerInternals;
    const runtime = await manager.ensureManagedRuntimeInstalled();
    const managedRuntimePath = path.join(userDataDir, "runtime", "system-doh", "xray-system-doh.exe");

    await expect(fs.readFile(managedRuntimePath, "utf8")).resolves.toBe("fake-xray-runtime");
    await expect(fs.readFile(path.join(userDataDir, "runtime", "system-doh", "VERSION.txt"), "utf8")).resolves.toContain(
      "1.9.7"
    );
    expect(runtime.runtimePath).toBe(managedRuntimePath);
    expect(runtime.version).toBe("1.9.7");
  });

  it("использует уже установленный managed runtime, если source runtime временно недоступен", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "egoist-system-doh-managed-only-"));
    tempRoots.push(tempRoot);

    const resourcesPath = path.join(tempRoot, "resources");
    const appPath = path.join(tempRoot, "app");
    const userDataDir = path.join(tempRoot, "user-data");
    const managedDir = path.join(userDataDir, "runtime", "system-doh");
    const managedRuntimePath = path.join(managedDir, "xray-system-doh.exe");

    await fs.mkdir(managedDir, { recursive: true });
    await fs.writeFile(managedRuntimePath, "managed-runtime", "utf8");
    await fs.writeFile(path.join(managedDir, "VERSION.txt"), "1.9.8\n", "utf8");

    const manager = new SystemDohManager(resourcesPath, appPath, userDataDir) as unknown as ManagerInternals;
    vi.spyOn(manager as unknown as { getSourceRuntimeInfo(): Promise<RuntimeInfo | null> }, "getSourceRuntimeInfo").mockResolvedValue(
      null
    );
    const runtime = await manager.ensureManagedRuntimeInstalled();

    expect(runtime).toMatchObject({
      sourceDir: managedDir,
      runtimePath: managedRuntimePath,
      version: "1.9.8"
    });
  });

  it("status() очищает битый state, если pid уже не существует", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "egoist-system-doh-status-"));
    tempRoots.push(tempRoot);

    const resourcesPath = path.join(tempRoot, "resources");
    const appPath = path.join(tempRoot, "app");
    const userDataDir = path.join(tempRoot, "user-data");
    const managedDir = path.join(userDataDir, "runtime", "system-doh");

    await fs.mkdir(managedDir, { recursive: true });
    await fs.writeFile(path.join(managedDir, "xray-system-doh.exe"), "managed-runtime", "utf8");
    await fs.writeFile(path.join(managedDir, "VERSION.txt"), "1.9.7\n", "utf8");

    const manager = new SystemDohManager(resourcesPath, appPath, userDataDir) as unknown as ManagerInternals &
      SystemDohManager;
    await manager.writeManagedState({
      pid: 999_999,
      startedAt: new Date().toISOString(),
      localAddress: "127.0.0.9",
      localPort: 53,
      url: "https://1.1.1.1/dns-query"
    });

    const status = await manager.status();

    expect(status.available).toBe(true);
    expect(status.running).toBe(false);
    expect(status.pid).toBeNull();
    expect(status.currentUrl).toBe("https://1.1.1.1/dns-query");
    await expect(manager.readManagedState()).resolves.toBeNull();
  });

  it("readManagedState() нормализует битые поля и оставляет loopback по умолчанию", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "egoist-system-doh-state-normalize-"));
    tempRoots.push(tempRoot);

    const resourcesPath = path.join(tempRoot, "resources");
    const appPath = path.join(tempRoot, "app");
    const userDataDir = path.join(tempRoot, "user-data");
    const workDir = path.join(userDataDir, "system-doh");

    await fs.mkdir(workDir, { recursive: true });
    await fs.writeFile(
      path.join(workDir, "state.json"),
      JSON.stringify({
        pid: "bad",
        startedAt: 42,
        localAddress: "192.168.1.10",
        localPort: "53",
        url: "not-a-url"
      }),
      "utf8"
    );

    const manager = new SystemDohManager(resourcesPath, appPath, userDataDir) as unknown as ManagerInternals;
    const state = await manager.readManagedState();

    expect(state).toMatchObject({
      pid: null,
      localAddress: "127.0.0.2",
      localPort: 53,
      url: "not-a-url"
    });
    expect(Date.parse(state?.startedAt ?? "")).not.toBeNaN();
  });

  it("apply() сразу возвращает текущий status, если тот же DoH уже поднят", async () => {
    const manager = new SystemDohManager("C:\\resources", "C:\\app", "C:\\user-data");
    const currentStatus = {
      available: true,
      running: true,
      pid: 1234,
      startedAt: new Date().toISOString(),
      runtimePath: "C:\\managed\\xray-system-doh.exe",
      configPath: "C:\\managed\\config.json",
      logPath: "C:\\managed\\runtime.log",
      localAddress: "127.0.0.9",
      localPort: 53,
      currentUrl: "https://1.1.1.1/dns-query",
      lastError: null
    };

    const statusSpy = vi.spyOn(manager, "status").mockResolvedValue(currentStatus);
    const stopSpy = vi.spyOn(manager, "stop").mockResolvedValue(currentStatus);

    const result = await manager.apply("https://1.1.1.1/dns-query", "127.0.0.2");

    expect(result).toBe(currentStatus);
    expect(statusSpy).toHaveBeenCalledTimes(1);
    expect(stopSpy).not.toHaveBeenCalled();
  });

  it("recover() возвращает null, если System DoH выключен или URL пустой", async () => {
    const manager = new SystemDohManager("C:\\resources", "C:\\app", "C:\\user-data");

    await expect(manager.recover({ enabled: false, url: "https://1.1.1.1/dns-query" })).resolves.toBeNull();
    await expect(manager.recover({ enabled: true, url: "" })).resolves.toBeNull();
  });

  it("recover() возвращает status с lastError, если apply() завершился ошибкой", async () => {
    const manager = new SystemDohManager("C:\\resources", "C:\\app", "C:\\user-data");
    const statusSpy = vi.spyOn(manager, "status").mockResolvedValue({
      available: true,
      running: false,
      pid: null,
      startedAt: null,
      runtimePath: "C:\\managed\\xray-system-doh.exe",
      configPath: "C:\\managed\\config.json",
      logPath: "C:\\managed\\runtime.log",
      localAddress: null,
      localPort: null,
      currentUrl: null,
      lastError: "bind failed"
    });

    vi.spyOn(manager, "apply").mockRejectedValue(new Error("bind failed"));

    const result = await manager.recover({
      enabled: true,
      url: "https://1.1.1.1/dns-query",
      localAddress: "127.0.0.2"
    });

    expect(result).toMatchObject({
      running: false,
      lastError: "bind failed"
    });
    expect(statusSpy).toHaveBeenCalled();
  });
});
