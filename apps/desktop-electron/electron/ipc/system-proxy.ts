/**
 * System Proxy — управление Windows системным прокси через реестр.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Уведомляет Windows о смене настроек прокси через WinInet API */
export function notifySystemProxyChanged(): void {
  if (process.platform !== "win32") return;

  const ps = `
    Add-Type -TypeDefinition @"
    using System;
    using System.Runtime.InteropServices;
    public class WinInet {
      [DllImport("wininet.dll", SetLastError=true)]
      public static extern bool InternetSetOption(IntPtr h, int o, IntPtr b, int l);
    }
"@
    [WinInet]::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0) | Out-Null
    [WinInet]::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0) | Out-Null
  `.replace(/\r?\n/g, " ");

  execFile(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", ps],
    {
      timeout: 3000,
      windowsHide: true
    },
    () => {
      /* fire-and-forget */
    }
  );
}

const REG_PATH = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";

/** Включить системный прокси на указанном порту */
export async function enableSystemProxy(port: number): Promise<void> {
  if (process.platform !== "win32") return;

  const proxyServer = `127.0.0.1:${port}`;
  const bypass = "<local>;127.*;10.*;192.168.*;172.16.*;172.17.*;172.18.*;172.19.*;localhost";

  await Promise.all([
    execFileAsync("reg.exe", ["add", REG_PATH, "/v", "ProxyEnable", "/t", "REG_DWORD", "/d", "1", "/f"]),
    execFileAsync("reg.exe", ["add", REG_PATH, "/v", "ProxyServer", "/t", "REG_SZ", "/d", proxyServer, "/f"]),
    execFileAsync("reg.exe", ["add", REG_PATH, "/v", "ProxyOverride", "/t", "REG_SZ", "/d", bypass, "/f"])
  ]);
  notifySystemProxyChanged();
}

/** Отключить системный прокси */
export async function disableSystemProxy(): Promise<void> {
  if (process.platform !== "win32") return;

  await Promise.all([
    execFileAsync("reg.exe", ["add", REG_PATH, "/v", "ProxyEnable", "/t", "REG_DWORD", "/d", "0", "/f"]),
    execFileAsync("reg.exe", ["delete", REG_PATH, "/v", "ProxyServer", "/f"]).catch(() => {}),
    execFileAsync("reg.exe", ["delete", REG_PATH, "/v", "ProxyOverride", "/f"]).catch(() => {})
  ]);
  notifySystemProxyChanged();
}
