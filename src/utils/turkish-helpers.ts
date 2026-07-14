const TURKISH_CHAR_MAP: Record<string, string> = {
    '\u00e7': 'c', '\u00c7': 'C',
    '\u011f': 'g', '\u011e': 'G',
    '\u0131': 'i', '\u0130': 'I',
    '\u00f6': 'o', '\u00d6': 'O',
    '\u015f': 's', '\u015e': 'S',
    '\u00fc': 'u', '\u00dc': 'U',
};

export function capitalizeWords(value: string): string {
    return value
        .split(' ')
        .map((word) =>
            word.length === 0
                ? ''
                : word.charAt(0).toLocaleUpperCase('tr-TR') + word.slice(1).toLocaleLowerCase('tr-TR')
        )
        .join(' ');
}

export function toUpperCaseTr(value: string): string {
    return value.toLocaleUpperCase('tr-TR');
}

export function turkishToAscii(str: string): string {
    return str.replace(/./g, (ch) => TURKISH_CHAR_MAP[ch] || ch);
}

export function generateUsername(givenName: string, familyName: string): string {
    const given = turkishToAscii(givenName.toLocaleLowerCase('tr-TR')).trim().replace(/\s+/g, '.');
    const family = turkishToAscii(familyName.toLocaleLowerCase('tr-TR')).trim().replace(/\s+/g, '.');
    if (!given && !family) return '';
    if (!given) return family;
    if (!family) return given;
    return `${given}.${family}`;
}

/**
 * A number written in international form for a country other than Turkey.
 * The Turkish mask below would mangle it (+1 555 010 0101 → "90 155 501 00 10"),
 * so it is left exactly as the user wrote it — including while they are still
 * typing, which is why the raw string is returned rather than a normalised one.
 *
 * A leading "+90" still gets the Turkish mask, so typing "+90 532…" snaps back
 * into the domestic format as soon as the country code is complete.
 */
function passthroughForeignNumber(raw: string): string | null {
    if (!raw?.trimStart().startsWith('+')) return null;
    if (raw.replace(/\D/g, '').startsWith('90')) return null; // Turkish — apply the mask
    return raw;
}

export function formatPhoneNumber(raw: string): string {
    const foreign = passthroughForeignNumber(raw);
    if (foreign) return foreign;

    let digits = raw.replace(/\D/g, '');

    // Auto-correct prefixes
    if (digits.startsWith('0')) {
        digits = '90' + digits.slice(1);
    } else if (digits.length > 0 && !digits.startsWith('9')) {
        digits = '90' + digits;
    }

    // Limit to 12 digits
    digits = digits.slice(0, 12);

    // Apply mask: XX XXX XXX XX XX
    let formatted = '';
    if (digits.length > 0) formatted += digits.slice(0, 2);
    if (digits.length > 2) formatted += ' ' + digits.slice(2, 5);
    if (digits.length > 5) formatted += ' ' + digits.slice(5, 8);
    if (digits.length > 8) formatted += ' ' + digits.slice(8, 10);
    if (digits.length > 10) formatted += ' ' + digits.slice(10, 12);

    return formatted;
}

export function phoneToE164(formatted: string): string {
    // Strip everything but the digits, so an already-international "+1 555 …"
    // does not come back as "++1555…".
    const digits = (formatted ?? '').replace(/[^0-9]/g, '');
    return digits ? `+${digits}` : '';
}

export function e164ToDisplay(e164: string): string {
    // Passed through with its "+" so a foreign number can be recognised as such.
    return formatPhoneNumber(e164 ?? '');
}

export function formatPhoneForSignature(raw: string): string {
    if (!raw) return '';

    const foreign = passthroughForeignNumber(raw);
    if (foreign) return foreign;

    let digits = raw.replace(/\D/g, '');
    if (digits.startsWith('0')) {
        digits = '90' + digits.slice(1);
    } else if (digits.length > 0 && !digits.startsWith('9')) {
        digits = '90' + digits;
    }
    digits = digits.slice(0, 12);
    if (digits.length < 4) return digits;
    // 90XXXXXXXXXX → 0XXXXXXXXXX
    const domestic = '0' + digits.slice(2);
    // Mask: 0XXX XXX XX XX
    let formatted = domestic.slice(0, 4);
    if (domestic.length > 4) formatted += ' ' + domestic.slice(4, 7);
    if (domestic.length > 7) formatted += ' ' + domestic.slice(7, 9);
    if (domestic.length > 9) formatted += ' ' + domestic.slice(9, 11);
    return formatted;
}
