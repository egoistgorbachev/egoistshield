import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import pngToIco from "png-to-ico";

async function main() {
    const rootDir = path.resolve();
    const srcLogoPath = path.join(rootDir, "..", "..", "..", "..", "new logo.png");
    const tmpDir = path.join(rootDir, "packaging", "scripts", "tmp-icons");
    const assetsDir = path.join(rootDir, "renderer", "public", "assets");
    const installerDir = path.join(rootDir, "packaging", "installer", "assets");

    await fs.mkdir(tmpDir, { recursive: true });

    try {
        await fs.access(srcLogoPath);
    } catch {
        console.error(`Source logo not found at: ${srcLogoPath}`);
        return;
    }

    const srcMeta = await sharp(srcLogoPath).metadata();
    console.log(`Source: ${srcMeta.width}x${srcMeta.height} ${srcMeta.format}`);

    // ─────────────────────────────────────────────────────────
    // Используем СТРОГО оригинал без обрезки/искажения.
    // contain = вписываем в квадрат, сохраняя пропорции.
    // Прозрачный фон заполняет оставшееся пространство.
    // ─────────────────────────────────────────────────────────

    // ─── 1. MULTI-SIZE ICO ───
    console.log("Generating multi-size ICO (original, no crop)...");
    const icoSizes = [16, 32, 48, 64, 128, 256];
    const icoPngs = await Promise.all(
        icoSizes.map(async (size) => {
            const p = path.join(tmpDir, `ico-${size}.png`);
            await sharp(srcLogoPath)
                .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .png({ quality: 100 })
                .toFile(p);
            return p;
        })
    );
    const icoData = await pngToIco(icoPngs);
    await fs.writeFile(path.join(assetsDir, "icon.ico"), icoData);
    await fs.writeFile(path.join(installerDir, "installerHeaderIcon.ico"), icoData);

    // ─── 2. HIGH-RES PNG (1024x1024) ───
    console.log("Generating 1024x1024 PNG...");
    const pngBuf1024 = await sharp(srcLogoPath)
        .resize(1024, 1024, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ quality: 100 })
        .toBuffer();
    await fs.writeFile(path.join(assetsDir, "shield-logo.png"), pngBuf1024);
    await fs.writeFile(path.join(assetsDir, "egoist-logo.png"), pngBuf1024);

    // Копируем оригинал как есть
    await fs.copyFile(srcLogoPath, path.join(assetsDir, "logo-original.png"));

    // ─── 3. FAVICON ICO ───
    console.log("Generating favicon.ico...");
    const favSizes = [16, 32, 48];
    const favPngs = await Promise.all(
        favSizes.map(async (size) => {
            const p = path.join(tmpDir, `fav-${size}.png`);
            await sharp(srcLogoPath)
                .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .png()
                .toFile(p);
            return p;
        })
    );
    const faviconIcoData = await pngToIco(favPngs);
    await fs.writeFile(path.join(assetsDir, "favicon.ico"), faviconIcoData);

    // ─── 4. TRAY ICONS (32x32) ───
    console.log("Generating tray icons (32x32)...");
    const trayBase = sharp(srcLogoPath).resize(32, 32, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } });

    await trayBase.clone().modulate({ brightness: 0.85 }).png().toFile(path.join(assetsDir, "tray-default.png"));
    await trayBase.clone().modulate({ brightness: 1.2, saturation: 1.3 }).png().toFile(path.join(assetsDir, "tray-connected.png"));
    await trayBase.clone().grayscale().modulate({ brightness: 0.55 }).png().toFile(path.join(assetsDir, "tray-disconnected.png"));
    await trayBase.clone().tint({ r: 255, g: 0, b: 0 }).modulate({ brightness: 0.75 }).png().toFile(path.join(assetsDir, "tray-error.png"));

    // ─── Cleanup ───
    await fs.rm(tmpDir, { recursive: true, force: true });
    console.log("✅ All icons generated (original proportions, no crop)!");
}

main().catch(console.error);
