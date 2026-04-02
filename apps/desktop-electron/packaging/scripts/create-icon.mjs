import path from "node:path";
import sharp from "sharp";
import { getMasterLogoPath } from "./generate-icons.mjs";

async function main() {
  const rootDir = path.resolve();
  const targetPath = path.join(rootDir, "..", "..", "..", "..", "new logo.png");
  const masterLogoPath = getMasterLogoPath();

  console.log("Rendering master logo to 1024x1024 PNG...");

  await sharp(masterLogoPath)
    .resize(1024, 1024, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ quality: 100, compressionLevel: 9, palette: false })
    .toFile(targetPath);

  console.log(`✅ Saved master EgoistShield logo to: ${targetPath}`);
}

main().catch(console.error);
