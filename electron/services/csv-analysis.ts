import { institutionService } from './institution-service';

export interface BulkAnalyzeRequest {
    actionType: 'suspend' | 'delete' | 'signature_push';
    rows: Record<string, string>[];
}

export interface ValidatedRow {
    rowNumber: number;
    data: Record<string, string>;
    resolvedData?: { institutionAddress?: string; institutionPhone?: string };
}

export interface FieldError {
    field: string;
    errorType: 'MISSING_REQUIRED' | 'INVALID_FORMAT' | 'NOT_FOUND' | 'DUPLICATE_IN_CSV';
    message: string;
}

export interface InvalidRowDetail {
    rowNumber: number;
    rawData: Record<string, string>;
    errors: FieldError[];
}

export interface BulkAnalyzeResponse {
    summary: { totalRows: number; validCount: number; invalidCount: number };
    validRows: ValidatedRow[];
    invalidRows: InvalidRowDetail[];
}

const REQUIRED_COLUMNS: Record<string, string[]> = {
    suspend: ['email'],
    delete: ['email'],
    // Kanonik (TR) sütunlar. CSV'de İngilizce başlıklar (first_name vb.) da
    // kabul edilir — normalizeColumns() kanonik forma çevirir.
    signature_push: ['email', 'ad', 'soyad', 'unvan', 'kurum_adi', 'telefon'],
};

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const TURKISH_CHARS = /[çşğüöıİÇŞĞÜÖ]/;

/**
 * `src/utils/bulkColumns.ts`'in Electron main eşdeğeri — bu süreç renderer
 * modüllerini import edemez; iki dosya birlikte güncel tutulmalıdır.
 * (Aynı pattern: `signatureTokens.ts` ↔ `template-renderer.ts`.)
 */
type ColumnLang = 'tr' | 'en';

/** Alias → kanonik (TR) sütun anahtarı: İngilizce başlıklar. */
const COLUMN_ALIAS: Record<string, string> = {
    first_name: 'ad',
    last_name: 'soyad',
    title: 'unvan',
    institution_name: 'kurum_adi',
    phone: 'telefon',
};

/** Kanonik anahtar → dile göre sütun başlığı. */
const COLUMN_I18N: Record<string, Record<ColumnLang, string>> = {
    email: { tr: 'email', en: 'email' },
    ad: { tr: 'ad', en: 'first_name' },
    soyad: { tr: 'soyad', en: 'last_name' },
    unvan: { tr: 'unvan', en: 'title' },
    kurum_adi: { tr: 'kurum_adi', en: 'institution_name' },
    telefon: { tr: 'telefon', en: 'phone' },
};

/** Kanonik anahtar için aktif dile uygun sütun başlığı (bilinmeyen → olduğu gibi). */
export function localeColumn(canonical: string, lang: ColumnLang): string {
    return COLUMN_I18N[canonical]?.[lang] ?? canonical;
}

/** Bir action için dile göre lokalize sütun başlık listesi (CSV şablonu / UI). */
export function localeColumnsForAction(actionType: string, lang: ColumnLang): string[] {
    return (REQUIRED_COLUMNS[actionType] || ['email']).map(c => localeColumn(c, lang));
}

/** CSV doğrulama hata mesajları — Electron main `t()` kullanamaz, inline TR/EN. */
const MESSAGES: Record<ColumnLang, {
    missingRequired: (field: string) => string;
    invalidEmail: (email: string) => string;
    turkishChars: (email: string) => string;
    duplicate: (firstRow: number) => string;
    institutionNotFound: (name: string) => string;
}> = {
    tr: {
        missingRequired: (field) => `'${field}' alanı zorunludur.`,
        invalidEmail: (email) => `Geçersiz e-posta formatı: '${email}'`,
        turkishChars: (email) => `E-posta adresi Türkçe karakter içeriyor: '${email}'`,
        duplicate: (firstRow) => `Bu e-posta CSV'de tekrar ediyor (ilk görülme: satır ${firstRow}).`,
        institutionNotFound: (name) => `Kurum bulunamadı: '${name}'. Lütfen CSV'yi kontrol edin.`,
    },
    en: {
        missingRequired: (field) => `The '${field}' field is required.`,
        invalidEmail: (email) => `Invalid email format: '${email}'`,
        turkishChars: (email) => `Email address contains Turkish characters: '${email}'`,
        duplicate: (firstRow) => `This email is duplicated in the CSV (first seen: row ${firstRow}).`,
        institutionNotFound: (name) => `Institution not found: '${name}'. Please check the CSV.`,
    },
};

/**
 * Satır anahtarlarını kanonik (TR) forma çevirir: trim + lowercase + alias.
 * İngilizce başlıkları (`first_name` vb.) kanonik forma çözer.
 */
function normalizeColumns(row: Record<string, string>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
        const k = key.trim().toLowerCase();
        const canonical = COLUMN_ALIAS[k] ?? k;
        result[canonical] = value;
    }
    return result;
}

export function analyzeBulkCsv(
    actionType: string,
    rows: Record<string, string>[],
    lang: ColumnLang = 'tr',
): BulkAnalyzeResponse {
    const requiredCols = REQUIRED_COLUMNS[actionType] || ['email'];
    const msg = MESSAGES[lang] ?? MESSAGES.tr;
    const validRows: ValidatedRow[] = [];
    const invalidRows: InvalidRowDetail[] = [];
    const seenEmails = new Map<string, number>();

    const institutionMap = new Map<string, { address: string; phone: string }>();
    if (actionType === 'signature_push') {
        for (const c of institutionService.list()) {
            institutionMap.set(c.name.trim().toLowerCase(), { address: c.address || '', phone: c.phone || '' });
        }
    }

    for (let i = 0; i < rows.length; i++) {
        const row = normalizeColumns(rows[i]);
        const rowNumber = i + 1;
        const errors: FieldError[] = [];

        const trimmedRow: Record<string, string> = {};
        for (const [key, value] of Object.entries(row)) {
            trimmedRow[key] = (value || '').trim();
        }

        for (const col of requiredCols) {
            if (!trimmedRow[col]) {
                errors.push({ field: col, errorType: 'MISSING_REQUIRED', message: msg.missingRequired(localeColumn(col, lang)) });
            }
        }

        const email = trimmedRow.email;
        if (email) {
            if (!EMAIL_REGEX.test(email)) {
                errors.push({ field: 'email', errorType: 'INVALID_FORMAT', message: msg.invalidEmail(email) });
            } else if (TURKISH_CHARS.test(email)) {
                errors.push({ field: 'email', errorType: 'INVALID_FORMAT', message: msg.turkishChars(email) });
            }
            const emailLower = email.toLowerCase();
            if (seenEmails.has(emailLower)) {
                errors.push({
                    field: 'email',
                    errorType: 'DUPLICATE_IN_CSV',
                    message: msg.duplicate(seenEmails.get(emailLower)!),
                });
            } else {
                seenEmails.set(emailLower, rowNumber);
            }
        }

        let institutionAddress: string | undefined;
        let institutionPhone: string | undefined;
        if (actionType === 'signature_push' && trimmedRow.kurum_adi) {
            const institutionData = institutionMap.get(trimmedRow.kurum_adi.trim().toLowerCase());
            if (institutionData) {
                institutionAddress = institutionData.address;
                institutionPhone = institutionData.phone;
            } else {
                errors.push({
                    field: 'kurum_adi',
                    errorType: 'NOT_FOUND',
                    message: msg.institutionNotFound(trimmedRow.kurum_adi),
                });
            }
        }

        if (errors.length > 0) {
            invalidRows.push({ rowNumber, rawData: row, errors });
        } else {
            const validatedRow: ValidatedRow = { rowNumber, data: trimmedRow };
            if (actionType === 'signature_push') {
                validatedRow.resolvedData = {
                    institutionAddress: institutionAddress || '',
                    institutionPhone: institutionPhone || '',
                };
            }
            validRows.push(validatedRow);
        }
    }

    return {
        summary: { totalRows: rows.length, validCount: validRows.length, invalidCount: invalidRows.length },
        validRows,
        invalidRows,
    };
}
