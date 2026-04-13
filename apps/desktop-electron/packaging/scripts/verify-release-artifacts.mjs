import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");
const packageJsonPath = path.join(projectRoot, "package.json");
const distDir = path.join(projectRoot, "out", "dist");

function formatBytes(size) {
  return `${new Intl.NumberFormat("en-US").format(size)} bytes`;
}

async function readPackageVersion() {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const version = String(packageJson.version || "").trim();
  if (!version) {
    throw new Error("package.json version is missing.");
  }

  return version;
}

async function assertArtifactExists(label, filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`${label} is missing: ${path.relative(projectRoot, filePath)}`);
  }

  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) {
    throw new Error(`${label} is not a file: ${path.relative(projectRoot, filePath)}`);
  }
  if (fileStat.size <= 0) {
    throw new Error(`${label} is empty: ${path.relative(projectRoot, filePath)}`);
  }

  return fileStat;
}

async function assertAnyArtifactExists(label, filePaths) {
  for (const filePath of filePaths) {
    if (existsSync(filePath)) {
      return assertArtifactExists(label, filePath);
    }
  }

  throw new Error(
    `${label} is missing: ${filePaths.map((filePath) => path.relative(projectRoot, filePath)).join(" or ")}`
  );
}

function ensureString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is missing or empty.`);
  }

  return value.trim();
}

function ensureBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }

  return value;
}

export async function verifyReleaseArtifacts(rootDir = projectRoot) {
  const version = await readPackageVersion();
  const releaseDir = rootDir === projectRoot ? distDir : path.join(rootDir, "out", "dist");
  const installerName = `EgoistShield-${version}-Setup.exe`;
  const blockmapName = `${installerName}.blockmap`;
  const latestYmlPath = path.join(releaseDir, "latest.yml");
  const installerPath = path.join(releaseDir, installerName);
  const blockmapPath = path.join(releaseDir, blockmapName);
  const telegramProxyCandidates = [
    path.join(releaseDir, "win-unpacked", "resources", "runtime", "tg-ws-proxy", "egoistshield-tg-ws-proxy.bin"),
    path.join(releaseDir, "win-unpacked", "resources", "runtime", "tg-ws-proxy", "TgWsProxy_windows_7_64bit.exe")
  ];

  const installerStat = await assertArtifactExists("Installer", installerPath);
  const blockmapStat = await assertArtifactExists("Blockmap", blockmapPath);
  const latestYmlStat = await assertArtifactExists("latest.yml", latestYmlPath);
  await assertAnyArtifactExists("Telegram Proxy runtime", telegramProxyCandidates);

  const latestYmlRaw = await readFile(latestYmlPath, "utf8");
  const latest = parseYaml(latestYmlRaw);
  if (!latest || typeof latest !== "object") {
    throw new Error("latest.yml could not be parsed.");
  }

  const latestVersion = ensureString(latest.version, "latest.yml version");
  if (latestVersion !== version) {
    throw new Error(`latest.yml version mismatch: expected ${version}, got ${latestVersion}.`);
  }

  const latestPath = ensureString(latest.path, "latest.yml path");
  if (latestPath !== installerName) {
    throw new Error(`latest.yml path mismatch: expected ${installerName}, got ${latestPath}.`);
  }

  const releaseDate = ensureString(latest.releaseDate, "latest.yml releaseDate");
  if (Number.isNaN(Date.parse(releaseDate))) {
    throw new Error(`latest.yml releaseDate is invalid: ${releaseDate}`);
  }

  if (!Array.isArray(latest.files) || latest.files.length === 0) {
    throw new Error("latest.yml files[] is missing.");
  }

  const installerEntry = latest.files.find((item) => item?.url === installerName);
  if (!installerEntry) {
    throw new Error(`latest.yml files[] does not contain ${installerName}.`);
  }

  const latestSha512 = ensureString(installerEntry.sha512, "latest.yml files[installer].sha512");
  const latestSize = installerEntry.size;
  if (typeof latestSize !== "number" || !Number.isFinite(latestSize) || latestSize <= 0) {
    throw new Error("latest.yml files[installer].size must be a positive number.");
  }
  if (latestSize !== installerStat.size) {
    throw new Error(
      `latest.yml size mismatch for installer: expected ${installerStat.size}, got ${latestSize}.`
    );
  }

  if (ensureString(latest.sha512, "latest.yml sha512") !== latestSha512) {
    throw new Error("latest.yml root sha512 does not match files[installer].sha512.");
  }

  ensureBoolean(installerEntry.isAdminRightsRequired, "latest.yml files[installer].isAdminRightsRequired");

  return {
    version,
    installerName,
    installerSize: installerStat.size,
    blockmapSize: blockmapStat.size,
    latestYmlSize: latestYmlStat.size
  };
}

async function main() {
  const result = await verifyReleaseArtifacts();

  console.log(`[release:verify] Checking EgoistShield ${result.version}`);
  console.log(`[release:verify] Installer: ${result.installerName} (${formatBytes(result.installerSize)})`);
  console.log(`[release:verify] Blockmap: ${formatBytes(result.blockmapSize)}`);
  console.log(`[release:verify] latest.yml: ${formatBytes(result.latestYmlSize)}`);
  console.log("[release:verify] Release artifacts are present and metadata is consistent.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
