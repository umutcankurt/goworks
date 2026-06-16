import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock institution-service — to bypass the getDb() dependency.
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

// Import after the mocks are defined
import { analyzeBulkCsv, localeColumnsForAction } from './csv-analysis';

describe('localeColumnsForAction — şablon başlıkları (rol dahil)', () => {
    it('add_to_group TR başlıkları rol içerir', () => {
        expect(localeColumnsForAction('add_to_group', 'tr')).toEqual(['grup_email', 'email', 'rol']);
    });
    it('add_to_group EN başlıkları role içerir', () => {
        expect(localeColumnsForAction('add_to_group', 'en')).toEqual(['group_email', 'email', 'role']);
    });
    it('signature_push başlıkları değişmedi', () => {
        expect(localeColumnsForAction('signature_push', 'tr')).toEqual(['email', 'ad', 'soyad', 'unvan', 'kurum_adi', 'telefon']);
    });
});

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
            { email: 'a@x.com', first_name: 'A', last_name: 'B', title: 'X', phone: '0555' }, // no institution_name
        ], 'en');
        expect(result.summary.invalidCount).toBe(1);
        const err = result.invalidRows[0].errors.find((e) => e.field === 'kurum_adi');
        expect(err).toBeDefined();
        expect(err!.message).toContain('institution_name');
        expect(err!.message).toMatch(/required/i);
    });

    it('lang=tr (varsayılan) → hata mesajı Türkçe ve kanonik alan adı', () => {
        const result = analyzeBulkCsv('signature_push', [
            { email: 'a@x.com', ad: 'A', soyad: 'B', unvan: 'X', telefon: '0555' }, // no kurum_adi
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

describe('analyzeBulkCsv — add_to_group', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('geçerli grup/email/rol satırı → valid', () => {
        const result = analyzeBulkCsv('add_to_group', [
            { grup_email: 'g@x.com', email: 'a@x.com', rol: 'MEMBER' },
        ]);
        expect(result.summary.validCount).toBe(1);
        expect(result.summary.invalidCount).toBe(0);
    });

    it('eksik grup_email → MISSING_REQUIRED', () => {
        const result = analyzeBulkCsv('add_to_group', [
            { grup_email: '', email: 'a@x.com', rol: 'MEMBER' },
        ]);
        expect(result.summary.invalidCount).toBe(1);
        expect(result.invalidRows[0].errors.some((e) => e.field === 'grup_email' && e.errorType === 'MISSING_REQUIRED')).toBe(true);
    });

    it('geçersiz grup_email formatı → INVALID_FORMAT', () => {
        const result = analyzeBulkCsv('add_to_group', [
            { grup_email: 'not-an-email', email: 'a@x.com', rol: 'MEMBER' },
        ]);
        expect(result.invalidRows[0].errors.some((e) => e.field === 'grup_email' && e.errorType === 'INVALID_FORMAT')).toBe(true);
    });

    it('geçersiz üye email → INVALID_FORMAT', () => {
        const result = analyzeBulkCsv('add_to_group', [
            { grup_email: 'g@x.com', email: 'bad', rol: 'MEMBER' },
        ]);
        expect(result.invalidRows[0].errors.some((e) => e.field === 'email' && e.errorType === 'INVALID_FORMAT')).toBe(true);
    });

    it('geçersiz rol → INVALID_FORMAT', () => {
        const result = analyzeBulkCsv('add_to_group', [
            { grup_email: 'g@x.com', email: 'a@x.com', rol: 'PATRON' },
        ]);
        expect(result.invalidRows[0].errors.some((e) => e.field === 'rol' && e.errorType === 'INVALID_FORMAT')).toBe(true);
    });

    it('boş rol → valid (worker MEMBER varsayar)', () => {
        const result = analyzeBulkCsv('add_to_group', [
            { grup_email: 'g@x.com', email: 'a@x.com', rol: '' },
        ]);
        expect(result.summary.validCount).toBe(1);
    });

    it('TR rol eşanlamlısı (yönetici) → valid', () => {
        const result = analyzeBulkCsv('add_to_group', [
            { grup_email: 'g@x.com', email: 'a@x.com', rol: 'yönetici' },
        ]);
        expect(result.summary.validCount).toBe(1);
    });

    it('aynı email farklı gruplara eklenebilir (çift bazlı dedupe)', () => {
        const result = analyzeBulkCsv('add_to_group', [
            { grup_email: 'g1@x.com', email: 'a@x.com', rol: 'MEMBER' },
            { grup_email: 'g2@x.com', email: 'a@x.com', rol: 'MEMBER' },
        ]);
        expect(result.summary.validCount).toBe(2);
        expect(result.summary.invalidCount).toBe(0);
    });

    it('aynı (grup,email) çifti tekrarı → DUPLICATE_IN_CSV', () => {
        const result = analyzeBulkCsv('add_to_group', [
            { grup_email: 'g1@x.com', email: 'a@x.com', rol: 'MEMBER' },
            { grup_email: 'g1@x.com', email: 'a@x.com', rol: 'OWNER' },
        ]);
        expect(result.summary.validCount).toBe(1);
        expect(result.invalidRows[0].errors.some((e) => e.errorType === 'DUPLICATE_IN_CSV')).toBe(true);
    });

    it('EN başlıklar (group_email/role) → kanonik forma normalize edilir', () => {
        const result = analyzeBulkCsv('add_to_group', [
            { group_email: 'g@x.com', email: 'a@x.com', role: 'MANAGER' },
        ]);
        expect(result.summary.validCount).toBe(1);
        expect(result.validRows[0].data.grup_email).toBe('g@x.com');
    });
});
