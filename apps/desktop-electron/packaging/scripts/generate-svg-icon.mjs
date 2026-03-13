import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * EgoistShield Icon Generator v3 — Ultra HD, 1:1, NO padding
 * Shield fills 97% of the viewBox. True alpha transparency.
 */
const SIZES = [512, 1024];

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="shG" x1="256" y1="0" x2="256" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#2D1E0E"/>
      <stop offset="50%" stop-color="#1F140A"/>
      <stop offset="100%" stop-color="#120A04"/>
    </linearGradient>
    <linearGradient id="stG" x1="256" y1="0" x2="256" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#FDBA74"/>
      <stop offset="40%" stop-color="#F97316"/>
      <stop offset="100%" stop-color="#9A3412" stop-opacity="0.7"/>
    </linearGradient>
    <linearGradient id="blG" x1="256" y1="80" x2="256" y2="420" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#FEF3C7"/>
      <stop offset="20%" stop-color="#FDE68A"/>
      <stop offset="50%" stop-color="#FDBA74"/>
      <stop offset="75%" stop-color="#F97316"/>
      <stop offset="100%" stop-color="#EA580C"/>
    </linearGradient>
    <radialGradient id="innerShadow" cx="50%" cy="60%" r="50%">
      <stop offset="0%" stop-color="white" stop-opacity="0.04"/>
      <stop offset="100%" stop-color="black" stop-opacity="0.15"/>
    </radialGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="outerGlow" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur stdDeviation="3" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <path d="M256 6
           C256 6  310 6  380 40
           C450 74  462 98  462 98
           C462 98  504 190  496 280
           C488 370  256 506  256 506
           C256 506  24 370  16 280
           C8 190  50 98  50 98
           C50 98  62 74  132 40
           C202 6  256 6  256 6 Z"
        fill="url(#shG)"
        stroke="url(#stG)"
        stroke-width="7"
        stroke-linejoin="round"
        filter="url(#outerGlow)"/>

  <path d="M256 22
           C256 22  306 22  370 52
           C434 82  444 104  444 104
           C444 104  482 192  475 274
           C468 356  256 486  256 486
           C256 486  44 356  37 274
           C30 192  68 104  68 104
           C68 104  78 82  142 52
           C206 22  256 22  256 22 Z"
        fill="url(#innerShadow)"/>

  <path d="M256 28
           C256 28  304 28  366 56
           C428 84  438 104  438 104
           C438 104  448 140  448 180
           C310 200  200 170  130 130
           C74 100  76 100  76 100
           C76 100  86 80  148 54
           C210 28  256 28  256 28 Z"
        fill="white" fill-opacity="0.04"/>

  <g filter="url(#glow)">
    <path d="M290 80  L198 264  L260 264  L224 432  L330 228  L268 228 Z"
          fill="url(#blG)"/>
    <path d="M290 80  L244 178  L268 228  L330 228 Z"
          fill="white" fill-opacity="0.3"/>
  </g>

  <path d="M256 10
           C256 10  308 10  376 42
           C444 74  456 96  456 96"
        fill="none"
        stroke="white"
        stroke-opacity="0.08"
        stroke-width="2"
        stroke-linecap="round"/>
</svg>`;

async function main() {
  const rootDir = path.resolve();
  const assetsDir = path.join(rootDir, "renderer", "public", "assets");
  const outPath = path.join(rootDir, "..", "..", "..", "..", "new logo.png");

  for (const size of SIZES) {
    const buf = await sharp(Buffer.from(SVG))
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toBuffer();

    if (size === 1024) {
      await fs.writeFile(path.join(assetsDir, "shield-logo.png"), buf);
      await fs.writeFile(path.join(assetsDir, "egoist-logo.png"), buf);
      console.log(`✅ Saved ${size}px Ultra HD PNG → assets/`);
    }
    if (size === 512) {
      await fs.writeFile(outPath, buf);
      console.log(`✅ Saved ${size}px PNG → ${outPath}`);
    }
  }

  console.log("\\n✅ Icon generation complete (1:1, no padding, true alpha)");
  console.log("Now run: node packaging/scripts/generate-icons.mjs");
}

main().catch(console.error);
