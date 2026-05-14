export interface RetryStats {
    throttleCount: number;
}

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 60000;

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryable(err: any): boolean {
    const status = err?.code || err?.response?.status || err?.status;
    // 429 (rate limit), 503 (service unavailable) — geçici API hataları retry edilebilir
    if (status === 429 || status === 503) return true;
    if (err?.code === 'ECONNRESET' || err?.code === 'ENOTFOUND') return true;
    // ETIMEDOUT retry EDİLMEZ — googleapis'ten düzgün abort alamıyoruz,
    // retry zinciri 120s Watchdog'a yol açıyor (3 × 30s = 90s + retry overhead)
    return false;
}

export async function withRetry<T>(
    fn: () => Promise<T>,
    logger: { warn: (...args: unknown[]) => void },
    context: string,
    stats?: RetryStats,
): Promise<T> {
    let lastError: any;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await fn();
        } catch (err: any) {
            lastError = err;
            if (isRetryable(err) && attempt < MAX_RETRIES) {
                if (stats) stats.throttleCount++;
                const backoff = Math.min(INITIAL_BACKOFF_MS * Math.pow(2, attempt), MAX_BACKOFF_MS);
                logger.warn(`Retryable error for ${context}: ${err.message}, retry ${attempt + 1}/${MAX_RETRIES} after ${backoff}ms`);
                await sleep(backoff);
            } else {
                throw err;
            }
        }
    }
    throw lastError;
}
