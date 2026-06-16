import { institutionService } from './institution-service';

export interface BulkAnalyzeRequest {
    actionType: 'suspend' | 'delete' | 'signature_push' | 'add_to_group';
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
    // Canonical (TR) columns. English headers (first_name etc.) are also
    // accepted in the CSV — normalizeColumns() converts them to the canonical form.
    signature_push: ['email', 'ad', 'soyad', 'unvan', 'kurum_adi', 'telefon'],
    // `rol` is intentionally NOT required per-row (empty defaults to MEMBER in the
    // worker); the header is still expected via TEMPLATE_COLUMNS below.
    add_to_group: ['grup_email', 'email'],
};

/**
 * Columns shown in the downloaded CSV template / expected in the header for an
 * action. Mirrors `CANONICAL_COLUMNS` in `src/utils/bulkColumns.ts`. Differs from
 * REQUIRED_COLUMNS only when an action has an optional column whose header must
 * still be present (e.g. `add_to_group`'s `rol`, blank cell → MEMBER).
 */
const TEMPLATE_COLUMNS: Record<string, string[]> = {
    ...REQUIRED_COLUMNS,
    add_to_group: ['grup_email', 'email', 'rol'],
};

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const TURKISH_CHARS = /[çşğüöıİÇŞĞÜÖ]/;
/** Accepted role cells (case-insensitive): API values + TR synonyms. */
const VALID_ROLES = new Set(['member', 'manager', 'owner', 'üye', 'yönetici', 'yonetici', 'sahip']);

/**
 * Electron main equivalent of `src/utils/bulkColumns.ts` — this process cannot
 * import renderer modules; the two files must be kept in sync.
 * (Same pattern: `signatureTokens.ts` ↔ `template-renderer.ts`.)
 */
type ColumnLang = 'tr' | 'en';

/** Alias → canonical (TR) column key: English headers. */
const COLUMN_ALIAS: Record<string, string> = {
    first_name: 'ad',
    last_name: 'soyad',
    title: 'unvan',
    institution_name: 'kurum_adi',
    phone: 'telefon',
    group_email: 'grup_email',
    group: 'grup_email',
    role: 'rol',
};

/** Canonical key → column header per language. */
const COLUMN_I18N: Record<string, Record<ColumnLang, string>> = {
    email: { tr: 'email', en: 'email' },
    ad: { tr: 'ad', en: 'first_name' },
    soyad: { tr: 'soyad', en: 'last_name' },
    unvan: { tr: 'unvan', en: 'title' },
    kurum_adi: { tr: 'kurum_adi', en: 'institution_name' },
    telefon: { tr: 'telefon', en: 'phone' },
    grup_email: { tr: 'grup_email', en: 'group_email' },
    rol: { tr: 'rol', en: 'role' },
};

/** Column header for the active language given a canonical key (unknown → as-is). */
export function localeColumn(canonical: string, lang: ColumnLang): string {
    return COLUMN_I18N[canonical]?.[lang] ?? canonical;
}

/** Localized column header list for an action per language (CSV template / UI). */
export function localeColumnsForAction(actionType: string, lang: ColumnLang): string[] {
    return (TEMPLATE_COLUMNS[actionType] || REQUIRED_COLUMNS[actionType] || ['email']).map(c => localeColumn(c, lang));
}

/** CSV validation error messages — Electron main cannot use `t()`, inline TR/EN. */
const MESSAGES: Record<ColumnLang, {
    missingRequired: (field: string) => string;
    invalidEmail: (email: string) => string;
    turkishChars: (email: string) => string;
    duplicate: (firstRow: number) => string;
    institutionNotFound: (name: string) => string;
    invalidRole: (value: string) => string;
}> = {
    tr: {
        missingRequired: (field) => `'${field}' alanı zorunludur.`,
        invalidEmail: (email) => `Geçersiz e-posta formatı: '${email}'`,
        turkishChars: (email) => `E-posta adresi Türkçe karakter içeriyor: '${email}'`,
        duplicate: (firstRow) => `Bu kayıt CSV'de tekrar ediyor (ilk görülme: satır ${firstRow}).`,
        institutionNotFound: (name) => `Kurum bulunamadı: '${name}'. Lütfen CSV'yi kontrol edin.`,
        invalidRole: (value) => `Geçersiz rol: '${value}'. Geçerli değerler: MEMBER, MANAGER, OWNER.`,
    },
    en: {
        missingRequired: (field) => `The '${field}' field is required.`,
        invalidEmail: (email) => `Invalid email format: '${email}'`,
        turkishChars: (email) => `Email address contains Turkish characters: '${email}'`,
        duplicate: (firstRow) => `This record is duplicated in the CSV (first seen: row ${firstRow}).`,
        institutionNotFound: (name) => `Institution not found: '${name}'. Please check the CSV.`,
        invalidRole: (value) => `Invalid role: '${value}'. Valid values: MEMBER, MANAGER, OWNER.`,
    },
};

/**
 * Converts row keys to the canonical (TR) form: trim + lowercase + alias.
 * Resolves English headers (`first_name` etc.) to the canonical form.
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
            // For add_to_group the same person may join several groups, so dedupe
            // on the (group, member) pair rather than the member email alone.
            const dedupeKey = actionType === 'add_to_group'
                ? `${(trimmedRow.grup_email || '').toLowerCase()}|${email.toLowerCase()}`
                : email.toLowerCase();
            if (seenEmails.has(dedupeKey)) {
                errors.push({
                    field: 'email',
                    errorType: 'DUPLICATE_IN_CSV',
                    message: msg.duplicate(seenEmails.get(dedupeKey)!),
                });
            } else {
                seenEmails.set(dedupeKey, rowNumber);
            }
        }

        if (actionType === 'add_to_group') {
            const groupEmail = trimmedRow.grup_email;
            if (groupEmail) {
                if (!EMAIL_REGEX.test(groupEmail)) {
                    errors.push({ field: 'grup_email', errorType: 'INVALID_FORMAT', message: msg.invalidEmail(groupEmail) });
                } else if (TURKISH_CHARS.test(groupEmail)) {
                    errors.push({ field: 'grup_email', errorType: 'INVALID_FORMAT', message: msg.turkishChars(groupEmail) });
                }
            }
            // `rol` is optional (empty → MEMBER); validate only when present.
            const role = trimmedRow.rol;
            if (role && !VALID_ROLES.has(role.toLowerCase())) {
                errors.push({ field: 'rol', errorType: 'INVALID_FORMAT', message: msg.invalidRole(role) });
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
