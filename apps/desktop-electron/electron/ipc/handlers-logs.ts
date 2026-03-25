/**
 * IPC Handlers — Logs
 *
 * Доступ к файлам логов приложения (electron-log).
 * - logs:get-recent  → последние N записей из лог-файла
 * - logs:get-path    → путь к файлу логов (для «Открыть в проводнике»)
 */
import fs from "node:fs";
import path from "node:path";
import { ipcMain, shell } from "electron";
import log from "electron-log";
import type { RuntimeLogSummary } from "./contracts";
import { RUNTIME_EVENT_PREFIX } from "./logger";

export interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
}

const LOG_LINE_RE = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+)\] \[(\w+)\] (.*)$/;

function parseLogLevel(rawLevel: string): LogEntry["level"] | null {
  const normalizedLevel = rawLevel.toLowerCase();

  switch (normalizedLevel) {
    case "info":
    case "warn":
    case "error":
    case "debug":
      return normalizedLevel;
    default:
      return null;
  }
}

function parseLogLine(line: string): LogEntry | null {
  const match = LOG_LINE_RE.exec(line);
  if (!match) return null;

  const timestamp = match.at(1);
  const rawLevel = match.at(2);
  const message = match.at(3);

  if (!timestamp || !rawLevel || message === undefined) {
    return null;
  }

  const level = parseLogLevel(rawLevel);
  if (!level) {
    return null;
  }

  return {
    timestamp,
    level,
    message
  };
}

function getLogFilePath(): string {
  return log.transports.file.getFile().path;
}

function parseRuntimeEventLine(line: string): RuntimeLogSummary | null {
  const markerIndex = line.indexOf(RUNTIME_EVENT_PREFIX);
  if (markerIndex < 0) {
    return null;
  }

  const rawPayload = line.slice(markerIndex + RUNTIME_EVENT_PREFIX.length).trim();
  try {
    const parsed = JSON.parse(rawPayload) as RuntimeLogSummary;
    if (!parsed.timestamp || !parsed.level || !parsed.lifecycle) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function readRecentLogs(maxLines = 500): LogEntry[] {
  try {
    const logPath = getLogFilePath();
    if (!fs.existsSync(logPath)) return [];

    const content = fs.readFileSync(logPath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim().length > 0);
    const recent = lines.slice(-maxLines);

    const entries: LogEntry[] = [];
    for (const line of recent) {
      const parsed = parseLogLine(line);
      if (parsed) {
        entries.push(parsed);
      } else if (entries.length > 0) {
        // Multi-line log: append to previous entry
        const lastEntry = entries.at(-1);
        if (lastEntry) {
          lastEntry.message += `\n${line}`;
        }
      }
    }

    return entries;
  } catch (err) {
    log.error("[logs] Ошибка чтения логов:", err);
    return [];
  }
}

function readRecentRuntimeEvents(maxLines = 200): RuntimeLogSummary[] {
  try {
    const logPath = getLogFilePath();
    if (!fs.existsSync(logPath)) return [];

    const content = fs.readFileSync(logPath, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim().length > 0);
    const events: RuntimeLogSummary[] = [];

    for (const line of lines) {
      const parsed = parseRuntimeEventLine(line);
      if (parsed) {
        events.push(parsed);
      }
    }

    return events.slice(-maxLines);
  } catch (err) {
    log.error("[logs] Ошибка чтения runtime events:", err);
    return [];
  }
}

export function registerLogHandlers(): void {
  ipcMain.handle("logs:get-recent", (_event, maxLines?: number) => {
    return readRecentLogs(maxLines ?? 500);
  });

  ipcMain.handle("logs:get-runtime-summary", (_event, maxLines?: number) => {
    return readRecentRuntimeEvents(maxLines ?? 200);
  });

  ipcMain.handle("logs:get-path", () => {
    return getLogFilePath();
  });

  ipcMain.handle("logs:open-folder", () => {
    const logPath = getLogFilePath();
    const folder = path.dirname(logPath);
    shell.openPath(folder);
    return true;
  });
}
