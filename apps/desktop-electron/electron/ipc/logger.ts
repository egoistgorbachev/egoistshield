/**
 * Logger — centralized structured logging via electron-log.
 *
 * Уровни: error, warn, info, debug.
 * Запись в файл (ротация) + DevTools console.
 * Файлы логов: %AppData%/EgoistShield/logs/
 */
import log from "electron-log";

// Настройка формата
log.transports.file.format = "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}";
log.transports.console.format = "[{h}:{i}:{s}] [{level}] {text}";

// Ротация: максимум 5MB на файл
log.transports.file.maxSize = 5 * 1024 * 1024;

// Уровень логирования
log.transports.file.level = "info";
log.transports.console.level = "debug";

export const logger = {
  error: (...args: unknown[]) => log.error(...args),
  warn: (...args: unknown[]) => log.warn(...args),
  info: (...args: unknown[]) => log.info(...args),
  debug: (...args: unknown[]) => log.debug(...args)
};

export default logger;
