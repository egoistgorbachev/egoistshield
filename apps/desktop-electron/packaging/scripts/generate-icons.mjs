import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const SVG_CONTENT = `
<svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" width="512" height="512">
    <defs>
        <linearGradient id="shieldFill" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#ff6600" stop-opacity="0.2" />
            <stop offset="50%" stop-color="#ff1a1a" stop-opacity="0.05" />
            <stop offset="100%" stop-color="#000000" stop-opacity="0.5" />
        </linearGradient>
        <linearGradient id="shieldEdge" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#ffea00" />
            <stop offset="50%" stop-color="#ff6600" />
            <stop offset="100%" stop-color="#ff1a1a" />
        </linearGradient>
        <linearGradient id="coreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#fff" />
            <stop offset="50%" stop-color="#ffea00" />
            <stop offset="100%" stop-color="#ff6600" />
        </linearGradient>
        <filter id="megaGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="8" result="blur1" />
            <feGaussianBlur stdDeviation="15" result="blur2" />
            <feMerge>
                <feMergeNode in="blur2" />
                <feMergeNode in="blur1" />
                <feMergeNode in="SourceGraphic" />
            </feMerge>
        </filter>
    </defs>
    <!-- Outer Rings -->
    <circle cx="100" cy="100" r="90" stroke="#ff6600" stroke-width="1.5" stroke-dasharray="4 12 20 12" fill="none" opacity="0.8" />
    <circle cx="100" cy="100" r="75" stroke="#ff1a1a" stroke-width="2.5" stroke-dasharray="50 40 10 40" fill="none" opacity="0.9" />
    
    <!-- Shield Geometry with glow -->
    <g filter="url(#megaGlow)">
        <path d="M100 20 L160 45 V100 C160 145 100 180 100 180 C100 180 40 145 40 100 V45 L100 20 Z" fill="url(#shieldFill)" stroke="url(#shieldEdge)" stroke-width="4" stroke-linejoin="round" />
        <path d="M100 40 L140 60 V100 C140 130 100 155 100 155 C100 155 60 130 60 100 V60 L100 40 Z" fill="none" stroke="#ff6600" stroke-width="2" stroke-dasharray="6 6" opacity="0.9" />
        <g stroke="#ff1a1a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M100 40 V155 M60 70 L90 70 L100 80 M140 70 L110 70 L100 80 M70 120 L85 120 L100 135 M130 120 L115 120 L100 135" />
            <circle cx="60" cy="70" r="3" fill="#ffea00" />
            <circle cx="140" cy="70" r="3" fill="#ffea00" />
            <circle cx="70" cy="120" r="3" fill="#ffea00" />
            <circle cx="130" cy="120" r="3" fill="#ffea00" />
        </g>
        <circle cx="100" cy="100" r="14" fill="url(#coreGrad)" />
        <circle cx="100" cy="100" r="6" fill="#ffffff" />
    </g>
</svg>
`;

async function main() {
    const rootDir = path.resolve();
    const tmpDir = path.join(rootDir, "packaging", "scripts", "tmp-icons");

    await fs.mkdir(tmpDir, { recursive: true });

    const svgPath = path.join(tmpDir, "logo.svg");
    await fs.writeFile(svgPath, SVG_CONTENT);

    console.log("Generating 256x256 PNG...");
    const pngPath = path.join(tmpDir, "logo.png");
    await sharp(svgPath)
        .resize(256, 256)
        .png()
        .toFile(pngPath);

    console.log("Generating ICO files...");
    const icoData = await pngToIco(pngPath);

    const destIcon1 = path.join(rootDir, "renderer", "public", "assets", "icon.ico");
    const destIcon2 = path.join(rootDir, "packaging", "installer", "assets", "installerHeaderIcon.ico");

    await fs.writeFile(destIcon1, icoData);
    await fs.writeFile(destIcon2, icoData);

    console.log("Icons updated successfully!");

    await fs.rm(tmpDir, { recursive: true, force: true });
}

main().catch(console.error);
