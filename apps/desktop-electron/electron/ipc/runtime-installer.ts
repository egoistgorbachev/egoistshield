import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { RuntimeInstallResult } from "./contracts";

const execFileAsync = promisify(execFile);

type RuntimeKind = RuntimeInstallResult["runtimeKind"];

interface RuntimeInstallPlan {
  runtimeKind: RuntimeKind;
  displayName: string;
  runtimeDirName: string;
  exeName: string;
  releaseApiUrl: string;
  assetMatchers: RegExp[];
  assetExcludes?: RegExp[];
  extraFiles?: string[];
}

interface GitHubAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubRelease {
  tag_name?: string;
  assets?: GitHubAsset[];
}

const RELEASE_HEADERS = {
  "User-Agent": "EgoistShield/2.0",
  Accept: "application/vnd.github+json"
} as const;

const XRAY_PLAN: RuntimeInstallPlan = {
  runtimeKind: "xray",
  displayName: "Xray",
  runtimeDirName: "xray",
  exeName: "xray.exe",
  releaseApiUrl: "https://api.github.com/repos/XTLS/Xray-core/releases/latest",
  assetMatchers: [/windows-64.*\.zip$/i, /windows.*amd64.*\.zip$/i],
  extraFiles: ["geoip.dat", "geosite.dat"]
};

const SING_BOX_PLAN: RuntimeInstallPlan = {
  runtimeKind: "sing-box",
  displayName: "sing-box",
  runtimeDirName: "sing-box",
  exeName: "sing-box.exe",
  releaseApiUrl: "https://api.github.com/repos/SagerNet/sing-box/releases/latest",
  assetMatchers: [/windows-amd64\.zip$/i, /windows-amd64.*\.zip$/i],
  assetExcludes: [/legacy-windows-7/i]
};

export class RuntimeInstaller {
  public constructor(
    private readonly appRoot: string,
    private readonly userDataDir: string
  ) {}

  public async installXray(): Promise<RuntimeInstallResult> {
    return this.installRuntime(XRAY_PLAN);
  }

  public async installSingBox(): Promise<RuntimeInstallResult> {
    return this.installRuntime(SING_BOX_PLAN);
  }

  public async installAll(): Promise<{ ok: boolean; message: string; results: RuntimeInstallResult[] }> {
    const results: RuntimeInstallResult[] = [await this.installXray(), await this.installSingBox()];
    const ok = results.every((item) => item.ok);
    const failed = results.filter((item) => !item.ok);
    return {
      ok,
      message: failed.length === 0 ? "Runtime-компоненты готовы." : `Часть runtime не установлена (${failed.length}).`,
      results
    };
  }

  private async installRuntime(plan: RuntimeInstallPlan): Promise<RuntimeInstallResult> {
    const targetDir = path.join(this.userDataDir, "runtime", plan.runtimeDirName);
    const runtimePath = path.join(targetDir, plan.exeName);
    const versionPath = path.join(targetDir, "VERSION.txt");
    await fs.mkdir(targetDir, { recursive: true });

    const hadRuntimeBefore = await this.pathExists(runtimePath);
    const installedVersion = await this.readVersion(versionPath);
    const tempRoot = path.join(
      this.userDataDir,
      "runtime",
      "_download",
      `${plan.runtimeDirName}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    try {
      const release = await this.fetchLatestRelease(plan.releaseApiUrl);
      const releaseTag = release.tag_name?.trim() || "latest";
      const asset = this.pickAsset(release, plan);
      if (!asset) {
        throw new Error(`Не найден архив ${plan.displayName} для Windows x64.`);
      }

      if (hadRuntimeBefore && installedVersion === releaseTag) {
        return {
          ok: true,
          message: `${plan.displayName} уже актуален (${releaseTag}).`,
          runtimePath,
          runtimeKind: plan.runtimeKind,
          version: releaseTag,
          updated: false
        };
      }

      const zipPath = path.join(tempRoot, asset.name || `${plan.runtimeDirName}.zip`);
      const extractDir = path.join(tempRoot, "extract");
      await fs.mkdir(tempRoot, { recursive: true });

      await this.downloadToFile(asset.browser_download_url, zipPath);
      await this.extractZip(zipPath, extractDir);

      const extractedExe = await this.findFirstFileByName(extractDir, plan.exeName);
      if (!extractedExe) {
        throw new Error(`В архиве ${plan.displayName} отсутствует ${plan.exeName}.`);
      }
      await fs.copyFile(extractedExe, runtimePath);

      for (const filename of plan.extraFiles ?? []) {
        const source = await this.findFirstFileByName(extractDir, filename);
        if (source) {
          await fs.copyFile(source, path.join(targetDir, filename));
        }
      }

      await fs.writeFile(versionPath, `${releaseTag}\n`, "utf8");

      return {
        ok: true,
        message: `${plan.displayName} обновлён до ${releaseTag}.`,
        runtimePath,
        runtimeKind: plan.runtimeKind,
        version: releaseTag,
        updated: true
      };
    } catch (error) {
      const reason = this.errorToMessage(error);
      if (!hadRuntimeBefore) {
        const bundledResult = await this.tryUseBundledRuntime(plan, targetDir, runtimePath, versionPath);
        if (bundledResult) {
          return bundledResult;
        }
      }

      if (await this.pathExists(runtimePath)) {
        return {
          ok: true,
          message: `Не удалось обновить ${plan.displayName}, используется локальная версия: ${reason}`,
          runtimePath,
          runtimeKind: plan.runtimeKind,
          version: installedVersion,
          updated: false
        };
      }

      return {
        ok: false,
        message: `Не удалось установить ${plan.displayName}: ${reason}`,
        runtimePath: null,
        runtimeKind: plan.runtimeKind,
        version: null,
        updated: false
      };
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async tryUseBundledRuntime(
    plan: RuntimeInstallPlan,
    targetDir: string,
    runtimePath: string,
    versionPath: string
  ): Promise<RuntimeInstallResult | null> {
    const bundledDir = path.join(this.appRoot, "runtime", plan.runtimeDirName);
    const bundledExe = path.join(bundledDir, plan.exeName);
    if (!(await this.pathExists(bundledExe))) {
      return null;
    }

    await fs.mkdir(targetDir, { recursive: true });
    await fs.copyFile(bundledExe, runtimePath);
    for (const filename of plan.extraFiles ?? []) {
      const bundledFile = path.join(bundledDir, filename);
      if (await this.pathExists(bundledFile)) {
        await fs.copyFile(bundledFile, path.join(targetDir, filename));
      }
    }

    const bundledVersionPath = path.join(bundledDir, "VERSION.txt");
    const bundledVersion = await this.readVersion(bundledVersionPath);
    await fs.writeFile(versionPath, `${bundledVersion ?? "bundled"}\n`, "utf8");

    return {
      ok: true,
      message: `${plan.displayName} взят из встроенного пакета.`,
      runtimePath,
      runtimeKind: plan.runtimeKind,
      version: bundledVersion ?? "bundled",
      updated: true
    };
  }

  private async fetchLatestRelease(url: string): Promise<GitHubRelease> {
    const response = await fetch(url, { headers: RELEASE_HEADERS });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const body = (await response.json()) as GitHubRelease;
    return body;
  }

  private pickAsset(release: GitHubRelease, plan: RuntimeInstallPlan): GitHubAsset | null {
    const assets = Array.isArray(release.assets) ? release.assets : [];
    for (const matcher of plan.assetMatchers) {
      const asset = assets.find((item) => {
        if (!matcher.test(item.name)) {
          return false;
        }
        return !(plan.assetExcludes ?? []).some((exclude) => exclude.test(item.name));
      });
      if (asset) {
        return asset;
      }
    }
    return null;
  }

  private async downloadToFile(url: string, destination: string): Promise<void> {
    const response = await fetch(url, { headers: RELEASE_HEADERS });
    if (!response.ok) {
      throw new Error(`Ошибка загрузки (${response.status})`);
    }
    const data = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(destination, data);
  }

  private async extractZip(zipPath: string, destinationPath: string): Promise<void> {
    await fs.mkdir(destinationPath, { recursive: true });
    const command = `Expand-Archive -LiteralPath '${this.psEscape(zipPath)}' -DestinationPath '${this.psEscape(destinationPath)}' -Force`;
    await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command]);
  }

  private async findFirstFileByName(rootDir: string, filename: string): Promise<string | null> {
    const stack = [rootDir];
    const lowerName = filename.toLowerCase();
    while (stack.length > 0) {
      const dir = stack.pop();
      if (!dir) break;
      let entries: Awaited<ReturnType<typeof fs.readdir>>;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
          continue;
        }
        if (entry.isFile() && entry.name.toLowerCase() === lowerName) {
          return fullPath;
        }
      }
    }
    return null;
  }

  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
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

  private psEscape(value: string): string {
    return value.replace(/'/g, "''");
  }

  private errorToMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}
