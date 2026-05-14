type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function format(level: LogLevel, args: unknown[]): unknown[] {
    const ts = new Date().toISOString();
    return [`[${ts}] [${level.toUpperCase()}]`, ...args];
}

export const logger = {
    debug: (...args: unknown[]) => console.debug(...format('debug', args)),
    info: (...args: unknown[]) => console.info(...format('info', args)),
    warn: (...args: unknown[]) => console.warn(...format('warn', args)),
    error: (...args: unknown[]) => console.error(...format('error', args)),
};

export function getLogger() {
    return logger;
}
