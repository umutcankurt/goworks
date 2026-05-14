/**
 * İmza şablonu token'larının dile duyarlı yönetimi (renderer tarafı).
 *
 * Kanonik token isimleri Türkçe'dir ve hiç değişmez — DB'deki kayıtlı şablonlar,
 * worker'lar ve CSV bu isimlere dayanır. İngilizce token'lar (`{{institution_name}}`
 * vb.) yalnızca editöre yazılır; render sırasında `TOKEN_ALIAS` üzerinden kanonik
 * Türkçe anahtara çözülür.
 *
 * NOT: `electron/services/template-renderer.ts` Electron main process'te çalıştığı
 * için bu modülü import edemez; orada `TOKEN_ALIAS`'ın eşdeğeri ayrıca tutulur.
 * İki dosya birlikte güncel tutulmalıdır.
 */

export type SupportedTokenLang = 'tr' | 'en';

/** Şablonlarda ve worker'larda kullanılan kanonik (TR) token anahtarları. */
export const CANONICAL_TAG_KEYS = [
  'ad_soyad',
  'unvan',
  'kurum_adi',
  'kurum_adres',
  'kurum_telefon',
  'telefon',
  'eposta',
] as const;

export type CanonicalTagKey = (typeof CANONICAL_TAG_KEYS)[number];

/** Kanonik anahtar → dile göre token string'i. `tr` değeri daima kanonik anahtarın kendisidir. */
export const TOKEN_I18N: Record<CanonicalTagKey, Record<SupportedTokenLang, string>> = {
  ad_soyad: { tr: 'ad_soyad', en: 'full_name' },
  unvan: { tr: 'unvan', en: 'title' },
  kurum_adi: { tr: 'kurum_adi', en: 'institution_name' },
  kurum_adres: { tr: 'kurum_adres', en: 'institution_address' },
  kurum_telefon: { tr: 'kurum_telefon', en: 'institution_phone' },
  telefon: { tr: 'telefon', en: 'phone' },
  eposta: { tr: 'eposta', en: 'email' },
};

/**
 * Verilen kanonik anahtar için aktif dile uygun token string'ini döner.
 * `en` dışındaki her dil kanonik (TR) token'a düşer.
 */
export function localeToken(key: CanonicalTagKey, lang: string): string {
  const normalized: SupportedTokenLang = lang === 'en' ? 'en' : 'tr';
  return TOKEN_I18N[key][normalized];
}

/**
 * Token alias eşlemesi. Render sırasında bir token'ın karşılığı `variables`
 * içinde doğrudan bulunamazsa eşlenik kanonik anahtara bakılır.
 * - `kampus_* ↔ kurum_*`: Faz 22 yeniden adlandırması (bidirectional)
 * - `full_name → ad_soyad` vb.: İngilizce token'lar → kanonik TR anahtar
 */
export const TOKEN_ALIAS: Record<string, string> = {
  // Kampüs → Kurum (bidirectional — Faz 22)
  kampus_adi: 'kurum_adi',
  kampus_adres: 'kurum_adres',
  kampus_telefon: 'kurum_telefon',
  kurum_adi: 'kampus_adi',
  kurum_adres: 'kampus_adres',
  kurum_telefon: 'kampus_telefon',
  // İngilizce token → kanonik TR anahtar
  full_name: 'ad_soyad',
  title: 'unvan',
  institution_name: 'kurum_adi',
  institution_address: 'kurum_adres',
  institution_phone: 'kurum_telefon',
  phone: 'telefon',
  email: 'eposta',
};

/**
 * Bir token anahtarının değerini `variables` içinden çözer:
 * önce doğrudan, bulunamazsa alias üzerinden (tek hop).
 */
export function resolveVariable(
  key: string,
  variables: Record<string, string | undefined>,
): string | undefined {
  const direct = variables[key];
  if (direct !== undefined) return direct;
  const alias = TOKEN_ALIAS[key];
  if (alias) return variables[alias];
  return undefined;
}
