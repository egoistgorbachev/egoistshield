import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ZapretStatus } from "../electron/ipc/contracts";
import { resolveWindowsExecutable } from "../electron/ipc/windows-system-binaries";
import {
  buildDiscordCacheCleanupPlan,
  type ZapretManager,
  ZapretManager as ZapretManagerClass,
  applyZapretPlaceholders,
  compareZapretProfileNames,
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
});

describe("ZapretManager command launchers", () => {
  let manager: ZapretManager;
  let internal: ZapretManagerInternals;

  beforeEach(() => {
    manager = new ZapretManagerClass("C:\\resources", "C:\\app", "C:\\Users\\test\\AppData\\Roaming\\EgoistShield");
    internal = manager as unknown as ZapretManagerInternals;
  });

  it("openServiceMenu открывает отдельную cmd-консоль для service.bat", async () => {
    vi.spyOn(internal, "ensureProvisioned").mockResolvedValue(undefined);
    vi.spyOn(internal, "ensurePathExists").mockResolvedValue(undefined);
    const launchConsoleCommandSpy = vi.spyOn(internal, "launchConsoleCommand").mockResolvedValue(undefined);

    const result = await manager.openServiceMenu();

    expect(launchConsoleCommandSpy).toHaveBeenCalledWith(
      resolveWindowsExecutable("cmd.exe"),
      ["/d", "/k", "C:\\Users\\test\\AppData\\Roaming\\EgoistShield\\zapret\\core\\service.bat"],
      { cwd: "C:\\Users\\test\\AppData\\Roaming\\EgoistShield\\zapret\\core" }
    );
    expect(result.opened).toBe(true);
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
});
