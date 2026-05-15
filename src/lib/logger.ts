/**
 * GoWorks renderer logger.
 *
 * Console'a yazar (DevTools'ta görünür) + IPC üzerinden main process'e
 * iletir. Main tarafı dosyaya yazar ve hibrit rotation uygular
 * (`electron/services/logger.ts`).
 *
 * IPC iletimi yan etkisiz — IPC kanalı yoksa sessizce yutulur (test
 * ortamı, henüz preload yüklenmemiş erken aşama vb.).
 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface SerializedError {
    __error: true;
    name: string;
    message: string;
    stack?: string;
}

function serialize(arg: unknown): unknown {
    if (arg instanceof Error) {
        const out: SerializedError = {
            __error: true,
            name: arg.name,
            message: arg.message,
            stack: arg.stack,
        };
        return out;
    }
    return arg;
}

function send(level: LogLevel, args: unknown[]): void {
    try {
        const ipc = (globalThis as { ipcRenderer?: { send: (channel: string, payload: unknown) => void } })
            .ipcRenderer;
        ipc?.send('log:write', { level, args: args.map(serialize) });
    } catch {
        /* logger never throws */
    }
}

export const logger = {
    debug: (...args: unknown[]) => {
        console.debug(...args);
        send('debug', args);
    },
    info: (...args: unknown[]) => {
        console.info(...args);
        send('info', args);
    },
    warn: (...args: unknown[]) => {
        console.warn(...args);
        send('warn', args);
    },
    error: (...args: unknown[]) => {
        console.error(...args);
        send('error', args);
    },
};
