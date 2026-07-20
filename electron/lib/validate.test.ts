import { describe, it, expect } from 'vitest';
import {
    requireOneOf,
    requireString,
    requireArray,
    requireEmailList,
    requireBytes,
    sniffImageMime,
    requireImageBytes,
} from './validate';

describe('requireOneOf — kapalı küme üyeliği', () => {
    const TYPES = ['BULK_SUSPEND', 'BULK_DELETE'] as const;

    it('accepts a member and narrows it', () => {
        expect(requireOneOf('BULK_DELETE', TYPES, 'iş tipi')).toBe('BULK_DELETE');
    });

    it('rejects an unknown value', () => {
        expect(() => requireOneOf('BULK_WIPE', TYPES, 'iş tipi')).toThrow();
    });

    it('rejects non-strings, including prototype-ish keys', () => {
        for (const bad of [undefined, null, 42, {}, ['BULK_DELETE'], '__proto__', 'constructor']) {
            expect(() => requireOneOf(bad, TYPES, 'iş tipi')).toThrow();
        }
    });
});

describe('requireArray — uzunluk sınırı', () => {
    it('accepts an array within the cap', () => {
        expect(requireArray([1, 2, 3], 'Satırlar', 5)).toHaveLength(3);
    });

    it('rejects an over-long array', () => {
        expect(() => requireArray(new Array(11).fill(1), 'Satırlar', 10)).toThrow(/çok fazla/);
    });

    it('rejects a non-array', () => {
        expect(() => requireArray('a,b,c', 'Satırlar', 10)).toThrow();
    });
});

describe('requireEmailList — toplu işlem hedefleri', () => {
    it('accepts and trims valid addresses', () => {
        expect(requireEmailList([' a@b.com ', 'c@d.org'], 'E-postalar', 10))
            .toEqual(['a@b.com', 'c@d.org']);
    });

    it('names the offending row so the operator can fix the CSV', () => {
        expect(() => requireEmailList(['a@b.com', 'not-an-email'], 'E-postalar', 10))
            .toThrow(/2\. kayıt/);
    });

    it('enforces the cap', () => {
        const many = new Array(6).fill('a@b.com');
        expect(() => requireEmailList(many, 'E-postalar', 5)).toThrow(/çok fazla/);
    });
});

describe('requireString / requireBytes', () => {
    it('rejects empty and whitespace-only strings', () => {
        expect(() => requireString('   ', 'Ad')).toThrow();
        expect(() => requireString(undefined, 'Ad')).toThrow();
    });

    it('enforces the length cap', () => {
        expect(() => requireString('x'.repeat(11), 'Ad', 10)).toThrow(/çok uzun/);
    });

    it('rejects an oversized buffer', () => {
        expect(() => requireBytes(new Uint8Array(101), 'Görsel', 100)).toThrow(/çok büyük/);
    });

    it('rejects empty bytes', () => {
        expect(() => requireBytes(new Uint8Array(0), 'Görsel', 100)).toThrow();
        expect(() => requireBytes(null, 'Görsel', 100)).toThrow();
    });
});

describe('sniffImageMime — içerikten tip tespiti (F-10)', () => {
    const png = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.alloc(16),
    ]);
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
    const gif = Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.alloc(16)]);
    const webp = Buffer.concat([
        Buffer.from('RIFF', 'latin1'), Buffer.alloc(4), Buffer.from('WEBP', 'latin1'), Buffer.alloc(8),
    ]);

    it('identifies the raster formats from their magic bytes', () => {
        expect(sniffImageMime(png)).toBe('image/png');
        expect(sniffImageMime(jpeg)).toBe('image/jpeg');
        expect(sniffImageMime(gif)).toBe('image/gif');
        expect(sniffImageMime(webp)).toBe('image/webp');
    });

    it('rejects SVG — no magic number, and it carries script', () => {
        const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
        expect(sniffImageMime(svg)).toBeNull();
    });

    it('rejects arbitrary content dressed as an image', () => {
        expect(sniffImageMime(Buffer.from('PK\x03\x04 not an image at all'))).toBeNull();
        expect(sniffImageMime(Buffer.from('plain text'))).toBeNull();
    });

    it('derives the mime from bytes, ignoring any caller-supplied label', () => {
        // The whole point: the renderer's File.type is an extension guess and
        // becomes the Content-Type a public CDN serves the file with.
        const { mimeType } = requireImageBytes(jpeg, 'Görsel', 1024);
        expect(mimeType).toBe('image/jpeg');
    });

    it('refuses a non-image upload outright', () => {
        expect(() => requireImageBytes(Buffer.from('#!/bin/sh\nrm -rf /'), 'Görsel', 1024))
            .toThrow(/tanınan bir görsel değil/);
    });
});
