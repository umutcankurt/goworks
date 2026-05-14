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

describe('analyzeBulkCsv — geri uyum (kampus_adi → kurum_adi)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('eski kampus_adi sütunlu satır → header normalize edilip kurum_adi olarak işlenir', () => {
        const result = analyzeBulkCsv('signature_push', [
            { email: 'a@x.com', ad: 'A', soyad: 'B', unvan: 'X', kampus_adi: 'Merkez', telefon: '0555' },
        ]);
        expect(result.summary.invalidCount).toBe(0);
        expect(result.summary.validCount).toBe(1);
        expect(result.validRows[0].resolvedData?.institutionAddress).toBe('İstanbul');
        expect(result.validRows[0].resolvedData?.institutionPhone).toBe('0212');
    });

    it('yeni kurum_adi sütunlu satır → direkt çalışır', () => {
        const result = analyzeBulkCsv('signature_push', [
            { email: 'a@x.com', ad: 'A', soyad: 'B', unvan: 'X', kurum_adi: 'Kadıköy', telefon: '0555' },
        ]);
        expect(result.summary.validCount).toBe(1);
        expect(result.validRows[0].resolvedData?.institutionAddress).toBe('Kadıköy/İstanbul');
    });

    it('hem kampus_adi hem kurum_adi varsa kurum_adi öncelikli', () => {
        const result = analyzeBulkCsv('signature_push', [
            { email: 'a@x.com', ad: 'A', soyad: 'B', unvan: 'X', kurum_adi: 'Merkez', kampus_adi: 'Kadıköy', telefon: '0555' },
        ]);
        expect(result.validRows[0].resolvedData?.institutionAddress).toBe('İstanbul');
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

    it('legacy kampus_adi + EN diğer başlıklar karışık → kabul edilir', () => {
        const result = analyzeBulkCsv('signature_push', [
            { email: 'a@x.com', first_name: 'A', last_name: 'B', title: 'X', kampus_adi: 'Merkez', phone: '0555' },
        ]);
        expect(result.summary.validCount).toBe(1);
    });

    it("err.field EN başlıklı CSV'de bile kanonik kalır", () => {
        const result = analyzeBulkCsv('signature_push', [
            { email: 'invalid', first_name: 'A', last_name: 'B', title: 'X', institution_name: 'Merkez', phone: '0555' },
        ], 'en');
        const canonicalFields = ['email', 'ad', 'soyad', 'unvan', 'kurum_adi', 'telefon'];
        expect(result.invalidRows[0].errors.every((e) => canonicalFields.includes(e.field))).toBe(true);
    });
});
