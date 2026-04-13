import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pngToIco from "png-to-ico";
import sharp from "sharp";

const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WORKSPACE_ROOT = path.resolve(PROJECT_DIR, "../../..");

export function getMasterLogoPath() {
  return path.join(WORKSPACE_ROOT, "artifacts", "egoistshield", "logo", "egoistshield-logo-for-crop-4096.png");
}

function createPngOptions() {
  return {
    quality: 100,
    compressionLevel: 9,
    palette: false
  };
}

async function ensureMasterLogoExists() {
  const masterLogoPath = getMasterLogoPath();
  await fs.access(masterLogoPath);
  return masterLogoPath;
}

async function writeResizedPng(inputPath, size, outputPath) {
  await sharp(inputPath)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png(createPngOptions())
    .toFile(outputPath);
}

async function copyMasterPng(inputPath, outputPath) {
  const buffer = await sharp(inputPath).png(createPngOptions()).toBuffer();
  await fs.writeFile(outputPath, buffer);
}

async function removeIfExists(targetPath) {
  await fs.rm(targetPath, { force: true });
}

async function writeInstallerSidebar(masterLogoPath, outputPath) {
  const canvasSize = 512;
  const logoSize = 320;
  const offset = Math.round((canvasSize - logoSize) / 2);
  const logoBuffer = await sharp(masterLogoPath)
    .resize(logoSize, logoSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png(createPngOptions())
    .toBuffer();

  const backgroundSvg = `
    <svg width="${canvasSize}" height="${canvasSize}" viewBox="0 0 ${canvasSize} ${canvasSize}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="outerGlow" cx="50%" cy="42%" r="52%">
          <stop offset="0%" stop-color="rgba(255, 113, 74, 0.30)" />
          <stop offset="100%" stop-color="rgba(255, 113, 74, 0)" />
        </radialGradient>
        <linearGradient id="surface" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#09131F" />
          <stop offset="100%" stop-color="#050A10" />
        </linearGradient>
      </defs>
      <rect width="${canvasSize}" height="${canvasSize}" rx="96" fill="url(#surface)" />
      <circle cx="${canvasSize / 2}" cy="${canvasSize / 2}" r="176" fill="url(#outerGlow)" />
    </svg>
  `;

  await sharp(Buffer.from(backgroundSvg))
    .composite([{ input: logoBuffer, left: offset, top: offset }])
    .png(createPngOptions())
    .toFile(outputPath);
}

export async function main() {
  const rootDir = path.resolve();
  const tmpDir = path.join(rootDir, "packaging", "scripts", "tmp-icons");
  const assetsDir = path.join(rootDir, "renderer", "public", "assets");
  const installerDir = path.join(rootDir, "packaging", "installer", "assets");
  const buildResourcesDir = path.join(rootDir, "packaging", "build-resources");
  const masterLogoPath = await ensureMasterLogoExists();

  await fs.mkdir(tmpDir, { recursive: true });
  await fs.mkdir(assetsDir, { recursive: true });
  await fs.mkdir(installerDir, { recursive: true });
  await fs.mkdir(buildResourcesDir, { recursive: true });

  console.log(`Generating icon set from master logo: ${masterLogoPath}`);

  const icoSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
  const icoPngs = await Promise.all(
    icoSizes.map(async (size) => {
      const tempPath = path.join(tmpDir, `ico-${size}.png`);
      await writeResizedPng(masterLogoPath, size, tempPath);
      return tempPath;
    })
  );

  const icoData = await pngToIco(icoPngs);
  await fs.writeFile(path.join(assetsDir, "icon.ico"), icoData);
  await fs.writeFile(path.join(assetsDir, "favicon.ico"), icoData);
  await fs.writeFile(path.join(installerDir, "installerHeaderIcon.ico"), icoData);

  await copyMasterPng(masterLogoPath, path.join(assetsDir, "icon.png"));
  await copyMasterPng(masterLogoPath, path.join(assetsDir, "shield-logo.png"));
  await writeResizedPng(masterLogoPath, 32, path.join(assetsDir, "tray-icon.png"));
  await writeResizedPng(masterLogoPath, 32, path.join(assetsDir, "tray-default.png"));
  await writeResizedPng(masterLogoPath, 32, path.join(assetsDir, "tray-connected.png"));
  await writeResizedPng(masterLogoPath, 32, path.join(assetsDir, "tray-disconnected.png"));
  await writeResizedPng(masterLogoPath, 32, path.join(assetsDir, "tray-error.png"));
  await writeInstallerSidebar(masterLogoPath, path.join(buildResourcesDir, "installerSidebar.png"));

  await removeIfExists(path.join(assetsDir, "egoist-logo.png"));
  await removeIfExists(path.join(assetsDir, "logo-original.png"));

  await fs.rm(tmpDir, { recursive: true, force: true });
  console.log("✅ Brand assets generated from the cropped master logo.");
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;

if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
