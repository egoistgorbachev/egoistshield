import path from "node:path";

interface ResolveWindowsExecutableOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
}

const WINDOWS_BINARY_SEGMENTS: Record<string, string[]> = {
  "cmd.exe": ["System32", "cmd.exe"],
  "ipconfig.exe": ["System32", "ipconfig.exe"],
  "net.exe": ["System32", "net.exe"],
  "netsh.exe": ["System32", "netsh.exe"],
  "powershell.exe": ["System32", "WindowsPowerShell", "v1.0", "powershell.exe"],
  "reg.exe": ["System32", "reg.exe"],
  "sc.exe": ["System32", "sc.exe"],
  "taskkill.exe": ["System32", "taskkill.exe"]
};

function normalizeBinaryLookup(command: string): string {
  const baseName = path.win32.basename(command).trim().toLowerCase();
  return baseName.endsWith(".exe") ? baseName : `${baseName}.exe`;
}

export function resolveWindowsSystemRoot(env: NodeJS.ProcessEnv = process.env): string {
  return env.SYSTEMROOT || env.SystemRoot || env.windir || "C:\\Windows";
}

export function resolveWindowsExecutable(
  command: string,
  options: ResolveWindowsExecutableOptions = {}
): string {
  const platform = options.platform ?? process.platform;
  if (platform !== "win32") {
    return command;
  }

  if (path.win32.isAbsolute(command) || command.includes("\\") || command.includes("/")) {
    return command;
  }

  const segments = WINDOWS_BINARY_SEGMENTS[normalizeBinaryLookup(command)];
  if (!segments) {
    return command;
  }

  return path.win32.join(resolveWindowsSystemRoot(options.env), ...segments);
}
