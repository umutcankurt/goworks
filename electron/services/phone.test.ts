import { describe, it, expect } from 'vitest';
import { formatPhoneNumber, formatPhoneForSignature } from './phone';

describe('phone', () => {
    describe('formatPhoneNumber (E.164-tarz uluslararası gösterim)', () => {
        it('Türkiye 0 prefix\'li numarayı 90 + ile dönüştürür', () => {
            expect(formatPhoneNumber('05551234567')).toBe('90 555 123 45 67');
        });

        it('prefix\'siz numaraya 90 ekler', () => {
            expect(formatPhoneNumber('5551234567')).toBe('90 555 123 45 67');
        });

        it('zaten 90 ile başlayan numarayı bozmaz', () => {
            expect(formatPhoneNumber('905551234567')).toBe('90 555 123 45 67');
        });

        it('non-digit karakterleri temizler', () => {
            expect(formatPhoneNumber('0 (555) 123-45-67')).toBe('90 555 123 45 67');
            expect(formatPhoneNumber('+90 555 123 45 67')).toBe('90 555 123 45 67');
        });

        it('12 haneden uzun girdiyi keser', () => {
            expect(formatPhoneNumber('9055512345671234')).toBe('90 555 123 45 67');
        });

        it('boş string\'i boş döner', () => {
            expect(formatPhoneNumber('')).toBe('');
        });

        it('kısmi numaralar için aşamalı format döner', () => {
            // 1-digit input → "90 5" (90 prefix + space + single digit)
            expect(formatPhoneNumber('5')).toBe('90 5');
            // 2-digit input → "90 55"
            expect(formatPhoneNumber('55')).toBe('90 55');
            // 4-digit input → "90 555 1" (the 3-digit first block fills, the next block starts)
            expect(formatPhoneNumber('5551')).toBe('90 555 1');
        });
    });

    describe('formatPhoneForSignature (Türkiye iç gösterim: 0XXX XXX XX XX)', () => {
        it('Türkiye 0 prefix\'li numarayı yerel formata çevirir', () => {
            expect(formatPhoneForSignature('05551234567')).toBe('0555 123 45 67');
        });

        it('prefix\'siz numarayı yerel formata çevirir', () => {
            expect(formatPhoneForSignature('5551234567')).toBe('0555 123 45 67');
        });

        it('uluslararası 90 prefix\'i yerele indirir', () => {
            expect(formatPhoneForSignature('905551234567')).toBe('0555 123 45 67');
        });

        it('boş string\'i boş döner', () => {
            expect(formatPhoneForSignature('')).toBe('');
        });

        it('çok kısa girdi (4 haneden az dijital) ham digits döner', () => {
            // "1" → 90 prefix added, length 3 < 4 → returns raw "901"
            expect(formatPhoneForSignature('1')).toBe('901');
            // "12" → 90+12 = 4 digits, domestic "012" (no separator kicks in)
            expect(formatPhoneForSignature('12')).toBe('012');
        });

        it('non-digit karakterleri temizleyip formatlar', () => {
            expect(formatPhoneForSignature('+90 (555) 123-45-67')).toBe('0555 123 45 67');
        });

        it('null/undefined falsy girdiyi boş döner', () => {
            expect(formatPhoneForSignature(null as unknown as string)).toBe('');
            expect(formatPhoneForSignature(undefined as unknown as string)).toBe('');
        });
    });
});
