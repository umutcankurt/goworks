import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    generatePassword,
    PASSWORD_ALPHABET,
    DEFAULT_GENERATED_PASSWORD_LENGTH,
} from './generatePassword';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('PASSWORD_ALPHABET', () => {
    it('holds 63 distinct characters', () => {
        expect(PASSWORD_ALPHABET).toHaveLength(63);
        expect(new Set(PASSWORD_ALPHABET).size).toBe(63);
    });

    it('excludes the ambiguous glyphs I, l, O, 0 and 1', () => {
        for (const char of ['I', 'l', 'O', '0', '1']) {
            expect(PASSWORD_ALPHABET).not.toContain(char);
        }
    });

    it('covers all four character classes Google Workspace accepts', () => {
        expect(PASSWORD_ALPHABET).toMatch(/[a-z]/);
        expect(PASSWORD_ALPHABET).toMatch(/[A-Z]/);
        expect(PASSWORD_ALPHABET).toMatch(/[0-9]/);
        expect(PASSWORD_ALPHABET).toMatch(/[^A-Za-z0-9]/);
    });
});

describe('generatePassword', () => {
    it('defaults to 24 characters', () => {
        expect(generatePassword()).toHaveLength(DEFAULT_GENERATED_PASSWORD_LENGTH);
        expect(DEFAULT_GENERATED_PASSWORD_LENGTH).toBe(24);
    });

    it('honours a requested length, above and below the buffer size', () => {
        expect(generatePassword(1)).toHaveLength(1);
        expect(generatePassword(8)).toHaveLength(8);
        expect(generatePassword(200)).toHaveLength(200);
    });

    it('only emits characters from the alphabet', () => {
        for (const char of generatePassword(500)) {
            expect(PASSWORD_ALPHABET).toContain(char);
        }
    });

    it('accepts a custom alphabet', () => {
        expect(generatePassword(40, 'ab')).toMatch(/^[ab]{40}$/);
    });

    it('does not repeat itself across calls', () => {
        const passwords = new Set(Array.from({ length: 50 }, () => generatePassword()));
        expect(passwords.size).toBe(50);
    });

    // The regression this module exists for: CodeQL js/insecure-randomness on the
    // former Math.random() implementation in src/pages/Offboard.tsx.
    it('draws from crypto.getRandomValues and never from Math.random', () => {
        const mathRandom = vi.spyOn(Math, 'random');
        const getRandomValues = vi.spyOn(globalThis.crypto, 'getRandomValues');

        generatePassword();

        expect(getRandomValues).toHaveBeenCalled();
        expect(mathRandom).not.toHaveBeenCalled();
    });

    it('rejects bytes that would bias the distribution', () => {
        // 256 % 63 === 4, so the four bytes 252-255 must be discarded. A naive
        // `byte % 63` would instead fold them onto symbols 0-3, handing those four
        // a 5/256 chance against everyone else's 4/256. Feed all four rejects, then
        // a single usable byte, and ask for exactly one character: with rejection
        // the answer is symbol 7, without it symbol 0 (252 % 63 === 0).
        const scripted = [252, 253, 254, 255, 7];
        let cursor = 0;
        vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(((buffer: Uint8Array) => {
            // Advance through the script across refills; replaying the same rejected
            // bytes forever would hang the generator instead of testing it.
            for (let i = 0; i < buffer.length; i++) buffer[i] = scripted[cursor++] ?? 0;
            return buffer;
        }) as typeof globalThis.crypto.getRandomValues);

        expect(generatePassword(1)).toBe(PASSWORD_ALPHABET[7]);
    });

    it('reaches every symbol in the alphabet', () => {
        // 200 * 24 = 4800 draws over 63 symbols; the chance of missing any one of
        // them is roughly e^-76, so this is deterministic in practice.
        const seen = new Set(Array.from({ length: 200 }, () => generatePassword()).join(''));
        expect(seen.size).toBe(PASSWORD_ALPHABET.length);
    });

    it('rejects a non-positive or fractional length', () => {
        expect(() => generatePassword(0)).toThrow(/positive integer/);
        expect(() => generatePassword(-8)).toThrow(/positive integer/);
        expect(() => generatePassword(4.5)).toThrow(/positive integer/);
    });

    it('rejects an alphabet outside the 2-256 character range', () => {
        expect(() => generatePassword(8, '')).toThrow(/2-256 characters/);
        expect(() => generatePassword(8, 'a')).toThrow(/2-256 characters/);
        expect(() => generatePassword(8, 'a'.repeat(257))).toThrow(/2-256 characters/);
    });
});
