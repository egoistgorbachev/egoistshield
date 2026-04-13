import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { execFileMock, spawnMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  spawnMock: vi.fn()
}));

vi.mock("electron", () => ({
  shell: {
    openExternal: vi.fn(),
    showItemInFolder: vi.fn()
  }
}));

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    execFile: execFileMock,
    spawn: spawnMock
  };
});

import { TelegramProxyManager } from "../electron/ipc/telegram-proxy-manager";

const TG_MANAGED_RUNTIME_NAME = "egoistshield-tg-ws-proxy.exe";
const TG_BUNDLED_RUNTIME_NAME = "egoistshield-tg-ws-proxy.bin";
const TG_DESIRED_FLAVOR = "headless-windowless";

describe("TelegramProxyManager runtime integration", () => {
  let tempRoot: string;
  let previousAppData: string | undefined;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "egoist-tg-runtime-"));
    previousAppData = process.env.APPDATA;
    process.env.APPDATA = path.join(tempRoot, "LegacyAppData");
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    execFileMock.mockImplementation(
      (
        _file: string,
        _args: readonly string[] | undefined,
        _options: Record<string, unknown> | undefined,
        callback?: (error: Error | null, stdout: string, stderr: string) => void
      ) => {
        callback?.(null, "", "");
      }
    );
    spawnMock.mockReturnValue({
      pid: process.pid,
      unref: vi.fn()
    });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    process.env.APPDATA = previousAppData;
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("start запускает managed headless runtime с CLI-аргументами и хранит конфиг внутри EgoistShield", async () => {
    const appRoot = path.join(tempRoot, "app");
    const userRoot = path.join(tempRoot, "user");
    const bundledRuntimeDir = path.join(appRoot, "runtime", "tg-ws-proxy");
    await fs.mkdir(bundledRuntimeDir, { recursive: true });
    await fs.writeFile(path.join(bundledRuntimeDir, TG_BUNDLED_RUNTIME_NAME), "headless-runtime");
    await fs.writeFile(path.join(bundledRuntimeDir, "VERSION.txt"), "v1.4.0\n");
    await fs.writeFile(path.join(bundledRuntimeDir, "RUNTIME_FLAVOR.txt"), `${TG_DESIRED_FLAVOR}\n`);

    const manager = new TelegramProxyManager(path.join(tempRoot, "resources"), appRoot, userRoot);
    await manager.saveConfig({
      host: "127.0.0.1",
      port: 1443,
      secret: "0123456789abcdef0123456789abcdef",
      dcIp: ["2:149.154.167.220", "4:149.154.167.220"],
      verbose: true,
      bufKb: 512,
      poolSize: 8,
      logMaxMb: 7,
      checkUpdates: true
    });

    const status = await manager.start();

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock).toHaveBeenCalledWith(
      path.join(userRoot, "runtime", "tg-ws-proxy", TG_MANAGED_RUNTIME_NAME),
      [
        "--host",
        "127.0.0.1",
        "--port",
        "1443",
        "--secret",
        "0123456789abcdef0123456789abcdef",
        "--buf-kb",
        "512",
        "--pool-size",
        "8",
        "--log-file",
        path.join(userRoot, "telegram-proxy", "proxy.log"),
        "--log-max-mb",
        "7",
        "--dc-ip",
        "2:149.154.167.220",
        "--dc-ip",
        "4:149.154.167.220",
        "--verbose"
      ],
      expect.objectContaining({
        detached: true,
        windowsHide: true
      })
    );
    expect(status.configPath).toBe(path.join(userRoot, "telegram-proxy", "config.json"));
    expect(status.logPath).toBe(path.join(userRoot, "telegram-proxy", "proxy.log"));
    expect(status.pid).toBe(process.pid);
    expect(await fs.readFile(path.join(userRoot, "runtime", "tg-ws-proxy", TG_MANAGED_RUNTIME_NAME), "utf8")).toBe(
      "headless-runtime"
    );

    const savedConfig = JSON.parse(await fs.readFile(path.join(userRoot, "telegram-proxy", "config.json"), "utf8")) as {
      host: string;
      port: number;
      check_updates: boolean;
    };
    expect(savedConfig.host).toBe("127.0.0.1");
    expect(savedConfig.port).toBe(1443);
    expect(savedConfig.check_updates).toBe(true);
  });

  it("checkForUpdates и installUpdate восстанавливают bundled headless runtime вместо tray-версии upstream", async () => {
    const resourcesRoot = path.join(tempRoot, "resources");
    const userRoot = path.join(tempRoot, "user");
    const bundledRuntimeDir = path.join(resourcesRoot, "runtime", "tg-ws-proxy");
    const userRuntimeDir = path.join(userRoot, "runtime", "tg-ws-proxy");

    await fs.mkdir(bundledRuntimeDir, { recursive: true });
    await fs.mkdir(userRuntimeDir, { recursive: true });
    await fs.writeFile(path.join(bundledRuntimeDir, TG_BUNDLED_RUNTIME_NAME), "bundled-runtime");
    await fs.writeFile(path.join(bundledRuntimeDir, "VERSION.txt"), "v1.6.1\n");
    await fs.writeFile(path.join(bundledRuntimeDir, "RUNTIME_FLAVOR.txt"), `${TG_DESIRED_FLAVOR}\n`);
    await fs.writeFile(path.join(userRuntimeDir, TG_MANAGED_RUNTIME_NAME), "tray-runtime");
    await fs.writeFile(path.join(userRuntimeDir, "VERSION.txt"), "v1.6.1\n");

    const manager = new TelegramProxyManager(resourcesRoot, path.join(tempRoot, "app"), userRoot);

    const info = await manager.checkForUpdates();
    expect(info.currentVersion).toBe("v1.6.1");
    expect(info.latestVersion).toBe("v1.6.1");
    expect(info.updateAvailable).toBe(true);
    expect(info.message).toContain("headless");

    await manager.installUpdate();

    expect(await fs.readFile(path.join(userRuntimeDir, TG_MANAGED_RUNTIME_NAME), "utf8")).toBe("bundled-runtime");
    expect(await fs.readFile(path.join(userRuntimeDir, "VERSION.txt"), "utf8")).toContain("v1.6.1");
    expect(await fs.readFile(path.join(userRuntimeDir, "RUNTIME_FLAVOR.txt"), "utf8")).toContain("headless");
  });

  it("start не откатывает более новый managed runtime назад на старый bundled runtime", async () => {
    const appRoot = path.join(tempRoot, "app");
    const userRoot = path.join(tempRoot, "user");
    const bundledRuntimeDir = path.join(appRoot, "runtime", "tg-ws-proxy");
    const userRuntimeDir = path.join(userRoot, "runtime", "tg-ws-proxy");

    await fs.mkdir(bundledRuntimeDir, { recursive: true });
    await fs.mkdir(userRuntimeDir, { recursive: true });
    await fs.writeFile(path.join(bundledRuntimeDir, TG_BUNDLED_RUNTIME_NAME), "bundled-runtime");
    await fs.writeFile(path.join(bundledRuntimeDir, "VERSION.txt"), "v1.4.0\n");
    await fs.writeFile(path.join(bundledRuntimeDir, "RUNTIME_FLAVOR.txt"), `${TG_DESIRED_FLAVOR}\n`);
    await fs.writeFile(path.join(userRuntimeDir, TG_MANAGED_RUNTIME_NAME), "remote-runtime");
    await fs.writeFile(path.join(userRuntimeDir, "VERSION.txt"), "v1.6.1\n");
    await fs.writeFile(path.join(userRuntimeDir, "RUNTIME_FLAVOR.txt"), `${TG_DESIRED_FLAVOR}\n`);

    const manager = new TelegramProxyManager(path.join(tempRoot, "resources"), appRoot, userRoot);
    await manager.start();

    expect(await fs.readFile(path.join(userRuntimeDir, TG_MANAGED_RUNTIME_NAME), "utf8")).toBe("remote-runtime");
    expect(await fs.readFile(path.join(userRuntimeDir, "VERSION.txt"), "utf8")).toContain("v1.6.1");
  });

  it("start автоматически лечит managed runtime без headless-маркера и заменяет его bundled headless runtime", async () => {
    const appRoot = path.join(tempRoot, "app");
    const userRoot = path.join(tempRoot, "user");
    const bundledRuntimeDir = path.join(appRoot, "runtime", "tg-ws-proxy");
    const userRuntimeDir = path.join(userRoot, "runtime", "tg-ws-proxy");

    await fs.mkdir(bundledRuntimeDir, { recursive: true });
    await fs.mkdir(userRuntimeDir, { recursive: true });
    await fs.writeFile(path.join(bundledRuntimeDir, TG_BUNDLED_RUNTIME_NAME), "bundled-headless-runtime");
    await fs.writeFile(path.join(bundledRuntimeDir, "VERSION.txt"), "v1.6.1\n");
    await fs.writeFile(path.join(bundledRuntimeDir, "RUNTIME_FLAVOR.txt"), `${TG_DESIRED_FLAVOR}\n`);
    await fs.writeFile(path.join(userRuntimeDir, TG_MANAGED_RUNTIME_NAME), "legacy-tray-runtime");
    await fs.writeFile(path.join(userRuntimeDir, "VERSION.txt"), "v1.6.1\n");

    const manager = new TelegramProxyManager(path.join(tempRoot, "resources"), appRoot, userRoot);
    await manager.start();

    expect(await fs.readFile(path.join(userRuntimeDir, TG_MANAGED_RUNTIME_NAME), "utf8")).toBe(
      "bundled-headless-runtime"
    );
    expect(await fs.readFile(path.join(userRuntimeDir, "RUNTIME_FLAVOR.txt"), "utf8")).toContain("headless");
  });

  it("checkForUpdates чинит legacy console-headless runtime даже при той же версии", async () => {
    const resourcesRoot = path.join(tempRoot, "resources");
    const userRoot = path.join(tempRoot, "user");
    const bundledRuntimeDir = path.join(resourcesRoot, "runtime", "tg-ws-proxy");
    const userRuntimeDir = path.join(userRoot, "runtime", "tg-ws-proxy");

    await fs.mkdir(bundledRuntimeDir, { recursive: true });
    await fs.mkdir(userRuntimeDir, { recursive: true });
    await fs.writeFile(path.join(bundledRuntimeDir, TG_BUNDLED_RUNTIME_NAME), "bundled-windowless-runtime");
    await fs.writeFile(path.join(bundledRuntimeDir, "VERSION.txt"), "v1.6.1\n");
    await fs.writeFile(path.join(bundledRuntimeDir, "RUNTIME_FLAVOR.txt"), `${TG_DESIRED_FLAVOR}\n`);
    await fs.writeFile(path.join(userRuntimeDir, TG_MANAGED_RUNTIME_NAME), "legacy-console-headless-runtime");
    await fs.writeFile(path.join(userRuntimeDir, "VERSION.txt"), "v1.6.1\n");
    await fs.writeFile(path.join(userRuntimeDir, "RUNTIME_FLAVOR.txt"), "headless\n");

    const manager = new TelegramProxyManager(resourcesRoot, path.join(tempRoot, "app"), userRoot);
    const updateInfo = await manager.checkForUpdates();

    expect(updateInfo.currentVersion).toBe("v1.6.1");
    expect(updateInfo.latestVersion).toBe("v1.6.1");
    expect(updateInfo.updateAvailable).toBe(true);
    expect(updateInfo.message).toContain("консоли");

    await manager.installUpdate();

    expect(await fs.readFile(path.join(userRuntimeDir, TG_MANAGED_RUNTIME_NAME), "utf8")).toBe(
      "bundled-windowless-runtime"
    );
    expect(await fs.readFile(path.join(userRuntimeDir, "RUNTIME_FLAVOR.txt"), "utf8")).toContain(TG_DESIRED_FLAVOR);
  });

  it("installUpdate принудительно завершает старый tray runtime перед заменой managed exe", async () => {
    const resourcesRoot = path.join(tempRoot, "resources");
    const userRoot = path.join(tempRoot, "user");
    const bundledRuntimeDir = path.join(resourcesRoot, "runtime", "tg-ws-proxy");
    const userRuntimeDir = path.join(userRoot, "runtime", "tg-ws-proxy");

    await fs.mkdir(bundledRuntimeDir, { recursive: true });
    await fs.mkdir(userRuntimeDir, { recursive: true });
    await fs.writeFile(path.join(bundledRuntimeDir, TG_BUNDLED_RUNTIME_NAME), "bundled-headless-runtime");
    await fs.writeFile(path.join(bundledRuntimeDir, "VERSION.txt"), "v1.6.1\n");
    await fs.writeFile(path.join(bundledRuntimeDir, "RUNTIME_FLAVOR.txt"), `${TG_DESIRED_FLAVOR}\n`);
    await fs.writeFile(path.join(userRuntimeDir, TG_MANAGED_RUNTIME_NAME), "legacy-tray-runtime");
    await fs.writeFile(path.join(userRuntimeDir, "VERSION.txt"), "v1.6.1\n");

    const manager = new TelegramProxyManager(resourcesRoot, path.join(tempRoot, "app"), userRoot);
    await manager.installUpdate();

    expect(execFileMock).toHaveBeenCalled();
    const firstCall = execFileMock.mock.calls[0] ?? [];
    expect(String(firstCall[0])).toContain("powershell.exe");
    expect(String(firstCall[1]?.[5] ?? "")).toContain(TG_MANAGED_RUNTIME_NAME);
    expect(String(firstCall[1]?.[5] ?? "")).toContain(path.join(userRuntimeDir, TG_MANAGED_RUNTIME_NAME));
    expect(await fs.readFile(path.join(userRuntimeDir, TG_MANAGED_RUNTIME_NAME), "utf8")).toBe(
      "bundled-headless-runtime"
    );
  });

  it("мигрирует legacy config из %APPDATA%\\TgWsProxy в internal EgoistShield storage", async () => {
    const legacyDir = path.join(process.env.APPDATA as string, "TgWsProxy");
    await fs.mkdir(legacyDir, { recursive: true });
    await fs.writeFile(
      path.join(legacyDir, "config.json"),
      `${JSON.stringify({
        host: "10.0.0.2",
        port: 1666,
        secret: "ddabcdefabcdefabcdefabcdefabcdef",
        dc_ip: ["2:149.154.167.220"],
        verbose: false,
        buf_kb: 256,
        pool_size: 4,
        log_max_mb: 5,
        check_updates: false
      })}\n`
    );

    const manager = new TelegramProxyManager(path.join(tempRoot, "resources"), path.join(tempRoot, "app"), path.join(tempRoot, "user"));
    const status = await manager.status();

    expect(status.config.host).toBe("10.0.0.2");
    expect(status.config.port).toBe(1666);
    expect(status.config.checkUpdates).toBe(false);
    expect(status.configPath).toBe(path.join(tempRoot, "user", "telegram-proxy", "config.json"));
  });
});
