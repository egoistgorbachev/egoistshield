/**
 * Logger — centralized structured logging via electron-log.
 *
 * Уровни: error, warn, info, debug.
 * Запись в файл (ротация) + DevTools console.
 * Путь к логам задаётся main process через configureLoggerPaths().
 */
import path from "node:path";
import log from "electron-log";
import type { RuntimeLogSummary } from "./contracts";

// Настройка формата
log.transports.file.format = "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}";
log.transports.console.format = "[{h}:{i}:{s}] [{level}] {text}";

// Ротация: максимум 5MB на файл
log.transports.file.maxSize = 5 * 1024 * 1024;

// Уровень логирования
log.transports.file.level = "info";
log.transports.console.level = "debug";

export function configureLoggerPaths(logsDir: string): void {
  log.transports.file.resolvePathFn = () => path.join(logsDir, "main.log");
}

export const RUNTIME_EVENT_PREFIX = "[runtime-event]";

export function formatRuntimeLogEvent(entry: RuntimeLogSummary): string {
  return `${RUNTIME_EVENT_PREFIX} ${JSON.stringify(entry)}`;
}

export const logger = {
  error: (...args: unknown[]) => log.error(...args),
  warn: (...args: unknown[]) => log.warn(...args),
  info: (...args: unknown[]) => log.info(...args),
  debug: (...args: unknown[]) => log.debug(...args)
};

export default logger;
