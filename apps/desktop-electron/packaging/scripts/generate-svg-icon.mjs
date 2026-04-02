import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { getMasterLogoPath } from "./generate-icons.mjs";

const SIZES = [512, 1024];

async function main() {
  const rootDir = path.resolve();
  const assetsDir = path.join(rootDir, "renderer", "public", "assets");
  const outPath = path.join(rootDir, "..", "..", "..", "..", "new logo.png");
  const masterLogoPath = getMasterLogoPath();

  for (const size of SIZES) {
    const buf = await sharp(masterLogoPath)
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ quality: 100, compressionLevel: 9, palette: false })
      .toBuffer();

    if (size === 1024) {
      await fs.writeFile(path.join(assetsDir, "shield-logo.png"), buf);
      await fs.writeFile(path.join(assetsDir, "egoist-logo.png"), buf);
      console.log(`✅ Saved ${size}px Ultra HD PNG → assets/`);
    }
    if (size === 512) {
      await sharp(buf).toFile(outPath);
      console.log(`✅ Saved ${size}px PNG → ${outPath}`);
    }
  }

  console.log("\\n✅ Unified PNG logo assets generated from master source.");
  console.log("Now run: node packaging/scripts/generate-icons.mjs");
}

main().catch(console.error);
