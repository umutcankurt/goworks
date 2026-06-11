import { describe, it, expect } from 'vitest';
import {
    localeToken,
    resolveVariable,
    TOKEN_ALIAS,
    TOKEN_I18N,
    CANONICAL_TAG_KEYS,
} from './signatureTokens';

describe('signatureTokens', () => {
    describe('localeToken', () => {
        it('en için İngilizce token string\'i döner', () => {
            expect(localeToken('ad_soyad', 'en')).toBe('full_name');
            expect(localeToken('unvan', 'en')).toBe('title');
            expect(localeToken('kurum_adi', 'en')).toBe('institution_name');
            expect(localeToken('kurum_adres', 'en')).toBe('institution_address');
            expect(localeToken('kurum_telefon', 'en')).toBe('institution_phone');
            expect(localeToken('telefon', 'en')).toBe('phone');
            expect(localeToken('eposta', 'en')).toBe('email');
        });

        it('tr için kanonik (TR) token döner', () => {
            expect(localeToken('ad_soyad', 'tr')).toBe('ad_soyad');
            expect(localeToken('kurum_adres', 'tr')).toBe('kurum_adres');
        });

        it('bilinmeyen dil "tr"e düşer', () => {
            expect(localeToken('ad_soyad', 'fr')).toBe('ad_soyad');
            expect(localeToken('eposta', '')).toBe('eposta');
        });
    });

    describe('resolveVariable', () => {
        it('doğrudan eşleşme varsa onu döner (alias\'a düşmez)', () => {
            const vars = { ad_soyad: 'Ali Veli', telefon: '555' };
            expect(resolveVariable('ad_soyad', vars)).toBe('Ali Veli');
            expect(resolveVariable('telefon', vars)).toBe('555');
        });

        it('alias üzerinden tek hop çözümleme yapar', () => {
            const vars = { ad_soyad: 'Ali Veli' };
            expect(resolveVariable('full_name', vars)).toBe('Ali Veli');
        });

        it('alias bile variables\'da yoksa undefined döner', () => {
            expect(resolveVariable('full_name', {})).toBeUndefined();
            expect(resolveVariable('unknown_key', {})).toBeUndefined();
        });

        it('boş string değer "" valid bir değerdir, undefined gibi davranmaz', () => {
            expect(resolveVariable('telefon', { telefon: '' })).toBe('');
        });

        it('alias\'lar EN→TR yönünde çözer, TR→EN yönünde değil', () => {
            const vars = { full_name: 'Ali Veli' };
            // ad_soyad is not directly in vars, nor is it an alias (TOKEN_ALIAS is EN→TR only)
            expect(resolveVariable('ad_soyad', vars)).toBeUndefined();
        });
    });

    describe('Veri bütünlüğü (data integrity)', () => {
        it('TOKEN_ALIAS değerlerinin tamamı kanonik anahtar', () => {
            const canonicalSet = new Set<string>(CANONICAL_TAG_KEYS);
            for (const canonical of Object.values(TOKEN_ALIAS)) {
                expect(canonicalSet.has(canonical)).toBe(true);
            }
        });

        it('TOKEN_ALIAS\'in tüm key\'leri en karşılıklarıyla eşleşir (TOKEN_I18N ile tutarlılık)', () => {
            for (const [enKey, canonical] of Object.entries(TOKEN_ALIAS)) {
                expect(TOKEN_I18N[canonical as keyof typeof TOKEN_I18N].en).toBe(enKey);
            }
        });

        it('CANONICAL_TAG_KEYS\'in tamamı TOKEN_I18N\'de tanımlı', () => {
            for (const key of CANONICAL_TAG_KEYS) {
                expect(TOKEN_I18N[key]).toBeDefined();
                expect(TOKEN_I18N[key].tr).toBe(key);
                expect(TOKEN_I18N[key].en).toBeTruthy();
            }
        });
    });
});
