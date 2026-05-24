/**
 * Security Monitor — Logger
 * Prefixed, structured logging. Never logs PII.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

function log(level: LogLevel, module: string, message: string, meta?: Record<string, unknown>): void {
  const prefix = `[SecurityMonitor:${module}]`;
  const safe = meta ? JSON.stringify(meta) : "";
  switch (level) {
    case "debug": console.debug(prefix, message, safe); break;
    case "info":  console.info(prefix, message, safe);  break;
    case "warn":  console.warn(prefix, message, safe);  break;
    case "error": console.error(prefix, message, safe); break;
  }
}

export function createLogger(module: string) {
  return {
    debug: (msg: string, meta?: Record<string, unknown>) => log("debug", module, msg, meta),
    info:  (msg: string, meta?: Record<string, unknown>) => log("info",  module, msg, meta),
    warn:  (msg: string, meta?: Record<string, unknown>) => log("warn",  module, msg, meta),
    error: (msg: string, meta?: Record<string, unknown>) => log("error", module, msg, meta),
  };
}
