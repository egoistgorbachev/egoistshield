import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const activeInstallerScriptPath = path.join(projectRoot, "packaging", "nsis", "installer.nsh");
const electronBuilderConfigPath = path.join(projectRoot, "electron-builder.yml");

describe("active NSIS installer script", () => {
  it("electron-builder points to the active NSIS include file", () => {
    const config = readFileSync(electronBuilderConfigPath, "utf8");

    expect(config).toContain("include: packaging/nsis/installer.nsh");
  });

  it("stops Zapret processes and preserves user profile during uninstall", () => {
    const script = readFileSync(activeInstallerScriptPath, "utf8");

    expect(script).toContain("taskkill /F /IM winws.exe /T");
    expect(script).toContain("sc stop EgoistShieldZapret");
    expect(script).toContain("sc delete EgoistShieldZapret");
    expect(script).toContain("sc stop WinDivert");
    expect(script).toContain("sc delete WinDivert14");
    expect(script).not.toContain('RMDir /r "$APPDATA\\EgoistShield"');
    expect(script).not.toContain('RMDir /r "$LOCALAPPDATA\\EgoistShield"');
  });

  it("keeps deleteAppDataOnUninstall disabled in electron-builder", () => {
    const config = readFileSync(electronBuilderConfigPath, "utf8");

    expect(config).toContain("deleteAppDataOnUninstall: false");
  });

  it("removes auto-start registry entry during uninstall cleanup", () => {
    const script = readFileSync(activeInstallerScriptPath, "utf8");

    expect(script).toContain('DeleteRegValue HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Run" "EgoistShield"');
  });

  it("does not schedule install directory deletion during app updates", () => {
    const script = readFileSync(activeInstallerScriptPath, "utf8");

    expect(script).toContain("${ifNot} ${isUpdated}");
    expect(script).toContain('Exec \'"$SYSDIR\\cmd.exe" /C cd /d "$TEMP" & ping 127.0.0.1 -n 5 >NUL & rmdir /S /Q "$INSTDIR"\'');
    expect(script).toContain('RMDir /r /REBOOTOK "$INSTDIR"');
  });
});
