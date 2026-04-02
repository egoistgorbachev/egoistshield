import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { shell } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TelegramProxyConfig } from "../shared/types";

vi.mock("electron", () => ({
  shell: {
    openExternal: vi.fn(),
    showItemInFolder: vi.fn()
  }
}));

import {
  buildTelegramProxyLink,
  buildTelegramProxyWebLink,
  normalizeTelegramProxyConfig,
  normalizeTelegramProxySecret,
  TelegramProxyManager
} from "../electron/ipc/telegram-proxy-manager";

const FALLBACK_CONFIG: TelegramProxyConfig = {
  host: "127.0.0.1",
  port: 1443,
  secret: "0123456789abcdef0123456789abcdef",
  dcIp: ["2:149.154.167.220", "4:149.154.167.220"],
  verbose: false,
  bufKb: 256,
  poolSize: 4,
  logMaxMb: 5,
  checkUpdates: true
};

describe("telegram-proxy helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizeTelegramProxySecret срезает dd-префикс и генерирует hex fallback", () => {
    expect(normalizeTelegramProxySecret("ddabcdef")).toBe("abcdef");

    const generated = normalizeTelegramProxySecret("   ");
    expect(generated).toMatch(/^[a-f0-9]{32}$/i);
  });

  it("buildTelegramProxyLink собирает tg:// ссылку с dd-префиксом", () => {
    const url = buildTelegramProxyLink({
      host: "vpn.example.com",
      port: 1443,
      secret: "abcdef0123456789abcdef0123456789"
    });

    expect(url).toBe(
      "tg://proxy?server=vpn.example.com&port=1443&secret=ddabcdef0123456789abcdef0123456789"
    );
  });

  it("buildTelegramProxyWebLink собирает https://t.me fallback-ссылку", () => {
    const url = buildTelegramProxyWebLink({
      host: "vpn.example.com",
      port: 1443,
      secret: "abcdef0123456789abcdef0123456789"
    });

    expect(url).toBe(
      "https://t.me/proxy?server=vpn.example.com&port=1443&secret=ddabcdef0123456789abcdef0123456789"
    );
  });

  it("normalizeTelegramProxyConfig приводит raw config к совместимому виду", () => {
    const config = normalizeTelegramProxyConfig(
      {
        host: " 192.168.1.10 ",
        port: 0,
        secret: "ddfeedface",
        dc_ip: "2:149.154.167.220\r\n4:149.154.167.220\r\n",
        verbose: true,
        buf_kb: -50,
        pool_size: 8,
        log_max_mb: 10.5,
        check_updates: false
      },
      FALLBACK_CONFIG
    );

    expect(config).toEqual({
      host: "192.168.1.10",
      port: 1443,
      secret: "feedface",
      dcIp: ["2:149.154.167.220", "4:149.154.167.220"],
      verbose: true,
      bufKb: 256,
      poolSize: 8,
      logMaxMb: 10.5,
      checkUpdates: false
    });
  });

  it("normalizeTelegramProxyConfig берёт fallback при невалидном объекте", () => {
    expect(normalizeTelegramProxyConfig(null, FALLBACK_CONFIG)).toEqual(FALLBACK_CONFIG);
  });

  it("openConnectionLink переключается на web fallback, если tg:// протокол не зарегистрирован", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "egoist-tgproxy-"));
    const originalAppData = process.env.APPDATA;
    process.env.APPDATA = path.join(tempRoot, "AppData");

    try {
      const manager = new TelegramProxyManager(path.join(tempRoot, "resources"), path.join(tempRoot, "app"), path.join(tempRoot, "user"));
      await manager.saveConfig(FALLBACK_CONFIG);
      const openExternalMock = vi.mocked(shell.openExternal);
      openExternalMock.mockRejectedValueOnce(new Error("Protocol not found"));
      openExternalMock.mockResolvedValueOnce(undefined);

      const result = await manager.openConnectionLink();

      expect(openExternalMock).toHaveBeenNthCalledWith(
        1,
        "tg://proxy?server=127.0.0.1&port=1443&secret=dd0123456789abcdef0123456789abcdef"
      );
      expect(openExternalMock).toHaveBeenNthCalledWith(
        2,
        "https://t.me/proxy?server=127.0.0.1&port=1443&secret=dd0123456789abcdef0123456789abcdef"
      );
      expect(result.message).toContain("web-страницу Telegram");
      expect(result.opened).toBe(true);
    } finally {
      process.env.APPDATA = originalAppData;
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });
});
