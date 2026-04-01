import { describe, expect, it, vi } from "vitest";
import {
  buildWindowsLoginItemSettings,
  syncWindowsLoginItemSettings
} from "../electron/ipc/login-item-settings";

describe("login-item-settings", () => {
  it("buildWindowsLoginItemSettings adds minimized flag only when requested", () => {
    expect(
      buildWindowsLoginItemSettings(
        {
          autoStart: true,
          startMinimized: true
        },
        "C:\\Program Files\\EgoistShield\\EgoistShield.exe"
      )
    ).toEqual({
      openAtLogin: true,
      path: "C:\\Program Files\\EgoistShield\\EgoistShield.exe",
      args: ["--minimized"]
    });

    expect(
      buildWindowsLoginItemSettings(
        {
          autoStart: false,
          startMinimized: false
        },
        "C:\\Program Files\\EgoistShield\\EgoistShield.exe"
      )
    ).toEqual({
      openAtLogin: false,
      path: "C:\\Program Files\\EgoistShield\\EgoistShield.exe",
      args: []
    });
  });

  it("syncWindowsLoginItemSettings updates Electron login items on Windows", () => {
    const setLoginItemSettings = vi.fn();

    const applied = syncWindowsLoginItemSettings({
      app: { setLoginItemSettings },
      platform: "win32",
      executablePath: "C:\\Program Files\\EgoistShield\\EgoistShield.exe",
      settings: {
        autoStart: true,
        startMinimized: true
      }
    });

    expect(applied).toBe(true);
    expect(setLoginItemSettings).toHaveBeenCalledOnce();
    expect(setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: true,
      path: "C:\\Program Files\\EgoistShield\\EgoistShield.exe",
      args: ["--minimized"]
    });
  });

  it("syncWindowsLoginItemSettings is a no-op outside Windows", () => {
    const setLoginItemSettings = vi.fn();

    const applied = syncWindowsLoginItemSettings({
      app: { setLoginItemSettings },
      platform: "linux",
      settings: {
        autoStart: true,
        startMinimized: false
      }
    });

    expect(applied).toBe(false);
    expect(setLoginItemSettings).not.toHaveBeenCalled();
  });
});
