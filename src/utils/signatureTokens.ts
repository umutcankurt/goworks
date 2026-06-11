/**
 * Language-aware management of signature template tokens (renderer side).
 *
 * Canonical token names are Turkish and never change — the templates stored in the
 * DB, the workers, and the CSVs rely on these names. English tokens (`{{institution_name}}`
 * etc.) are only written into the editor; at render time they are resolved to the
 * canonical Turkish key via `TOKEN_ALIAS`.
 *
 * NOTE: `electron/services/template-renderer.ts` runs in the Electron main process and
 * therefore cannot import this module; an equivalent of `TOKEN_ALIAS` is kept separately there.
 * The two files must be kept in sync.
 */

export type SupportedTokenLang = 'tr' | 'en';

/** Canonical (TR) token keys used in templates and workers. */
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

/** Canonical key → token string per language. The `tr` value is always the canonical key itself. */
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
 * Returns the token string for the given canonical key in the active language.
 * Every language other than `en` falls back to the canonical (TR) token.
 */
export function localeToken(key: CanonicalTagKey, lang: string): string {
  const normalized: SupportedTokenLang = lang === 'en' ? 'en' : 'tr';
  return TOKEN_I18N[key][normalized];
}

/**
 * Token alias mapping. At render time, if a token's value cannot be found
 * directly in `variables`, its mapped canonical key is looked up instead.
 * English tokens → canonical TR key.
 */
export const TOKEN_ALIAS: Record<string, string> = {
  full_name: 'ad_soyad',
  title: 'unvan',
  institution_name: 'kurum_adi',
  institution_address: 'kurum_adres',
  institution_phone: 'kurum_telefon',
  phone: 'telefon',
  email: 'eposta',
};

/**
 * Resolves a token key's value from `variables`:
 * first directly, then via the alias if not found (single hop).
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
