import { describe, it, expect } from 'vitest';
import {
    requireOneOf,
    requireString,
    requireArray,
    requireEmailList,
    requireBytes,
    requireStringRecord,
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

describe('requireStringRecord — düz metin sözlüğü', () => {
    const call = (v: unknown) => requireStringRecord(v, 'Değişkenler', 8, 32);

    it('treats an absent record as empty rather than invalid', () => {
        // Every call site has the field as optional; missing is not a user error.
        expect(call(undefined)).toEqual({});
        expect(call(null)).toEqual({});
    });

    it('passes a well-formed record through', () => {
        expect(call({ ad_soyad: 'Ayşe Yılmaz', unvan: 'Müdür' }))
            .toEqual({ ad_soyad: 'Ayşe Yılmaz', unvan: 'Müdür' });
    });

    it('returns a new object, never the caller reference', () => {
        // The handler merges media tokens over this; aliasing the caller's object
        // would let a mutation downstream reach back into unvalidated input.
        const input = { ad_soyad: 'Ayşe' };
        expect(call(input)).not.toBe(input);
    });

    it('rejects an array, which is technically an object', () => {
        expect(() => call(['a', 'b'])).toThrow(/bir nesne olmalı/);
    });

    it('rejects a non-object', () => {
        expect(() => call('ad_soyad=Ayşe')).toThrow(/bir nesne olmalı/);
        expect(() => call(42)).toThrow(/bir nesne olmalı/);
    });

    it('caps the number of fields', () => {
        const tooMany = Object.fromEntries(
            Array.from({ length: 9 }, (_, i) => [`tag${i}`, 'v']),
        );
        expect(() => call(tooMany)).toThrow(/çok fazla alan/);
    });

    it('caps the length of each value', () => {
        expect(() => call({ adres: 'x'.repeat(33) })).toThrow(/çok uzun/);
    });

    it('rejects a non-string value', () => {
        expect(() => call({ unvan: 42 })).toThrow(/metin olmalı/);
        expect(() => call({ unvan: null })).toThrow(/metin olmalı/);
    });

    it('rejects keys a template token could never have', () => {
        // TAG_REGEX matches \w+, so anything else can never resolve — accepting it
        // would only widen what reaches the renderer.
        expect(() => call({ 'ad-soyad': 'x' })).toThrow(/geçersiz alan adı/);
        expect(() => call({ 'ad.soyad': 'x' })).toThrow(/geçersiz alan adı/);
        expect(() => call({ '': 'x' })).toThrow(/geçersiz alan adı/);
    });

    it('rejects prototype-pollution keys explicitly', () => {
        // Object literals swallow a literal __proto__ key, so build it deliberately.
        const poison = Object.defineProperty({}, '__proto__', {
            value: 'x', enumerable: true, configurable: true, writable: true,
        });
        expect(() => call(poison)).toThrow(/izin verilmeyen alan adı/);
        expect(() => call({ constructor: 'x' })).toThrow(/izin verilmeyen alan adı/);
        expect(() => call({ prototype: 'x' })).toThrow(/izin verilmeyen alan adı/);
    });

    it('does not pollute Object.prototype even when a poison key is present', () => {
        const poison = Object.defineProperty({}, '__proto__', {
            value: 'polluted', enumerable: true, configurable: true, writable: true,
        });
        try { call(poison); } catch { /* expected */ }
        expect(({} as any).polluted).toBeUndefined();
        expect(Object.prototype).not.toHaveProperty('polluted');
    });
});
