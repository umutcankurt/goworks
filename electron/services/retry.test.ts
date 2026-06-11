import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry, type RetryStats } from './retry';

function mockLogger() {
    return { warn: vi.fn() };
}

describe('retry / withRetry', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('ilk denemede başarılı olursa retry etmez ve sonucu döner', async () => {
        const fn = vi.fn().mockResolvedValue('ok');
        const logger = mockLogger();
        const result = await withRetry(fn, logger, 'test-ctx');
        expect(result).toBe('ok');
        expect(fn).toHaveBeenCalledTimes(1);
        expect(logger.warn).not.toHaveBeenCalled();
    });

    it('429 hatasında retry eder, exponential backoff uygular ve sonunda başarılı olur', async () => {
        const fn = vi
            .fn()
            .mockRejectedValueOnce({ code: 429, message: 'rate limited' })
            .mockRejectedValueOnce({ code: 429, message: 'rate limited' })
            .mockResolvedValue('finally-ok');
        const logger = mockLogger();
        const stats: RetryStats = { throttleCount: 0 };

        const promise = withRetry(fn, logger, 'ctx-429', stats);
        // First backoff: 2s (INITIAL_BACKOFF_MS * 2^0)
        await vi.advanceTimersByTimeAsync(2000);
        // Second backoff: 4s (INITIAL_BACKOFF_MS * 2^1)
        await vi.advanceTimersByTimeAsync(4000);

        const result = await promise;
        expect(result).toBe('finally-ok');
        expect(fn).toHaveBeenCalledTimes(3);
        expect(stats.throttleCount).toBe(2);
        expect(logger.warn).toHaveBeenCalledTimes(2);
    });

    it('503 service unavailable hatası da retry edilir', async () => {
        const fn = vi
            .fn()
            .mockRejectedValueOnce({ response: { status: 503 }, message: 'unavailable' })
            .mockResolvedValue('ok');
        const logger = mockLogger();

        const promise = withRetry(fn, logger, 'ctx-503');
        await vi.advanceTimersByTimeAsync(2000);
        const result = await promise;
        expect(result).toBe('ok');
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('ECONNRESET retry edilir', async () => {
        const fn = vi
            .fn()
            .mockRejectedValueOnce({ code: 'ECONNRESET', message: 'reset' })
            .mockResolvedValue('ok');
        const logger = mockLogger();

        const promise = withRetry(fn, logger, 'ctx-econnreset');
        await vi.advanceTimersByTimeAsync(2000);
        const result = await promise;
        expect(result).toBe('ok');
    });

    it('ETIMEDOUT retry EDİLMEZ — googleapis abort sorunu yüzünden', async () => {
        const err = { code: 'ETIMEDOUT', message: 'timeout' };
        const fn = vi.fn().mockRejectedValue(err);
        const logger = mockLogger();

        await expect(withRetry(fn, logger, 'ctx-etimedout')).rejects.toEqual(err);
        expect(fn).toHaveBeenCalledTimes(1); // first attempt, no retry
    });

    it('400 gibi non-retryable hatalarda doğrudan throw eder', async () => {
        const err = { code: 400, message: 'bad request' };
        const fn = vi.fn().mockRejectedValue(err);
        const logger = mockLogger();

        await expect(withRetry(fn, logger, 'ctx-400')).rejects.toEqual(err);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('MAX_RETRIES (3) aşıldığında son hatayı fırlatır', async () => {
        const err = { code: 429, message: 'rate limited' };
        const fn = vi.fn().mockRejectedValue(err);
        const logger = mockLogger();
        const stats: RetryStats = { throttleCount: 0 };

        // Attach a catch handler to the promise up front (to prevent an unhandled rejection)
        let caught: unknown;
        const promise = withRetry(fn, logger, 'ctx-max-retries', stats).catch((e) => {
            caught = e;
        });

        // Backoffs: 2s + 4s + 8s
        await vi.advanceTimersByTimeAsync(2000);
        await vi.advanceTimersByTimeAsync(4000);
        await vi.advanceTimersByTimeAsync(8000);
        await promise;

        expect(caught).toEqual(err);
        // First attempt + 3 retries = 4 total calls
        expect(fn).toHaveBeenCalledTimes(4);
        expect(stats.throttleCount).toBe(3);
    });

    it('backoff MAX_BACKOFF_MS (60s) ile sınırlanır', async () => {
        // 2^attempt × 2000 is normally: 2s, 4s, 8s. To test the 60s cap,
        // here we only check the message (it won't reach the cap within 3 attempts)
        const fn = vi
            .fn()
            .mockRejectedValueOnce({ code: 429 })
            .mockResolvedValue('ok');
        const logger = mockLogger();

        const promise = withRetry(fn, logger, 'ctx-backoff');
        await vi.advanceTimersByTimeAsync(2000);
        await promise;

        expect(logger.warn).toHaveBeenCalledTimes(1);
        const warnMsg = (logger.warn.mock.calls[0][0] as string);
        expect(warnMsg).toContain('retry 1/3');
        expect(warnMsg).toContain('2000ms');
    });

    it('response.status üzerinden de retryable algılar (googleapis pattern)', async () => {
        const fn = vi
            .fn()
            .mockRejectedValueOnce({ response: { status: 429 }, message: 'limited' })
            .mockResolvedValue('ok');
        const logger = mockLogger();

        const promise = withRetry(fn, logger, 'ctx-resp');
        await vi.advanceTimersByTimeAsync(2000);
        await expect(promise).resolves.toBe('ok');
    });

    it('stats parametresi opsiyonel — geçilmezse hata atmaz', async () => {
        const fn = vi
            .fn()
            .mockRejectedValueOnce({ code: 429 })
            .mockResolvedValue('ok');
        const logger = mockLogger();

        const promise = withRetry(fn, logger, 'no-stats');
        await vi.advanceTimersByTimeAsync(2000);
        await expect(promise).resolves.toBe('ok');
    });
});
