import type { ZapretProfile, ZapretStatus } from "../../../shared/types";

interface ZapretBootstrapApi {
  zapret?: {
    status(): Promise<ZapretStatus>;
    listProfiles(): Promise<ZapretProfile[]>;
  };
  app?: {
    isAdmin?(): Promise<boolean>;
  };
}

export interface ZapretBootstrapState {
  status: ZapretStatus | null;
  profiles: ZapretProfile[];
  isAdmin: boolean;
}

export async function loadZapretBootstrapState(
  api: ZapretBootstrapApi | null | undefined
): Promise<ZapretBootstrapState> {
  if (!api?.zapret) {
    return {
      status: null,
      profiles: [],
      isAdmin: false
    };
  }

  const adminPromise = api.app?.isAdmin?.() ?? Promise.resolve(false);
  const initialStatus = await api.zapret.status();

  if (!initialStatus.available) {
    return {
      status: initialStatus,
      profiles: [],
      isAdmin: await adminPromise
    };
  }

  const profiles = await api.zapret.listProfiles();
  const nextStatus = initialStatus.provisioned ? initialStatus : await api.zapret.status();

  return {
    status: nextStatus,
    profiles,
    isAdmin: await adminPromise
  };
}

export function buildZapretProfileOptions(
  profiles: ZapretProfile[],
  selectedProfile: string
): ZapretProfile[] {
  const trimmedSelectedProfile = selectedProfile.trim();
  if (!trimmedSelectedProfile) {
    return profiles;
  }

  if (profiles.some((profile) => profile.name === trimmedSelectedProfile)) {
    return profiles;
  }

  return [{ name: trimmedSelectedProfile, fileName: "__selected-profile__.bat" }, ...profiles];
}
