import { execFile, spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type {
  ZapretAutoSelectResult,
  ZapretCommandResult,
  ZapretDiscordCacheTarget,
  ZapretDiagnosticsItem,
  ZapretDiagnosticsReport,
  ZapretDriverStatus,
  ZapretGameFilterMode,
  ZapretIpsetMode,
  ZapretProfile,
  ZapretStatus,
  ZapretUpdateInfo
} from "../../shared/types";
import logger from "./logger";
import { resolveWindowsExecutable } from "./windows-system-binaries";

const execFileAsync = promisify(execFile);

const SERVICE_NAME = "EgoistShieldZapret";
const SERVICE_DISPLAY_NAME = "EgoistShield Zapret";
const SERVICE_DESCRIPTION = "Integrated Zapret DPI bypass managed by EgoistShield";
const DRIVER_SERVICES = ["WinDivert", "WinDivert14"] as const;
const EXTERNAL_CONFLICT_SERVICES = ["zapret", "zapret_discord"] as const;
const DIAGNOSTIC_CONFLICT_SERVICES = ["GoodbyeDPI", "discordfix_zapret", "winws1", "winws2"] as const;
const DEFAULT_PROFILE_NAME = "General";
const PROFILE_FILE_EXCLUDES = new Set(["discord.bat", "service.bat", "cloudflare_switch.bat"]);
const DEFAULT_USER_LIST_FILES: Record<string, string> = {
  "ipset-exclude-user.txt": "203.0.113.113/32\n",
  "list-general-user.txt": "domain.example.abc\n",
  "list-exclude-user.txt": "domain.example.abc\n"
};
const FLOWSEAL_VERSION_URL =
  "https://raw.githubusercontent.com/Flowseal/zapret-discord-youtube/main/.service/version.txt";
const FLOWSEAL_RELEASES_URL = "https://github.com/Flowseal/zapret-discord-youtube/releases/latest";
const FLOWSEAL_IPSET_URL =
  "https://raw.githubusercontent.com/Flowseal/zapret-discord-youtube/refs/heads/main/.service/ipset-service.txt";
const STANDALONE_STATE_FILE = ".egoistshield-standalone.json";
const AUTO_SELECT_ENDPOINTS = [
  "https://discord.com/api/v9/experiments",
  "https://www.youtube.com/generate_204"
] as const;
const DISCORD_CACHE_SUBPATHS = [
  "Cache",
  "Code Cache",
  "GPUCache",
  "DawnCache",
  path.join("Network", "Cache"),
  path.join("Service Worker", "CacheStorage"),
  path.join("Service Worker", "ScriptCache"),
  path.join("Partitions", "discord_voice", "Cache"),
  path.join("Partitions", "discord_voice", "Code Cache"),
  path.join("Partitions", "discord_voice", "GPUCache")
] as const;
const DISCORD_CACHE_TARGETS = {
  discord: {
    label: "Discord",
    directoryNames: ["discord", "Discord"],
    processNames: ["Discord.exe", "Update.exe"]
  },
  "discord-ptb": {
    label: "Discord PTB",
    directoryNames: ["discordptb", "DiscordPTB"],
    processNames: ["DiscordPTB.exe", "Update.exe"]
  },
  "discord-canary": {
    label: "Discord Canary",
    directoryNames: ["discordcanary", "DiscordCanary"],
    processNames: ["DiscordCanary.exe", "Update.exe"]
  },
  vesktop: {
    label: "Vesktop",
    directoryNames: ["vesktop", "Vesktop"],
    processNames: ["vesktop.exe", "Vesktop.exe", "Update.exe"]
  }
} satisfies Record<
  Exclude<ZapretDiscordCacheTarget, "all">,
  {
    label: string;
    directoryNames: string[];
    processNames: string[];
  }
>;

interface DiscordCacheCleanupPlan {
  labels: string[];
  directories: string[];
  processNames: string[];
}

interface ServiceQueryResult {
  installed: boolean;
  running: boolean;
  state: string | null;
}

interface GameFilterValues {
  GameFilter: string;
  GameFilterTCP: string;
  GameFilterUDP: string;
}

interface SourceRuntimeInfo {
  sourceDir: string;
  version: string | null;
}

interface StandaloneState {
  pid: number | null;
  profile: string | null;
  startedAt: string;
}

interface WinwsProcessInfo {
  pid: number;
  commandLine: string;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("\\") ? value : `${value}\\`;
}

type ExecFileLikeError = Error & {
  code?: string | number;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
};

function getCommandFailureText(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const execError = error as ExecFileLikeError;
  const chunks = [execError.message];

  if (typeof execError.code !== "undefined") {
    chunks.push(String(execError.code));
  }
  if (typeof execError.stdout === "string") {
    chunks.push(execError.stdout);
  } else if (Buffer.isBuffer(execError.stdout)) {
    chunks.push(execError.stdout.toString("utf8"));
  }
  if (typeof execError.stderr === "string") {
    chunks.push(execError.stderr);
  } else if (Buffer.isBuffer(execError.stderr)) {
    chunks.push(execError.stderr.toString("utf8"));
  }

  return chunks.filter(Boolean).join("\n");
}

export function isWindowsServiceMissingError(error: unknown): boolean {
  const message = getCommandFailureText(error);
  return /1060|does not exist as an installed service/i.test(message);
}

export function isScAlreadyRunningError(error: unknown): boolean {
  const message = getCommandFailureText(error);
  return /1056|already running/i.test(message);
}

export function isScNotActiveError(error: unknown): boolean {
  const message = getCommandFailureText(error);
  return /1062|has not been started/i.test(message);
}

function normalizeBatchContent(content: string): string {
  return content.replace(/\r\n/g, "\n");
}

function naturalTokens(value: string): Array<string | number> {
  return value
    .split(/(\d+)/)
    .filter(Boolean)
    .map((part) => (/^\d+$/.test(part) ? Number.parseInt(part, 10) : part.toLowerCase()));
}

type ProfileSortKey = [Array<string | number>, number, string, number];

function buildProfileSortKey(name: string): ProfileSortKey {
  const trimmed = name.trim();
  const altMatch = trimmed.match(/\(\s*([A-Za-z\-]*ALT)\s*(\d*)\s*\)\s*$/i);
  if (altMatch) {
    const base = trimmed.slice(0, altMatch.index).trimEnd();
    const altLabel = (altMatch[1] || "").toLowerCase();
    const altIndex = altMatch[2] ? Number.parseInt(altMatch[2], 10) : 1;
    return [naturalTokens(base), 0, altLabel, altIndex];
  }
  return [naturalTokens(trimmed), 1, "", 0];
}

function compareMixedValues(left: string | number, right: string | number): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return String(left).localeCompare(String(right), "ru-RU", { sensitivity: "base", numeric: true });
}

export function compareZapretProfileNames(left: string, right: string): number {
  const leftKey = buildProfileSortKey(left);
  const rightKey = buildProfileSortKey(right);

  const maxLength = Math.max(leftKey[0].length, rightKey[0].length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftKey[0][index];
    const rightValue = rightKey[0][index];
    if (typeof leftValue === "undefined") return -1;
    if (typeof rightValue === "undefined") return 1;
    const diff = compareMixedValues(leftValue, rightValue);
    if (diff !== 0) {
      return diff;
    }
  }

  if (leftKey[1] !== rightKey[1]) {
    return leftKey[1] - rightKey[1];
  }
  if (leftKey[2] !== rightKey[2]) {
    return leftKey[2].localeCompare(rightKey[2], "ru-RU", { sensitivity: "base" });
  }
  return leftKey[3] - rightKey[3];
}

export function parseZapretWinwsArgs(profileContent: string): string {
  const lines = normalizeBatchContent(profileContent).split("\n");
  const commandStart = lines.findIndex((line) => /%BIN%winws\.exe/i.test(line));
  if (commandStart < 0) {
    throw new Error("Не удалось найти команду запуска winws.exe в выбранном профиле Zapret.");
  }

  const chunks: string[] = [];
  for (let index = commandStart; index < lines.length; index += 1) {
    const originalLine = lines[index]?.trim();
    if (!originalLine) {
      continue;
    }

    const continued = originalLine.endsWith("^");
    chunks.push(continued ? originalLine.slice(0, -1).trim() : originalLine);
    if (!continued) {
      break;
    }
  }

  const command = chunks.join(" ");
  const match = command.match(/%BIN%winws\.exe"?\s+(.+)$/i);
  if (!match?.[1]) {
    throw new Error("Не удалось выделить аргументы winws.exe из профиля Zapret.");
  }

  return match[1].trim();
}

export function applyZapretPlaceholders(rawArgs: string, replacements: Record<string, string>): string {
  return rawArgs
    .replace(/%BIN%/gi, replacements.BIN)
    .replace(/%LISTS%/gi, replacements.LISTS)
    .replace(/%GameFilterTCP%/gi, replacements.GameFilterTCP)
    .replace(/%GameFilterUDP%/gi, replacements.GameFilterUDP)
    .replace(/%GameFilter%/gi, replacements.GameFilter)
    .replace(/\^!/g, "!")
    .replace(/\^\^/g, "^")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitWindowsCommandLine(commandLine: string): string[] {
  const args: string[] = [];
  let current = "";
  let inQuotes = false;
  let backslashes = 0;

  for (const char of commandLine) {
    if (char === "\\") {
      backslashes += 1;
      continue;
    }

    if (char === '"') {
      current += "\\".repeat(Math.floor(backslashes / 2));
      if (backslashes % 2 === 0) {
        inQuotes = !inQuotes;
      } else {
        current += '"';
      }
      backslashes = 0;
      continue;
    }

    if (backslashes > 0) {
      current += "\\".repeat(backslashes);
      backslashes = 0;
    }

    if (/\s/.test(char) && !inQuotes) {
      if (current.length > 0) {
        args.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (backslashes > 0) {
    current += "\\".repeat(backslashes);
  }
  if (current.length > 0) {
    args.push(current);
  }

  return args;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function buildCommandResult(message: string, options: Partial<ZapretCommandResult> = {}): ZapretCommandResult {
  return {
    ok: options.ok ?? true,
    opened: options.opened ?? false,
    message,
    output: options.output ?? ""
  };
}

function buildScCreateServiceArgs(serviceName: string, executablePath: string, commandArgs: string): string[] {
  return [
    "create",
    serviceName,
    "binPath=",
    `"${executablePath}" ${commandArgs}`,
    "DisplayName=",
    SERVICE_DISPLAY_NAME,
    "start=",
    "auto"
  ];
}

export function buildDiscordCacheCleanupPlan(
  target: ZapretDiscordCacheTarget,
  env: NodeJS.ProcessEnv = process.env
): DiscordCacheCleanupPlan {
  const resolvedTargets =
    target === "all"
      ? (Object.values(DISCORD_CACHE_TARGETS) as Array<(typeof DISCORD_CACHE_TARGETS)[keyof typeof DISCORD_CACHE_TARGETS]>)
      : [DISCORD_CACHE_TARGETS[target]];
  const roots = [env.APPDATA, env.LOCALAPPDATA].filter((value): value is string => Boolean(value));
  const directories = new Set<string>();
  const processNames = new Set<string>();

  for (const resolvedTarget of resolvedTargets) {
    for (const processName of resolvedTarget.processNames) {
      processNames.add(processName);
    }

    for (const root of roots) {
      for (const directoryName of resolvedTarget.directoryNames) {
        for (const subPath of DISCORD_CACHE_SUBPATHS) {
          directories.add(path.join(root, directoryName, subPath));
        }
      }
    }
  }

  return {
    labels: resolvedTargets.map((item) => item.label),
    directories: Array.from(directories),
    processNames: Array.from(processNames)
  };
}

export class ZapretManager {
  private readonly workDir: string;
  private lastError: string | null = null;
  private suspendedByVpnMode: "none" | "service" | "standalone" = "none";
  private suspendedProfileDuringVpn: string | null = null;

  public constructor(
    private readonly resourcesPath: string,
    private readonly appPath: string,
    private readonly userDataDir: string
  ) {
    this.workDir = path.join(userDataDir, "zapret");
  }

  public getWorkDir(): string {
    return this.workDir;
  }

  public async status(): Promise<ZapretStatus> {
    const sourceRuntime = await this.getSourceRuntimeInfo();
    const service = await this.queryService(SERVICE_NAME);
    const provisioned = await this.pathExists(path.join(this.workDir, "core", "service.bat"));
    const serviceProfile = service.installed ? await this.readServiceProfile() : null;
    const coreVersion = provisioned ? await this.readCoreVersion() : null;
    const standaloneState = await this.readStandaloneState();
    const integratedProcesses = await this.listIntegratedWinwsProcesses();
    const standaloneRunning = !service.running && integratedProcesses.length > 0;
    const standalonePid =
      standaloneRunning && standaloneState?.pid
        ? standaloneState.pid
        : standaloneRunning
          ? integratedProcesses[0]?.pid ?? null
          : null;
    const standaloneProfile = standaloneRunning ? standaloneState?.profile ?? null : null;
    const drivers = await this.getDriverStatuses();
    const gameFilterMode = provisioned ? await this.readGameFilterMode() : "disabled";
    const ipsetMode = provisioned ? await this.readIpsetMode() : "loaded";
    const updateChecksEnabled = provisioned ? await this.areUpdateChecksEnabled() : false;

    if (!standaloneRunning && standaloneState) {
      await this.clearStandaloneState();
    }

    return {
      available: Boolean(sourceRuntime),
      provisioned,
      workDir: this.workDir,
      serviceName: SERVICE_NAME,
      serviceInstalled: service.installed,
      serviceRunning: service.running,
      serviceProfile,
      standaloneRunning,
      standalonePid,
      standaloneProfile,
      winwsRunning: service.running || standaloneRunning,
      drivers,
      gameFilterMode,
      ipsetMode,
      updateChecksEnabled,
      coreVersion,
      currentProfile: serviceProfile ?? standaloneProfile ?? null,
      lastError: this.lastError
    };
  }

  public async listProfiles(): Promise<ZapretProfile[]> {
    await this.ensureProvisioned();
    const coreDir = path.join(this.workDir, "core");
    const entries = await fs.readdir(coreDir, { withFileTypes: true }).catch(() => []);

    const profiles: ZapretProfile[] = [];
    if (entries.some((entry) => entry.isFile() && entry.name.toLowerCase() === "general.bat")) {
      profiles.push({ name: DEFAULT_PROFILE_NAME, fileName: "general.bat" });
    }

    const dynamicProfiles = entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".bat"))
      .filter((entry) => {
        const lower = entry.name.toLowerCase();
        return lower !== "general.bat" && !PROFILE_FILE_EXCLUDES.has(lower) && !lower.startsWith("__noupdate__");
      })
      .map((entry) => ({
        name: path.parse(entry.name).name,
        fileName: entry.name
      }))
      .sort((left, right) => compareZapretProfileNames(left.name, right.name));

    return [...profiles, ...dynamicProfiles];
  }

  public async installService(profileName = DEFAULT_PROFILE_NAME): Promise<ZapretStatus> {
    await this.ensureProvisioned();
    await this.assertNoExternalConflict();

    try {
      const { profile, args, winwsPath } = await this.buildServiceCommand(profileName);
      await this.deleteServiceIfPresent(SERVICE_NAME);

      await this.execSc(buildScCreateServiceArgs(SERVICE_NAME, winwsPath, args));
      await this.execSc(["description", SERVICE_NAME, SERVICE_DESCRIPTION]);
      await this.execReg([
        "add",
        `HKLM\\SYSTEM\\CurrentControlSet\\Services\\${SERVICE_NAME}`,
        "/v",
        "EgoistShieldProfile",
        "/t",
        "REG_SZ",
        "/d",
        profile.name,
        "/f"
      ]);

      this.lastError = null;
      await this.startService();
      return this.status();
    } catch (error: unknown) {
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  public async setServiceProfile(profileName: string): Promise<ZapretStatus> {
    await this.ensureProvisioned();
    await this.assertNoExternalConflict();
    await this.assertStandaloneStopped();

    const service = await this.queryService(SERVICE_NAME);
    if (!service.installed) {
      throw new Error("Служба Zapret ещё не установлена.");
    }

    const shouldRestart = service.running;
    const { profile, args, winwsPath } = await this.buildServiceCommand(profileName);
    await this.deleteServiceIfPresent(SERVICE_NAME);

    await this.execSc(buildScCreateServiceArgs(SERVICE_NAME, winwsPath, args));
    await this.execSc(["description", SERVICE_NAME, SERVICE_DESCRIPTION]);
    await this.execReg([
      "add",
      `HKLM\\SYSTEM\\CurrentControlSet\\Services\\${SERVICE_NAME}`,
      "/v",
      "EgoistShieldProfile",
      "/t",
      "REG_SZ",
      "/d",
      profile.name,
      "/f"
    ]);

    if (shouldRestart) {
      await this.startService();
    }

    this.lastError = null;
    return this.status();
  }

  public async startService(): Promise<ZapretStatus> {
    await this.ensureProvisioned();

    const service = await this.queryService(SERVICE_NAME);
    if (!service.installed) {
      throw new Error("Служба Zapret ещё не установлена.");
    }

    const restoreStandalone = await this.prepareStandaloneForServiceStart();

    try {
      if (!service.running) {
        try {
          await this.execSc(["start", SERVICE_NAME]);
        } catch (error: unknown) {
          if (!isScAlreadyRunningError(error)) {
            throw error;
          }
        }
        await this.waitForServiceState(SERVICE_NAME, ["RUNNING"], 15_000);
      }

      this.lastError = null;
      return this.status();
    } catch (error: unknown) {
      await restoreStandalone();
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  public async stopService(): Promise<ZapretStatus> {
    await this.stopServiceInternal(true);
    this.lastError = null;
    return this.status();
  }

  public async removeService(): Promise<ZapretStatus> {
    await this.deleteServiceIfPresent(SERVICE_NAME);
    await this.cleanupDriverServicesIfSafe();
    if (this.suspendedByVpnMode === "service") {
      this.clearVpnSuspension();
    }
    this.lastError = null;
    return this.status();
  }

  public async startStandalone(profileName = DEFAULT_PROFILE_NAME): Promise<ZapretStatus> {
    await this.ensureProvisioned();
    await this.assertNoExternalConflict();

    const service = await this.queryService(SERVICE_NAME);
    if (service.running) {
      throw new Error("Сначала остановите службу Zapret, затем запускайте standalone-режим.");
    }

    await this.stopStandaloneInternal(true);

    const { profile, args, winwsPath } = await this.buildServiceCommand(profileName);
    const child = spawn(winwsPath, splitWindowsCommandLine(args), {
      cwd: path.join(this.workDir, "core"),
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });

    child.unref();
    await this.writeStandaloneState({
      pid: child.pid ?? null,
      profile: profile.name,
      startedAt: new Date().toISOString()
    });

    const started = await this.waitForIntegratedWinwsStart(child.pid ?? null, 12_000);
    if (!started) {
      await this.stopStandaloneInternal(true);
      throw new Error("winws.exe не запустился в standalone-режиме. Проверьте права администратора и драйверы.");
    }

    this.lastError = null;
    return this.status();
  }

  public async restartStandalone(profileName = DEFAULT_PROFILE_NAME): Promise<ZapretStatus> {
    await this.stopStandaloneInternal(true);
    return this.startStandalone(profileName);
  }

  public async stopStandalone(): Promise<ZapretStatus> {
    await this.stopStandaloneInternal(true);
    this.lastError = null;
    return this.status();
  }

  public async setGameFilterMode(mode: ZapretGameFilterMode): Promise<ZapretStatus> {
    await this.ensureProvisioned();
    const flagPath = path.join(this.workDir, "core", "utils", "game_filter.enabled");

    if (mode === "disabled") {
      await fs.rm(flagPath, { force: true });
    } else {
      await fs.mkdir(path.dirname(flagPath), { recursive: true });
      await fs.writeFile(flagPath, `${mode}\n`, "utf8");
    }

    return this.status();
  }

  public async setIpsetMode(mode: ZapretIpsetMode): Promise<ZapretStatus> {
    await this.ensureProvisioned();
    const listFile = path.join(this.workDir, "core", "lists", "ipset-all.txt");
    const backupFile = `${listFile}.backup`;
    const currentMode = await this.readIpsetMode();

    if (mode === currentMode) {
      return this.status();
    }

    if (mode === "none") {
      if (currentMode === "loaded" && (await this.pathExists(listFile))) {
        await fs.copyFile(listFile, backupFile);
      }
      await fs.writeFile(listFile, "203.0.113.113/32\n", "utf8");
      return this.status();
    }

    if (mode === "any") {
      if (currentMode === "loaded" && (await this.pathExists(listFile))) {
        await fs.copyFile(listFile, backupFile);
      }
      await fs.writeFile(listFile, "", "utf8");
      return this.status();
    }

    if (!(await this.pathExists(backupFile))) {
      throw new Error("Нет сохранённого ipset backup. Сначала обновите список или переключите режим из loaded.");
    }

    await fs.copyFile(backupFile, listFile);
    return this.status();
  }

  public async updateIpsetList(): Promise<ZapretStatus> {
    await this.ensureProvisioned();
    const listFile = path.join(this.workDir, "core", "lists", "ipset-all.txt");
    const payload = await this.fetchText(FLOWSEAL_IPSET_URL, 12_000);
    await fs.writeFile(listFile, payload.endsWith("\n") ? payload : `${payload}\n`, "utf8");
    return this.status();
  }

  public async setUpdateChecksEnabled(enabled: boolean): Promise<ZapretStatus> {
    await this.ensureProvisioned();
    const flagPath = path.join(this.workDir, "core", "utils", "check_updates.enabled");

    if (enabled) {
      await fs.mkdir(path.dirname(flagPath), { recursive: true });
      await fs.writeFile(flagPath, "ENABLED\n", "utf8");
    } else {
      await fs.rm(flagPath, { force: true });
    }

    return this.status();
  }

  public async checkForUpdates(): Promise<ZapretUpdateInfo> {
    await this.ensureProvisioned();
    const currentVersion = await this.readCoreVersion();
    const latestVersion = (await this.fetchText(FLOWSEAL_VERSION_URL, 8_000)).trim() || null;
    const updateAvailable = Boolean(currentVersion && latestVersion && currentVersion !== latestVersion);

    return {
      currentVersion,
      latestVersion,
      updateAvailable,
      releaseUrl: FLOWSEAL_RELEASES_URL,
      message: updateAvailable
        ? `Доступно обновление Flowseal Core: ${latestVersion}`
        : `Используется актуальная версия Core${currentVersion ? `: ${currentVersion}` : ""}`
    };
  }

  public async runCoreUpdater(): Promise<ZapretCommandResult> {
    await this.ensureProvisioned();
    const scriptPath = path.join(this.workDir, "core", "fast", "update_service.bat");
    await this.ensurePathExists(scriptPath, "update_service.bat не найден.");
    await this.launchConsoleCommand(resolveWindowsExecutable("cmd.exe"), ["/d", "/k", scriptPath], {
      cwd: path.dirname(scriptPath)
    });
    return buildCommandResult("Открыта отдельная консоль обновления Flowseal Core.", { opened: true });
  }

  public async openServiceMenu(): Promise<ZapretCommandResult> {
    await this.ensureProvisioned();
    const scriptPath = path.join(this.workDir, "core", "service.bat");
    await this.ensurePathExists(scriptPath, "service.bat не найден.");
    await this.launchConsoleCommand(resolveWindowsExecutable("cmd.exe"), ["/d", "/k", scriptPath], {
      cwd: path.dirname(scriptPath)
    });
    return buildCommandResult("Открыто отдельное консольное меню Flowseal Service Manager.", { opened: true });
  }

  public async runFlowsealTests(): Promise<ZapretCommandResult> {
    await this.ensureProvisioned();
    const scriptPath = path.join(this.workDir, "core", "utils", "test zapret.ps1");
    await this.ensurePathExists(scriptPath, "test zapret.ps1 не найден.");
    await this.launchConsoleCommand(
      resolveWindowsExecutable("powershell.exe"),
      ["-NoExit", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
      {
        cwd: path.dirname(scriptPath)
      }
    );
    return buildCommandResult("Открыта отдельная консоль проверки Flowseal test zapret.ps1.", { opened: true });
  }

  public async cleanDiscordCache(target: ZapretDiscordCacheTarget): Promise<ZapretCommandResult> {
    const plan = buildDiscordCacheCleanupPlan(target);
    const killedProcesses = await this.killImageNames(plan.processNames);
    const removedDirectories = await this.removeExistingDirectories(plan.directories);
    const title = plan.labels.length > 1 ? "Discord-клиентов" : plan.labels[0] ?? "Discord";
    const summary =
      removedDirectories.length > 0
        ? `Кеш ${title} очищен.`
        : `Кеш ${title} не найден, но активные процессы были аккуратно завершены.`;
    const outputLines = [
      `Targets: ${plan.labels.join(", ") || "Discord"}`,
      `Processes stopped: ${killedProcesses.join(", ") || "нет активных процессов"}`,
      `Removed cache folders: ${removedDirectories.length}`
    ];

    if (removedDirectories.length > 0) {
      const listedDirectories = removedDirectories.slice(0, 12);
      outputLines.push(...listedDirectories.map((directory) => `- ${directory}`));
      if (removedDirectories.length > listedDirectories.length) {
        outputLines.push(`... и ещё ${removedDirectories.length - listedDirectories.length} папок`);
      }
    }

    outputLines.push("Local Storage, токены и пользовательские настройки не затрагивались.");

    return buildCommandResult(summary, {
      output: outputLines.join("\n")
    });
  }

  public async resetNetworkState(): Promise<ZapretStatus> {
    await this.stopStandaloneInternal(true);
    await this.deleteServiceIfPresent(SERVICE_NAME);
    await this.cleanupDriverServicesIfSafe();
    this.lastError = null;
    return this.status();
  }

  public async runDiagnostics(): Promise<ZapretDiagnosticsReport> {
    await this.ensureProvisioned();
    const [service, driverStatuses, secureDnsEnabled, tcpTimestampsEnabled, proxyInfo, adguardRunning, bfeRunning] =
      await Promise.all([
        this.queryService(SERVICE_NAME),
        this.getDriverStatuses(),
        this.hasSecureDns(),
        this.hasTcpTimestampsEnabled(),
        this.readSystemProxyInfo(),
        this.isNamedProcessRunning("AdguardSvc"),
        this.queryService("BFE").then((item) => item.running).catch(() => false)
      ]);

    const winwsRunning = await this.isWinwsRunning();
    const vpnServices = await this.findServiceNamesByPatterns(["VPN"]);
    const killerServices = await this.findServiceNamesByPatterns(["Killer"]);
    const checkpointServices = await this.findServiceNamesByPatterns(["TracSrvWrapper", "EPWD"]);
    const smartByteServices = await this.findServiceNamesByPatterns(["SmartByte"]);
    const intelConnectivityServices = await this.findServiceNamesByPatterns(["Intel", "Connectivity", "Network"]);
    const conflictingServices = await this.findServiceNamesByPatterns([...DIAGNOSTIC_CONFLICT_SERVICES]);
    const hostsWarning = await this.hostsFileContains(["youtube.com", "youtu.be"]);

    const items: ZapretDiagnosticsItem[] = [
      {
        key: "bfe",
        title: "Base Filtering Engine",
        state: bfeRunning ? "ok" : "error",
        details: bfeRunning
          ? "Служба BFE запущена."
          : "Служба BFE не запущена. Без неё WinDivert/Zapret не будет работать корректно."
      },
      {
        key: "proxy",
        title: "Системный прокси Windows",
        state: proxyInfo.enabled ? "warn" : "ok",
        details: proxyInfo.enabled
          ? `Включён системный прокси: ${proxyInfo.server || "значение не прочитано"}.`
          : "Системный прокси отключён."
      },
      {
        key: "tcp-timestamps",
        title: "TCP timestamps",
        state: tcpTimestampsEnabled ? "ok" : "warn",
        details: tcpTimestampsEnabled
          ? "TCP timestamps включены."
          : "TCP timestamps выключены. Flowseal рекомендует включить их для стабильной работы."
      },
      {
        key: "secure-dns",
        title: "Secure DNS",
        state: secureDnsEnabled ? "ok" : "warn",
        details: secureDnsEnabled
          ? "Обнаружены признаки настроенного secure DNS."
          : "Secure DNS не обнаружен. Часть блокировок может упираться в DNS."
      },
      {
        key: "adguard",
        title: "AdGuard",
        state: adguardRunning ? "warn" : "ok",
        details: adguardRunning
          ? "Найден активный AdGuard. Он может конфликтовать с Discord/WinDivert."
          : "AdGuard не обнаружен."
      },
      {
        key: "killer",
        title: "Killer Services",
        state: killerServices.length > 0 ? "warn" : "ok",
        details:
          killerServices.length > 0
            ? `Найдены сервисы Killer: ${killerServices.join(", ")}.`
            : "Конфликтующих Killer-сервисов не найдено."
      },
      {
        key: "intel-connectivity",
        title: "Intel Connectivity Network Service",
        state: intelConnectivityServices.length > 0 ? "warn" : "ok",
        details:
          intelConnectivityServices.length > 0
            ? `Найдены сервисы Intel Connectivity: ${intelConnectivityServices.join(", ")}.`
            : "Конфликтов Intel Connectivity не найдено."
      },
      {
        key: "checkpoint",
        title: "Check Point",
        state: checkpointServices.length > 0 ? "warn" : "ok",
        details:
          checkpointServices.length > 0
            ? `Найдены сервисы Check Point: ${checkpointServices.join(", ")}.`
            : "Сервисы Check Point не обнаружены."
      },
      {
        key: "smartbyte",
        title: "SmartByte",
        state: smartByteServices.length > 0 ? "warn" : "ok",
        details:
          smartByteServices.length > 0
            ? `Найдены сервисы SmartByte: ${smartByteServices.join(", ")}.`
            : "SmartByte не обнаружен."
      },
      {
        key: "vpn-services",
        title: "Сторонние VPN-сервисы",
        state: vpnServices.length > 0 ? "warn" : "ok",
        details:
          vpnServices.length > 0
            ? `Найдены сервисы с VPN в имени: ${vpnServices.join(", ")}.`
            : "Сторонних VPN-сервисов не найдено."
      },
      {
        key: "hosts",
        title: "Hosts override",
        state: hostsWarning ? "warn" : "ok",
        details: hostsWarning
          ? "В hosts найдены записи для YouTube. Это может ломать доступ даже при рабочем профиле."
          : "Подозрительных записей YouTube в hosts не найдено."
      },
      {
        key: "drivers",
        title: "WinDivert drivers",
        state: driverStatuses.some((driver) => driver.running && !winwsRunning) ? "warn" : "ok",
        details: driverStatuses
          .map((driver) => `${driver.name}: ${driver.running ? "RUNNING" : driver.installed ? "INSTALLED" : "ABSENT"}`)
          .join(" · ")
      },
      {
        key: "bypass",
        title: "Активный bypass",
        state: winwsRunning || service.running ? "ok" : "warn",
        details: service.running
          ? `Служба ${SERVICE_NAME} активна.`
          : winwsRunning
            ? "Обнаружен активный standalone winws.exe."
            : "Активный winws.exe не обнаружен."
      },
      {
        key: "conflicts",
        title: "Известные конфликтующие bypass-сервисы",
        state: conflictingServices.length > 0 ? "warn" : "ok",
        details:
          conflictingServices.length > 0
            ? `Найдены: ${conflictingServices.join(", ")}.`
            : "Известных конфликтующих bypass-сервисов не найдено."
      }
    ];

    const errorCount = items.filter((item) => item.state === "error").length;
    const warnCount = items.filter((item) => item.state === "warn").length;

    return {
      generatedAt: new Date().toISOString(),
      summary:
        errorCount > 0
          ? `Найдены критические проблемы: ${errorCount}, предупреждения: ${warnCount}.`
          : warnCount > 0
            ? `Критических проблем нет, предупреждений: ${warnCount}.`
            : "Критических проблем и предупреждений не обнаружено.",
      items
    };
  }

  public async autoSelectBestProfile(): Promise<ZapretAutoSelectResult> {
    await this.ensureProvisioned();
    await this.assertNoExternalConflict();

    const service = await this.queryService(SERVICE_NAME);
    if (service.running) {
      throw new Error("Сначала остановите службу Zapret, затем запускайте автоподбор профиля.");
    }

    await this.stopStandaloneInternal(true);

    const profiles = await this.listProfiles();
    const goodProfiles: string[] = [];
    const badProfiles: string[] = [];
    const testedProfiles: string[] = [];

    try {
      for (const profile of profiles) {
        testedProfiles.push(profile.name);
        try {
          await this.startStandalone(profile.name);
          await sleep(700);
          const healthy = await this.probeZapretHealth();
          if (healthy) {
            goodProfiles.push(profile.name);
          } else {
            badProfiles.push(profile.name);
          }
        } catch (error: unknown) {
          logger.warn("[zapret] Auto-select probe failed for profile:", profile.name, error);
          badProfiles.push(profile.name);
        } finally {
          await this.stopStandaloneInternal(true);
          await sleep(250);
        }
      }
    } finally {
      await this.stopStandaloneInternal(true);
    }

    return {
      bestProfile: goodProfiles[0] ?? null,
      goodProfiles,
      badProfiles,
      testedProfiles
    };
  }

  public async prepareForVpn(suspendDuringVpn: boolean): Promise<void> {
    if (!suspendDuringVpn || this.suspendedByVpnMode !== "none") {
      return;
    }

    const service = await this.queryService(SERVICE_NAME);
    if (service.running) {
      this.suspendedByVpnMode = "service";
      this.suspendedProfileDuringVpn = await this.readServiceProfile();
      await this.stopServiceInternal(false);
      return;
    }

    const standaloneStatus = await this.status();
    if (standaloneStatus.standaloneRunning) {
      this.suspendedByVpnMode = "standalone";
      this.suspendedProfileDuringVpn = standaloneStatus.standaloneProfile ?? standaloneStatus.currentProfile;
      await this.stopStandaloneInternal(false);
    }
  }

  public async restoreAfterVpnIfNeeded(
    suspendDuringVpn: boolean,
    preferredProfile = DEFAULT_PROFILE_NAME
  ): Promise<ZapretStatus> {
    if (!suspendDuringVpn || this.suspendedByVpnMode === "none") {
      this.clearVpnSuspension();
      return this.status();
    }

    const profile = this.suspendedProfileDuringVpn ?? preferredProfile;
    if (this.suspendedByVpnMode === "service") {
      const serviceProfile = await this.readServiceProfile();
      if (!(await this.queryService(SERVICE_NAME)).installed) {
        await this.installService(profile);
      } else if (serviceProfile && serviceProfile !== profile) {
        await this.setServiceProfile(profile);
        await this.startService();
      } else {
        await this.startService();
      }
    } else if (this.suspendedByVpnMode === "standalone") {
      await this.startStandalone(profile);
    }

    this.clearVpnSuspension();
    return this.status();
  }

  private clearVpnSuspension(): void {
    this.suspendedByVpnMode = "none";
    this.suspendedProfileDuringVpn = null;
  }

  private async stopServiceInternal(clearVpnSuspension: boolean): Promise<void> {
    const service = await this.queryService(SERVICE_NAME);
    if (!service.installed) {
      if (clearVpnSuspension && this.suspendedByVpnMode === "service") {
        this.clearVpnSuspension();
      }
      return;
    }

    if (service.running) {
      try {
        await this.execSc(["stop", SERVICE_NAME]);
      } catch (error: unknown) {
        if (!isScNotActiveError(error)) {
          this.lastError = error instanceof Error ? error.message : String(error);
          throw error;
        }
      }
      await this.waitForServiceState(SERVICE_NAME, ["STOPPED"], 20_000);
    }

    if (clearVpnSuspension && this.suspendedByVpnMode === "service") {
      this.clearVpnSuspension();
    }
  }

  private async stopStandaloneInternal(clearVpnSuspension: boolean): Promise<void> {
    const service = await this.queryService(SERVICE_NAME);
    const standaloneState = await this.readStandaloneState();
    const integratedProcesses = service.running ? [] : await this.listIntegratedWinwsProcesses();
    const targetPids = new Set<number>();

    if (!service.running && standaloneState?.pid) {
      targetPids.add(standaloneState.pid);
    }
    for (const processInfo of integratedProcesses) {
      targetPids.add(processInfo.pid);
    }

    for (const pid of targetPids) {
      try {
        await execFileAsync(resolveWindowsExecutable("taskkill.exe"), ["/PID", String(pid), "/T", "/F"], {
          windowsHide: true,
          timeout: 10_000
        });
      } catch {
        // Ignore already exited processes.
      }
    }

    if (targetPids.size > 0) {
      const startedAt = Date.now();
      while (Date.now() - startedAt < 12_000) {
        if ((await this.listIntegratedWinwsProcesses()).length === 0) {
          break;
        }
        await sleep(400);
      }
    }

    await this.clearStandaloneState();
    if (clearVpnSuspension && this.suspendedByVpnMode === "standalone") {
      this.clearVpnSuspension();
    }
    await this.cleanupDriverServicesIfSafe();
  }

  private async prepareStandaloneForServiceStart(): Promise<() => Promise<void>> {
    const currentStatus = await this.status();
    if (!currentStatus.standaloneRunning) {
      return async () => {};
    }

    const profileToRestore = currentStatus.standaloneProfile ?? currentStatus.currentProfile ?? DEFAULT_PROFILE_NAME;
    await this.stopStandaloneInternal(true);

    return async () => {
      try {
        const service = await this.queryService(SERVICE_NAME);
        if (service.running) {
          return;
        }
        await this.startStandalone(profileToRestore);
      } catch (error: unknown) {
        logger.warn("[zapret] Failed to restore standalone after service transition error:", error);
      }
    };
  }

  private async assertStandaloneStopped(): Promise<void> {
    const currentStatus = await this.status();
    if (currentStatus.standaloneRunning) {
      throw new Error("Сначала остановите standalone-режим Zapret, затем запускайте службу.");
    }
  }

  private async buildServiceCommand(profileName: string): Promise<{
    profile: ZapretProfile;
    args: string;
    winwsPath: string;
  }> {
    const profiles = await this.listProfiles();
    const profile = profiles.find((item) => item.name === profileName);
    if (!profile) {
      throw new Error(`Профиль Zapret "${profileName}" не найден.`);
    }

    const content = await fs.readFile(path.join(this.workDir, "core", profile.fileName), "utf8");
    const rawArgs = parseZapretWinwsArgs(content);
    const binDir = ensureTrailingSlash(path.join(this.workDir, "core", "bin"));
    const listsDir = ensureTrailingSlash(path.join(this.workDir, "core", "lists"));
    const gameFilter = await this.readGameFilterValues();
    const args = applyZapretPlaceholders(rawArgs, {
      BIN: binDir,
      LISTS: listsDir,
      ...gameFilter
    });

    return {
      profile,
      args,
      winwsPath: path.join(this.workDir, "core", "bin", "winws.exe")
    };
  }

  private async ensureProvisioned(): Promise<void> {
    const runtime = await this.getSourceRuntimeInfo();
    if (!runtime) {
      throw new Error("Bundled Zapret runtime не найден. Сначала подготовьте runtime/zapret.");
    }

    const versionFile = path.join(this.workDir, "VERSION.txt");
    const installedVersion = await this.readVersion(versionFile);
    const shouldRefresh = installedVersion !== runtime.version || !(await this.pathExists(path.join(this.workDir, "core")));

    await fs.mkdir(this.workDir, { recursive: true });

    if (shouldRefresh) {
      await this.copyRuntimeTree(runtime.sourceDir, this.workDir);
    }

    await this.ensureUserLists();
  }

  private async copyRuntimeTree(sourceDir: string, destinationDir: string): Promise<void> {
    const stack = [{ sourceDir, destinationDir }];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) {
        continue;
      }

      await fs.mkdir(current.destinationDir, { recursive: true });
      const entries = await fs.readdir(current.sourceDir, { withFileTypes: true });

      for (const entry of entries) {
        const sourcePath = path.join(current.sourceDir, entry.name);
        const destinationPath = path.join(current.destinationDir, entry.name);

        if (entry.isDirectory()) {
          stack.push({ sourceDir: sourcePath, destinationDir: destinationPath });
          continue;
        }

        if (this.shouldPreserveDestinationFile(destinationPath) && (await this.pathExists(destinationPath))) {
          continue;
        }

        await fs.copyFile(sourcePath, destinationPath);
      }
    }
  }

  private shouldPreserveDestinationFile(filePath: string): boolean {
    const normalized = filePath.replace(/\//g, "\\").toLowerCase();
    return (
      normalized.endsWith("-user.txt") ||
      normalized.endsWith(".backup") ||
      normalized.endsWith("\\core\\utils\\game_filter.enabled")
    );
  }

  private async ensureUserLists(): Promise<void> {
    const listsDir = path.join(this.workDir, "core", "lists");
    await fs.mkdir(listsDir, { recursive: true });

    for (const [fileName, defaultContent] of Object.entries(DEFAULT_USER_LIST_FILES)) {
      const filePath = path.join(listsDir, fileName);
      if (!(await this.pathExists(filePath))) {
        await fs.writeFile(filePath, defaultContent, "utf8");
      }
    }
  }

  private async readGameFilterValues(): Promise<GameFilterValues> {
    const mode = await this.readGameFilterMode();
    if (mode === "all") {
      return {
        GameFilter: "1024-65535",
        GameFilterTCP: "1024-65535",
        GameFilterUDP: "1024-65535"
      };
    }

    if (mode === "tcp") {
      return {
        GameFilter: "1024-65535",
        GameFilterTCP: "1024-65535",
        GameFilterUDP: "12"
      };
    }

    if (mode === "udp") {
      return {
        GameFilter: "1024-65535",
        GameFilterTCP: "12",
        GameFilterUDP: "1024-65535"
      };
    }

    return {
      GameFilter: "12",
      GameFilterTCP: "12",
      GameFilterUDP: "12"
    };
  }

  private async readGameFilterMode(): Promise<ZapretGameFilterMode> {
    const flagPath = path.join(this.workDir, "core", "utils", "game_filter.enabled");
    const mode = (await fs.readFile(flagPath, "utf8").catch(() => "")).trim().toLowerCase();

    if (mode === "all" || mode === "tcp" || mode === "udp") {
      return mode;
    }
    return "disabled";
  }

  private async readIpsetMode(): Promise<ZapretIpsetMode> {
    const listFile = path.join(this.workDir, "core", "lists", "ipset-all.txt");
    const raw = await fs.readFile(listFile, "utf8").catch(() => "");
    const trimmedLines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (trimmedLines.length === 0) {
      return "any";
    }

    return trimmedLines.length === 1 && trimmedLines[0] === "203.0.113.113/32" ? "none" : "loaded";
  }

  private async areUpdateChecksEnabled(): Promise<boolean> {
    return this.pathExists(path.join(this.workDir, "core", "utils", "check_updates.enabled"));
  }

  private async assertNoExternalConflict(): Promise<void> {
    for (const serviceName of EXTERNAL_CONFLICT_SERVICES) {
      const service = await this.queryService(serviceName);
      if (service.installed) {
        throw new Error(
          `Обнаружен внешний сервис ${serviceName}. Сначала удалите или остановите сторонний Zapret, чтобы избежать конфликта WinDivert.`
        );
      }
    }
  }

  private async cleanupDriverServicesIfSafe(): Promise<void> {
    const otherServices = [SERVICE_NAME, ...EXTERNAL_CONFLICT_SERVICES];
    for (const serviceName of otherServices) {
      const service = await this.queryService(serviceName);
      if (service.running) {
        return;
      }
    }

    if ((await this.listIntegratedWinwsProcesses()).length > 0) {
      return;
    }

    for (const driverService of DRIVER_SERVICES) {
      try {
        await this.execSc(["stop", driverService]);
      } catch {
        // Ignore best-effort cleanup failures.
      }
      try {
        await this.execSc(["delete", driverService]);
      } catch {
        // Ignore best-effort cleanup failures.
      }
    }
  }

  private async isWinwsRunning(): Promise<boolean> {
    return (await this.listWinwsProcesses()).length > 0;
  }

  private async listWinwsProcesses(): Promise<WinwsProcessInfo[]> {
    try {
      const stdout = await this.execPowerShell(
        "$procs = Get-CimInstance Win32_Process -Filter \"Name='winws.exe'\" | Select-Object ProcessId, CommandLine; " +
          "if (-not $procs) { '[]' } else { $procs | ConvertTo-Json -Compress }",
        12_000
      );

      const trimmed = stdout.trim();
      if (!trimmed) {
        return [];
      }

      const parsed = JSON.parse(trimmed) as
        | { ProcessId?: number; CommandLine?: string | null }
        | Array<{ ProcessId?: number; CommandLine?: string | null }>;
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      return entries
        .map((entry) => ({
          pid: Number(entry.ProcessId ?? 0),
          commandLine: String(entry.CommandLine ?? "")
        }))
        .filter((entry) => entry.pid > 0);
    } catch {
      return [];
    }
  }

  private async listIntegratedWinwsProcesses(): Promise<WinwsProcessInfo[]> {
    const marker = this.workDir.replace(/\//g, "\\").toLowerCase();
    const processes = await this.listWinwsProcesses();
    return processes.filter((processInfo) => processInfo.commandLine.replace(/\//g, "\\").toLowerCase().includes(marker));
  }

  private async waitForIntegratedWinwsStart(expectedPid: number | null, timeoutMs: number): Promise<boolean> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const processes = await this.listIntegratedWinwsProcesses();
      if (expectedPid && processes.some((processInfo) => processInfo.pid === expectedPid)) {
        return true;
      }
      if (!expectedPid && processes.length > 0) {
        return true;
      }
      await sleep(300);
    }
    return false;
  }

  private async probeZapretHealth(): Promise<boolean> {
    for (const url of AUTO_SELECT_ENDPOINTS) {
      if (await this.tryFetch(url, 3_500)) {
        return true;
      }
    }
    return false;
  }

  private async tryFetch(url: string, timeoutMs: number): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "manual",
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36"
        },
        signal: controller.signal
      });
      return response.status >= 200 && response.status < 500;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  private async getDriverStatuses(): Promise<ZapretDriverStatus[]> {
    const statuses: ZapretDriverStatus[] = [];
    for (const driver of DRIVER_SERVICES) {
      const service = await this.queryService(driver);
      statuses.push({
        name: driver,
        installed: service.installed,
        running: service.running
      });
    }
    return statuses;
  }

  private async hasSecureDns(): Promise<boolean> {
    try {
      const output = await this.execPowerShell(
        "Get-ChildItem -Recurse -Path 'HKLM:System\\CurrentControlSet\\Services\\Dnscache\\InterfaceSpecificParameters\\' | " +
          "Get-ItemProperty | Where-Object { $_.DohFlags -gt 0 } | Measure-Object | Select-Object -ExpandProperty Count",
        10_000
      );
      return Number.parseInt(output.trim(), 10) > 0;
    } catch {
      return false;
    }
  }

  private async hasTcpTimestampsEnabled(): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync(resolveWindowsExecutable("netsh.exe"), ["interface", "tcp", "show", "global"], {
        windowsHide: true,
        timeout: 8_000
      });
      return /timestamps/i.test(stdout) && /enabled/i.test(stdout);
    } catch {
      return false;
    }
  }

  private async readSystemProxyInfo(): Promise<{ enabled: boolean; server: string | null }> {
    try {
      const enableOutput = await execFileAsync(
        resolveWindowsExecutable("reg.exe"),
        ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings", "/v", "ProxyEnable"],
        {
          windowsHide: true,
          timeout: 8_000
        }
      );
      const enabled = /0x1/i.test(enableOutput.stdout);

      if (!enabled) {
        return { enabled: false, server: null };
      }

      const serverOutput = await execFileAsync(
        resolveWindowsExecutable("reg.exe"),
        ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings", "/v", "ProxyServer"],
        {
          windowsHide: true,
          timeout: 8_000
        }
      );
      const match = serverOutput.stdout.match(/ProxyServer\s+REG_\w+\s+(.+)$/im);
      return {
        enabled: true,
        server: match?.[1]?.trim() ?? null
      };
    } catch {
      return { enabled: false, server: null };
    }
  }

  private async isNamedProcessRunning(processName: string): Promise<boolean> {
    try {
      const output = await this.execPowerShell(
        `(Get-Process -Name ${psQuote(processName)} -ErrorAction SilentlyContinue | Measure-Object).Count`,
        8_000
      );
      return Number.parseInt(output.trim(), 10) > 0;
    } catch {
      return false;
    }
  }

  private async hostsFileContains(needles: string[]): Promise<boolean> {
    try {
      const hostsFile = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "drivers", "etc", "hosts");
      const content = (await fs.readFile(hostsFile, "utf8")).toLowerCase();
      return needles.some((needle) => content.includes(needle.toLowerCase()));
    } catch {
      return false;
    }
  }

  private async findServiceNamesByPatterns(patterns: readonly string[]): Promise<string[]> {
    const checks = patterns.map((pattern) => `($_.Name -match ${psQuote(pattern)} -or $_.DisplayName -match ${psQuote(pattern)})`);
    const command =
      "Get-Service | Where-Object { " +
      checks.join(" -or ") +
      " } | Sort-Object Name | Select-Object -ExpandProperty Name";

    try {
      const output = await this.execPowerShell(command, 12_000);
      return output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  private async readCoreVersion(): Promise<string | null> {
    const servicePath = path.join(this.workDir, "core", "service.bat");
    try {
      const content = await fs.readFile(servicePath, "utf8");
      const match = content.match(/LOCAL_VERSION\s*=\s*([^\r\n]+)/i);
      return match?.[1]?.trim() ?? null;
    } catch {
      return null;
    }
  }

  private async readStandaloneState(): Promise<StandaloneState | null> {
    const statePath = path.join(this.workDir, STANDALONE_STATE_FILE);
    try {
      const raw = await fs.readFile(statePath, "utf8");
      const parsed = JSON.parse(raw) as StandaloneState;
      return {
        pid: typeof parsed.pid === "number" ? parsed.pid : null,
        profile: typeof parsed.profile === "string" ? parsed.profile : null,
        startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : new Date().toISOString()
      };
    } catch {
      return null;
    }
  }

  private async writeStandaloneState(next: StandaloneState): Promise<void> {
    await fs.mkdir(this.workDir, { recursive: true });
    await fs.writeFile(path.join(this.workDir, STANDALONE_STATE_FILE), JSON.stringify(next, null, 2), "utf8");
  }

  private async clearStandaloneState(): Promise<void> {
    await fs.rm(path.join(this.workDir, STANDALONE_STATE_FILE), { force: true });
  }

  private async waitForServiceState(serviceName: string, expectedStates: string[], timeoutMs: number): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const service = await this.queryService(serviceName);
      if (!service.installed && expectedStates.includes("DELETED")) {
        return;
      }
      if (service.state && expectedStates.includes(service.state)) {
        return;
      }
      await sleep(500);
    }

    throw new Error(
      `Служба ${serviceName} не перешла в состояние ${expectedStates.join(" / ")} за ${timeoutMs}мс.`
    );
  }

  private async deleteServiceIfPresent(serviceName: string): Promise<void> {
    const service = await this.queryService(serviceName);
    if (!service.installed) {
      return;
    }

    if (service.running) {
      try {
        await this.execSc(["stop", serviceName]);
      } catch (error: unknown) {
        if (!isScNotActiveError(error)) {
          throw error;
        }
      }
      await this.waitForServiceState(serviceName, ["STOPPED"], 20_000);
    }

    try {
      await this.execSc(["delete", serviceName]);
    } catch (error: unknown) {
      if (!isWindowsServiceMissingError(error)) {
        throw error;
      }
    }
    await this.waitForServiceState(serviceName, ["DELETED"], 12_000);
  }

  private async queryService(serviceName: string): Promise<ServiceQueryResult> {
    try {
      const { stdout } = await execFileAsync(resolveWindowsExecutable("sc.exe"), ["query", serviceName], {
        windowsHide: true,
        timeout: 8_000
      });
      const stateMatch = stdout.match(/STATE\s*:\s*\d+\s+([A-Z_]+)/i);
      const state = stateMatch?.[1]?.toUpperCase() ?? null;
      return {
        installed: true,
        running: state === "RUNNING",
        state
      };
    } catch (error: unknown) {
      if (isWindowsServiceMissingError(error)) {
        return {
          installed: false,
          running: false,
          state: null
        };
      }

      logger.warn("[zapret] Service query failed:", serviceName, error);
      throw error;
    }
  }

  private async readServiceProfile(): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync(
        resolveWindowsExecutable("reg.exe"),
        ["query", `HKLM\\SYSTEM\\CurrentControlSet\\Services\\${SERVICE_NAME}`, "/v", "EgoistShieldProfile"],
        {
          windowsHide: true,
          timeout: 6_000
        }
      );

      const valueMatch = stdout.match(/EgoistShieldProfile\s+REG_SZ\s+(.+)$/im);
      return valueMatch?.[1]?.trim() ?? null;
    } catch {
      return null;
    }
  }

  private async execSc(args: string[]): Promise<void> {
    await execFileAsync(resolveWindowsExecutable("sc.exe"), args, {
      windowsHide: true,
      timeout: 20_000
    });
  }

  private async execReg(args: string[]): Promise<void> {
    await execFileAsync(resolveWindowsExecutable("reg.exe"), args, {
      windowsHide: true,
      timeout: 10_000
    });
  }

  private async execPowerShell(command: string, timeoutMs = 8_000): Promise<string> {
    const { stdout } = await execFileAsync(
      resolveWindowsExecutable("powershell.exe"),
      ["-NoProfile", "-NonInteractive", "-Command", command],
      {
        windowsHide: true,
        timeout: timeoutMs
      }
    );
    return stdout;
  }

  private async fetchText(url: string, timeoutMs: number): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          "cache-control": "no-cache",
          pragma: "no-cache"
        },
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.text();
    } finally {
      clearTimeout(timer);
    }
  }

  private async launchConsoleCommand(
    executable: string,
    args: string[],
    options: { cwd: string }
  ): Promise<void> {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      detached: true,
      stdio: "ignore",
      windowsHide: false
    });
    child.unref();
  }

  private async killImageNames(imageNames: string[]): Promise<string[]> {
    const killed: string[] = [];

    for (const imageName of imageNames) {
      try {
        await execFileAsync(resolveWindowsExecutable("taskkill.exe"), ["/F", "/T", "/IM", imageName], {
          windowsHide: true,
          timeout: 8_000
        });
        killed.push(imageName);
      } catch (error: unknown) {
        if (this.isMissingProcessError(error)) {
          continue;
        }
        logger.warn("[zapret] Failed to stop process before cache cleanup:", imageName, error);
      }
    }

    return killed;
  }

  private isMissingProcessError(error: unknown): boolean {
    const message = getCommandFailureText(error);
    return /not found|no running instance|128/i.test(message);
  }

  private async removeExistingDirectories(targets: string[]): Promise<string[]> {
    const removed: string[] = [];

    for (const target of targets) {
      if (!(await this.pathExists(target))) {
        continue;
      }

      await fs.rm(target, {
        recursive: true,
        force: true,
        maxRetries: 2
      });
      removed.push(target);
    }

    return removed;
  }

  private async ensurePathExists(targetPath: string, errorMessage: string): Promise<void> {
    if (!(await this.pathExists(targetPath))) {
      throw new Error(errorMessage);
    }
  }

  private async getSourceRuntimeInfo(): Promise<SourceRuntimeInfo | null> {
    const candidates = [
      path.join(this.resourcesPath, "runtime", "zapret"),
      path.join(this.appPath, "runtime", "zapret"),
      path.join(process.cwd(), "runtime", "zapret")
    ];

    for (const candidate of candidates) {
      if (await this.pathExists(path.join(candidate, "core", "service.bat"))) {
        return {
          sourceDir: candidate,
          version: await this.readVersion(path.join(candidate, "VERSION.txt"))
        };
      }
    }

    return null;
  }

  private async readVersion(versionPath: string): Promise<string | null> {
    try {
      const raw = await fs.readFile(versionPath, "utf8");
      const value = raw.trim();
      return value || null;
    } catch {
      return null;
    }
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }
}
