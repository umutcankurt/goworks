import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { throttle } from './throttle';

describe('throttle', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('ilk çağrıyı hemen iletir', () => {
        const fn = vi.fn();
        const throttled = throttle(fn, 100);
        throttled('a');
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith('a');
    });

    it('aralık içinde gelen çağrıyı bekletir', () => {
        const fn = vi.fn();
        const throttled = throttle(fn, 100);
        throttled('a');
        throttled('b');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('aralık dolunca trailing çağrıyı emit eder', () => {
        const fn = vi.fn();
        const throttled = throttle(fn, 100);
        throttled('a');
        throttled('b');
        vi.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledTimes(2);
        expect(fn).toHaveBeenLastCalledWith('b');
    });

    it('birden fazla bekleyen çağrı varsa SADECE sonuncuyu iletir', () => {
        const fn = vi.fn();
        const throttled = throttle(fn, 100);
        throttled(1);
        throttled(2);
        throttled(3);
        throttled(4);
        vi.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledTimes(2); // first + last trailing
        expect(fn).toHaveBeenLastCalledWith(4);
    });

    it('aralık dolduktan sonra gelen çağrıyı yine hemen iletir', () => {
        const fn = vi.fn();
        const throttled = throttle(fn, 100);
        throttled('a');
        vi.advanceTimersByTime(150);
        throttled('b');
        expect(fn).toHaveBeenCalledTimes(2);
        expect(fn).toHaveBeenLastCalledWith('b');
    });

    it('flush(): bekleyen trailing çağrıyı hemen tetikler', () => {
        const fn = vi.fn();
        const throttled = throttle(fn, 100);
        throttled('a');
        throttled('b');
        throttled.flush();
        expect(fn).toHaveBeenCalledTimes(2);
        expect(fn).toHaveBeenLastCalledWith('b');
    });

    it('cancel(): bekleyen trailing çağrıyı iptal eder', () => {
        const fn = vi.fn();
        const throttled = throttle(fn, 100);
        throttled('a');
        throttled('b');
        throttled.cancel();
        vi.advanceTimersByTime(200);
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith('a');
    });

    it('flush bekleyen yoksa no-op', () => {
        const fn = vi.fn();
        const throttled = throttle(fn, 100);
        throttled('a');
        throttled.flush(); // no trailing call pending
        expect(fn).toHaveBeenCalledTimes(1);
    });
});
