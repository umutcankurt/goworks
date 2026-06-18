import { describe, it, expect } from 'vitest';
import {
    capitalizeWords,
    toUpperCaseTr,
    turkishToAscii,
    generateUsername,
    formatPhoneNumber,
    phoneToE164,
    e164ToDisplay,
    formatPhoneForSignature
} from './turkish-helpers';

describe('turkish-helpers', () => {
    describe('capitalizeWords', () => {
        it('should capitalize simple words', () => {
            expect(capitalizeWords('hello world')).toBe('Hello World');
            expect(capitalizeWords('HELLO WORLD')).toBe('Hello World');
        });

        it('should handle Turkish characters correctly', () => {
            expect(capitalizeWords('istanbul ismir')).toBe('İstanbul İsmir');
            expect(capitalizeWords('ÇAĞDAŞ EĞİTİM')).toBe('Çağdaş Eğitim');
            expect(capitalizeWords('ısparta IĞDIR')).toBe('Isparta Iğdır');
            expect(capitalizeWords('şeker ŞAHİN')).toBe('Şeker Şahin');
            expect(capitalizeWords('ömer ÖZKAN')).toBe('Ömer Özkan');
            expect(capitalizeWords('ümit ÜNAL')).toBe('Ümit Ünal');
            expect(capitalizeWords('çetin ÇELİK')).toBe('Çetin Çelik');
        });

        it('should handle empty string', () => {
            expect(capitalizeWords('')).toBe('');
        });

        it('should handle multiple spaces', () => {
            expect(capitalizeWords('hello   world')).toBe('Hello   World');
        });
    });

    describe('toUpperCaseTr', () => {
        it('should convert to uppercase handling Turkish characters', () => {
            expect(toUpperCaseTr('i')).toBe('İ');
            expect(toUpperCaseTr('ı')).toBe('I');
            expect(toUpperCaseTr('ş')).toBe('Ş');
            expect(toUpperCaseTr('ğ')).toBe('Ğ');
            expect(toUpperCaseTr('ç')).toBe('Ç');
            expect(toUpperCaseTr('ö')).toBe('Ö');
            expect(toUpperCaseTr('ü')).toBe('Ü');
            expect(toUpperCaseTr('istanbul')).toBe('İSTANBUL');
            expect(toUpperCaseTr('ırmak')).toBe('IRMAK');
        });
    });

    describe('turkishToAscii', () => {
        it('should replace Turkish characters with their ASCII equivalents', () => {
            expect(turkishToAscii('çÇğĞıİöÖşŞüÜ')).toBe('cCgGiIoOsSuU');
            expect(turkishToAscii('Çağdaş Eğitim')).toBe('Cagdas Egitim');
            expect(turkishToAscii('Şeker İşçi')).toBe('Seker Isci');
        });

        it('should leave non-Turkish characters unchanged', () => {
            expect(turkishToAscii('Hello World 123 !@#')).toBe('Hello World 123 !@#');
        });
    });

    describe('generateUsername', () => {
        it('should generate a username from given and family name', () => {
            expect(generateUsername('John', 'Doe')).toBe('john.doe');
        });

        it('should handle Turkish characters', () => {
            expect(generateUsername('Çağatay', 'Özdemir')).toBe('cagatay.ozdemir');
            expect(generateUsername('Şükrü', 'İşler')).toBe('sukru.isler');
            expect(generateUsername('Irmak', 'Işık')).toBe('irmak.isik');
        });

        it('should handle missing given or family name', () => {
            expect(generateUsername('', 'Doe')).toBe('doe');
            expect(generateUsername('John', '')).toBe('john');
            expect(generateUsername('', '')).toBe('');
        });

        it('should handle multiple spaces and convert them to dots', () => {
            expect(generateUsername('John Paul', 'Doe Smith')).toBe('john.paul.doe.smith');
        });

        it('should handle trimming spaces', () => {
            expect(generateUsername(' John ', ' Doe ')).toBe('john.doe');
        });
    });

    describe('formatPhoneNumber', () => {
        it('should format a number starting with 0', () => {
            expect(formatPhoneNumber('05321234567')).toBe('90 532 123 45 67');
        });

        it('should format a number without 0 or 9', () => {
            expect(formatPhoneNumber('5321234567')).toBe('90 532 123 45 67');
        });

        it('should format a number already starting with 90', () => {
            expect(formatPhoneNumber('905321234567')).toBe('90 532 123 45 67');
        });

        it('should handle non-digit characters', () => {
            expect(formatPhoneNumber('+90 (532) 123-4567')).toBe('90 532 123 45 67');
        });

        it('should limit to 12 digits', () => {
             expect(formatPhoneNumber('905321234567890')).toBe('90 532 123 45 67');
        });

        it('should format partial numbers', () => {
             expect(formatPhoneNumber('532')).toBe('90 532');
             expect(formatPhoneNumber('5321')).toBe('90 532 1');
             expect(formatPhoneNumber('0')).toBe('90');
        });
    });

    describe('phoneToE164', () => {
        it('should add + and remove spaces', () => {
            expect(phoneToE164('90 532 123 45 67')).toBe('+905321234567');
        });

        it('should return empty string for empty input', () => {
            expect(phoneToE164('')).toBe('');
            expect(phoneToE164('   ')).toBe('');
        });
    });

    describe('e164ToDisplay', () => {
        it('should convert E164 to formatted display string', () => {
            expect(e164ToDisplay('+905321234567')).toBe('90 532 123 45 67');
        });

        it('should handle invalid E164 inputs', () => {
            expect(e164ToDisplay('+123')).toBe('90 123');
        });
    });

    describe('formatPhoneForSignature', () => {
        it('should format to domestic format (0XXX XXX XX XX)', () => {
            expect(formatPhoneForSignature('905321234567')).toBe('0532 123 45 67');
            expect(formatPhoneForSignature('05321234567')).toBe('0532 123 45 67');
            expect(formatPhoneForSignature('5321234567')).toBe('0532 123 45 67');
        });

        it('should handle non-digit characters', () => {
            expect(formatPhoneForSignature('+90 (532) 123-4567')).toBe('0532 123 45 67');
        });

        it('should return empty string for empty input', () => {
            expect(formatPhoneForSignature('')).toBe('');
            expect(formatPhoneForSignature(null as unknown as string)).toBe('');
            expect(formatPhoneForSignature(undefined as unknown as string)).toBe('');
        });

        it('should handle short numbers', () => {
            expect(formatPhoneForSignature('0')).toBe('90'); // Auto-correct adds 90
            expect(formatPhoneForSignature('5')).toBe('905'); // Auto-correct adds 90
        });
    });
});
