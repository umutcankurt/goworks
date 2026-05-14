import { describe, it, expect } from 'vitest';
import { initialsFrom } from './initials';

describe('initialsFrom', () => {
    it('extracts uppercase initials from multi-word Turkish names', () => {
        expect(initialsFrom('Çağdaş Eğitim')).toBe('ÇE');
    });

    it('returns single char for single-word names', () => {
        expect(initialsFrom('GoWorks')).toBe('G');
    });

    it('caps result at default 3 characters', () => {
        expect(initialsFrom('Test Firması Anonim Şirketi')).toBe('TFA');
    });

    it('respects custom max parameter', () => {
        expect(initialsFrom('Test Firması Anonim Şirketi', 2)).toBe('TF');
    });

    it('handles whitespace and lowercase TR-aware', () => {
        expect(initialsFrom('  çağdaş  eğitim  ')).toBe('ÇE');
    });

    it('returns empty string for null/undefined/empty input', () => {
        expect(initialsFrom('')).toBe('');
        expect(initialsFrom(null)).toBe('');
        expect(initialsFrom(undefined)).toBe('');
        expect(initialsFrom('   ')).toBe('');
    });

    it('uses Turkish locale uppercasing for "i" → "İ"', () => {
        expect(initialsFrom('istanbul ankara')).toBe('İA');
    });
});
