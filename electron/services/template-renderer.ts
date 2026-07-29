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

/**
 * Escapes the two quote characters sanitize-html leaves raw.
 *
 * `sanitizeHtml(value, VARIABLE_SANITIZE_OPTIONS)` strips tags and escapes
 * `& < >` — but NOT `"` or `'`. Every token in a signature template can land
 * inside an attribute value: buildImageEmbed() emits `src="{{image_N}}"`, and
 * cleanTelHrefs() below exists precisely because templates carry
 * `href="tel:{{telefon}}"`. Without this, a directory field a tenant user can
 * edit (their own name, title, phone) closes the attribute and appends new ones
 * to a signature we then push to their mailbox.
 *
 * `'` is escaped as well as `"`: templates are hand-written HTML in a plain
 * textarea, so nothing forces double-quoted attributes. Both escapes are
 * invisible in the delivered signature — sanitizeTemplateHtml() decodes them
 * back in text context and normalises them in attribute context.
 */
function escapeQuotes(value: string): string {
    return value.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// --- Inline-CSS allowlist for sanitizeHtml (defense-in-depth) ---
// Without an explicit `allowedStyles`, sanitize-html lets every inline style
// through unparsed. We instead permit only presentational CSS whose value
// patterns cannot carry an injection (no url(), expression(), or free text —
// only bounded shapes). This list MUST cover every property the app itself
// emits — notably the `display/max-width/word-wrap/vertical-align` span from
// applyModifiers() — otherwise legitimate signature formatting is stripped.
const CSS_COLOR = [
    /^#(0x)?[0-9a-f]{3,8}$/i,
    /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i,
    /^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(?:0|1|0?\.\d+)\s*\)$/i,
    /^hsl\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*\)$/i,
    /^[a-z]+$/i, // named colors (red, transparent, …)
];
const CSS_LEN = [/^-?\d+(?:\.\d+)?(?:px|em|rem|%|pt|vw|vh)?$/i];
const CSS_LEN_POS = [/^\d+(?:\.\d+)?(?:px|em|rem|%|pt|vw|vh)?$/i];
const CSS_SHORTHAND_LEN = [/^(?:-?\d+(?:\.\d+)?(?:px|em|rem|%|pt)?\s*){1,4}$/i];

// Border shorthand: `<width> <style> <color>`, plus the bare `0` / `0px` / `none`
// forms that email HTML uses on images. The colour alternatives mirror CSS_COLOR
// — notably rgb()/rgba(), which the previous pattern omitted, so a perfectly
// ordinary `border-left: 4px solid rgb(...)` was dropped. Values stay bounded
// shapes: no url(), no expression(), no free text.
const CSS_BORDER_COLOR = '#[0-9a-f]{3,8}|rgba?\\([\\d\\s,.%]+\\)|hsla?\\([\\d\\s,.%]+\\)|[a-z]+';
const CSS_BORDER = [
    /^(?:0|none)$/i,
    /^\d+(?:\.\d+)?(?:px|em|rem|pt)$/i,
    new RegExp(
        '^\\d+(?:\\.\\d+)?(?:px|em|rem|pt)?'
        + '\\s+(?:solid|dashed|dotted|double|none|hidden|groove|ridge|inset|outset)'
        + `(?:\\s+(?:${CSS_BORDER_COLOR}))?$`,
        'i',
    ),
];
const CSS_BORDER_WIDTH = [/^(?:0|(?:thin|medium|thick)|\d+(?:\.\d+)?(?:px|em|rem|pt))$/i];
const CSS_BORDER_STYLE = [/^(?:solid|dashed|dotted|double|none|hidden|groove|ridge|inset|outset)$/i];

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
    allowedStyles: {
        '*': {
            color: CSS_COLOR,
            'background-color': CSS_COLOR,
            background: CSS_COLOR,
            'border-color': CSS_COLOR,
            'font-size': [/^\d+(?:\.\d+)?(?:px|em|rem|%|pt)$/i],
            'font-family': [/^[\w\s,"'-]+$/],
            'font-weight': [/^(?:normal|bold|bolder|lighter|[1-9]00)$/i],
            'font-style': [/^(?:normal|italic|oblique)$/i],
            'line-height': [/^\d+(?:\.\d+)?(?:px|em|rem|%)?$/i],
            'letter-spacing': [/^-?\d+(?:\.\d+)?(?:px|em|rem)$/i],
            'text-align': [/^(?:left|right|center|justify)$/i],
            // `solid|double|dotted|dashed|wavy` are all matched by `[a-z]+` as well.
            // Listing both gave every whitespace-separated word two ways to match, so
            // a value like `underline solid solid solid ...` forced 2^n backtracking
            // paths and the regex hung the main process (CodeQL js/redos). Measured
            // before the fix: 24 repeats took 639ms, and each further pair of repeats
            // quadrupled it. Dropping the redundant literals accepts exactly the same
            // set of values — verified against 200k generated inputs — in linear time.
            // Reachable from untrusted input: Gmail signatures fetched via
            // `signatures:get` flow into sanitizeTemplateHtml, so any user could hang
            // the app for the admin viewing their profile.
            'text-decoration': [/^(?:none|underline|overline|line-through)(?:\s+(?:#[0-9a-f]{3,8}|[a-z]+))*$/i],
            'text-transform': [/^(?:none|uppercase|lowercase|capitalize)$/i],
            'white-space': [/^(?:normal|nowrap|pre|pre-wrap|pre-line)$/i],
            'word-wrap': [/^(?:normal|break-word)$/i],
            'word-break': [/^(?:normal|break-all|break-word|keep-all)$/i],
            'vertical-align': [/^(?:baseline|top|middle|bottom|sub|super|text-top|text-bottom)$/i],
            display: [/^(?:inline|inline-block|block|none|table|table-cell|table-row|flex)$/i],
            width: [/^(?:auto|\d+(?:\.\d+)?(?:px|em|rem|%|pt))$/i],
            height: [/^(?:auto|\d+(?:\.\d+)?(?:px|em|rem|%|pt))$/i],
            'max-width': CSS_LEN_POS,
            'min-width': CSS_LEN_POS,
            'max-height': CSS_LEN_POS,
            'min-height': CSS_LEN_POS,
            padding: CSS_SHORTHAND_LEN,
            'padding-top': CSS_LEN,
            'padding-right': CSS_LEN,
            'padding-bottom': CSS_LEN,
            'padding-left': CSS_LEN,
            margin: CSS_SHORTHAND_LEN,
            'margin-top': CSS_LEN,
            'margin-right': CSS_LEN,
            'margin-bottom': CSS_LEN,
            'margin-left': CSS_LEN,
            border: CSS_BORDER,
            // The four sides individually. Their absence silently flattened every
            // signature that used an accent rule — a very common email-HTML idiom,
            // and the one the bundled `logolu` / `cizgili` starters rely on.
            'border-left': CSS_BORDER,
            'border-right': CSS_BORDER,
            'border-top': CSS_BORDER,
            'border-bottom': CSS_BORDER,
            'border-width': CSS_BORDER_WIDTH,
            'border-style': CSS_BORDER_STYLE,
            'border-radius': [/^(?:\d+(?:\.\d+)?(?:px|em|rem|%)?\s*){1,4}$/i],
            'border-collapse': [/^(?:collapse|separate)$/i],
        },
    },
};

export function renderTemplate(html: string, variables: TemplateVariables): string {
    // Conditional blocks are resolved BEFORE substitution, so that a substituted
    // value can never introduce a `data-condition` the engine then honours.
    // Quote escaping already prevents that, but only as an accident of the
    // matching regex requiring literal double quotes — evaluating conditions
    // against the template alone makes it structural instead. It also stops the
    // trailing sweep below from deleting the literal text `data-condition="..."`
    // out of a legitimate value.
    const conditioned = processConditionalBlocks(html, variables);
    const replaced = conditioned.replace(TAG_REGEX, (match, key, modifierStr) => {
        const value = resolveVariable(key, variables);
        if (value === undefined) return match;
        const sanitized = escapeQuotes(sanitizeHtml(value, VARIABLE_SANITIZE_OPTIONS));
        if (!modifierStr) return sanitized;
        const modifiers = parseModifiers(modifierStr);
        return applyModifiers(sanitized, modifiers);
    });
    return cleanTelHrefs(replaced);
}

/**
 * The one signature pipeline: substitute, then re-sanitise.
 *
 * `renderTemplate()` alone is NOT safe to hand to Gmail — it splices directory
 * values into an HTML document, and the save-time allowlist ran before those
 * values existed. Every path that writes a signature to a mailbox, and the audit
 * path that fingerprints what those writes should produce, must go through this
 * function so they cannot drift apart.
 *
 * This is a no-op for well-formed input: templates are stored through
 * sanitizeTemplateHtml() (template-service.ts create/update) and the function is
 * idempotent, so the wrap only ever removes markup a substituted value smuggled
 * in. That property is what keeps signature_state.desired_hash stable across
 * this change, and template-renderer.test.ts locks it.
 */
export function renderSignatureHtml(templateHtml: string, variables: TemplateVariables): string {
    return sanitizeTemplateHtml(renderTemplate(templateHtml, variables));
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
/**
 * Elements with no closing tag — for these the element IS the open tag.
 *
 * findMatchingCloseTag() searches for a literal `</tag>`, which an img/br/hr
 * never has, so it returned -1 and the caller's -1 branch kept the element while
 * stripping its data-condition. The conditional failed open, and invisibly: the
 * attribute was gone, so the output gave no sign the condition was ignored.
 */
const VOID_ELEMENTS = new Set([
    'img', 'br', 'hr', 'input', 'meta', 'link',
    'area', 'base', 'col', 'embed', 'source', 'track', 'wbr',
]);

export function processConditionalBlocks(html: string, variables: TemplateVariables): string {
    const openTagRegex = /<(\w+)(\s[^>]*?)data-condition="([^"]*)"([^>]*?)>/g;
    let result = html;
    let match: RegExpExecArray | null;

    // Every iteration removes exactly one `data-condition`, so the loop is bounded
    // by the count at entry. This is an invariant check, not a truncation limit:
    // the old fixed cap of 200 silently let blocks 201+ through — the trailing
    // sweep stripped their attribute and kept the element, so a template with
    // enough conditionals leaked the very blocks it meant to hide.
    const maxIterations = (result.match(/data-condition="/g) || []).length + 1;
    let iterations = 0;

    while ((match = openTagRegex.exec(result)) !== null) {
        if (++iterations > maxIterations) {
            // Fail closed. This output goes into a real mailbox, so refusing beats
            // sending a half-processed signature. Every caller already has a
            // per-user catch that records the failure.
            throw new Error('processConditionalBlocks: koşullu bloklar çözümlenemedi (şablon bozuk olabilir)');
        }

        const openTag = match[0];
        const fullMatchStart = match.index;
        const tagName = match[1];
        const conditionValue = match[3];
        const openTagEnd = fullMatchStart + openTag.length;

        const keepElement = () => {
            result = result.slice(0, fullMatchStart)
                + openTag.replace(/\s*data-condition="[^"]*"/, '')
                + result.slice(openTagEnd);
            openTagRegex.lastIndex = 0;
        };
        const dropRange = (end: number) => {
            result = result.slice(0, fullMatchStart) + result.slice(end);
            openTagRegex.lastIndex = 0;
        };

        const keys = conditionValue.split(',').map((k) => k.trim()).filter(Boolean);
        if (keys.length === 0) { keepElement(); continue; }

        const allEmpty = keys.every((k) => !(resolveVariable(k, variables) || '').trim());

        if (VOID_ELEMENTS.has(tagName.toLowerCase())) {
            if (allEmpty) dropRange(openTagEnd); else keepElement();
            continue;
        }

        const closingIndex = findMatchingCloseTag(result, openTagEnd, tagName);
        if (closingIndex === -1) {
            // Unbalanced non-void element. Templates are persisted through
            // sanitizeTemplateHtml(), which balances tags, so this is unreachable
            // for stored input — treat it as corruption and fail closed rather
            // than guess at the element's extent.
            throw new Error(`processConditionalBlocks: <${tagName}> için kapanış etiketi bulunamadı`);
        }

        if (allEmpty) dropRange(closingIndex + `</${tagName}>`.length); else keepElement();
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
