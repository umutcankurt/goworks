import { describe, it, expect } from 'vitest';
import {
    canonicalColumn,
    normalizeRowColumns,
    localeColumn,
    localeColumnsForAction,
    COLUMN_ALIAS,
    COLUMN_I18N,
    CANONICAL_COLUMNS,
} from './bulkColumns';

describe('bulkColumns', () => {
    describe('canonicalColumn', () => {
        it('zaten kanonik bir anahtarı olduğu gibi döner', () => {
            expect(canonicalColumn('email')).toBe('email');
            expect(canonicalColumn('ad')).toBe('ad');
            expect(canonicalColumn('kurum_adi')).toBe('kurum_adi');
        });

        it('İngilizce alias\'ları kanonik TR anahtarlara çevirir', () => {
            expect(canonicalColumn('first_name')).toBe('ad');
            expect(canonicalColumn('last_name')).toBe('soyad');
            expect(canonicalColumn('title')).toBe('unvan');
            expect(canonicalColumn('institution_name')).toBe('kurum_adi');
            expect(canonicalColumn('phone')).toBe('telefon');
            expect(canonicalColumn('group_email')).toBe('grup_email');
            expect(canonicalColumn('group')).toBe('grup_email');
            expect(canonicalColumn('role')).toBe('rol');
        });

        it('case-insensitive: büyük/küçük harf ayırt etmez', () => {
            expect(canonicalColumn('EMAIL')).toBe('email');
            expect(canonicalColumn('First_Name')).toBe('ad');
            expect(canonicalColumn('INSTITUTION_NAME')).toBe('kurum_adi');
        });

        it('başında/sonunda boşlukları temizler', () => {
            expect(canonicalColumn('  email  ')).toBe('email');
            expect(canonicalColumn('\tfirst_name\n')).toBe('ad');
        });

        it('bilinmeyen anahtarları lowercase + trim yapıp olduğu gibi döner', () => {
            expect(canonicalColumn('UnknownColumn')).toBe('unknowncolumn');
            expect(canonicalColumn('  RandomField  ')).toBe('randomfield');
        });
    });

    describe('normalizeRowColumns', () => {
        it('tüm anahtarları kanonik forma çevirir', () => {
            const row = {
                first_name: 'Ali',
                LAST_NAME: 'Veli',
                '  email  ': 'ali@example.com',
                unvan: 'Müdür',
            };
            expect(normalizeRowColumns(row)).toEqual({
                ad: 'Ali',
                soyad: 'Veli',
                email: 'ali@example.com',
                unvan: 'Müdür',
            });
        });

        it('boş objeyi boş döner', () => {
            expect(normalizeRowColumns({})).toEqual({});
        });

        it('çakışma durumunda son yazılan kazanır (CSV başlıkları benzersiz olmalı)', () => {
            const row = { first_name: 'Ali', AD: 'Ahmet' };
            expect(normalizeRowColumns(row)).toEqual({ ad: 'Ahmet' });
        });

        it('İngilizce signature_push tüm sütunlarını kanonik forma çevirir', () => {
            const row = {
                email: 'a@b.com',
                first_name: 'Ali',
                last_name: 'Veli',
                title: 'Müdür',
                institution_name: 'Okul',
                phone: '5551234567',
            };
            expect(normalizeRowColumns(row)).toEqual({
                email: 'a@b.com',
                ad: 'Ali',
                soyad: 'Veli',
                unvan: 'Müdür',
                kurum_adi: 'Okul',
                telefon: '5551234567',
            });
        });
    });

    describe('localeColumn', () => {
        it('en için İngilizce başlık döner', () => {
            expect(localeColumn('ad', 'en')).toBe('first_name');
            expect(localeColumn('soyad', 'en')).toBe('last_name');
            expect(localeColumn('kurum_adi', 'en')).toBe('institution_name');
            expect(localeColumn('email', 'en')).toBe('email');
        });

        it('tr için kanonik (TR) başlık döner', () => {
            expect(localeColumn('ad', 'tr')).toBe('ad');
            expect(localeColumn('kurum_adi', 'tr')).toBe('kurum_adi');
        });

        it('bilinmeyen dil "tr"e düşer', () => {
            expect(localeColumn('ad', 'fr')).toBe('ad');
            expect(localeColumn('ad', '')).toBe('ad');
        });

        it('bilinmeyen kanonik anahtarı olduğu gibi döner', () => {
            expect(localeColumn('unknown_key', 'en')).toBe('unknown_key');
            expect(localeColumn('unknown_key', 'tr')).toBe('unknown_key');
        });
    });

    describe('localeColumnsForAction', () => {
        it('suspend: email tek sütun (her dilde)', () => {
            expect(localeColumnsForAction('suspend', 'tr')).toEqual(['email']);
            expect(localeColumnsForAction('suspend', 'en')).toEqual(['email']);
        });

        it('delete: email tek sütun (her dilde)', () => {
            expect(localeColumnsForAction('delete', 'tr')).toEqual(['email']);
            expect(localeColumnsForAction('delete', 'en')).toEqual(['email']);
        });

        it('signature_push: TR için tüm kanonik sütunlar', () => {
            expect(localeColumnsForAction('signature_push', 'tr')).toEqual([
                'email',
                'ad',
                'soyad',
                'unvan',
                'kurum_adi',
                'telefon',
            ]);
        });

        it('signature_push: EN için tüm İngilizce karşılıklar', () => {
            expect(localeColumnsForAction('signature_push', 'en')).toEqual([
                'email',
                'first_name',
                'last_name',
                'title',
                'institution_name',
                'phone',
            ]);
        });

        it('add_to_group: TR başlıklar grup_email/email/rol', () => {
            expect(localeColumnsForAction('add_to_group', 'tr')).toEqual(['grup_email', 'email', 'rol']);
        });

        it('add_to_group: EN başlıklar group_email/email/role', () => {
            expect(localeColumnsForAction('add_to_group', 'en')).toEqual(['group_email', 'email', 'role']);
        });

        it('fallback: bilinmeyen diller için TR başlıkları döner', () => {
            expect(localeColumnsForAction('add_to_group', 'fr')).toEqual(['grup_email', 'email', 'rol']);
            expect(localeColumnsForAction('signature_push', '')).toEqual([
                'email',
                'ad',
                'soyad',
                'unvan',
                'kurum_adi',
                'telefon',
            ]);
        });
    });

    describe('Veri bütünlüğü (data integrity)', () => {
        it('COLUMN_ALIAS değerlerinin tamamı CANONICAL_COLUMNS içindeki bir sütuna karşılık gelir', () => {
            const allCanonical = new Set(Object.values(CANONICAL_COLUMNS).flat());
            for (const canonical of Object.values(COLUMN_ALIAS)) {
                expect(allCanonical.has(canonical)).toBe(true);
            }
        });

        it('CANONICAL_COLUMNS\'in tüm signature_push sütunları COLUMN_I18N\'de tanımlı', () => {
            for (const col of CANONICAL_COLUMNS.signature_push) {
                expect(COLUMN_I18N[col]).toBeDefined();
                expect(COLUMN_I18N[col].tr).toBe(col);
                expect(COLUMN_I18N[col].en).toBeTruthy();
            }
        });

        it('COLUMN_I18N\'de her kanonik anahtarın tr değeri kendisine eşit (kanonik = TR)', () => {
            for (const [canonical, langs] of Object.entries(COLUMN_I18N)) {
                expect(langs.tr).toBe(canonical);
            }
        });
    });
});
