import { promises as fs } from "node:fs";
import path from "node:path";
import type { RuntimeInstallResult, RuntimeUpdateInfo } from "./contracts";
import {
  buildGitHubAssetDownloadUrl,
  compareLooseVersions,
  downloadFileWithProgress,
  extractZipArchive,
  normalizeVersionTag,
  pickGitHubAsset,
  readVersionFile,
  resolveLatestGitHubRelease,
  verifyGitHubReleaseAssetChecksum
} from "./github-release";

type RuntimeKind = RuntimeInstallResult["runtimeKind"];

interface RuntimeInstallPlan {
  runtimeKind: RuntimeKind;
  displayName: string;
  runtimeDirName: string;
  exeName: string;
  releaseApiUrl: string;
  releasePageUrl: string;
  assetMatchers: RegExp[];
  assetExcludes?: RegExp[];
  fallbackAssetName?: (tagName: string) => string | null;
  extraFiles?: string[];
}

const XRAY_PLAN: RuntimeInstallPlan = {
  runtimeKind: "xray",
  displayName: "Xray",
  runtimeDirName: "xray",
  exeName: "xray.exe",
  releaseApiUrl: "https://api.github.com/repos/XTLS/Xray-core/releases/latest",
  releasePageUrl: "https://github.com/XTLS/Xray-core/releases/latest",
  assetMatchers: [/windows-64.*\.zip$/i, /windows.*amd64.*\.zip$/i],
  fallbackAssetName: () => "Xray-windows-64.zip",
  extraFiles: ["geoip.dat", "geosite.dat"]
};

const SING_BOX_PLAN: RuntimeInstallPlan = {
  runtimeKind: "sing-box",
  displayName: "sing-box",
  runtimeDirName: "sing-box",
  exeName: "sing-box.exe",
  releaseApiUrl: "https://api.github.com/repos/SagerNet/sing-box/releases/latest",
  releasePageUrl: "https://github.com/SagerNet/sing-box/releases/latest",
  assetMatchers: [/windows-amd64\.zip$/i, /windows-amd64.*\.zip$/i],
  assetExcludes: [/legacy-windows-7/i],
  fallbackAssetName: (tagName: string) => {
    const normalized = normalizeVersionTag(tagName);
    return normalized ? `sing-box-${normalized}-windows-amd64.zip` : null;
  }
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

  public async checkUpdates(): Promise<RuntimeUpdateInfo[]> {
    return Promise.all([this.checkRuntimePlan(XRAY_PLAN), this.checkRuntimePlan(SING_BOX_PLAN)]);
  }

  private async installRuntime(plan: RuntimeInstallPlan): Promise<RuntimeInstallResult> {
    const targetDir = path.join(this.userDataDir, "runtime", plan.runtimeDirName);
    const runtimePath = path.join(targetDir, plan.exeName);
    const versionPath = path.join(targetDir, "VERSION.txt");
    await fs.mkdir(targetDir, { recursive: true });

    const hadRuntimeBefore = await this.pathExists(runtimePath);
    const installedVersion = await readVersionFile(versionPath);
    const tempRoot = path.join(
      this.userDataDir,
      "runtime",
      "_download",
      `${plan.runtimeDirName}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    try {
      const resolvedRelease = await resolveLatestGitHubRelease(plan.releaseApiUrl);
      const releaseTag = resolvedRelease.tag_name?.trim() || "latest";
      const asset = resolvedRelease.release
        ? pickGitHubAsset(resolvedRelease.release, plan.assetMatchers, plan.assetExcludes ?? [])
        : null;
      const fallbackAssetName = plan.fallbackAssetName?.(releaseTag) ?? null;
      const assetDownloadUrl =
        asset?.browser_download_url ??
        (fallbackAssetName ? buildGitHubAssetDownloadUrl(plan.releaseApiUrl, releaseTag, fallbackAssetName) : null);

      if (!assetDownloadUrl) {
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

      const zipPath = path.join(tempRoot, asset?.name || fallbackAssetName || `${plan.runtimeDirName}.zip`);
      const extractDir = path.join(tempRoot, "extract");
      await fs.mkdir(tempRoot, { recursive: true });

      await downloadFileWithProgress(assetDownloadUrl, zipPath);
      const verification = await verifyGitHubReleaseAssetChecksum({
        filePath: zipPath,
        assetName: path.basename(zipPath),
        releaseApiUrl: plan.releaseApiUrl,
        tagName: releaseTag,
        release: resolvedRelease.release
      });
      if (!verification.verified) {
        throw new Error(verification.verificationMessage);
      }
      await extractZipArchive(zipPath, extractDir);

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
        updated: true,
        verified: verification.verified,
        verificationMessage: verification.verificationMessage,
        integritySource: verification.integritySource
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

  private async checkRuntimePlan(plan: RuntimeInstallPlan): Promise<RuntimeUpdateInfo> {
    const currentVersion = await this.readInstalledVersion(plan);

    try {
      const resolvedRelease = await resolveLatestGitHubRelease(plan.releaseApiUrl);
      const latestVersion = resolvedRelease.tag_name?.trim() || null;
      const updateAvailable =
        latestVersion === null
          ? false
          : currentVersion === null
            ? true
            : compareLooseVersions(latestVersion, currentVersion) > 0;

      return {
        runtimeKind: plan.runtimeKind,
        displayName: plan.displayName,
        currentVersion,
        latestVersion,
        updateAvailable,
        releaseUrl: resolvedRelease.html_url ?? plan.releasePageUrl,
        integritySource: "sha256",
        verificationMessage: "Runtime-архив будет принят только при совпадении опубликованного SHA-256 checksum.",
        message: latestVersion
          ? updateAvailable
            ? `Доступно обновление ${plan.displayName}: ${latestVersion}`
            : `${plan.displayName} уже актуален (${currentVersion ?? latestVersion}).`
          : `Не удалось определить последнюю версию ${plan.displayName}.`
      };
    } catch (error) {
      return {
        runtimeKind: plan.runtimeKind,
        displayName: plan.displayName,
        currentVersion,
        latestVersion: null,
        updateAvailable: false,
        releaseUrl: plan.releasePageUrl,
        message: `Не удалось проверить ${plan.displayName}: ${this.errorToMessage(error)}`
      };
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

    const bundledVersion = await readVersionFile(path.join(bundledDir, "VERSION.txt"));
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

  private async findFirstFileByName(rootDir: string, filename: string): Promise<string | null> {
    const stack = [rootDir];
    const lowerName = filename.toLowerCase();
    while (stack.length > 0) {
      const dir = stack.pop();
      if (!dir) {
        break;
      }

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

  private async readInstalledVersion(plan: RuntimeInstallPlan): Promise<string | null> {
    const versionPaths = [
      path.join(this.userDataDir, "runtime", plan.runtimeDirName, "VERSION.txt"),
      path.join(this.appRoot, "runtime", plan.runtimeDirName, "VERSION.txt")
    ];

    for (const versionPath of versionPaths) {
      const version = await readVersionFile(versionPath);
      if (version) {
        return version;
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

  private errorToMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}
