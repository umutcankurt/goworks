/**
 * GoWorks logger — main process side.
 *
 * Goal: alongside console.* calls, write to a file + hybrid rotation
 * (boot cleanup + size-based + daily rollover). For production debugging,
 * `userData/logs/app-YYYY-MM-DD[-N].log` files are collected; the user can
 * export them from Settings for support.
 *
 * Rules:
 * - The logger NEVER throws (the logging path won't crash the app).
 * - If `app.getPath('userData')` is not available, it falls back to /tmp/goworks-logs
 *   (for test/early-init scenarios).
 * - Console output is preserved (once no-console: warn is enabled in Phase C2,
 *   a flat-config override will be added for this file).
 */
import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const RETENTION_DAYS = 7;

let logsDir: string | null = null;
let currentDate: string | null = null;
let currentFile: string | null = null;
let currentSeq = 0;
let cleanupRan = false;
let cachedLevel: LogLevel | null = null;

function readLevelOnce(): LogLevel {
    if (cachedLevel) return cachedLevel;
    const env = process.env.GOWORKS_LOG_LEVEL?.toLowerCase() as LogLevel | undefined;
    if (env && env in LEVELS) {
        cachedLevel = env;
    } else {
        cachedLevel = process.env.NODE_ENV === 'development' ? 'debug' : 'info';
    }
    return cachedLevel;
}

function ensureLogsDir(): string {
    if (logsDir) return logsDir;
    try {
        const userData = app.getPath('userData');
        logsDir = path.join(userData, 'logs');
    } catch {
        logsDir = '/tmp/goworks-logs';
    }
    try {
        fs.mkdirSync(logsDir, { recursive: true });
    } catch {
        /* ignore — write attempt will fail safely */
    }
    return logsDir;
}

function todayStr(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function cleanupOldLogs() {
    if (cleanupRan) return;
    cleanupRan = true;
    try {
        const dir = ensureLogsDir();
        const files = fs.readdirSync(dir);
        const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
        for (const f of files) {
            const m = f.match(/^app-(\d{4})-(\d{2})-(\d{2})(?:-\d+)?\.log$/);
            if (!m) continue;
            const fileDate = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`).getTime();
            if (fileDate < cutoff) {
                try {
                    fs.unlinkSync(path.join(dir, f));
                } catch {
                    /* ignore */
                }
            }
        }
    } catch {
        /* logger never throws */
    }
}

function selectFile(): string {
    const today = todayStr();
    const dir = ensureLogsDir();

    // Daily rollover: date changed → restart seq from 0
    if (currentDate !== today) {
        currentDate = today;
        currentSeq = 0;
        currentFile = path.join(dir, `app-${today}.log`);
    }

    // Size-based rotation: if the current file is over 10MB, increment seq
    if (currentFile && fs.existsSync(currentFile)) {
        try {
            const size = fs.statSync(currentFile).size;
            if (size >= MAX_FILE_SIZE_BYTES) {
                currentSeq++;
                currentFile = path.join(dir, `app-${today}-${currentSeq}.log`);
            }
        } catch {
            /* ignore */
        }
    }

    return currentFile!;
}

function formatArg(a: unknown): string {
    if (a instanceof Error) return a.stack || a.message;
    if (a === null) return 'null';
    if (a === undefined) return 'undefined';
    if (typeof a === 'object') {
        try {
            return JSON.stringify(a);
        } catch {
            return String(a);
        }
    }
    return String(a);
}

function write(level: LogLevel, args: unknown[]): void {
    if (LEVELS[level] < LEVELS[readLevelOnce()]) return;

    cleanupOldLogs();

    const ts = new Date().toISOString();
    const prefix = `[${ts}] [${level.toUpperCase()}]`;

    // Console output (for terminal and devtools)
    if (level === 'debug') console.debug(prefix, ...args);
    else if (level === 'info') console.info(prefix, ...args);
    else if (level === 'warn') console.warn(prefix, ...args);
    else console.error(prefix, ...args);

    // Write to file
    try {
        const formatted = args.map(formatArg).join(' ');
        const line = `${prefix} ${formatted}\n`;
        const file = selectFile();
        fs.appendFileSync(file, line, 'utf-8');
    } catch {
        /* logger never throws */
    }
}

export const logger = {
    debug: (...args: unknown[]) => write('debug', args),
    info: (...args: unknown[]) => write('info', args),
    warn: (...args: unknown[]) => write('warn', args),
    error: (...args: unknown[]) => write('error', args),
};

export function getLogger() {
    return logger;
}

/** Absolute path of the log folder for Settings or error reports. */
export function getLogsDir(): string {
    return ensureLogsDir();
}

/**
 * Delete ALL log files (factory reset / pre-disposal wipe). Removes every app-*.log
 * in the logs dir and resets the rotation state so the next write starts fresh.
 * Never throws — logging must never crash the app.
 */
export function clearAllLogs(): void {
    try {
        const dir = ensureLogsDir();
        for (const f of fs.readdirSync(dir)) {
            if (/^app-\d{4}-\d{2}-\d{2}(?:-\d+)?\.log$/.test(f)) {
                try { fs.unlinkSync(path.join(dir, f)); } catch { /* ignore */ }
            }
        }
    } catch {
        /* logger never throws */
    }
    currentFile = null;
    currentDate = null;
    currentSeq = 0;
}
