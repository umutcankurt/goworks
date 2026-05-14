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
    // Yeni standart sütun: kurum_adi. Geri uyum için kampus_adi de kabul edilir
    // (normalize sırasında kurum_adi'ye çevrilir).
    signature_push: ['email', 'ad', 'soyad', 'unvan', 'kurum_adi', 'telefon'],
};

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const TURKISH_CHARS = /[çşğüöıİÇŞĞÜÖ]/;

/**
 * Geri uyum: CSV'de eski `kampus_adi` sütunu varsa `kurum_adi`'na taşınır.
 * Mutator: orijinal objeyi de eski anahtarı silmeden bırakır (template renderer
 * eski token kullanırsa hâlâ erişebilsin).
 */
function normalizeLegacyColumns(row: Record<string, string>): Record<string, string> {
    if (row.kampus_adi !== undefined && row.kurum_adi === undefined) {
        return { ...row, kurum_adi: row.kampus_adi };
    }
    return row;
}

export function analyzeBulkCsv(actionType: string, rows: Record<string, string>[]): BulkAnalyzeResponse {
    const requiredCols = REQUIRED_COLUMNS[actionType] || ['email'];
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
        const row = normalizeLegacyColumns(rows[i]);
        const rowNumber = i + 1;
        const errors: FieldError[] = [];

        const trimmedRow: Record<string, string> = {};
        for (const [key, value] of Object.entries(row)) {
            trimmedRow[key] = (value || '').trim();
        }

        for (const col of requiredCols) {
            if (!trimmedRow[col]) {
                errors.push({ field: col, errorType: 'MISSING_REQUIRED', message: `'${col}' alanı zorunludur.` });
            }
        }

        const email = trimmedRow.email;
        if (email) {
            if (!EMAIL_REGEX.test(email)) {
                errors.push({ field: 'email', errorType: 'INVALID_FORMAT', message: `Geçersiz e-posta formatı: '${email}'` });
            } else if (TURKISH_CHARS.test(email)) {
                errors.push({ field: 'email', errorType: 'INVALID_FORMAT', message: `E-posta adresi Türkçe karakter içeriyor: '${email}'` });
            }
            const emailLower = email.toLowerCase();
            if (seenEmails.has(emailLower)) {
                errors.push({
                    field: 'email',
                    errorType: 'DUPLICATE_IN_CSV',
                    message: `Bu e-posta CSV'de tekrar ediyor (ilk görülme: satır ${seenEmails.get(emailLower)}).`,
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
                    message: `Kurum bulunamadı: '${trimmedRow.kurum_adi}'. Lütfen CSV'yi kontrol edin.`,
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
