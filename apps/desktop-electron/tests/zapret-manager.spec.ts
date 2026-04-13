import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ZapretStatus } from "../electron/ipc/contracts";
import packageJson from "../package.json";
import { resolveWindowsExecutable } from "../electron/ipc/windows-system-binaries";
import {
  buildDiscordCacheCleanupPlan,
  type ZapretManager,
  ZapretManager as ZapretManagerClass,
  applyZapretPlaceholders,
  compareZapretProfileNames,
  isFlowsealRootPayloadEntry,
  isScAlreadyRunningError,
  isScNotActiveError,
  isWindowsServiceMissingError,
  parseZapretWinwsArgs,
  splitWindowsCommandLine
} from "../electron/ipc/zapret-manager";

const SAMPLE_PROFILE = `@echo off
set "BIN=%~dp0bin\\"
set "LISTS=%~dp0lists\\"
start "zapret: %~n0" /min "%BIN%winws.exe" --wf-tcp=80,443,%GameFilterTCP% --wf-udp=443,%GameFilterUDP% ^
--filter-udp=443 --hostlist="%LISTS%list-general.txt" --dpi-desync=fake --new ^
--filter-tcp=%GameFilterTCP% --dpi-desync=fake --dpi-desync-fake-tls=^!
`;
const APP_VERSION = packageJson.version;

interface ServiceQueryResult {
  installed: boolean;
  running: boolean;
  state: string | null;
}

interface ZapretManagerInternals {
  ensureProvisioned(): Promise<void>;
  assertNoExternalConflict(): Promise<void>;
  assertStandaloneStopped(): Promise<void>;
  ensurePathExists(targetPath: string, errorMessage: string): Promise<void>;
  applyFlowsealScriptFixes(coreDir: string): Promise<void>;
  readCoreVersion(): Promise<string | null>;
  buildServiceCommand(profileName: string): Promise<{
    profile: { name: string; fileName: string };
    args: string;
    winwsPath: string;
  }>;
  deleteServiceIfPresent(serviceName: string): Promise<void>;
  execSc(args: string[]): Promise<string>;
  execReg(args: string[]): Promise<string>;
  queryService(serviceName: string): Promise<ServiceQueryResult>;
  waitForServiceState(serviceName: string, expectedStates: string[], timeoutMs: number): Promise<void>;
  stopStandaloneInternal(clearVpnSuspension: boolean): Promise<void>;
  launchConsoleCommand(executable: string, args: string[], options: { cwd: string }): Promise<void>;
  readStandaloneState(): Promise<{ pid: number | null; profile: string | null; startedAt: string } | null>;
  getSourceRuntimeInfo(): Promise<{ sourceDir: string; version: string | null } | null>;
}

const BASE_STATUS: ZapretStatus = {
  available: true,
  provisioned: true,
  workDir: "C:\\Users\\test\\AppData\\Roaming\\EgoistShield\\zapret",
  serviceName: "EgoistShieldZapret",
  serviceInstalled: false,
  serviceRunning: false,
  serviceProfile: null,
  standaloneRunning: false,
  standalonePid: null,
  standaloneProfile: null,
  winwsRunning: false,
  drivers: [],
  gameFilterMode: "disabled",
  ipsetMode: "loaded",
  updateChecksEnabled: false,
  coreVersion: "test-core",
  currentProfile: null,
  lastError: null
};

describe("zapret-manager helpers", () => {
  it("извлекает аргументы winws.exe из многострочного .bat профиля", () => {
    const args = parseZapretWinwsArgs(SAMPLE_PROFILE);

    expect(args).toContain("--wf-tcp=80,443,%GameFilterTCP%");
    expect(args).toContain('--hostlist="%LISTS%list-general.txt"');
    expect(args).toContain("--dpi-desync-fake-tls=^!");
  });

  it("подставляет пути и фильтры без batch-placeholders", () => {
    const rawArgs = parseZapretWinwsArgs(SAMPLE_PROFILE);
    const finalArgs = applyZapretPlaceholders(rawArgs, {
      BIN: "C:\\Runtime\\zapret\\core\\bin\\",
      LISTS: "C:\\Runtime\\zapret\\core\\lists\\",
      GameFilter: "1024-65535",
      GameFilterTCP: "1024-65535",
      GameFilterUDP: "12"
    });

    expect(finalArgs).toContain("--wf-tcp=80,443,1024-65535");
    expect(finalArgs).toContain("--wf-udp=443,12");
    expect(finalArgs).toContain('--hostlist="C:\\Runtime\\zapret\\core\\lists\\list-general.txt"');
    expect(finalArgs).toContain("--dpi-desync-fake-tls=!");
    expect(finalArgs).not.toContain("%GameFilter");
    expect(finalArgs).not.toContain("%LISTS%");
  });

  it("разбивает windows command line с quoted путями", () => {
    const args = splitWindowsCommandLine(
      '--filter-tcp=443 --hostlist="C:\\Runtime\\zapret\\core\\lists\\list-general.txt" --dpi-desync=fake'
    );

    expect(args).toEqual([
      "--filter-tcp=443",
      "--hostlist=C:\\Runtime\\zapret\\core\\lists\\list-general.txt",
      "--dpi-desync=fake"
    ]);
  });

  it("сортирует ALT-профили естественным образом", () => {
    const input = ["General (ALT10)", "General", "General (ALT2)", "General (ALT)"];
    const sorted = [...input].sort(compareZapretProfileNames);

    expect(sorted).toEqual(["General (ALT)", "General (ALT2)", "General (ALT10)", "General"]);
  });

  it("распознаёт отсутствие службы по stdout/code от sc.exe", () => {
    const error = Object.assign(new Error("Command failed: C:\\Windows\\System32\\sc.exe query EgoistShieldZapret\n"), {
      code: 1060,
      stdout:
        "[SC] EnumQueryServicesStatus:OpenService FAILED 1060:\r\n\r\nThe specified service does not exist as an installed service.\r\n\r\n",
      stderr: ""
    });

    expect(isWindowsServiceMissingError(error)).toBe(true);
  });

  it("распознаёт уже запущенную и неактивную службу по stderr/sc-кодам", () => {
    const alreadyRunningError = Object.assign(new Error("1056"), {
      code: 1056,
      stdout: "",
      stderr: "An instance of the service is already running."
    });
    const notActiveError = Object.assign(new Error("1062"), {
      code: 1062,
      stdout: "",
      stderr: "The service has not been started."
    });

    expect(isScAlreadyRunningError(alreadyRunningError)).toBe(true);
    expect(isScNotActiveError(notActiveError)).toBe(true);
  });

  it("собирает план очистки кеша для всех Discord-клиентов без дублей", () => {
    const plan = buildDiscordCacheCleanupPlan("all", {
      APPDATA: "C:\\Users\\test\\AppData\\Roaming",
      LOCALAPPDATA: "C:\\Users\\test\\AppData\\Local"
    });

    expect(plan.labels).toEqual(["Discord", "Discord PTB", "Discord Canary", "Vesktop"]);
    expect(plan.processNames).toContain("Discord.exe");
    expect(plan.processNames).toContain("DiscordPTB.exe");
    expect(plan.processNames).toContain("DiscordCanary.exe");
    expect(plan.processNames).toContain("Vesktop.exe");
    expect(plan.directories).toContain("C:\\Users\\test\\AppData\\Roaming\\discord\\Cache");
    expect(plan.directories).toContain("C:\\Users\\test\\AppData\\Local\\Discord\\Code Cache");
    expect(plan.directories).toContain("C:\\Users\\test\\AppData\\Roaming\\vesktop\\Network\\Cache");
    expect(plan.directories).toContain(
      "C:\\Users\\test\\AppData\\Roaming\\discordcanary\\Partitions\\discord_voice\\GPUCache"
    );
    expect(new Set(plan.directories).size).toBe(plan.directories.length);
  });

  it("собирает узкий план очистки только для Vesktop без Discord-процессов", () => {
    const plan = buildDiscordCacheCleanupPlan("vesktop", {
      APPDATA: "C:\\Users\\test\\AppData\\Roaming",
      LOCALAPPDATA: "C:\\Users\\test\\AppData\\Local"
    });

    expect(plan.labels).toEqual(["Vesktop"]);
    expect(plan.processNames).toEqual(["vesktop.exe", "Vesktop.exe", "Update.exe"]);
    expect(plan.directories.every((entry) => entry.toLowerCase().includes("vesktop"))).toBe(true);
  });

  it("распознаёт payload-элементы Flowseal из root-layout архива", () => {
    expect(isFlowsealRootPayloadEntry("bin", true)).toBe(true);
    expect(isFlowsealRootPayloadEntry("lists", true)).toBe(true);
    expect(isFlowsealRootPayloadEntry("utils", true)).toBe(true);
    expect(isFlowsealRootPayloadEntry("service.bat", false)).toBe(true);
    expect(isFlowsealRootPayloadEntry("general (ALT3).bat", false)).toBe(true);
    expect(isFlowsealRootPayloadEntry("cloudflare_switch.bat", false)).toBe(true);

    expect(isFlowsealRootPayloadEntry(".service", true)).toBe(false);
    expect(isFlowsealRootPayloadEntry(".github", true)).toBe(false);
    expect(isFlowsealRootPayloadEntry("README.md", false)).toBe(false);
    expect(isFlowsealRootPayloadEntry("LICENSE.txt", false)).toBe(false);
  });

  it("автоматически патчит legacy Flowseal service/update scripts под managed update flow", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "egoist-zapret-scriptfix-"));
    const coreDir = path.join(tempRoot, "core");
    const fastDir = path.join(coreDir, "fast");
    await fs.mkdir(fastDir, { recursive: true });

    try {
      await fs.writeFile(
        path.join(coreDir, "service.bat"),
        [
          "@echo off",
          'set "LOCAL_VERSION=%CURRENT_VERSION%"',
          `for /f "delims=" %%A in ('powershell -NoProfile -Command "(Invoke-WebRequest -Uri ''%GITHUB_VERSION_URL%'' -UseBasicParsing).Content.Trim()" 2^>nul') do set "GITHUB_VERSION=%%A"`,
          "echo done"
        ].join("\r\n"),
        "utf8"
      );
      await fs.writeFile(path.join(fastDir, "update_service.bat"), "@echo off\r\necho legacy updater\r\n", "utf8");

      const manager = new ZapretManagerClass(
        "C:\\resources",
        "C:\\app",
        "C:\\Users\\test\\AppData\\Roaming\\EgoistShield"
      ) as unknown as ZapretManagerInternals;

      await manager.applyFlowsealScriptFixes(coreDir);

      const serviceScript = await fs.readFile(path.join(coreDir, "service.bat"), "utf8");
      const updateScript = await fs.readFile(path.join(fastDir, "update_service.bat"), "utf8");

      expect(serviceScript).toContain('set "LOCAL_VERSION=unknown"');
      expect(serviceScript).toContain(
        'if exist "%~dp0..\\VERSION.txt" for /f "usebackq delims=" %%A in ("%~dp0..\\VERSION.txt") do set "LOCAL_VERSION=%%~A"'
      );
      expect(serviceScript).toContain(`User-Agent: EgoistShield/${APP_VERSION}`);
      expect(updateScript).toContain("sc delete WinDivert >nul 2>nul");
      expect(updateScript).toContain("sc delete WinDivert14 >nul 2>nul");
      expect(updateScript).toContain(`User-Agent'='EgoistShield/${APP_VERSION}`);
      expect(updateScript).toContain("Expand-Archive -LiteralPath '%ZIP_PATH%' -DestinationPath '%UNPACK_DIR%' -Force");
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("читает текущую версию Core из VERSION.txt, а не из legacy LOCAL_VERSION=unknown", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "egoist-zapret-version-"));
    const userDataDir = path.join(tempRoot, "user-data");
    const workDir = path.join(userDataDir, "zapret");
    await fs.mkdir(path.join(workDir, "core"), { recursive: true });

    try {
      await fs.writeFile(path.join(workDir, "VERSION.txt"), "v1.9.7b\n", "utf8");
      await fs.writeFile(path.join(workDir, "core", "service.bat"), '@echo off\r\nset "LOCAL_VERSION=unknown"\r\n', "utf8");

      const manager = new ZapretManagerClass(path.join(tempRoot, "resources"), path.join(tempRoot, "app"), userDataDir);
      const internal = manager as unknown as ZapretManagerInternals;

      await expect(internal.readCoreVersion()).resolves.toBe("v1.9.7b");
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("ensureProvisioned не откатывает уже обновлённый Core на более старый bundled runtime", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "egoist-zapret-refresh-"));
    const resourcesPath = path.join(tempRoot, "resources");
    const appPath = path.join(tempRoot, "app");
    const userDataDir = path.join(tempRoot, "user-data");
    const bundledRuntimeDir = path.join(resourcesPath, "runtime", "zapret");
    const workDir = path.join(userDataDir, "zapret");

    await fs.mkdir(path.join(bundledRuntimeDir, "core"), { recursive: true });
    await fs.mkdir(path.join(workDir, "core"), { recursive: true });

    try {
      await fs.writeFile(path.join(bundledRuntimeDir, "VERSION.txt"), "v1.7.3\n", "utf8");
      await fs.writeFile(path.join(bundledRuntimeDir, "core", "service.bat"), "@echo off\r\necho bundled build\r\n", "utf8");

      await fs.writeFile(path.join(workDir, "VERSION.txt"), "v1.9.7b\n", "utf8");
      await fs.writeFile(path.join(workDir, "core", "service.bat"), "@echo off\r\necho updated build\r\n", "utf8");

      const manager = new ZapretManagerClass(resourcesPath, appPath, userDataDir);
      const internal = manager as unknown as ZapretManagerInternals;

      await internal.ensureProvisioned();

      await expect(fs.readFile(path.join(workDir, "VERSION.txt"), "utf8")).resolves.toContain("v1.9.7b");
      await expect(fs.readFile(path.join(workDir, "core", "service.bat"), "utf8")).resolves.toContain("updated build");
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("readStandaloneState безопасно нормализует битый standalone-state", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "egoist-zapret-standalone-state-"));
    const userDataDir = path.join(tempRoot, "user-data");
    const workDir = path.join(userDataDir, "zapret");
    await fs.mkdir(workDir, { recursive: true });

    try {
      await fs.writeFile(
        path.join(workDir, ".egoistshield-standalone.json"),
        JSON.stringify({ pid: "bad", profile: 42, startedAt: 0 }),
        "utf8"
      );

      const manager = new ZapretManagerClass(path.join(tempRoot, "resources"), path.join(tempRoot, "app"), userDataDir);
      const internal = manager as unknown as ZapretManagerInternals;
      const state = await internal.readStandaloneState();

      expect(state).not.toBeNull();
      expect(state?.pid).toBeNull();
      expect(state?.profile).toBeNull();
      expect(Date.parse(state?.startedAt ?? "")).not.toBeNaN();
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("getSourceRuntimeInfo подхватывает runtime из appPath, если resourcesPath пуст", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "egoist-zapret-source-runtime-"));
    const resourcesPath = path.join(tempRoot, "resources");
    const appPath = path.join(tempRoot, "app");
    const userDataDir = path.join(tempRoot, "user-data");
    const appRuntimeDir = path.join(appPath, "runtime", "zapret");
    await fs.mkdir(path.join(appRuntimeDir, "core"), { recursive: true });

    try {
      await fs.writeFile(path.join(appRuntimeDir, "core", "service.bat"), "@echo off\r\necho app runtime\r\n", "utf8");
      await fs.writeFile(path.join(appRuntimeDir, "VERSION.txt"), "v1.9.9\n", "utf8");

      const manager = new ZapretManagerClass(resourcesPath, appPath, userDataDir);
      const internal = manager as unknown as ZapretManagerInternals;
      const runtime = await internal.getSourceRuntimeInfo();

      expect(runtime).toMatchObject({
        sourceDir: appRuntimeDir,
        version: "v1.9.9"
      });
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });
});

describe("ZapretManager service transitions", () => {
  let manager: ZapretManager;
  let internal: ZapretManagerInternals;

  beforeEach(() => {
    manager = new ZapretManagerClass("C:\\resources", "C:\\app", "C:\\Users\\test\\AppData\\Roaming\\EgoistShield");
    internal = manager as unknown as ZapretManagerInternals;
  });

  it("installService больше не требует ручной остановки standalone перед установкой", async () => {
    vi.spyOn(internal, "ensureProvisioned").mockResolvedValue(undefined);
    vi.spyOn(internal, "assertNoExternalConflict").mockResolvedValue(undefined);
    const assertStandaloneStoppedSpy = vi.spyOn(internal, "assertStandaloneStopped").mockResolvedValue(undefined);
    vi.spyOn(internal, "buildServiceCommand").mockResolvedValue({
      profile: { name: "General", fileName: "general.bat" },
      args: "--test-arg",
      winwsPath: "C:\\zapret\\core\\bin\\winws.exe"
    });
    vi.spyOn(internal, "deleteServiceIfPresent").mockResolvedValue(undefined);
    const execScSpy = vi.spyOn(internal, "execSc").mockResolvedValue("");
    vi.spyOn(internal, "execReg").mockResolvedValue("");
    vi.spyOn(manager, "startService").mockResolvedValue({
      ...BASE_STATUS,
      serviceInstalled: true,
      serviceRunning: true,
      serviceProfile: "General",
      winwsRunning: true,
      currentProfile: "General"
    });
    vi.spyOn(manager, "status").mockResolvedValue({
      ...BASE_STATUS,
      serviceInstalled: true,
      serviceRunning: true,
      serviceProfile: "General",
      winwsRunning: true,
      currentProfile: "General"
    });

    const result = await manager.installService("General");

    expect(assertStandaloneStoppedSpy).not.toHaveBeenCalled();
    expect(execScSpy).toHaveBeenNthCalledWith(1, [
      "create",
      "EgoistShieldZapret",
      "binPath=",
      "\"C:\\zapret\\core\\bin\\winws.exe\" --test-arg",
      "DisplayName=",
      "EgoistShield Zapret",
      "start=",
      "auto"
    ]);
    expect(result.serviceRunning).toBe(true);
  });

  it("startService мягко переводит standalone в service-режим", async () => {
    vi.spyOn(internal, "ensureProvisioned").mockResolvedValue(undefined);
    vi.spyOn(internal, "queryService").mockResolvedValue({
      installed: true,
      running: false,
      state: "STOPPED"
    });
    const stopStandaloneSpy = vi.spyOn(internal, "stopStandaloneInternal").mockResolvedValue(undefined);
    const execScSpy = vi.spyOn(internal, "execSc").mockResolvedValue("");
    vi.spyOn(internal, "waitForServiceState").mockResolvedValue(undefined);
    const statusSpy = vi
      .spyOn(manager, "status")
      .mockResolvedValueOnce({
        ...BASE_STATUS,
        serviceInstalled: true,
        standaloneRunning: true,
        standalonePid: 4242,
        standaloneProfile: "General",
        winwsRunning: true,
        currentProfile: "General"
      })
      .mockResolvedValueOnce({
        ...BASE_STATUS,
        serviceInstalled: true,
        serviceRunning: true,
        serviceProfile: "General",
        winwsRunning: true,
        currentProfile: "General"
      });

    const result = await manager.startService();

    expect(stopStandaloneSpy).toHaveBeenCalledWith(true);
    expect(execScSpy).toHaveBeenCalledWith(["start", "EgoistShieldZapret"]);
    expect(stopStandaloneSpy.mock.invocationCallOrder[0]).toBeLessThan(execScSpy.mock.invocationCallOrder[0]);
    expect(statusSpy).toHaveBeenCalledTimes(2);
    expect(result.serviceRunning).toBe(true);
    expect(result.standaloneRunning).toBe(false);
  });

  it("startService восстанавливает standalone, если запуск службы не удался", async () => {
    vi.spyOn(internal, "ensureProvisioned").mockResolvedValue(undefined);
    vi.spyOn(internal, "queryService")
      .mockResolvedValueOnce({
        installed: true,
        running: false,
        state: "STOPPED"
      })
      .mockResolvedValueOnce({
        installed: true,
        running: false,
        state: "STOPPED"
      });
    vi.spyOn(internal, "stopStandaloneInternal").mockResolvedValue(undefined);
    vi.spyOn(manager, "status").mockResolvedValue({
      ...BASE_STATUS,
      serviceInstalled: true,
      standaloneRunning: true,
      standalonePid: 4242,
      standaloneProfile: "General",
      winwsRunning: true,
      currentProfile: "General"
    });
    vi.spyOn(internal, "execSc").mockRejectedValue(new Error("Service failed to start"));
    const restoreStandaloneSpy = vi.spyOn(manager, "startStandalone").mockResolvedValue({
      ...BASE_STATUS,
      standaloneRunning: true,
      standalonePid: 4242,
      standaloneProfile: "General",
      winwsRunning: true,
      currentProfile: "General"
    });

    await expect(manager.startService()).rejects.toThrow("Service failed to start");

    expect(restoreStandaloneSpy).toHaveBeenCalledWith("General");
  });

  it("startService принимает 1056 от sc.exe как признак уже запущенной службы", async () => {
    vi.spyOn(internal, "ensureProvisioned").mockResolvedValue(undefined);
    vi.spyOn(internal, "queryService").mockResolvedValue({
      installed: true,
      running: false,
      state: "STOP_PENDING"
    });
    vi.spyOn(internal, "stopStandaloneInternal").mockResolvedValue(undefined);
    vi.spyOn(internal, "execSc").mockRejectedValue(
      Object.assign(new Error("already running"), {
        code: 1056,
        stdout: "",
        stderr: "An instance of the service is already running."
      })
    );
    const waitForServiceStateSpy = vi.spyOn(internal, "waitForServiceState").mockResolvedValue(undefined);
    vi.spyOn(manager, "status").mockResolvedValue({
      ...BASE_STATUS,
      serviceInstalled: true,
      serviceRunning: true,
      serviceProfile: "General",
      winwsRunning: true,
      currentProfile: "General"
    });

    const result = await manager.startService();

    expect(waitForServiceStateSpy).toHaveBeenCalledWith("EgoistShieldZapret", ["RUNNING"], 15_000);
    expect(result.serviceRunning).toBe(true);
  });
});

describe("ZapretManager command launchers", () => {
  let manager: ZapretManager;
  let internal: ZapretManagerInternals;

  beforeEach(() => {
    manager = new ZapretManagerClass("C:\\resources", "C:\\app", "C:\\Users\\test\\AppData\\Roaming\\EgoistShield");
    internal = manager as unknown as ZapretManagerInternals;
  });

  it("openServiceMenu остаётся безопасным deprecated-wrapper без запуска legacy консоли", async () => {
    const launchConsoleCommandSpy = vi.spyOn(internal, "launchConsoleCommand").mockResolvedValue(undefined);

    const result = await manager.openServiceMenu();

    expect(launchConsoleCommandSpy).not.toHaveBeenCalled();
    expect(result.opened).toBe(false);
    expect(result.message).toContain("Сервисное консольное меню Flowseal больше не используется");
    expect(result.output).toContain("Deprecated console workflow suppressed");
  });

  it("runCoreUpdater остаётся безопасным deprecated-wrapper без запуска updater.bat", async () => {
    const launchConsoleCommandSpy = vi.spyOn(internal, "launchConsoleCommand").mockResolvedValue(undefined);

    const result = await manager.runCoreUpdater();

    expect(launchConsoleCommandSpy).not.toHaveBeenCalled();
    expect(result.opened).toBe(false);
    expect(result.message).toContain("Классический консольный обновлятор Flowseal Core больше не используется");
    expect(result.output).toContain("integrated Flowseal Core panel");
  });

  it("runFlowsealTests открывает отдельную PowerShell-консоль для test zapret.ps1", async () => {
    vi.spyOn(internal, "ensureProvisioned").mockResolvedValue(undefined);
    vi.spyOn(internal, "ensurePathExists").mockResolvedValue(undefined);
    const launchConsoleCommandSpy = vi.spyOn(internal, "launchConsoleCommand").mockResolvedValue(undefined);

    const result = await manager.runFlowsealTests();

    expect(launchConsoleCommandSpy).toHaveBeenCalledWith(
      resolveWindowsExecutable("powershell.exe"),
      [
        "-NoExit",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        "C:\\Users\\test\\AppData\\Roaming\\EgoistShield\\zapret\\core\\utils\\test zapret.ps1"
      ],
      { cwd: "C:\\Users\\test\\AppData\\Roaming\\EgoistShield\\zapret\\core\\utils" }
    );
    expect(result.opened).toBe(true);
  });

  it("checkForUpdates выдаёт понятную ошибку, если Flowseal version endpoint отвечает HTTP 403", async () => {
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 403
        })
      );
      vi.spyOn(internal, "ensureProvisioned").mockResolvedValue(undefined);
      vi.spyOn(internal, "readCoreVersion").mockResolvedValue("v1.7.3");

      await expect(manager.checkForUpdates()).rejects.toThrow(
        "Не удалось выполнить проверку обновлений Flowseal Core: сервер Flowseal временно отклонил запрос (HTTP 403)."
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("checkForUpdates не предлагает повторное обновление, если версии отличаются только префиксом v", async () => {
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          text: vi.fn().mockResolvedValue("1.9.7b")
        })
      );
      vi.spyOn(internal, "ensureProvisioned").mockResolvedValue(undefined);
      vi.spyOn(internal, "readCoreVersion").mockResolvedValue("v1.9.7b");

      await expect(manager.checkForUpdates()).resolves.toMatchObject({
        currentVersion: "v1.9.7b",
        latestVersion: "1.9.7b",
        updateAvailable: false
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("updateIpsetList выдаёт понятную ошибку по таймауту Flowseal", async () => {
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(Object.assign(new Error("The operation was aborted"), { name: "AbortError" }))
      );
      vi.spyOn(internal, "ensureProvisioned").mockResolvedValue(undefined);

      await expect(manager.updateIpsetList()).rejects.toThrow(
        "Не удалось выполнить обновление списка IP для Zapret: сервер Flowseal не ответил вовремя."
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("updateIpsetList выдаёт понятную ошибку по HTTP-ответу Flowseal", async () => {
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 502
        })
      );
      vi.spyOn(internal, "ensureProvisioned").mockResolvedValue(undefined);

      await expect(manager.updateIpsetList()).rejects.toThrow("HTTP 502");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
