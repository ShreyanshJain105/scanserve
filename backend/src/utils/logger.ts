type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

class Logger {
  private static instance: Logger;
  private readonly minLevel: number;
  private readonly useColor: boolean;
  private readonly format: "json" | "pretty";

  private constructor() {
    const envLevel = (process.env.LOG_LEVEL || "info").toLowerCase() as LogLevel;
    this.minLevel = LOG_LEVELS[envLevel] ?? LOG_LEVELS.info;
    const colorFlag = process.env.LOG_COLOR;
    this.useColor = colorFlag !== "false";
    const formatFlag = (process.env.LOG_FORMAT || "json").toLowerCase();
    this.format = formatFlag === "pretty" ? "pretty" : "json";
  }

  static getInstance() {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  debug(message: string, context: LogContext = {}) {
    this.write("debug", message, context);
  }

  info(message: string, context: LogContext = {}) {
    this.write("info", message, context);
  }

  warn(message: string, context: LogContext = {}) {
    this.write("warn", message, context);
  }

  error(message: string, context: LogContext = {}) {
    this.write("error", message, context);
  }

  private write(level: LogLevel, message: string, context: LogContext) {
    if (LOG_LEVELS[level] < this.minLevel) return;

    const payload = {
      ts: new Date().toISOString(),
      level,
      msg: message,
      ...this.normalizeContext(context),
    };

    const line = this.format === "pretty" ? this.prettyFormat(payload) : JSON.stringify(payload);
    const output = this.useColor ? this.colorize(level, line) : line;
    if (level === "error") {
      console.error(output);
      return;
    }
    if (level === "warn") {
      console.warn(output);
      return;
    }
    console.log(output);
  }

  private normalizeContext(context: LogContext): LogContext {
    const normalized: LogContext = {};
    for (const [key, value] of Object.entries(context)) {
      if (value instanceof Error) {
        normalized[key] = {
          message: value.message,
          stack: value.stack,
          name: value.name,
        };
        continue;
      }
      normalized[key] = value;
    }
    return normalized;
  }

  private prettyFormat(payload: Record<string, unknown>) {
    const { ts, level, msg, ...rest } = payload as {
      ts: string;
      level: string;
      msg: string;
    };
    const parts: string[] = [`[${ts}]`, level.toUpperCase(), msg];
    const entries = Object.entries(rest)
      .filter(([, value]) => value !== undefined && value !== null)
      .sort(([a], [b]) => a.localeCompare(b));
    for (const [key, value] of entries) {
      parts.push(`${key}=${this.stringifyValue(value)}`);
    }
    return parts.join(" ");
  }

  private stringifyValue(value: unknown) {
    if (typeof value === "string") {
      return /\s/.test(value) ? JSON.stringify(value) : value;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return JSON.stringify(value);
  }

  private colorize(level: LogLevel, line: string) {
    const colors: Record<LogLevel, string> = {
      debug: "\u001b[90m",
      info: "\u001b[36m",
      warn: "\u001b[33m",
      error: "\u001b[31m",
    };
    const reset = "\u001b[0m";
    return `${colors[level]}${line}${reset}`;
  }
}

export const logger = Logger.getInstance();
