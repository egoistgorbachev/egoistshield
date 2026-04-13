import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildChecksumCandidateAssetNames,
  buildGitHubAssetDownloadUrl,
  buildGitHubReleasePageUrl,
  buildGitHubReleaseTagApiUrl,
  buildGitHubReleaseTagPageUrl,
  buildGitHubTagsApiUrl,
  compareLooseVersions,
  extractSha256FromGitHubAssetDigest,
  extractSha256FromChecksumText,
  extractGitHubTagFromReleaseUrl,
  fetchGitHubTags,
  normalizeAuthenticodeStatusMessage,
  normalizeVersionTag,
  pickGitHubAsset,
  pickGitHubChecksumAsset,
  pickLatestGitHubTag,
  resolveLatestGitHubRelease,
  verifyFileSha256
} from "../electron/ipc/github-release";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("github-release helpers", () => {
  it("normalizeVersionTag снимает v-префикс и пустые значения", () => {
    expect(normalizeVersionTag(" v1.4.0 ")).toBe("1.4.0");
    expect(normalizeVersionTag("V26.3.27")).toBe("26.3.27");
    expect(normalizeVersionTag("")).toBeNull();
    expect(normalizeVersionTag(undefined)).toBeNull();
  });

  it("normalizeAuthenticodeStatusMessage убирает шумный хвост PowerShell для неподписанных файлов", () => {
    expect(
      normalizeAuthenticodeStatusMessage(
        "NotSigned",
        "The file C:\\temp\\EgoistShield.exe is not digitally signed. You cannot run this script on the current system. For more information about running scripts and setting execution policy, see about_Execution_Policies."
      )
    ).toBe("Файл не подписан цифровой подписью.");
  });

  it("normalizeAuthenticodeStatusMessage сохраняет содержательное сообщение для других статусов", () => {
    expect(normalizeAuthenticodeStatusMessage("HashMismatch", "A certificate chain processed, but terminated in a root certificate that isn't trusted.")).toBe(
      "A certificate chain processed, but terminated in a root certificate that isn't trusted."
    );
  });

  it("compareLooseVersions корректно сравнивает semver и mixed suffixes", () => {
    expect(compareLooseVersions("v1.4.0", "1.3.9")).toBeGreaterThan(0);
    expect(compareLooseVersions("1.13.4", "1.13.4")).toBe(0);
    expect(compareLooseVersions("v26.3.27", "v26.4.1")).toBeLessThan(0);
    expect(compareLooseVersions("1.0.0-rc2", "1.0.0-rc1")).toBeGreaterThan(0);
  });

  it("pickGitHubAsset выбирает первый подходящий asset и уважает excludes", () => {
    const release = {
      assets: [
        { name: "sing-box-1.13.4-windows-7-amd64.zip", browser_download_url: "https://example.com/legacy.zip" },
        { name: "sing-box-1.13.4-windows-amd64.zip", browser_download_url: "https://example.com/current.zip" },
        { name: "sing-box-1.13.4-linux-amd64.tar.gz", browser_download_url: "https://example.com/linux.tgz" }
      ]
    };

    expect(
      pickGitHubAsset(release, [/windows-amd64\.zip$/i, /windows-7-amd64\.zip$/i], [/windows-7/i])
    ).toEqual({
      name: "sing-box-1.13.4-windows-amd64.zip",
      browser_download_url: "https://example.com/current.zip"
    });
  });

  it("pickGitHubAsset возвращает null, если совпадений нет", () => {
    const release = {
      assets: [{ name: "xray-linux-64.zip", browser_download_url: "https://example.com/xray-linux.zip" }]
    };

    expect(pickGitHubAsset(release, [/windows-64.*\.zip$/i])).toBeNull();
  });

  it("строит release/latest и releases/download URL по GitHub API endpoint", () => {
    expect(buildGitHubReleasePageUrl("https://api.github.com/repos/Flowseal/tg-ws-proxy/releases/latest")).toBe(
      "https://github.com/Flowseal/tg-ws-proxy/releases/latest"
    );
    expect(buildGitHubTagsApiUrl("https://api.github.com/repos/Flowseal/tg-ws-proxy/releases/latest")).toBe(
      "https://api.github.com/repos/Flowseal/tg-ws-proxy/tags"
    );
    expect(
      buildGitHubReleaseTagApiUrl("https://api.github.com/repos/Flowseal/tg-ws-proxy/releases/latest", "v1.6.1")
    ).toBe("https://api.github.com/repos/Flowseal/tg-ws-proxy/releases/tags/v1.6.1");
    expect(
      buildGitHubReleaseTagPageUrl("https://api.github.com/repos/Flowseal/tg-ws-proxy/releases/latest", "v1.6.1")
    ).toBe("https://github.com/Flowseal/tg-ws-proxy/releases/tag/v1.6.1");
    expect(
      buildGitHubAssetDownloadUrl(
        "https://api.github.com/repos/Flowseal/tg-ws-proxy/releases/latest",
        "v1.4.0",
        "TgWsProxy_windows_7_64bit.exe"
      )
    ).toBe("https://github.com/Flowseal/tg-ws-proxy/releases/download/v1.4.0/TgWsProxy_windows_7_64bit.exe");
  });

  it("extractGitHubTagFromReleaseUrl достаёт tag из releases/tag URL", () => {
    expect(extractGitHubTagFromReleaseUrl("https://github.com/XTLS/Xray-core/releases/tag/v26.3.27")).toBe("v26.3.27");
    expect(extractGitHubTagFromReleaseUrl("https://github.com/SagerNet/sing-box/releases/latest")).toBeNull();
  });

  it("pickLatestGitHubTag выбирает самый новый tag даже если releases/latest устарел", () => {
    expect(pickLatestGitHubTag(["v1.4.0", "v1.6.1", "v1.6.0"])).toBe("v1.6.1");
  });

  it("buildChecksumCandidateAssetNames добавляет asset-specific и generic checksum варианты", () => {
    expect(buildChecksumCandidateAssetNames("Xray-windows-64.zip")).toContain("Xray-windows-64.zip.sha256");
    expect(buildChecksumCandidateAssetNames("Xray-windows-64.zip")).toContain("checksums.txt");
  });

  it("pickGitHubChecksumAsset находит checksum asset рядом с релизом", () => {
    const release = {
      assets: [
        { name: "Xray-windows-64.zip", browser_download_url: "https://example.com/xray.zip" },
        { name: "Xray-windows-64.zip.dgst", browser_download_url: "https://example.com/xray.zip.dgst" }
      ]
    };

    expect(pickGitHubChecksumAsset(release, "Xray-windows-64.zip")).toEqual({
      name: "Xray-windows-64.zip.dgst",
      browser_download_url: "https://example.com/xray.zip.dgst"
    });
  });

  it("extractSha256FromChecksumText читает форматы checksum list и OpenSSL", () => {
    expect(
      extractSha256FromChecksumText(
        "4f6c6f3dca8a20b7d4d8d54f2c2fbb0e87f5f1939de6df9fe8cc8fe8b5d4c21a  sing-box-1.13.4-windows-amd64.zip",
        "sing-box-1.13.4-windows-amd64.zip"
      )
    ).toBe("4f6c6f3dca8a20b7d4d8d54f2c2fbb0e87f5f1939de6df9fe8cc8fe8b5d4c21a");

    expect(
      extractSha256FromChecksumText(
        "SHA256 (Xray-windows-64.zip) = 9b24ec4c9f2a9f2f08c8a587cb5ff5d3b6b0e2e62ef8f2392d6f2540fc4b3d8c",
        "Xray-windows-64.zip"
      )
    ).toBe("9b24ec4c9f2a9f2f08c8a587cb5ff5d3b6b0e2e62ef8f2392d6f2540fc4b3d8c");
  });

  it("extractSha256FromGitHubAssetDigest читает digest из GitHub Release API", () => {
    expect(
      extractSha256FromGitHubAssetDigest(
        "sha256:9b24ec4c9f2a9f2f08c8a587cb5ff5d3b6b0e2e62ef8f2392d6f2540fc4b3d8c"
      )
    ).toBe("9b24ec4c9f2a9f2f08c8a587cb5ff5d3b6b0e2e62ef8f2392d6f2540fc4b3d8c");
  });

  it("verifyFileSha256 подтверждает и отклоняет локальный файл по checksum", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "egoistshield-github-release-"));
    const filePath = path.join(tempDir, "payload.txt");
    await fs.writeFile(filePath, "egoistshield", "utf8");

    const verified = await verifyFileSha256(
      filePath,
      "c5cf39a4e3960d391796dfea4b7f47d5a8d2ca91b48127a8e24624c8ac4c5328"
    );
    expect(verified.verified).toBe(true);
    expect(verified.integritySource).toBe("sha256");

    const rejected = await verifyFileSha256(
      filePath,
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    );
    expect(rejected.verified).toBe(false);
    expect(rejected.actualSha256).toBe("c5cf39a4e3960d391796dfea4b7f47d5a8d2ca91b48127a8e24624c8ac4c5328");

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("resolveLatestGitHubRelease переключается на releases/latest page при GitHub API 403", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 403
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        url: "https://github.com/Flowseal/tg-ws-proxy/releases/tag/v1.4.0",
        text: async () => ""
      });

    vi.stubGlobal("fetch", fetchMock);

    const resolved = await resolveLatestGitHubRelease("https://api.github.com/repos/Flowseal/tg-ws-proxy/releases/latest");

    expect(resolved).toEqual({
      release: null,
      html_url: "https://github.com/Flowseal/tg-ws-proxy/releases/tag/v1.4.0",
      tag_name: "v1.4.0",
      source: "release-page"
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fetchGitHubTags читает список тегов из GitHub API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ name: "v1.6.1" }, { name: "v1.6.0" }, { name: "v1.4.0" }]
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchGitHubTags("https://api.github.com/repos/Flowseal/tg-ws-proxy/releases/latest")).resolves.toEqual([
      "v1.6.1",
      "v1.6.0",
      "v1.4.0"
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
