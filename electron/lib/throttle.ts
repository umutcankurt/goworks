/**
 * Throttle helper — limits how often a function can be called.
 *
 * Trailing semantics: the last call within the interval is retained and emitted
 * when the interval elapses. This is correct for the "make sure the final state
 * of the progress event reaches the user" pattern — the last emit is never lost.
 *
 * Used to reduce IPC progress event spam
 * (`admin:bulkProgress`, `jobs:progress`).
 */
type AnyFn = (...args: never[]) => void;

export interface Throttled<T extends AnyFn> {
    (...args: Parameters<T>): void;
    /** Immediately fires the pending trailing call, if any. */
    flush: () => void;
    /** Cancels the pending trailing call. */
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
