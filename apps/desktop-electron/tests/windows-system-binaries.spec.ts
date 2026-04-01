import { describe, expect, it } from "vitest";
import { resolveWindowsExecutable, resolveWindowsSystemRoot } from "../electron/ipc/windows-system-binaries";

describe("windows system binaries", () => {
  it("строит абсолютный путь к powershell.exe через SYSTEMROOT", () => {
    const resolved = resolveWindowsExecutable("powershell.exe", {
      platform: "win32",
      env: { SYSTEMROOT: "D:\\Windows" }
    });

    expect(resolved).toBe("D:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
  });

  it("использует SystemRoot если SYSTEMROOT не задан", () => {
    const resolved = resolveWindowsExecutable("taskkill", {
      platform: "win32",
      env: { SystemRoot: "C:\\Windows" }
    });

    expect(resolved).toBe("C:\\Windows\\System32\\taskkill.exe");
  });

  it("возвращает исходную команду вне Windows", () => {
    expect(resolveWindowsExecutable("powershell.exe", { platform: "linux" })).toBe("powershell.exe");
  });

  it("не переписывает уже абсолютные пути", () => {
    const absolutePath = "C:\\Custom\\Tools\\powershell.exe";
    expect(resolveWindowsExecutable(absolutePath, { platform: "win32" })).toBe(absolutePath);
  });

  it("имеет безопасный fallback для SystemRoot", () => {
    expect(resolveWindowsSystemRoot({})).toBe("C:\\Windows");
  });
});
