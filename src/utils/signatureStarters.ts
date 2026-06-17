/**
 * Ready-made signature starter templates for the "new template" gallery.
 *
 * They solve the empty-textarea problem: a non-technical user picks a layout
 * instead of writing a `<table>` from scratch. Tokens are emitted in the active
 * editor language (via `localeToken`), exactly like `insertTag` in the editor.
 * Brand placeholders are intentionally generic ("ABC Firma") — never a real
 * customer name.
 */
import { localeToken, type CanonicalTagKey } from './signatureTokens';

export type SignatureStarterId = 'logolu' | 'logosuz' | 'cizgili';

export interface SignatureStarter {
  /** Stable id; also the i18n key under `starters.*`. */
  id: SignatureStarterId;
  /** Builds the HTML with language-aware tokens. */
  build: (lang: string) => string;
}

/** `{{token}}` in the active language. */
const tk = (key: CanonicalTagKey, lang: string) => `{{${localeToken(key, lang)}}}`;
/** `{{token|max-width:px}}` in the active language. */
const tkMax = (key: CanonicalTagKey, lang: string, px: number) => `{{${localeToken(key, lang)}|max-width:${px}}}`;
/** Raw token name for a `data-condition` attribute. */
const cond = (key: CanonicalTagKey, lang: string) => localeToken(key, lang);

export const SIGNATURE_STARTERS: SignatureStarter[] = [
  {
    id: 'logolu',
    build: (lang) => `<table style="font-family:Arial,sans-serif;font-size:13px;color:#333333;">
  <tr>
    <td style="padding-right:12px;border-right:2px solid #0066cc;">
      <img src="LOGO_URL" width="80" height="80" alt="ABC Firma" />
    </td>
    <td style="padding-left:12px;">
      <strong>${tk('ad_soyad', lang)}</strong><br/>
      <span data-condition="${cond('unvan', lang)}" style="color:#555555;">${tk('unvan', lang)}<br/></span>
      ${tk('kurum_adi', lang)}<br/>
      <span data-condition="${cond('telefon', lang)}">${tk('telefon', lang)}<br/></span>
      ${tk('eposta', lang)}
    </td>
  </tr>
</table>`,
  },
  {
    id: 'logosuz',
    build: (lang) => `<table style="font-family:Arial,sans-serif;font-size:13px;color:#333333;">
  <tr>
    <td>
      <strong style="font-size:15px;">${tk('ad_soyad', lang)}</strong><br/>
      <span data-condition="${cond('unvan', lang)}" style="color:#555555;">${tk('unvan', lang)}<br/></span>
      <strong>${tk('kurum_adi', lang)}</strong><br/>
      <span data-condition="${cond('telefon', lang)}">${tk('telefon', lang)}<br/></span>
      ${tk('eposta', lang)}<br/>
      <span data-condition="${cond('kurum_adres', lang)}" style="color:#888888;font-size:11px;">${tkMax('kurum_adres', lang, 350)}</span>
    </td>
  </tr>
</table>`,
  },
  {
    id: 'cizgili',
    build: (lang) => `<table style="font-family:Arial,sans-serif;font-size:13px;color:#333333;">
  <tr>
    <td style="padding-left:12px;border-left:3px solid #0066cc;">
      <strong style="color:#0066cc;font-size:15px;">${tk('ad_soyad', lang)}</strong><br/>
      <span data-condition="${cond('unvan', lang)}" style="color:#555555;">${tk('unvan', lang)} — </span>${tk('kurum_adi', lang)}<br/>
      <span data-condition="${cond('telefon', lang)}">${tk('telefon', lang)} · </span>${tk('eposta', lang)}
    </td>
  </tr>
</table>`,
  },
];
