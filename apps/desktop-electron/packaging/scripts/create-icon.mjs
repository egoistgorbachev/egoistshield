import path from "node:path";
import sharp from "sharp";

// Void Prism static rendering for icon (fallback to standard 2D transforms supported by sharp/librsvg)
const svgString = `
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Dark background for actual app icon context -->
    <linearGradient id="bgGlow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stopColor="#0f0f1a" />
      <stop offset="100%" stopColor="#030308" />
    </linearGradient>

    <linearGradient id="gL" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stopColor="#4F46E5" />
      <stop offset="100%" stopColor="#818CF8" />
    </linearGradient>

    <linearGradient id="gR" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stopColor="#C7D2FE" />
      <stop offset="100%" stopColor="#6366F1" />
    </linearGradient>

    <linearGradient id="gC" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stopColor="#818CF8" />
      <stop offset="50%" stopColor="#e0e7ff" />
      <stop offset="100%" stopColor="#ffffff" />
    </linearGradient>

    <linearGradient id="glass" x1="0%" y1="0%" x2="50%" y2="100%">
      <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
      <stop offset="40%" stopColor="#ffffff" stopOpacity="0.1" />
      <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
    </linearGradient>

    <filter id="glowHeavy" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation="10" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    <filter id="glowSoft" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="4" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>

  <rect width="200" height="200" rx="44" fill="url(#bgGlow)" />
  <rect width="200" height="200" rx="44" fill="none" stroke="#2a2a35" stroke-width="2" />

  <!-- Ambient glow behind shield -->
  <circle cx="100" cy="100" r="40" fill="url(#gR)" filter="url(#glowHeavy)" opacity="0.3" />

  <!-- Isometric Transform Simulation -->
  <g transform="translate(100, 100) scale(1, 0.8) rotate(-15) translate(-100, -100)">
    
    <!-- Outer orbitals -->
    <ellipse cx="100" cy="100" rx="75" ry="75" fill="none" stroke="url(#gR)" stroke-width="1.5" stroke-dasharray="2 12" opacity="0.6" />
    <ellipse cx="100" cy="100" rx="90" ry="90" fill="none" stroke="url(#gL)" stroke-width="0.5" opacity="0.3" />

    <!-- Left Shard -->
    <path d="M 40 70 L 100 30 L 120 40 L 60 85 V 155 L 40 145 Z" fill="url(#gL)" opacity="0.9" filter="drop-shadow(2px 4px 6px rgba(0,0,0,0.4))" />
    <path d="M 40 70 L 100 30 L 120 40 L 60 85 V 155 L 40 145 Z" fill="none" stroke="url(#glass)" stroke-width="1.5" opacity="0.7" />

    <!-- Right Shard -->
    <path d="M 160 130 L 100 170 L 80 160 L 140 115 V 45 L 160 55 Z" fill="url(#gR)" opacity="0.95" filter="drop-shadow(-4px 8px 10px rgba(0,0,0,0.6))" />
    <path d="M 160 130 L 100 170 L 80 160 L 140 115 V 45 L 160 55 Z" fill="none" stroke="url(#glass)" stroke-width="1.5" opacity="0.7" />

    <!-- Core -->
    <polygon points="100 70, 125 100, 100 130, 75 100" fill="url(#gC)" filter="url(#glowSoft)" />
    <polygon points="100 70, 125 100, 100 100, 75 100" fill="#ffffff" opacity="0.6" />
    
  </g>
</svg>
`;

async function main() {
  const rootDir = path.resolve();
  // generate-icons expects `new logo.png` here:
  const targetPath = path.join(rootDir, "..", "..", "..", "..", "new logo.png");

  console.log("Rendering SVG to 1024x1024 PNG...");

  const buffer = Buffer.from(svgString);
  await sharp(buffer).resize(1024, 1024).png({ quality: 100 }).toFile(targetPath);

  console.log(`✅ Saved new static Void Prism logo to: ${targetPath}`);
}

main().catch(console.error);
