import { describe, it, expect } from 'vitest';
import {
    evaluatePasswordStrength,
    MIN_PASSWORD_LENGTH,
    RECOMMENDED_PASSWORD_LENGTH,
} from './passwordStrength';

describe('evaluatePasswordStrength', () => {
    it('treats an empty password as weak / 0', () => {
        expect(evaluatePasswordStrength('')).toEqual({ score: 0, level: 'weak' });
    });

    it('rates a short single-class password as weak', () => {
        const { level } = evaluatePasswordStrength('abcdef'); // 6 chars, one class
        expect(level).toBe('weak');
    });

    it('rates a medium-length mixed password as medium', () => {
        const { level } = evaluatePasswordStrength('Abcdef12'); // 8 chars, 3 classes
        expect(level).toBe('medium');
    });

    it('rates a long four-class password as strong', () => {
        const { score, level } = evaluatePasswordStrength('Abcdef12!@#xyz'); // 14 chars, 4 classes
        expect(level).toBe('strong');
        expect(score).toBe(4);
    });

    it('never exceeds a score of 4', () => {
        const { score } = evaluatePasswordStrength('A'.repeat(40) + 'b1!');
        expect(score).toBeLessThanOrEqual(4);
    });

    it('exposes sensible length constants', () => {
        expect(MIN_PASSWORD_LENGTH).toBe(6);
        expect(RECOMMENDED_PASSWORD_LENGTH).toBeGreaterThan(MIN_PASSWORD_LENGTH);
    });
});
