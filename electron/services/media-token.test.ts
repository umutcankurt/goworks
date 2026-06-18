import { describe, it, expect } from 'vitest';
import { computeNextToken, buildMediaTokenVars } from './media-token';

describe('computeNextToken', () => {
    it('starts at image_1 for an empty template', () => {
        expect(computeNextToken([])).toBe('image_1');
    });

    it('returns max + 1', () => {
        expect(computeNextToken(['image_1', 'image_2'])).toBe('image_3');
    });

    it('does not reuse a gap left by deletion (image_3 deleted → still image_4)', () => {
        // image_3 was deleted; remaining tokens are image_1, image_2, image_4.
        expect(computeNextToken(['image_1', 'image_2', 'image_4'])).toBe('image_5');
    });

    it('ignores null/undefined and non-matching tokens', () => {
        expect(computeNextToken([null, undefined, 'logo', 'image_2'])).toBe('image_3');
    });

    it('ignores tokens that are not strictly image_<number>', () => {
        expect(computeNextToken(['image_', 'image_1x', 'imageX', 'image_2'])).toBe('image_3');
    });
});

describe('buildMediaTokenVars', () => {
    it('maps each token to its public url', () => {
        expect(
            buildMediaTokenVars([
                { token: 'image_1', publicUrl: 'https://lh3.googleusercontent.com/d/AAA' },
                { token: 'image_2', publicUrl: 'https://lh3.googleusercontent.com/d/BBB' },
            ]),
        ).toEqual({
            image_1: 'https://lh3.googleusercontent.com/d/AAA',
            image_2: 'https://lh3.googleusercontent.com/d/BBB',
        });
    });

    it('skips assets with a null token', () => {
        expect(
            buildMediaTokenVars([
                { token: null, publicUrl: 'https://lh3.googleusercontent.com/d/AAA' },
                { token: 'image_2', publicUrl: 'https://lh3.googleusercontent.com/d/BBB' },
            ]),
        ).toEqual({ image_2: 'https://lh3.googleusercontent.com/d/BBB' });
    });

    it('returns an empty map for empty/undefined/null input', () => {
        expect(buildMediaTokenVars([])).toEqual({});
        expect(buildMediaTokenVars(undefined)).toEqual({});
        expect(buildMediaTokenVars(null)).toEqual({});
    });
});
