import path from "node:path";

export type RuntimeEnvironment = "production" | "development" | "test";

interface RuntimeEnvironmentInput {
  isPackaged: boolean;
  nodeEnv: string | undefined;
}

interface AppPathConfigInput {
  defaultUserDataDir: string;
  environment: RuntimeEnvironment;
  pid: number;
}

export interface AppPathConfig {
  environment: RuntimeEnvironment;
  userDataDir: string;
  sessionDataDir: string | null;
  logsDir: string;
}

export function detectRuntimeEnvironment({ isPackaged, nodeEnv }: RuntimeEnvironmentInput): RuntimeEnvironment {
  if (nodeEnv === "test") {
    return "test";
  }

  if (!isPackaged) {
    return "development";
  }

  return "production";
}

export function buildAppPathConfig({ defaultUserDataDir, environment, pid }: AppPathConfigInput): AppPathConfig {
  const userDataDir =
    environment === "test"
      ? `${defaultUserDataDir}-test-${pid}`
      : environment === "development"
        ? `${defaultUserDataDir}-dev`
        : defaultUserDataDir;

  return {
    environment,
    userDataDir,
    sessionDataDir: environment === "production" ? null : path.join(userDataDir, "session"),
    logsDir: path.join(userDataDir, "logs")
  };
}
