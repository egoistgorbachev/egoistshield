/**
 * DNS & Proxy Cleanup — restores internet after VPN disconnection
 *
 * Actions:
 * 1. Disable system proxy (registry)
 * 2. Remove PAC script (AutoConfigURL)
 * 3. Flush DNS cache (ipconfig /flushdns)
 *
 * Winsock reset is intentionally excluded from regular disconnect/exit cleanup.
 * It is reserved for explicit repair flows because it is a heavyweight
 * system-wide operation.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import logger from "./logger";
import { resolveWindowsExecutable } from "./windows-system-binaries";

const execFileAsync = promisify(execFile);

/**
 * Full internet cleanup — called on disconnect and app exit
 */
export async function cleanupDnsAndProxy(): Promise<{ ok: boolean; message: string }> {
  const results: string[] = [];

  try {
    // 1. Disable proxy
    await execFileAsync(
      resolveWindowsExecutable("reg"),
      [
        "add",
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
        "/v",
        "ProxyEnable",
        "/t",
        "REG_DWORD",
        "/d",
        "0",
        "/f"
      ],
      { windowsHide: true, timeout: 5000 }
    );
    results.push("✅ Прокси отключён");
  } catch (e) {
    logger.warn("[cleanup] Failed to disable proxy:", e);
    results.push("⚠️ Прокси: не удалось отключить");
  }

  try {
    // 2. Remove PAC script
    await execFileAsync(
      resolveWindowsExecutable("reg"),
      ["delete", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings", "/v", "AutoConfigURL", "/f"],
      { windowsHide: true, timeout: 5000 }
    );
    results.push("✅ PAC-скрипт удалён");
  } catch {
    // AutoConfigURL may not exist — that's OK
    results.push("✅ PAC-скрипт не найден (ОК)");
  }

  try {
    // 3. Remove proxy server entry
    await execFileAsync(
      resolveWindowsExecutable("reg"),
      ["delete", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings", "/v", "ProxyServer", "/f"],
      { windowsHide: true, timeout: 5000 }
    );
    results.push("✅ ProxyServer удалён");
  } catch {
    results.push("✅ ProxyServer не найден (ОК)");
  }

  try {
    // 4. Flush DNS cache
    await execFileAsync(resolveWindowsExecutable("ipconfig"), ["/flushdns"], {
      windowsHide: true,
      timeout: 5000
    });
    results.push("✅ DNS-кэш очищен");
  } catch (e) {
    logger.warn("[cleanup] Failed to flush DNS:", e);
    results.push("⚠️ DNS: не удалось очистить кэш");
  }

  const message = results.join("\n");
  logger.info("[cleanup] completed:", message);
  return { ok: true, message };
}

/**
 * Kill all VPN runtime processes by name
 */
export async function killVpnProcesses(): Promise<void> {
  const processNames = ["xray.exe", "sing-box.exe"];

  for (const name of processNames) {
    try {
      await execFileAsync(resolveWindowsExecutable("taskkill"), ["/F", "/IM", name], {
        windowsHide: true,
        timeout: 5000
      });
      logger.info(`[cleanup] killed ${name}`);
    } catch {
      // Process may not be running
    }
  }
}

/**
 * Full cleanup: kill processes + reset DNS/proxy
 */
export async function fullCleanup(): Promise<{ ok: boolean; message: string }> {
  await killVpnProcesses();
  return cleanupDnsAndProxy();
}

export async function repairNetworkStack(): Promise<{ ok: boolean; message: string }> {
  const cleanupResult = await fullCleanup();
  const messages = [cleanupResult.message];

  try {
    await execFileAsync(resolveWindowsExecutable("netsh"), ["winsock", "reset"], {
      windowsHide: true,
      timeout: 8_000
    });
    messages.push("✅ Winsock каталог сброшен");
    return { ok: cleanupResult.ok, message: messages.join("\n") };
  } catch (error: unknown) {
    logger.warn("[cleanup] Failed to reset Winsock:", error);
    messages.push("⚠️ Winsock: не удалось сбросить каталог");
    return { ok: false, message: messages.join("\n") };
  }
}
