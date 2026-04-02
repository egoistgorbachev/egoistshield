import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { shell } from "electron";
import type {
  TelegramProxyCommandResult,
  TelegramProxyConfig,
  TelegramProxyStatus,
  TelegramProxyUpdateInfo
} from "../../shared/types";
import { compareLooseVersions, readVersionFile } from "./github-release";
import { resolveWindowsExecutable } from "./windows-system-binaries";

const execFileAsync = promisify(execFile);

const TG_WS_PROXY_RELEASE_PAGE_URL = "https://github.com/Flowseal/tg-ws-proxy/releases/latest";
const TG_WS_PROXY_EXE_NAME = "TgWsProxy_windows_7_64bit.exe";
const TG_WS_PROXY_VERSION_FILE = "VERSION.txt";
const TG_WS_PROXY_INTERNAL_DIR = "telegram-proxy";

interface TelegramProxyRawConfig {
  host?: string;
  port?: number;
  secret?: string;
  dc_ip?: string[] | string;
  verbose?: boolean;
  buf_kb?: number;
  pool_size?: number;
  log_max_mb?: number;
  check_updates?: boolean;
}

interface SourceRuntimeInfo {
  sourceDir: string;
  runtimePath: string;
  version: string | null;
}

interface ManagedState {
  pid: number | null;
  startedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : fallback;
}

function normalizePositiveFloat(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

export function normalizeTelegramProxySecret(value: string): string {
  const trimmed = value.trim().replace(/^dd/i, "");
  return trimmed || randomBytes(16).toString("hex");
}

export function buildTelegramProxyLink(config: Pick<TelegramProxyConfig, "host" | "port" | "secret">): string {
  const secret = normalizeTelegramProxySecret(config.secret);
  return `tg://proxy?server=${encodeURIComponent(config.host)}&port=${config.port}&secret=dd${secret}`;
}

export function buildTelegramProxyWebLink(config: Pick<TelegramProxyConfig, "host" | "port" | "secret">): string {
  const secret = normalizeTelegramProxySecret(config.secret);
  return `https://t.me/proxy?server=${encodeURIComponent(config.host)}&port=${config.port}&secret=dd${secret}`;
}

export function normalizeTelegramProxyConfig(
  rawConfig: unknown,
  fallback?: TelegramProxyConfig
): TelegramProxyConfig {
  const safeFallback: TelegramProxyConfig =
    fallback ??
    ({
      host: "127.0.0.1",
      port: 1443,
      secret: randomBytes(16).toString("hex"),
      dcIp: ["2:149.154.167.220", "4:149.154.167.220"],
      verbose: false,
      bufKb: 256,
      poolSize: 4,
      logMaxMb: 5,
      checkUpdates: true
    } satisfies TelegramProxyConfig);

  if (!isRecord(rawConfig)) {
    return safeFallback;
  }

  const dcIpValue = rawConfig.dc_ip;
  const dcIp = Array.isArray(dcIpValue)
    ? dcIpValue.map((item) => String(item).trim()).filter(Boolean)
    : typeof dcIpValue === "string"
      ? dcIpValue
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean)
      : safeFallback.dcIp;

  return {
    host: typeof rawConfig.host === "string" && rawConfig.host.trim() ? rawConfig.host.trim() : safeFallback.host,
    port: normalizePositiveInteger(rawConfig.port, safeFallback.port),
    secret:
      typeof rawConfig.secret === "string" ? normalizeTelegramProxySecret(rawConfig.secret) : safeFallback.secret,
    dcIp: dcIp.length > 0 ? dcIp : safeFallback.dcIp,
    verbose: typeof rawConfig.verbose === "boolean" ? rawConfig.verbose : safeFallback.verbose,
    bufKb: normalizePositiveInteger(rawConfig.buf_kb, safeFallback.bufKb),
    poolSize: normalizePositiveInteger(rawConfig.pool_size, safeFallback.poolSize),
    logMaxMb: normalizePositiveFloat(rawConfig.log_max_mb, safeFallback.logMaxMb),
    checkUpdates: typeof rawConfig.check_updates === "boolean" ? rawConfig.check_updates : safeFallback.checkUpdates
  };
}

function toRawConfig(config: TelegramProxyConfig): TelegramProxyRawConfig {
  return {
    host: config.host,
    port: config.port,
    secret: normalizeTelegramProxySecret(config.secret),
    dc_ip: config.dcIp,
    verbose: config.verbose,
    buf_kb: config.bufKb,
    pool_size: config.poolSize,
    log_max_mb: config.logMaxMb,
    check_updates: config.checkUpdates
  };
}

function buildCommandResult(message: string, options: Partial<TelegramProxyCommandResult> = {}): TelegramProxyCommandResult {
  return {
    ok: options.ok ?? true,
    opened: options.opened ?? false,
    message,
    output: options.output ?? ""
  };
}

export class TelegramProxyManager {
  private readonly runtimeDir: string;
  private readonly appDataDir: string;
  private readonly legacyAppDataDir: string;
  private readonly configPath: string;
  private readonly logPath: string;
  private readonly firstRunMarkerPath: string;
  private readonly statePath: string;
  private lastError: string | null = null;

  public constructor(
    private readonly resourcesPath: string,
    private readonly appPath: string,
    private readonly userDataDir: string
  ) {
    this.runtimeDir = path.join(this.userDataDir, "runtime", "tg-ws-proxy");
    this.appDataDir = path.join(this.userDataDir, TG_WS_PROXY_INTERNAL_DIR);
    this.legacyAppDataDir = path.join(process.env.APPDATA || path.dirname(this.userDataDir), "TgWsProxy");
    this.configPath = path.join(this.appDataDir, "config.json");
    this.logPath = path.join(this.appDataDir, "proxy.log");
    this.firstRunMarkerPath = path.join(this.appDataDir, ".first_run_done_mtproto");
    this.statePath = path.join(this.userDataDir, "telegram-proxy-state.json");
  }

  public async status(): Promise<TelegramProxyStatus> {
    await this.ensureConfigExists();

    const config = await this.readConfig();
    const managedState = await this.readManagedState();
    const running = await this.isStateRunning(managedState);
    if (!running && managedState) {
      await this.clearManagedState();
    }

    const runtime = await this.getSourceRuntimeInfo();
    return {
      available: Boolean(runtime),
      running,
      pid: running ? managedState?.pid ?? null : null,
      runtimePath: runtime?.runtimePath ?? null,
      configPath: this.configPath,
      logPath: this.logPath,
      currentVersion: runtime?.version ?? null,
      connectionUrl: buildTelegramProxyLink(config),
      updateChecksEnabled: config.checkUpdates,
      config,
      lastError: this.lastError
    };
  }

  public async saveConfig(config: TelegramProxyConfig): Promise<TelegramProxyStatus> {
    await this.writeConfig(config);
    this.lastError = null;
    return this.status();
  }

  public async start(): Promise<TelegramProxyStatus> {
    const runtime = await this.getSourceRuntimeInfo();
    if (!runtime) {
      throw new Error("Бинарь TG WS Proxy не найден. Сначала подготовьте runtime/tg-ws-proxy.");
    }

    const currentState = await this.readManagedState();
    if (await this.isStateRunning(currentState)) {
      return this.status();
    }

    const config = await this.readConfig();
    await this.writeConfig(config);
    await fs.mkdir(this.appDataDir, { recursive: true });
    await fs.writeFile(this.firstRunMarkerPath, new Date().toISOString(), "utf8");

    const child = spawn(runtime.runtimePath, this.buildRuntimeArgs(config), {
      cwd: path.dirname(runtime.runtimePath),
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    child.unref();

    await this.writeManagedState({
      pid: child.pid ?? null,
      startedAt: new Date().toISOString()
    });

    this.lastError = null;
    return this.status();
  }

  public async stop(): Promise<TelegramProxyStatus> {
    const state = await this.readManagedState();
    if (state?.pid && (await this.isPidRunning(state.pid))) {
      try {
        await execFileAsync(resolveWindowsExecutable("taskkill.exe"), ["/PID", String(state.pid), "/T", "/F"], {
          windowsHide: true,
          timeout: 8_000
        });
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error);
      }
    }

    await this.clearManagedState();
    return this.status();
  }

  public async restart(): Promise<TelegramProxyStatus> {
    await this.stop();
    return this.start();
  }

  public async checkForUpdates(): Promise<TelegramProxyUpdateInfo> {
    const runtime = await this.getSourceRuntimeInfo();
    const bundledRuntime = await this.getBundledRuntimeInfo();
    const currentVersion = runtime?.version ?? null;
    const latestVersion = bundledRuntime?.version ?? currentVersion;
    const updateAvailable =
      Boolean(
        bundledRuntime &&
          runtime &&
          runtime.sourceDir !== bundledRuntime.sourceDir &&
          latestVersion &&
          currentVersion &&
          compareLooseVersions(latestVersion, currentVersion) > 0
      );

    return {
      currentVersion,
      latestVersion,
      updateAvailable,
      releaseUrl: TG_WS_PROXY_RELEASE_PAGE_URL,
      message: latestVersion
        ? updateAvailable
          ? `Доступен managed runtime TG WS Proxy: ${latestVersion}`
          : `TG WS Proxy уже актуален (${currentVersion ?? latestVersion}).`
        : "Bundled runtime TG WS Proxy не найден."
    };
  }

  public async installUpdate(): Promise<TelegramProxyStatus> {
    const bundledRuntime = await this.getBundledRuntimeInfo();
    if (!bundledRuntime) {
      throw new Error("Bundled runtime TG WS Proxy не найден.");
    }

    const wasRunning = await this.isStateRunning(await this.readManagedState());
    if (wasRunning) {
      await this.stop();
    }

    await fs.mkdir(this.runtimeDir, { recursive: true });
    const runtimePath = path.join(this.runtimeDir, TG_WS_PROXY_EXE_NAME);
    await fs.copyFile(bundledRuntime.runtimePath, runtimePath);
    const bundledVersionPath = path.join(bundledRuntime.sourceDir, TG_WS_PROXY_VERSION_FILE);
    if (await this.pathExists(bundledVersionPath)) {
      await fs.copyFile(bundledVersionPath, path.join(this.runtimeDir, TG_WS_PROXY_VERSION_FILE));
    } else {
      await fs.writeFile(
        path.join(this.runtimeDir, TG_WS_PROXY_VERSION_FILE),
        `${bundledRuntime.version ?? "bundled"}\n`,
        "utf8"
      );
    }

    if (wasRunning) {
      await this.start();
    }

    this.lastError = null;
    return this.status();
  }

  public async openConnectionLink(): Promise<TelegramProxyCommandResult> {
    const config = await this.readConfig();
    const nativeUrl = buildTelegramProxyLink(config);
    const webUrl = buildTelegramProxyWebLink(config);

    try {
      await shell.openExternal(nativeUrl);
      return buildCommandResult("Ссылка подключения открыта в Telegram.", {
        opened: true,
        output: nativeUrl
      });
    } catch {
      try {
        await shell.openExternal(webUrl);
        return buildCommandResult("Протокол tg:// не найден, ссылка открыта через web-страницу Telegram.", {
          opened: true,
          output: webUrl
        });
      } catch {
        throw new Error(
          "Не удалось открыть ссылку Telegram Proxy. Проверьте, что установлен Telegram Desktop или доступен браузер."
        );
      }
    }
  }

  public async openLogs(): Promise<TelegramProxyCommandResult> {
    shell.showItemInFolder(this.logPath);
    return buildCommandResult("Открыта папка с логами TG WS Proxy.", { opened: true });
  }

  public async shouldCheckUpdates(): Promise<boolean> {
    const config = await this.readConfig();
    return config.checkUpdates;
  }

  private async ensureConfigExists(): Promise<void> {
    await this.migrateLegacyStateIfNeeded();
    await fs.mkdir(this.appDataDir, { recursive: true });
    if (!(await this.pathExists(this.configPath))) {
      await this.writeConfig(
        normalizeTelegramProxyConfig(null, {
          host: "127.0.0.1",
          port: 1443,
          secret: randomBytes(16).toString("hex"),
          dcIp: ["2:149.154.167.220", "4:149.154.167.220"],
          verbose: false,
          bufKb: 256,
          poolSize: 4,
          logMaxMb: 5,
          checkUpdates: true
        })
      );
    }
  }

  private async readConfig(): Promise<TelegramProxyConfig> {
    await this.ensureConfigExists();
    try {
      const raw = JSON.parse(await fs.readFile(this.configPath, "utf8")) as TelegramProxyRawConfig;
      return normalizeTelegramProxyConfig(raw);
    } catch {
      return normalizeTelegramProxyConfig(null);
    }
  }

  private async writeConfig(config: TelegramProxyConfig): Promise<void> {
    await fs.mkdir(this.appDataDir, { recursive: true });
    await fs.writeFile(this.configPath, `${JSON.stringify(toRawConfig(config), null, 2)}\n`, "utf8");
  }

  private async readManagedState(): Promise<ManagedState | null> {
    try {
      const raw = JSON.parse(await fs.readFile(this.statePath, "utf8")) as ManagedState;
      return {
        pid: typeof raw.pid === "number" ? raw.pid : null,
        startedAt: typeof raw.startedAt === "string" ? raw.startedAt : new Date().toISOString()
      };
    } catch {
      return null;
    }
  }

  private async writeManagedState(state: ManagedState): Promise<void> {
    await fs.writeFile(this.statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  private async clearManagedState(): Promise<void> {
    await fs.rm(this.statePath, { force: true });
  }

  private async isStateRunning(state: ManagedState | null): Promise<boolean> {
    if (!state?.pid) {
      return false;
    }
    return this.isPidRunning(state.pid);
  }

  private async isPidRunning(pid: number): Promise<boolean> {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private async getSourceRuntimeInfo(): Promise<SourceRuntimeInfo | null> {
    const candidates = [
      this.runtimeDir,
      path.join(this.resourcesPath, "runtime", "tg-ws-proxy"),
      path.join(this.appPath, "runtime", "tg-ws-proxy"),
      path.join(process.cwd(), "runtime", "tg-ws-proxy")
    ];

    for (const candidate of candidates) {
      const runtimePath = path.join(candidate, TG_WS_PROXY_EXE_NAME);
      if (await this.pathExists(runtimePath)) {
        return {
          sourceDir: candidate,
          runtimePath,
          version: await readVersionFile(path.join(candidate, TG_WS_PROXY_VERSION_FILE))
        };
      }
    }

    return null;
  }

  private async getBundledRuntimeInfo(): Promise<SourceRuntimeInfo | null> {
    const candidates = [
      path.join(this.resourcesPath, "runtime", "tg-ws-proxy"),
      path.join(this.appPath, "runtime", "tg-ws-proxy"),
      path.join(process.cwd(), "runtime", "tg-ws-proxy")
    ];

    for (const candidate of candidates) {
      const runtimePath = path.join(candidate, TG_WS_PROXY_EXE_NAME);
      if (await this.pathExists(runtimePath)) {
        return {
          sourceDir: candidate,
          runtimePath,
          version: await readVersionFile(path.join(candidate, TG_WS_PROXY_VERSION_FILE))
        };
      }
    }

    return null;
  }

  private buildRuntimeArgs(config: TelegramProxyConfig): string[] {
    const args = [
      "--host",
      config.host,
      "--port",
      String(config.port),
      "--secret",
      normalizeTelegramProxySecret(config.secret),
      "--buf-kb",
      String(config.bufKb),
      "--pool-size",
      String(config.poolSize),
      "--log-file",
      this.logPath,
      "--log-max-mb",
      String(config.logMaxMb)
    ];

    for (const dcIp of config.dcIp) {
      args.push("--dc-ip", dcIp);
    }

    if (config.verbose) {
      args.push("--verbose");
    }

    return args;
  }

  private async migrateLegacyStateIfNeeded(): Promise<void> {
    if (await this.pathExists(this.configPath)) {
      return;
    }

    await fs.mkdir(this.appDataDir, { recursive: true });
    const legacyConfigPath = path.join(this.legacyAppDataDir, "config.json");
    const legacyLogPath = path.join(this.legacyAppDataDir, "proxy.log");
    const legacyMarkerPath = path.join(this.legacyAppDataDir, ".first_run_done_mtproto");

    if (await this.pathExists(legacyConfigPath)) {
      await fs.copyFile(legacyConfigPath, this.configPath);
    }
    if ((await this.pathExists(legacyLogPath)) && !(await this.pathExists(this.logPath))) {
      await fs.copyFile(legacyLogPath, this.logPath);
    }
    if ((await this.pathExists(legacyMarkerPath)) && !(await this.pathExists(this.firstRunMarkerPath))) {
      await fs.copyFile(legacyMarkerPath, this.firstRunMarkerPath);
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
