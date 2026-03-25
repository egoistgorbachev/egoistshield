import { describe, expect, it } from "vitest";
import { buildAppPathConfig, detectRuntimeEnvironment } from "../electron/app-paths";

describe("app-paths", () => {
  it("использует отдельный userData для test-окружения", () => {
    const environment = detectRuntimeEnvironment({
      isPackaged: false,
      nodeEnv: "test"
    });

    const config = buildAppPathConfig({
      defaultUserDataDir: "C:\\Users\\Tester\\AppData\\Roaming\\EgoistShield",
      environment,
      pid: 4242
    });

    expect(environment).toBe("test");
    expect(config.userDataDir).toBe("C:\\Users\\Tester\\AppData\\Roaming\\EgoistShield-test-4242");
    expect(config.sessionDataDir).toBe("C:\\Users\\Tester\\AppData\\Roaming\\EgoistShield-test-4242\\session");
    expect(config.logsDir).toBe("C:\\Users\\Tester\\AppData\\Roaming\\EgoistShield-test-4242\\logs");
  });

  it("использует стабильный dev userData для unpackaged app", () => {
    const environment = detectRuntimeEnvironment({
      isPackaged: false,
      nodeEnv: "development"
    });

    const config = buildAppPathConfig({
      defaultUserDataDir: "C:\\Users\\Tester\\AppData\\Roaming\\EgoistShield",
      environment,
      pid: 77
    });

    expect(environment).toBe("development");
    expect(config.userDataDir).toBe("C:\\Users\\Tester\\AppData\\Roaming\\EgoistShield-dev");
    expect(config.sessionDataDir).toBe("C:\\Users\\Tester\\AppData\\Roaming\\EgoistShield-dev\\session");
    expect(config.logsDir).toBe("C:\\Users\\Tester\\AppData\\Roaming\\EgoistShield-dev\\logs");
  });

  it("оставляет production path без суффиксов", () => {
    const environment = detectRuntimeEnvironment({
      isPackaged: true,
      nodeEnv: "production"
    });

    const config = buildAppPathConfig({
      defaultUserDataDir: "C:\\Users\\Tester\\AppData\\Roaming\\EgoistShield",
      environment,
      pid: 1
    });

    expect(environment).toBe("production");
    expect(config.userDataDir).toBe("C:\\Users\\Tester\\AppData\\Roaming\\EgoistShield");
    expect(config.sessionDataDir).toBeNull();
    expect(config.logsDir).toBe("C:\\Users\\Tester\\AppData\\Roaming\\EgoistShield\\logs");
  });
});
