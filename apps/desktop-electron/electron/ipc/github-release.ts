import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { createReadStream } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { IntegritySource } from "./contracts";
import { resolveWindowsExecutable } from "./windows-system-binaries";

const execFileAsync = promisify(execFile);

export interface GitHubAsset {
  name: string;
  browser_download_url: string;
  digest?: string | null;
}

export interface GitHubRelease {
  html_url?: string;
  tag_name?: string;
  assets?: GitHubAsset[];
}

export interface GitHubTag {
  name: string;
}

export interface ResolvedGitHubRelease {
  release: GitHubRelease | null;
  html_url: string | null;
  tag_name: string | null;
  source: "api" | "release-page";
}

export interface DownloadProgress {
  percent: number;
  transferred: number;
  total: number;
}

export interface IntegrityVerificationResult {
  verified: boolean;
  integritySource: IntegritySource;
  verificationMessage: string;
  expectedSha256?: string | null;
  actualSha256?: string | null;
  signerSubject?: string | null;
}

export const DEFAULT_GITHUB_HEADERS = {
  "User-Agent": "EgoistShield/Desktop",
  Accept: "application/vnd.github+json"
} as const;

function parseGitHubReleaseApiUrl(releaseApiUrl: string): { owner: string; repo: string } | null {
  const match = releaseApiUrl.match(/^https:\/\/api\.github\.com\/repos\/([^/]+)\/([^/]+)\/releases\/latest\/?$/i);
  if (!match?.[1] || !match[2]) {
    return null;
  }

  return {
    owner: match[1],
    repo: match[2]
  };
}

export function buildGitHubTagsApiUrl(releaseApiUrl: string): string | null {
  const parsed = parseGitHubReleaseApiUrl(releaseApiUrl);
  if (!parsed) {
    return null;
  }

  return `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/tags`;
}

export function buildGitHubReleaseTagApiUrl(releaseApiUrl: string, tagName: string): string | null {
  const parsed = parseGitHubReleaseApiUrl(releaseApiUrl);
  if (!parsed) {
    return null;
  }

  return `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/releases/tags/${encodeURIComponent(tagName)}`;
}

export function buildGitHubReleaseTagPageUrl(releaseApiUrl: string, tagName: string): string | null {
  const parsed = parseGitHubReleaseApiUrl(releaseApiUrl);
  if (!parsed) {
    return null;
  }

  return `https://github.com/${parsed.owner}/${parsed.repo}/releases/tag/${encodeURIComponent(tagName)}`;
}

export function normalizeVersionTag(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/^v/i, "");
}

function toVersionTokens(value: string): Array<string | number> {
  return value
    .trim()
    .replace(/^v/i, "")
    .split(/([0-9]+)/)
    .filter(Boolean)
    .map((part) => (/^[0-9]+$/.test(part) ? Number.parseInt(part, 10) : part.toLowerCase()));
}

export function compareLooseVersions(left: string, right: string): number {
  const leftTokens = toVersionTokens(left);
  const rightTokens = toVersionTokens(right);
  const length = Math.max(leftTokens.length, rightTokens.length);

  for (let index = 0; index < length; index += 1) {
    const leftToken = leftTokens[index];
    const rightToken = rightTokens[index];

    if (typeof leftToken === "undefined") {
      return typeof rightToken === "number" && rightToken > 0 ? -1 : 0;
    }
    if (typeof rightToken === "undefined") {
      return typeof leftToken === "number" && leftToken > 0 ? 1 : 0;
    }

    if (typeof leftToken === "number" && typeof rightToken === "number") {
      if (leftToken !== rightToken) {
        return leftToken > rightToken ? 1 : -1;
      }
      continue;
    }

    const compared = String(leftToken).localeCompare(String(rightToken), "en", {
      sensitivity: "base",
      numeric: true
    });
    if (compared !== 0) {
      return compared > 0 ? 1 : -1;
    }
  }

  return 0;
}

export async function fetchLatestGitHubRelease(
  releaseApiUrl: string,
  headers: HeadersInit = DEFAULT_GITHUB_HEADERS
): Promise<GitHubRelease> {
  const response = await fetch(releaseApiUrl, {
    headers,
    signal: AbortSignal.timeout(15_000)
  });

  if (!response.ok) {
    throw new Error(`GitHub HTTP ${response.status}`);
  }

  return (await response.json()) as GitHubRelease;
}

export async function fetchGitHubReleaseByTag(
  releaseApiUrl: string,
  tagName: string,
  headers: HeadersInit = DEFAULT_GITHUB_HEADERS
): Promise<GitHubRelease> {
  const releaseTagApiUrl = buildGitHubReleaseTagApiUrl(releaseApiUrl, tagName);
  if (!releaseTagApiUrl) {
    throw new Error("Unsupported GitHub release API URL.");
  }

  const response = await fetch(releaseTagApiUrl, {
    headers,
    signal: AbortSignal.timeout(15_000)
  });

  if (!response.ok) {
    throw new Error(`GitHub HTTP ${response.status}`);
  }

  return (await response.json()) as GitHubRelease;
}

export async function fetchGitHubTags(
  releaseApiUrl: string,
  headers: HeadersInit = DEFAULT_GITHUB_HEADERS,
  limit = 20
): Promise<string[]> {
  const tagsApiUrl = buildGitHubTagsApiUrl(releaseApiUrl);
  if (!tagsApiUrl) {
    throw new Error("Unsupported GitHub release API URL.");
  }

  const response = await fetch(`${tagsApiUrl}?per_page=${Math.max(1, Math.min(limit, 100))}`, {
    headers,
    signal: AbortSignal.timeout(15_000)
  });

  if (!response.ok) {
    throw new Error(`GitHub HTTP ${response.status}`);
  }

  const tags = (await response.json()) as GitHubTag[];
  return tags
    .map((item) => item.name?.trim())
    .filter((item): item is string => Boolean(item));
}

export function buildGitHubReleasePageUrl(releaseApiUrl: string): string | null {
  const parsed = parseGitHubReleaseApiUrl(releaseApiUrl);
  if (!parsed) {
    return null;
  }

  return `https://github.com/${parsed.owner}/${parsed.repo}/releases/latest`;
}

export function buildGitHubAssetDownloadUrl(
  releaseApiUrl: string,
  tagName: string,
  assetName: string
): string | null {
  const parsed = parseGitHubReleaseApiUrl(releaseApiUrl);
  if (!parsed) {
    return null;
  }

  return `https://github.com/${parsed.owner}/${parsed.repo}/releases/download/${encodeURIComponent(tagName)}/${encodeURIComponent(assetName)}`;
}

export function extractGitHubTagFromReleaseUrl(url: string): string | null {
  const match = url.match(/\/releases\/tag\/([^/?#]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function pickLatestGitHubTag(tags: Array<string | null | undefined>): string | null {
  const normalized = tags
    .map((tag) => tag?.trim())
    .filter((tag): tag is string => Boolean(tag));

  if (normalized.length === 0) {
    return null;
  }

  return normalized.sort((left, right) => compareLooseVersions(right, left))[0] ?? null;
}

async function fetchLatestGitHubReleasePageMeta(
  releaseApiUrl: string,
  headers: HeadersInit = DEFAULT_GITHUB_HEADERS
): Promise<Pick<ResolvedGitHubRelease, "html_url" | "tag_name">> {
  const releasePageUrl = buildGitHubReleasePageUrl(releaseApiUrl);
  if (!releasePageUrl) {
    throw new Error("Unsupported GitHub release API URL.");
  }

  const response = await fetch(releasePageUrl, {
    headers: {
      ...headers,
      Accept: "text/html,application/xhtml+xml"
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000)
  });

  if (!response.ok) {
    throw new Error(`GitHub release page HTTP ${response.status}`);
  }

  const finalUrl = response.url || releasePageUrl;
  let tagName = extractGitHubTagFromReleaseUrl(finalUrl);

  if (!tagName) {
    const html = await response.text();
    const inlineMatch = html.match(/\/releases\/tag\/([^"'?#<>\s]+)/i);
    tagName = inlineMatch?.[1] ? decodeURIComponent(inlineMatch[1]) : null;
  }

  return {
    html_url: tagName ? finalUrl : releasePageUrl,
    tag_name: tagName
  };
}

export async function resolveLatestGitHubRelease(
  releaseApiUrl: string,
  headers: HeadersInit = DEFAULT_GITHUB_HEADERS
): Promise<ResolvedGitHubRelease> {
  try {
    const release = await fetchLatestGitHubRelease(releaseApiUrl, headers);
    return {
      release,
      html_url: release.html_url?.trim() || buildGitHubReleasePageUrl(releaseApiUrl),
      tag_name: release.tag_name?.trim() || null,
      source: "api"
    };
  } catch (apiError) {
    try {
      const fallback = await fetchLatestGitHubReleasePageMeta(releaseApiUrl, headers);
      return {
        release: null,
        ...fallback,
        source: "release-page"
      };
    } catch (fallbackError) {
      const apiMessage = apiError instanceof Error ? apiError.message : String(apiError);
      const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      throw new Error(`${apiMessage}; fallback failed: ${fallbackMessage}`);
    }
  }
}

export function pickGitHubAsset(
  release: GitHubRelease,
  matchers: RegExp[],
  excludes: RegExp[] = []
): GitHubAsset | null {
  const assets = Array.isArray(release.assets) ? release.assets : [];

  for (const matcher of matchers) {
    const asset = assets.find((item) => {
      if (!matcher.test(item.name)) {
        return false;
      }
      return !excludes.some((exclude) => exclude.test(item.name));
    });

    if (asset) {
      return asset;
    }
  }

  return null;
}

export async function downloadFileWithProgress(
  url: string,
  destinationPath: string,
  onProgress?: (progress: DownloadProgress) => void,
  headers: HeadersInit = DEFAULT_GITHUB_HEADERS
): Promise<void> {
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });

  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(60_000)
  });

  if (!response.ok || !response.body) {
    throw new Error(`Ошибка загрузки (${response.status})`);
  }

  const total = Number.parseInt(response.headers.get("content-length") ?? "0", 10) || 0;
  const fileHandle = await fs.open(destinationPath, "w");
  let transferred = 0;

  try {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }

      await fileHandle.write(Buffer.from(value), 0, value.length, null);
      transferred += value.length;
      onProgress?.({
        percent: total > 0 ? Math.min(100, Math.round((transferred / total) * 100)) : 0,
        transferred,
        total
      });
    }
  } catch (error) {
    await fs.rm(destinationPath, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    await fileHandle.close();
  }

  onProgress?.({
    percent: 100,
    transferred,
    total
  });
}

async function downloadText(
  url: string,
  headers: HeadersInit = DEFAULT_GITHUB_HEADERS
): Promise<string> {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(20_000)
  });

  if (!response.ok) {
    throw new Error(`Checksum HTTP ${response.status}`);
  }

  return response.text();
}

function quotePowerShellLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function normalizeAuthenticodeStatusMessage(
  status: string,
  statusMessage: string | null | undefined
): string {
  const cleaned = statusMessage?.replace(/\s+/g, " ").trim() || null;

  if (status === "NotSigned" || (cleaned && /not digitally signed/i.test(cleaned))) {
    return "Файл не подписан цифровой подписью.";
  }

  return cleaned || status || "UnknownError";
}

export function buildChecksumCandidateAssetNames(assetName: string): string[] {
  const exactCandidates = [
    `${assetName}.sha256`,
    `${assetName}.sha256.txt`,
    `${assetName}.sha256sum`,
    `${assetName}.sha256sum.txt`,
    `${assetName}.sha256sums`,
    `${assetName}.dgst`
  ];
  const genericCandidates = [
    "checksums.txt",
    "checksum.txt",
    "checksums.sha256",
    "checksum.sha256",
    "sha256sum.txt",
    "sha256sums.txt",
    "SHA256SUMS",
    "SHA256SUMS.txt",
    "sha256.txt"
  ];

  return [...new Set([...exactCandidates, ...genericCandidates])];
}

export function pickGitHubChecksumAsset(release: GitHubRelease, assetName: string): GitHubAsset | null {
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const candidates = new Set(buildChecksumCandidateAssetNames(assetName).map((item) => item.toLowerCase()));

  const exactMatch = assets.find((item) => candidates.has(item.name.toLowerCase()));
  if (exactMatch) {
    return exactMatch;
  }

  return (
    assets.find((item) =>
      /(^|[-_.])(sha256|sha256sum|checksums?)([-_.]|$)|\.dgst$/i.test(item.name)
    ) ?? null
  );
}

export function extractSha256FromChecksumText(checksumText: string, assetName: string): string | null {
  const normalizedAssetName = assetName.trim().toLowerCase();
  const lines = checksumText.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const opensslStyle = trimmed.match(/^SHA256\s*\((.+)\)\s*=\s*([a-f0-9]{64})$/i);
    if (opensslStyle?.[1] && opensslStyle[2] && opensslStyle[1].trim().toLowerCase() === normalizedAssetName) {
      return opensslStyle[2].toLowerCase();
    }

    const checksumList = trimmed.match(/^([a-f0-9]{64})\s+[* ]?(.+)$/i);
    if (checksumList?.[1] && checksumList[2]) {
      const listedName = checksumList[2].trim().replace(/^\.\//, "").toLowerCase();
      if (listedName === normalizedAssetName) {
        return checksumList[1].toLowerCase();
      }
    }
  }

  const allHashes = [...checksumText.matchAll(/\b([a-f0-9]{64})\b/gi)].map((match) => match[1]?.toLowerCase()).filter(Boolean);
  if (allHashes.length === 1) {
    return allHashes[0] ?? null;
  }

  return null;
}

export function extractSha256FromGitHubAssetDigest(digest: string | null | undefined): string | null {
  if (!digest) {
    return null;
  }

  const trimmed = digest.trim();
  const match = trimmed.match(/^(?:sha256:)?([a-f0-9]{64})$/i);
  return match?.[1] ? match[1].toLowerCase() : null;
}

export async function computeFileSha256(filePath: string): Promise<string> {
  const hash = createHash("sha256");

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => {
      hash.update(chunk);
    });
    stream.on("error", reject);
    stream.on("end", () => resolve());
  });

  return hash.digest("hex");
}

export async function verifyFileSha256(filePath: string, expectedSha256: string): Promise<IntegrityVerificationResult> {
  const normalizedExpected = expectedSha256.trim().toLowerCase();
  const actualSha256 = await computeFileSha256(filePath);
  const verified = actualSha256 === normalizedExpected;

  return {
    verified,
    integritySource: "sha256",
    verificationMessage: verified
      ? "SHA-256 checksum подтверждён."
      : "SHA-256 checksum не совпадает с опубликованным значением.",
    expectedSha256: normalizedExpected,
    actualSha256
  };
}

export async function verifyGitHubReleaseAssetChecksum(options: {
  filePath: string;
  assetName: string;
  releaseApiUrl: string;
  tagName: string;
  release?: GitHubRelease | null;
  assetDigest?: string | null;
  headers?: HeadersInit;
}): Promise<IntegrityVerificationResult> {
  const { assetDigest, assetName, filePath, headers = DEFAULT_GITHUB_HEADERS, release, releaseApiUrl, tagName } = options;
  const expectedSha256FromDigest = extractSha256FromGitHubAssetDigest(assetDigest);
  if (expectedSha256FromDigest) {
    return verifyFileSha256(filePath, expectedSha256FromDigest);
  }

  const checksumCandidates = buildChecksumCandidateAssetNames(assetName);
  const checksumUrls: string[] = [];

  const checksumAsset = release ? pickGitHubChecksumAsset(release, assetName) : null;
  if (checksumAsset?.browser_download_url) {
    checksumUrls.push(checksumAsset.browser_download_url);
  }

  for (const candidate of checksumCandidates) {
    const candidateUrl = buildGitHubAssetDownloadUrl(releaseApiUrl, tagName, candidate);
    if (candidateUrl) {
      checksumUrls.push(candidateUrl);
    }
  }

  const uniqueUrls = [...new Set(checksumUrls)];
  let lastChecksumError: string | null = null;

  for (const checksumUrl of uniqueUrls) {
    try {
      const checksumText = await downloadText(checksumUrl, headers);
      const expectedSha256 = extractSha256FromChecksumText(checksumText, assetName);
      if (!expectedSha256) {
        lastChecksumError = `В файле checksum нет SHA-256 для ${assetName}.`;
        continue;
      }

      return verifyFileSha256(filePath, expectedSha256);
    } catch (error) {
      lastChecksumError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    verified: false,
    integritySource: "none",
    verificationMessage:
      lastChecksumError ??
      `Не найден опубликованный checksum для ${assetName}, обновление заблокировано.`
  };
}

export async function verifyWindowsExecutableSignature(filePath: string): Promise<IntegrityVerificationResult> {
  const command = [
    `$sig = Get-AuthenticodeSignature -LiteralPath ${quotePowerShellLiteral(filePath)}`,
    "$payload = [pscustomobject]@{",
    "  Status = [string]$sig.Status",
    "  StatusMessage = [string]$sig.StatusMessage",
    "  SignerSubject = if ($sig.SignerCertificate) { [string]$sig.SignerCertificate.Subject } else { $null }",
    "}",
    "$payload | ConvertTo-Json -Compress"
  ].join("; ");

  try {
    const { stdout } = await execFileAsync(resolveWindowsExecutable("powershell.exe"), [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      command
    ]);

    const parsed = JSON.parse(stdout || "{}") as {
      Status?: string;
      StatusMessage?: string;
      SignerSubject?: string | null;
    };
    const status = parsed.Status?.trim() || "UnknownError";
    const statusMessage = parsed.StatusMessage?.trim() || null;
    const signerSubject = parsed.SignerSubject?.trim() || null;
    const normalizedStatusMessage = normalizeAuthenticodeStatusMessage(status, statusMessage);

    if (status === "Valid") {
      return {
        verified: true,
        integritySource: "authenticode",
        verificationMessage: signerSubject
          ? `Authenticode-подпись подтверждена: ${signerSubject}`
          : "Authenticode-подпись подтверждена.",
        signerSubject
      };
    }

    return {
      verified: false,
      integritySource: "authenticode",
      verificationMessage: signerSubject
        ? `Файл не прошёл проверку Authenticode (${normalizedStatusMessage}). Подписант: ${signerSubject}.`
        : `Файл не прошёл проверку Authenticode (${normalizedStatusMessage}).`,
      signerSubject
    };
  } catch (error) {
    return {
      verified: false,
      integritySource: "authenticode",
      verificationMessage: `Не удалось проверить Authenticode-подпись: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

export async function extractZipArchive(zipPath: string, destinationPath: string): Promise<void> {
  await fs.mkdir(destinationPath, { recursive: true });
  await execFileAsync(resolveWindowsExecutable("powershell.exe"), [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `Expand-Archive -LiteralPath ${quotePowerShellLiteral(zipPath)} -DestinationPath ${quotePowerShellLiteral(destinationPath)} -Force`
  ]);
}

export async function readVersionFile(versionPath: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(versionPath, "utf8");
    const trimmed = raw.trim();
    return trimmed || null;
  } catch {
    return null;
  }
}
