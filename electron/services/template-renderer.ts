import sanitizeHtml from 'sanitize-html';

export interface TemplateVariables {
    ad_soyad?: string;
    unvan?: string;
    kurum_adi?: string;
    kurum_adres?: string;
    kurum_telefon?: string;
    telefon?: string;
    eposta?: string;
    [key: string]: string | undefined;
}

/**
 * Token alias map. During render, when a token is looked up and has no value,
 * its aliased token is consulted. English tokens → canonical TR key.
 * The editor (`src/utils/signatureTokens.ts`) writes these tokens when the app
 * language is EN; since workers always fill `variables` with canonical TR keys,
 * a single-hop alias is sufficient. The two files must be kept in sync.
 */
const TOKEN_ALIAS: Record<string, string> = {
    full_name: 'ad_soyad',
    title: 'unvan',
    institution_name: 'kurum_adi',
    institution_address: 'kurum_adres',
    institution_phone: 'kurum_telefon',
    phone: 'telefon',
    email: 'eposta',
};

function resolveVariable(key: string, variables: TemplateVariables): string | undefined {
    const direct = variables[key];
    if (direct !== undefined) return direct;
    const alias = TOKEN_ALIAS[key];
    if (alias) return variables[alias];
    return undefined;
}

const TAG_REGEX = /\{\{(\w+)(?:\|([^}]*))?\}\}/g;

const ALLOWED_MODIFIERS = ['max-width'] as const;

const TURKISH_ADDRESS_ABBR_REGEX = /\s+(Mah\.|Sk\.|Sok\.|Cad\.|Cd\.|Blv\.|No:|Kat:|D:|Apt\.)/gi;

function protectAddressAbbreviations(value: string): string {
    return value.replace(TURKISH_ADDRESS_ABBR_REGEX, ' $1');
}

function parseModifiers(modifierStr: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const part of modifierStr.split(',')) {
        const [key, val] = part.trim().split(':').map((s) => s.trim());
        if ((ALLOWED_MODIFIERS as readonly string[]).includes(key) && val && /^\d+$/.test(val)) {
            result[key] = val;
        }
    }
    return result;
}

function applyModifiers(value: string, modifiers: Record<string, string>): string {
    if (modifiers['max-width']) {
        const processed = protectAddressAbbreviations(value);
        return `<span style="display:inline-block;max-width:${modifiers['max-width']}px;word-wrap:break-word;vertical-align:top">${processed}</span>`;
    }
    return value;
}

const VARIABLE_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
    allowedTags: [],
    allowedAttributes: {},
};

const TEMPLATE_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
    allowedTags: [
        'table', 'tr', 'td', 'th', 'tbody', 'thead',
        'img', 'a', 'br', 'p', 'div', 'span',
        'b', 'i', 'u', 'strong', 'em', 'font', 'hr',
    ],
    allowedAttributes: {
        '*': ['style', 'class', 'align', 'valign', 'width', 'height', 'data-condition'],
        a: ['href', 'target'],
        img: ['src', 'alt', 'width', 'height'],
        font: ['color', 'face', 'size'],
        td: ['colspan', 'rowspan'],
        table: ['cellpadding', 'cellspacing', 'border', 'width'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
};

export function renderTemplate(html: string, variables: TemplateVariables): string {
    const replaced = html.replace(TAG_REGEX, (match, key, modifierStr) => {
        const value = resolveVariable(key, variables);
        if (value === undefined) return match;
        const sanitized = sanitizeHtml(value, VARIABLE_SANITIZE_OPTIONS);
        if (!modifierStr) return sanitized;
        const modifiers = parseModifiers(modifierStr);
        return applyModifiers(sanitized, modifiers);
    });
    const processed = processConditionalBlocks(replaced, variables);
    return cleanTelHrefs(processed);
}

function cleanTelHrefs(html: string): string {
    return html.replace(/href="tel:([^"]*)"/g, (_match, number) => {
        return `href="tel:${number.replace(/\s+/g, '')}"`;
    });
}

/**
 * Processes elements with data-condition="var1,var2":
 * - If ALL listed variables are empty/undefined/whitespace → the element is removed entirely
 * - If at least one variable is filled → the element is kept, the data-condition attribute is removed
 */
export function processConditionalBlocks(html: string, variables: TemplateVariables): string {
    const openTagRegex = /<(\w+)(\s[^>]*?)data-condition="([^"]*)"([^>]*?)>/g;
    let result = html;
    let match: RegExpExecArray | null;

    let safety = 0;
    while ((match = openTagRegex.exec(result)) !== null && safety++ < 200) {
        const fullMatchStart = match.index;
        const tagName = match[1];
        const conditionValue = match[3];
        const openTagEnd = fullMatchStart + match[0].length;

        const keys = conditionValue.split(',').map((k) => k.trim()).filter(Boolean);
        if (keys.length === 0) {
            result = result.slice(0, match.index) +
                match[0].replace(/\s*data-condition="[^"]*"/, '') +
                result.slice(openTagEnd);
            openTagRegex.lastIndex = 0;
            continue;
        }

        const closingIndex = findMatchingCloseTag(result, openTagEnd, tagName);
        if (closingIndex === -1) {
            result = result.slice(0, match.index) +
                match[0].replace(/\s*data-condition="[^"]*"/, '') +
                result.slice(openTagEnd);
            openTagRegex.lastIndex = 0;
            continue;
        }

        const closeTagEnd = closingIndex + `</${tagName}>`.length;
        const allEmpty = keys.every((k) => !(resolveVariable(k, variables) || '').trim());

        if (allEmpty) {
            result = result.slice(0, fullMatchStart) + result.slice(closeTagEnd);
        } else {
            result = result.slice(0, match.index) +
                match[0].replace(/\s*data-condition="[^"]*"/, '') +
                result.slice(openTagEnd);
        }
        openTagRegex.lastIndex = 0;
    }

    return result.replace(/\s*data-condition="[^"]*"/g, '');
}

function findMatchingCloseTag(html: string, startFrom: number, tagName: string): number {
    const openPattern = new RegExp(`<${tagName}[\\s>]`, 'gi');
    const closePattern = new RegExp(`</${tagName}>`, 'gi');

    let depth = 1;
    let pos = startFrom;

    while (depth > 0 && pos < html.length) {
        openPattern.lastIndex = pos;
        closePattern.lastIndex = pos;

        const nextOpen = openPattern.exec(html);
        const nextClose = closePattern.exec(html);

        if (!nextClose) return -1;

        if (nextOpen && nextOpen.index < nextClose.index) {
            depth++;
            pos = nextOpen.index + nextOpen[0].length;
        } else {
            depth--;
            if (depth === 0) return nextClose.index;
            pos = nextClose.index + nextClose[0].length;
        }
    }

    return -1;
}

export function sanitizeTemplateHtml(html: string): string {
    return sanitizeHtml(html, TEMPLATE_SANITIZE_OPTIONS);
}

export function extractTags(html: string): string[] {
    const tags = new Set<string>();
    let match;
    while ((match = TAG_REGEX.exec(html)) !== null) {
        tags.add(match[1]);
    }
    return Array.from(tags);
}

export const AVAILABLE_TAGS = [
    { key: 'ad_soyad', label: 'Ad Soyad', description: 'Kullanıcının tam adı' },
    { key: 'unvan', label: 'Ünvan', description: 'Kullanıcının ünvanı' },
    { key: 'kurum_adi', label: 'Kurum Adı', description: 'Kurum/şube adı' },
    { key: 'kurum_adres', label: 'Kurum Adres', description: 'Kurum adresi (genişlik: {{kurum_adres|max-width:350}})' },
    { key: 'kurum_telefon', label: 'Kurum Telefon', description: 'Kurum telefon numarası' },
    { key: 'telefon', label: 'Telefon', description: 'Telefon numarası' },
    { key: 'eposta', label: 'E-posta', description: 'E-posta adresi' },
] as const;
