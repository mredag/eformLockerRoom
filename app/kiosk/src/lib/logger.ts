type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogPayload {
  event: string;
  level: LogLevel;
  timestamp: string;
  [key: string]: any;
}

function formatPayload(payload: LogPayload): string {
  return JSON.stringify(payload, (_key, value) => {
    if (value instanceof Error) {
      return { message: value.message, stack: value.stack };
    }
    return value;
  });
}

class KioskLogger {
  private log(level: LogLevel, event: string, data: Record<string, unknown>): void {
    const payload: LogPayload = {
      event,
      level,
      timestamp: new Date().toISOString(),
      ...data
    };

    if (level === 'error') {
      console.error(formatPayload(payload));
    } else if (level === 'warn') {
      console.warn(formatPayload(payload));
    } else if (level === 'debug') {
      console.debug(formatPayload(payload));
    } else {
      console.log(formatPayload(payload));
    }
  }

  info(event: string, data: Record<string, unknown> = {}): void {
    this.log('info', event, data);
  }

  warn(event: string, data: Record<string, unknown> = {}): void {
    this.log('warn', event, data);
  }

  error(event: string, data: Record<string, unknown> = {}): void {
    this.log('error', event, data);
  }

  debug(event: string, data: Record<string, unknown> = {}): void {
    this.log('debug', event, data);
  }
}

export const kioskLogger = new KioskLogger();
