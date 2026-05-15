/**
 * GoWorks logger — main process tarafı.
 *
 * Hedef: console.* çağrılarının yanına dosyaya yazma + hibrit rotation
 * (boot cleanup + size-based + daily rollover). Production debug için
 * `userData/logs/app-YYYY-MM-DD[-N].log` dosyaları toplanır; kullanıcı
 * destek için Settings'ten dışa aktarabilir.
 *
 * Kurallar:
 * - Logger ASLA throw etmez (loglama akışı uygulamayı çökertmez).
 * - `app.getPath('userData')` mevcut değilse /tmp/goworks-logs'a düşer
 *   (test/erken-init senaryoları için).
 * - Console çıktısı korunur (Faz C2'de no-console: warn açılınca
 *   bu dosya için eslintrc override'ı eklenecek).
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

    // Daily rollover: tarih değişti → seq 0'dan başla
    if (currentDate !== today) {
        currentDate = today;
        currentSeq = 0;
        currentFile = path.join(dir, `app-${today}.log`);
    }

    // Size-based rotation: mevcut dosya 10MB üstündeyse seq artır
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

    // Console çıktısı (terminal ve devtools için)
    if (level === 'debug') console.debug(prefix, ...args);
    else if (level === 'info') console.info(prefix, ...args);
    else if (level === 'warn') console.warn(prefix, ...args);
    else console.error(prefix, ...args);

    // Dosyaya yazma
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

/** Settings veya hata raporu için log klasörünün mutlak yolu. */
export function getLogsDir(): string {
    return ensureLogsDir();
}
