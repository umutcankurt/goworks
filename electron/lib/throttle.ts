/**
 * Throttle helper — bir fonksiyonun çağrılma sıklığını sınırlar.
 *
 * Trailing semantik: aralık içinde gelen son çağrı tutulur ve aralık
 * dolduğunda gönderilir. Bu, "progress event'inin son hâli kullanıcıda
 * göründüğünden emin olalım" pattern'i için doğru — son emit kaybolmaz.
 *
 * IPC progress event spam'ini azaltmak için kullanılır
 * (`admin:bulkProgress`, `jobs:progress`).
 */
type AnyFn = (...args: never[]) => void;

export interface Throttled<T extends AnyFn> {
    (...args: Parameters<T>): void;
    /** Bekleyen trailing çağrıyı (varsa) hemen tetikler. */
    flush: () => void;
    /** Bekleyen trailing çağrıyı iptal eder. */
    cancel: () => void;
}

export function throttle<T extends AnyFn>(fn: T, minIntervalMs: number): Throttled<T> {
    let lastCallTime = 0;
    let pending: Parameters<T> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const invoke = () => {
        if (!pending) return;
        const args = pending;
        pending = null;
        timer = null;
        lastCallTime = Date.now();
        fn(...args);
    };

    const throttled = ((...args: Parameters<T>) => {
        const now = Date.now();
        const elapsed = now - lastCallTime;

        if (elapsed >= minIntervalMs) {
            lastCallTime = now;
            pending = null;
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            fn(...args);
        } else {
            pending = args;
            if (!timer) {
                timer = setTimeout(invoke, minIntervalMs - elapsed);
            }
        }
    }) as Throttled<T>;

    throttled.flush = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        invoke();
    };

    throttled.cancel = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        pending = null;
    };

    return throttled;
}
