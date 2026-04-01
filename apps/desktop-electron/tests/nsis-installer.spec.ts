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

  it("stops Zapret processes before AppData cleanup", () => {
    const script = readFileSync(activeInstallerScriptPath, "utf8");

    expect(script).toContain("taskkill /F /IM winws.exe /T");
    expect(script).toContain("sc stop EgoistShieldZapret");
    expect(script).toContain("sc delete EgoistShieldZapret");
    expect(script).toContain("sc stop WinDivert");
    expect(script).toContain("sc delete WinDivert14");
    expect(script).toContain('RMDir /r "$APPDATA\\EgoistShield\\zapret"');
  });

  it("removes auto-start registry entry during uninstall cleanup", () => {
    const script = readFileSync(activeInstallerScriptPath, "utf8");

    expect(script).toContain('DeleteRegValue HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Run" "EgoistShield"');
  });
});
