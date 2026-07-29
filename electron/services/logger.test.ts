import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The suite asserts on what reaches the FILE, so node:fs is mocked — note the
// `node:` prefix. auth-service.test.ts mocks bare 'fs', which logger.ts does not
// import, which is why that suite writes real files into the test userData dir.
vi.mock('node:fs', () => ({
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    existsSync: vi.fn(() => false),
    statSync: vi.fn(() => ({ size: 0 })),
    appendFileSync: vi.fn(),
    unlinkSync: vi.fn(),
}));

vi.mock('electron', () => ({
    app: { getPath: vi.fn(() => '/tmp/goworks-logger-test') },
}));

import * as fs from 'node:fs';
import { logger } from './logger';

const appendFileSync = vi.mocked(fs.appendFileSync);

/** The single record handed to fs.appendFileSync by the most recent log call. */
function lastWrittenRecord(): string {
    const calls = appendFileSync.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    return String(calls[calls.length - 1][1]);
}

beforeEach(() => {
    appendFileSync.mockClear();
    // Console output is a separate stream, asserted on explicitly further down;
    // silence it here so the suite output stays readable.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('logger — record integrity', () => {
    it('writes an ordinary message through untouched', () => {
        logger.info('[boot] started');

        const record = lastWrittenRecord();
        expect(record).toContain('[INFO] [boot] started');
        expect(record.endsWith('\n')).toBe(true);
    });

    it('escapes newlines so one call produces exactly one line', () => {
        logger.warn('first\nsecond\r\nthird');

        const record = lastWrittenRecord();
        // Only the record terminator survives as a real newline.
        expect(record.match(/\n/g)).toHaveLength(1);
        expect(record).toContain('first\\nsecond\\r\\nthird');
    });

    // The reason this module was hardened: raw CSV cells and OAuth callback query
    // parameters reach the log, and a newline in one of them used to mint a second
    // record indistinguishable from something the app wrote itself.
    it('cannot be used to forge a second log record', () => {
        logger.warn('boom\n[2026-01-01T00:00:00.000Z] [ERROR] deletion approved by admin');

        const record = lastWrittenRecord();
        const lines = record.split('\n').filter(Boolean);
        expect(lines).toHaveLength(1);
        expect(lines[0]).toMatch(/^\[[^\]]+\] \[WARN\] /);
        // The forged prefix is still readable, just demoted to inert text.
        expect(record).toContain('\\n[2026-01-01T00:00:00.000Z] [ERROR] deletion approved');
    });

    it('escapes ANSI escape sequences and other control characters', () => {
        logger.warn('\x1b[31mred\x1b[0m\x07\x7f');

        const record = lastWrittenRecord();
        expect(record).toContain('\\x1b[31mred\\x1b[0m\\x07\\x7f');
        // No raw control byte survives into the file, terminator aside.
        // eslint-disable-next-line no-control-regex -- asserting they are gone is the point
        expect(record.replace(/\n$/, '')).not.toMatch(/[\u0000-\u001F\u007F]/);
    });

    it('flattens a multi-line Error stack into a single record', () => {
        const error = new Error('kaboom');
        error.stack = 'Error: kaboom\n    at one (a.ts:1:1)\n    at two (b.ts:2:2)';

        logger.error('[jobs] failed', error);

        const record = lastWrittenRecord();
        expect(record.match(/\n/g)).toHaveLength(1);
        expect(record).toContain('Error: kaboom\\n    at one (a.ts:1:1)');
    });

    it('truncates an oversized argument and says how much it dropped', () => {
        logger.info('x'.repeat(10_000));

        const record = lastWrittenRecord();
        expect(record).toContain('[1808 chars truncated]');
        expect(record.length).toBeLessThan(10_000);
    });

    it('leaves separate arguments separated', () => {
        logger.info('[a]', 'b', 42);

        expect(lastWrittenRecord()).toContain('[INFO] [a] b 42');
    });
});

describe('logger — behaviour left unchanged', () => {
    it('still passes raw, unsanitized args to the console', () => {
        const consoleWarn = vi.mocked(console.warn);

        logger.warn('line\nbreak');

        expect(consoleWarn).toHaveBeenCalledTimes(1);
        // Deliberate: the console keeps multi-line stack traces readable. Only the
        // persisted file needs the one-record-per-line invariant.
        expect(consoleWarn.mock.calls[0][1]).toBe('line\nbreak');
    });

    it('drops debug records below the active level', () => {
        logger.debug('should not be written');

        expect(appendFileSync).not.toHaveBeenCalled();
    });
});
