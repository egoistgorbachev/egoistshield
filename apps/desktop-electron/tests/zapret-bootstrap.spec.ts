import { describe, expect, it, vi } from "vitest";
import type { ZapretProfile, ZapretStatus } from "../shared/types";
import { buildZapretProfileOptions, loadZapretBootstrapState } from "../renderer/src/lib/zapret-bootstrap";

function createStatus(overrides: Partial<ZapretStatus> = {}): ZapretStatus {
  return {
    available: true,
    provisioned: true,
    workDir: "C:\\Users\\Test\\AppData\\Roaming\\EgoistShield\\zapret",
    serviceName: "EgoistShieldZapret",
    serviceInstalled: false,
    serviceRunning: false,
    serviceProfile: null,
    standaloneRunning: false,
    standalonePid: null,
    standaloneProfile: null,
    winwsRunning: false,
    drivers: [],
    gameFilterMode: "disabled",
    ipsetMode: "loaded",
    updateChecksEnabled: false,
    coreVersion: "1.0.0",
    currentProfile: null,
    lastError: null,
    ...overrides
  };
}

describe("loadZapretBootstrapState", () => {
  it("возвращает безопасный fallback без zapret API", async () => {
    await expect(loadZapretBootstrapState(undefined)).resolves.toEqual({
      status: null,
      profiles: [],
      isAdmin: false
    });
  });

  it("не тянет профили, если bundled runtime недоступен", async () => {
    const status = createStatus({ available: false, provisioned: false, coreVersion: null });
    const listProfiles = vi.fn<() => Promise<ZapretProfile[]>>();
    const api = {
      zapret: {
        status: vi.fn().mockResolvedValue(status),
        listProfiles
      },
      app: {
        isAdmin: vi.fn().mockResolvedValue(false)
      }
    };

    await expect(loadZapretBootstrapState(api)).resolves.toEqual({
      status,
      profiles: [],
      isAdmin: false
    });
    expect(listProfiles).not.toHaveBeenCalled();
  });

  it("перечитывает статус после первичного provision, чтобы экран не видел stale state", async () => {
    const initialStatus = createStatus({ provisioned: false, coreVersion: null });
    const refreshedStatus = createStatus({ provisioned: true, coreVersion: "2026.03.28" });
    const profiles: ZapretProfile[] = [{ name: "General", fileName: "general.bat" }];
    const api = {
      zapret: {
        status: vi.fn().mockResolvedValueOnce(initialStatus).mockResolvedValueOnce(refreshedStatus),
        listProfiles: vi.fn().mockResolvedValue(profiles)
      },
      app: {
        isAdmin: vi.fn().mockResolvedValue(true)
      }
    };

    await expect(loadZapretBootstrapState(api)).resolves.toEqual({
      status: refreshedStatus,
      profiles,
      isAdmin: true
    });
    expect(api.zapret.status).toHaveBeenCalledTimes(2);
    expect(api.zapret.listProfiles).toHaveBeenCalledTimes(1);
  });

  it("добавляет сохранённый профиль в options, если backend пока не вернул список", () => {
    expect(buildZapretProfileOptions([], "General")).toEqual([
      { name: "General", fileName: "__selected-profile__.bat" }
    ]);
  });

  it("не дублирует выбранный профиль, если он уже есть в списке", () => {
    const profiles: ZapretProfile[] = [{ name: "General", fileName: "general.bat" }];

    expect(buildZapretProfileOptions(profiles, "General")).toEqual(profiles);
  });
});
