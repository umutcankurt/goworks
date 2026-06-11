/**
 * Language-aware management of Bulk Operations CSV columns
 * (renderer side).
 *
 * Canonical column names are Turkish and never change — the backend CSV parser
 * (`electron/services/csv-analysis.ts`) and the workers rely on these names.
 * CSVs with English headers can also be uploaded; they are resolved to the
 * canonical Turkish key via `canonicalColumn()` / `normalizeRowColumns()`. The UI
 * displays them per language via `localeColumn()`.
 *
 * NOTE: `electron/services/csv-analysis.ts` runs in the Electron main process and
 * therefore cannot import this module; an equivalent of COLUMN_ALIAS / COLUMN_I18N
 * is kept separately there. The two files must be kept in sync.
 * (Same pattern: `signatureTokens.ts` ↔ `template-renderer.ts`.)
 */
import type { BulkActionType } from '../types/admin';

export type SupportedColumnLang = 'tr' | 'en';

/** Canonical (TR) column keys expected by the backend parser + workers. */
export const CANONICAL_COLUMNS: Record<BulkActionType, string[]> = {
  suspend: ['email'],
  delete: ['email'],
  signature_push: ['email', 'ad', 'soyad', 'unvan', 'kurum_adi', 'telefon'],
};

/** Canonical key → column header per language. The `tr` value is always the canonical key itself. */
export const COLUMN_I18N: Record<string, Record<SupportedColumnLang, string>> = {
  email: { tr: 'email', en: 'email' },
  ad: { tr: 'ad', en: 'first_name' },
  soyad: { tr: 'soyad', en: 'last_name' },
  unvan: { tr: 'unvan', en: 'title' },
  kurum_adi: { tr: 'kurum_adi', en: 'institution_name' },
  telefon: { tr: 'telefon', en: 'phone' },
};

/**
 * Alias mapping → canonical (TR) key. English headers: `first_name → ad`, etc.
 */
export const COLUMN_ALIAS: Record<string, string> = {
  first_name: 'ad',
  last_name: 'soyad',
  title: 'unvan',
  institution_name: 'kurum_adi',
  phone: 'telefon',
};

/** Returns the column header for the given canonical key in the active language. */
export function localeColumn(canonical: string, lang: string): string {
  const normalized: SupportedColumnLang = lang === 'en' ? 'en' : 'tr';
  const entry = COLUMN_I18N[canonical];
  if (entry) return entry[normalized];
  // Unknown key (e.g. an unexpected field) → pass through as-is.
  return canonical;
}

/** Converts a CSV header to its canonical key: trim + lowercase + alias. */
export function canonicalColumn(key: string): string {
  const normalized = key.trim().toLowerCase();
  return COLUMN_ALIAS[normalized] ?? normalized;
}

/**
 * Converts all of a row's keys to canonical form: trim + lowercase + alias.
 * On a conflict (both canonical and alias present) the last write wins — this
 * is not a problem in practice because CSV headers must be unique.
 */
export function normalizeRowColumns(row: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    const normalized = key.trim().toLowerCase();
    const canonical = COLUMN_ALIAS[normalized] ?? normalized;
    result[canonical] = value;
  }
  return result;
}

/** Language-localized list of column headers for an action (template/UI display). */
export function localeColumnsForAction(action: BulkActionType, lang: string): string[] {
  return CANONICAL_COLUMNS[action].map(col => localeColumn(col, lang));
}
