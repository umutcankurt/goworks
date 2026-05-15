import { describe, it, expect, vi, beforeEach } from 'vitest';

// institution-service'i mock'la — getDb() bağımlılığını atlatmak için.
const fakeInstitutions = [
    { id: 1, name: 'Merkez', address: 'İstanbul', phone: '0212' },
    { id: 2, name: 'Kadıköy', address: 'Kadıköy/İstanbul', phone: '0216' },
];

vi.mock('./institution-service', () => ({
    institutionService: {
        list: vi.fn(() => fakeInstitutions),
        findByName: vi.fn(),
    },
}));

// Mock'lar tanımlandıktan sonra import et
import { analyzeBulkCsv } from './csv-analysis';

describe('analyzeBulkCsv — temel akış', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('kurum_adi sütunlu satır → direkt çalışır ve resolvedData doldurulur', () => {
        const result = analyzeBulkCsv('signature_push', [
            { email: 'a@x.com', ad: 'A', soyad: 'B', unvan: 'X', kurum_adi: 'Kadıköy', telefon: '0555' },
        ]);
        expect(result.summary.validCount).toBe(1);
        expect(result.validRows[0].resolvedData?.institutionAddress).toBe('Kadıköy/İstanbul');
        expect(result.validRows[0].resolvedData?.institutionPhone).toBe('0216');
    });

    it('bilinmeyen kurum adı → "Kurum bulunamadı" hatası', () => {
        const result = analyzeBulkCsv('signature_push', [
            { email: 'a@x.com', ad: 'A', soyad: 'B', unvan: 'X', kurum_adi: 'Yokoluş', telefon: '0555' },
        ]);
        expect(result.summary.invalidCount).toBe(1);
        const errors = result.invalidRows[0].errors;
        expect(errors.some((e) => e.field === 'kurum_adi' && e.message.includes('Kurum bulunamadı'))).toBe(true);
    });

    it('suspend action — kurum lookup yapmaz, sadece email validation', () => {
        const result = analyzeBulkCsv('suspend', [
            { email: 'a@x.com' },
            { email: 'invalid-email' },
        ]);
        expect(result.summary.validCount).toBe(1);
        expect(result.summary.invalidCount).toBe(1);
    });
});

describe('analyzeBulkCsv — iki dilli başlıklar (TR/EN)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('EN başlıklı satır (first_name/last_name/title/institution_name/phone) → kabul edilir', () => {
        const result = analyzeBulkCsv('signature_push', [
            { email: 'a@x.com', first_name: 'A', last_name: 'B', title: 'X', institution_name: 'Merkez', phone: '0555' },
        ]);
        expect(result.summary.invalidCount).toBe(0);
        expect(result.summary.validCount).toBe(1);
        expect(result.validRows[0].resolvedData?.institutionAddress).toBe('İstanbul');
    });

    it('karışık TR/EN başlıklar → hepsi kanonik forma normalize edilir', () => {
        const result = analyzeBulkCsv('signature_push', [
            { email: 'a@x.com', ad: 'A', last_name: 'B', unvan: 'X', institution_name: 'Kadıköy', telefon: '0555' },
        ]);
        expect(result.summary.validCount).toBe(1);
        expect(result.validRows[0].resolvedData?.institutionAddress).toBe('Kadıköy/İstanbul');
    });

    it('EN başlık + eksik kolon, lang=en → hata mesajı İngilizce ve lokalize alan adı', () => {
        const result = analyzeBulkCsv('signature_push', [
            { email: 'a@x.com', first_name: 'A', last_name: 'B', title: 'X', phone: '0555' }, // institution_name yok
        ], 'en');
        expect(result.summary.invalidCount).toBe(1);
        const err = result.invalidRows[0].errors.find((e) => e.field === 'kurum_adi');
        expect(err).toBeDefined();
        expect(err!.message).toContain('institution_name');
        expect(err!.message).toMatch(/required/i);
    });

    it('lang=tr (varsayılan) → hata mesajı Türkçe ve kanonik alan adı', () => {
        const result = analyzeBulkCsv('signature_push', [
            { email: 'a@x.com', ad: 'A', soyad: 'B', unvan: 'X', telefon: '0555' }, // kurum_adi yok
        ]);
        const err = result.invalidRows[0].errors.find((e) => e.field === 'kurum_adi');
        expect(err!.message).toContain("'kurum_adi'");
        expect(err!.message).toContain('zorunludur');
    });

    it("err.field EN başlıklı CSV'de bile kanonik kalır", () => {
        const result = analyzeBulkCsv('signature_push', [
            { email: 'invalid', first_name: 'A', last_name: 'B', title: 'X', institution_name: 'Merkez', phone: '0555' },
        ], 'en');
        const canonicalFields = ['email', 'ad', 'soyad', 'unvan', 'kurum_adi', 'telefon'];
        expect(result.invalidRows[0].errors.every((e) => canonicalFields.includes(e.field))).toBe(true);
    });
});
