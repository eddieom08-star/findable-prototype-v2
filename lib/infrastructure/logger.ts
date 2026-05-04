import type { AppConfig } from "./config";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LogFields {
  readonly request_id?: string;
  readonly [key: string]: unknown;
}

export interface Logger {
  readonly debug: (msg: string, fields?: LogFields) => void;
  readonly info: (msg: string, fields?: LogFields) => void;
  readonly warn: (msg: string, fields?: LogFields) => void;
  readonly error: (msg: string, fields?: LogFields) => void;
  readonly child: (bindings: LogFields) => Logger;
}

const PHONE_FIELDS = new Set(["phone", "formatted_phone", "phone_number"]);
const REDACT_PLACEHOLDER = "[redacted]";

const scrub = (fields: LogFields | undefined): LogFields | undefined => {
  if (fields === undefined) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (PHONE_FIELDS.has(key) && typeof value === "string") {
      out[key] = value.length >= 4 ? `***${value.slice(-4)}` : REDACT_PLACEHOLDER;
    } else {
      out[key] = value;
    }
  }
  return out;
};

const emit = (
  level: LogLevel,
  minLevel: LogLevel,
  bindings: LogFields,
  msg: string,
  fields?: LogFields,
): void => {
  if (LEVEL_RANK[level] < LEVEL_RANK[minLevel]) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...bindings,
    ...scrub(fields),
  });
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  sink(line);
};

const make = (minLevel: LogLevel, bindings: LogFields): Logger => ({
  debug: (msg, fields) => emit("debug", minLevel, bindings, msg, fields),
  info: (msg, fields) => emit("info", minLevel, bindings, msg, fields),
  warn: (msg, fields) => emit("warn", minLevel, bindings, msg, fields),
  error: (msg, fields) => emit("error", minLevel, bindings, msg, fields),
  child: (extra) => make(minLevel, { ...bindings, ...extra }),
});

export const createLogger = (config: Pick<AppConfig, "LOG_LEVEL">): Logger =>
  make(config.LOG_LEVEL, {});
