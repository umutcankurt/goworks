/**
 * Toplu İşlemler (Bulk Operations) CSV sütunlarının dile duyarlı yönetimi
 * (renderer tarafı).
 *
 * Kanonik sütun isimleri Türkçe'dir ve hiç değişmez — backend CSV parser
 * (`electron/services/csv-analysis.ts`) ve worker'lar bu isimlere dayanır.
 * İngilizce başlıklı CSV'ler de yüklenebilir; `canonicalColumn()` /
 * `normalizeRowColumns()` ile kanonik Türkçe anahtara çözülür. UI dile göre
 * `localeColumn()` ile gösterilir.
 *
 * NOT: `electron/services/csv-analysis.ts` Electron main process'te çalıştığı
 * için bu modülü import edemez; orada COLUMN_ALIAS / COLUMN_I18N eşdeğeri
 * ayrıca tutulur. İki dosya birlikte güncel tutulmalıdır.
 * (Aynı pattern: `signatureTokens.ts` ↔ `template-renderer.ts`.)
 */
import type { BulkActionType } from '../types/admin';

export type SupportedColumnLang = 'tr' | 'en';

/** Backend parser + worker'ların beklediği kanonik (TR) sütun anahtarları. */
export const CANONICAL_COLUMNS: Record<BulkActionType, string[]> = {
  suspend: ['email'],
  delete: ['email'],
  signature_push: ['email', 'ad', 'soyad', 'unvan', 'kurum_adi', 'telefon'],
};

/** Kanonik anahtar → dile göre sütun başlığı. `tr` değeri daima kanonik anahtarın kendisidir. */
export const COLUMN_I18N: Record<string, Record<SupportedColumnLang, string>> = {
  email: { tr: 'email', en: 'email' },
  ad: { tr: 'ad', en: 'first_name' },
  soyad: { tr: 'soyad', en: 'last_name' },
  unvan: { tr: 'unvan', en: 'title' },
  kurum_adi: { tr: 'kurum_adi', en: 'institution_name' },
  telefon: { tr: 'telefon', en: 'phone' },
};

/**
 * Alias eşlemesi → kanonik (TR) anahtar. İngilizce başlıklar: `first_name → ad`, vb.
 */
export const COLUMN_ALIAS: Record<string, string> = {
  first_name: 'ad',
  last_name: 'soyad',
  title: 'unvan',
  institution_name: 'kurum_adi',
  phone: 'telefon',
};

/** Verilen kanonik anahtar için aktif dile uygun sütun başlığını döner. */
export function localeColumn(canonical: string, lang: string): string {
  const normalized: SupportedColumnLang = lang === 'en' ? 'en' : 'tr';
  const entry = COLUMN_I18N[canonical];
  if (entry) return entry[normalized];
  // Bilinmeyen anahtar (örn. beklenmeyen bir field) → olduğu gibi geç.
  return canonical;
}

/** Bir CSV başlığını kanonik anahtara çevirir: trim + lowercase + alias. */
export function canonicalColumn(key: string): string {
  const normalized = key.trim().toLowerCase();
  return COLUMN_ALIAS[normalized] ?? normalized;
}

/**
 * Bir satırın tüm anahtarlarını kanonik forma çevirir: trim + lowercase + alias.
 * Çakışma durumunda (hem kanonik hem alias varsa) son yazılan kazanır — bu
 * pratikte sorun değil çünkü CSV başlıkları benzersiz olmak zorunda.
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

/** Bir action için dile göre lokalize sütun başlık listesi (template/UI gösterimi). */
export function localeColumnsForAction(action: BulkActionType, lang: string): string[] {
  return CANONICAL_COLUMNS[action].map(col => localeColumn(col, lang));
}
