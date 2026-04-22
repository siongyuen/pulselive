import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

/**
 * Simple structured logger that wraps console or writes to file.
 * Minimal dependency-free implementation.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

export interface LoggerOptions {
  level?: LogLevel;
  file?: string;
  name?: string;
}

export interface LogEntry {
  time: number;
  level: number;
  levelLabel: string;
  name?: string;
  msg: string;
  [key: string]: any;
}

export interface Logger {
  info(obj: Record<string, any>, msg: string): void;
  info(msg: string): void;
  warn(obj: Record<string, any>, msg: string): void;
  warn(msg: string): void;
  error(obj: Record<string, any>, msg: string): void;
  error(err: Error, msg: string): void;
  error(msg: string): void;
  debug(obj: Record<string, any>, msg: string): void;
  debug(msg: string): void;
  child(bindings: Record<string, any>): Logger;
}

class LoggerImpl implements Logger {
  private level: number;
  private file?: string;
  private name?: string;
  private bindings: Record<string, any>;

  constructor(options: LoggerOptions = {}, bindings: Record<string, any> = {}) {
    this.level = LEVELS[options.level || 'info'];
    this.file = options.file;
    this.name = options.name;
    this.bindings = bindings;

    if (this.file) {
      const dir = dirname(this.file);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
  }

  private log(levelLabel: LogLevel, objOrMsg: any, msg?: string): void {
    const level = LEVELS[levelLabel];
    if (level < this.level) return;

    let entry: LogEntry;

    if (objOrMsg instanceof Error) {
      entry = {
        time: Date.now(),
        level,
        levelLabel,
        name: this.name,
        msg: msg || objOrMsg.message,
        err: {
          message: objOrMsg.message,
          stack: objOrMsg.stack,
          type: objOrMsg.name
        },
        ...this.bindings
      };
    } else if (typeof objOrMsg === 'string') {
      entry = {
        time: Date.now(),
        level,
        levelLabel,
        name: this.name,
        msg: objOrMsg,
        ...this.bindings
      };
    } else {
      entry = {
        time: Date.now(),
        level,
        levelLabel,
        name: this.name,
        msg: msg || '',
        ...objOrMsg,
        ...this.bindings
      };
    }

    const line = JSON.stringify(entry) + '\n';

    if (this.file) {
      // Append to file (synchronous for simplicity)
      const { appendFileSync } = require('fs');
      appendFileSync(this.file, line);
    } else {
      // Console output
      const consoleMethod = levelLabel === 'error' ? console.error :
                           levelLabel === 'warn' ? console.warn :
                           levelLabel === 'debug' ? console.debug : console.log;
      consoleMethod(line.trim());
    }
  }

  info(obj: Record<string, any>, msg: string): void;
  info(msg: string): void;
  info(objOrMsg: any, msg?: string): void {
    this.log('info', objOrMsg, msg);
  }

  warn(obj: Record<string, any>, msg: string): void;
  warn(msg: string): void;
  warn(objOrMsg: any, msg?: string): void {
    this.log('warn', objOrMsg, msg);
  }

  error(obj: Record<string, any>, msg: string): void;
  error(err: Error, msg: string): void;
  error(msg: string): void;
  error(objOrMsg: any, msg?: string): void {
    this.log('error', objOrMsg, msg);
  }

  debug(obj: Record<string, any>, msg: string): void;
  debug(msg: string): void;
  debug(objOrMsg: any, msg?: string): void {
    this.log('debug', objOrMsg, msg);
  }

  child(bindings: Record<string, any>): Logger {
    return new LoggerImpl(
      { level: this.getLevelLabel(), file: this.file, name: this.name },
      { ...this.bindings, ...bindings }
    );
  }

  private getLevelLabel(): LogLevel {
    for (const [label, value] of Object.entries(LEVELS)) {
      if (value === this.level) return label as LogLevel;
    }
    return 'info';
  }
}

export function createLogger(options: LoggerOptions = {}): Logger {
  return new LoggerImpl(options);
}

// Global logger instance (lazy init)
let globalLogger: Logger | null = null;

export function getGlobalLogger(): Logger {
  if (!globalLogger) {
    globalLogger = createLogger({
      level: (process.env.PULSETEL_LOG_LEVEL as LogLevel) || 'info',
      file: process.env.PULSETEL_LOG_FILE
    });
  }
  return globalLogger;
}

export function setGlobalLogger(logger: Logger): void {
  globalLogger = logger;
}
