import { describe, it, expect } from 'vitest';
import { computeNextToken } from './media-token';

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
