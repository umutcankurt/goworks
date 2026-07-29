import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { renderTemplate, renderSignatureHtml, processConditionalBlocks, sanitizeTemplateHtml, AVAILABLE_TAGS } from './template-renderer';

describe('renderTemplate — Kurum token rendering', () => {
    it('renders {{kurum_*}} tokens from kurum_* variables', () => {
        const html = renderTemplate(
            '{{kurum_adi}} - {{kurum_adres}} ({{kurum_telefon}})',
            { kurum_adi: 'X', kurum_adres: 'Y', kurum_telefon: '0212' },
        );
        expect(html).toBe('X - Y (0212)');
    });

    it('leaves unknown tokens intact (no value, no alias)', () => {
        const html = renderTemplate('{{kurum_telefon}}', {});
        expect(html).toBe('{{kurum_telefon}}');
    });

    it('AVAILABLE_TAGS uses canonical kurum_* keys', () => {
        const keys = AVAILABLE_TAGS.map((t) => t.key);
        expect(keys).toContain('kurum_adi');
        expect(keys).toContain('kurum_adres');
        expect(keys).toContain('kurum_telefon');
    });
});

describe('renderTemplate — İngilizce token aliasing (dile duyarlı editör)', () => {
    it('resolves English tokens from canonical TR variables', () => {
        const html = renderTemplate(
            '{{full_name}} / {{title}} / {{institution_name}} / {{institution_address}} / {{institution_phone}} / {{phone}} / {{email}}',
            {
                ad_soyad: 'Ada',
                unvan: 'Müdür',
                kurum_adi: 'Merkez',
                kurum_adres: 'İstanbul',
                kurum_telefon: '0212',
                telefon: '0555',
                eposta: 'ada@x.com',
            },
        );
        expect(html).toBe('Ada / Müdür / Merkez / İstanbul / 0212 / 0555 / ada@x.com');
    });

    it('renders a template that mixes TR and EN tokens', () => {
        const html = renderTemplate(
            '{{ad_soyad}} — {{institution_name}}',
            { ad_soyad: 'Ada', kurum_adi: 'Merkez' },
        );
        expect(html).toBe('Ada — Merkez');
    });

    it('applies modifiers on English tokens', () => {
        const html = renderTemplate(
            '{{institution_address|max-width:350}}',
            { kurum_adres: 'Istanbul Office' },
        );
        expect(html).toContain('max-width:350px');
        expect(html).toContain('Istanbul Office');
    });
});

describe('renderTemplate — image tokens (signature media)', () => {
    it('resolves {{image_N}} inside an img src to the CDN url', () => {
        const html = renderTemplate(
            '<img src="{{image_1}}" width="90" height="90" />',
            { image_1: 'https://lh3.googleusercontent.com/d/ABC123' },
        );
        expect(html).toContain('src="https://lh3.googleusercontent.com/d/ABC123"');
    });

    it('keeps the lh3 url intact — no query string means no &amp; corruption', () => {
        const url = 'https://lh3.googleusercontent.com/d/ABC123';
        const html = renderTemplate('<img src="{{image_1}}" />', { image_1: url });
        expect(html).toContain(url);
        expect(html).not.toContain('&amp;');
    });

    it('still renders legacy uc?export=view urls (backward compatible)', () => {
        const html = renderTemplate(
            '<img src="{{image_1}}" />',
            { image_1: 'https://drive.google.com/uc?export=view&id=ABC123' },
        );
        expect(html).toContain('uc?export=view');
        expect(html).toContain('id=ABC123');
    });

    it('supports multiple distinct image tokens', () => {
        const html = renderTemplate(
            '<img src="{{image_1}}" /><img src="{{image_2}}" />',
            { image_1: 'https://lh3.googleusercontent.com/d/AAA', image_2: 'https://lh3.googleusercontent.com/d/BBB' },
        );
        expect(html).toContain('https://lh3.googleusercontent.com/d/AAA');
        expect(html).toContain('https://lh3.googleusercontent.com/d/BBB');
    });
});

describe('processConditionalBlocks — İngilizce token alias farkındalığı', () => {
    it('removes element when English condition token resolves to an empty value', () => {
        const out = processConditionalBlocks('<span data-condition="phone">x</span>', { telefon: '' });
        expect(out).toBe('');
    });

    it('keeps element when English condition token resolves to a non-empty value', () => {
        const out = processConditionalBlocks('<span data-condition="phone">x</span>', { telefon: '0555' });
        expect(out).toContain('x');
    });
});

describe('sanitizeTemplateHtml — allowedStyles regresyon kilidi (rich signature formatting)', () => {
    // These lock the sanitize-html upgrade so legitimate inline CSS survives.
    it('preserves the applyModifiers span styles (display/max-width/word-wrap/vertical-align)', () => {
        const out = sanitizeTemplateHtml(
            '<span style="display:inline-block;max-width:350px;word-wrap:break-word;vertical-align:top">Addr</span>',
        );
        expect(out).toContain('display:inline-block');
        expect(out).toContain('max-width:350px');
        expect(out).toContain('word-wrap:break-word');
        expect(out).toContain('vertical-align:top');
    });

    it('preserves colors (hex, rgb, named) and typography', () => {
        const out = sanitizeTemplateHtml(
            '<span style="color:#1a73e8;background-color:rgb(255,255,255);font-size:14px;font-family:Arial, sans-serif;font-weight:bold;font-style:italic;text-align:center;text-decoration:underline;line-height:1.4">Name</span>',
        );
        expect(out).toContain('color:#1a73e8');
        expect(out).toContain('background-color:rgb(255,255,255)');
        expect(out).toContain('font-size:14px');
        expect(out).toContain('font-family:Arial, sans-serif');
        expect(out).toContain('font-weight:bold');
        expect(out).toContain('font-style:italic');
        expect(out).toContain('text-align:center');
        expect(out).toContain('text-decoration:underline');
        expect(out).toContain('line-height:1.4');
    });

    it('keeps every text-decoration shorthand the allowlist accepted before', () => {
        // The ReDoS fix dropped `solid|double|dotted|dashed|wavy` from the alternation
        // because `[a-z]+` already matches them. These must still survive.
        for (const value of [
            'none', 'underline', 'overline', 'line-through',
            'underline solid', 'underline wavy', 'underline dotted red',
            'line-through double green', 'overline solid #abc', 'underline #123456ff',
        ]) {
            const out = sanitizeTemplateHtml(`<span style="text-decoration:${value}">x</span>`);
            expect(out, `text-decoration:${value} was dropped`).toContain(`text-decoration:${value}`);
        }
    });

    it('does not backtrack exponentially on a crafted text-decoration value', () => {
        // Before the fix each repeated word had two ways to match, so this input
        // took 639ms at 24 repeats and quadrupled every further pair. Reachable from
        // a user's own Gmail signature via signatures:get, which would hang the main
        // process for the admin viewing them. 30 repeats used to run for ~40s.
        const hostile = `underline${' solid'.repeat(30)}!`;
        const started = Date.now();
        sanitizeTemplateHtml(`<span style="text-decoration:${hostile}">x</span>`);
        expect(Date.now() - started).toBeLessThan(1000);
    });

    it('preserves box model + border styles used in table signatures', () => {
        const out = sanitizeTemplateHtml(
            '<td style="padding:8px 12px;margin:0;width:120px;height:40px;border:1px solid #cccccc;vertical-align:middle">x</td>',
        );
        expect(out).toContain('padding:8px 12px');
        expect(out).toContain('width:120px');
        expect(out).toContain('border:1px solid #cccccc');
        expect(out).toContain('vertical-align:middle');
    });

    it('keeps rich tags + attributes (table, font color/size, links, images)', () => {
        const out = sanitizeTemplateHtml(
            '<table cellpadding="0"><tr><td><font color="#333333" size="3">A</font></td></tr></table>' +
            '<a href="https://example.com" target="_blank">site</a>' +
            '<img src="https://lh3.googleusercontent.com/d/ABC" width="90" />',
        );
        expect(out).toContain('<table');
        expect(out).toContain('<font');
        expect(out).toContain('color="#333333"');
        expect(out).toContain('href="https://example.com"');
        expect(out).toContain('src="https://lh3.googleusercontent.com/d/ABC"');
    });

    it('strips dangerous CSS (expression/url-javascript/position-fixed)', () => {
        const out = sanitizeTemplateHtml(
            '<span style="width:expression(alert(1));background:url(javascript:alert(1));position:fixed;color:#000000">x</span>',
        );
        expect(out).not.toContain('expression');
        expect(out).not.toContain('javascript');
        expect(out).not.toContain('position');
        // …while a legit property alongside them still survives
        expect(out).toContain('color:#000000');
    });

    it('strips script/iframe/xmp tags and javascript: hrefs', () => {
        const out = sanitizeTemplateHtml(
            '<script>alert(1)</script><iframe src="https://evil"></iframe>' +
            '<xmp><img src=x onerror=alert(1)></xmp>' +
            '<a href="javascript:alert(1)">bad</a>',
        );
        expect(out).not.toContain('<script');
        expect(out).not.toContain('<iframe');
        expect(out).not.toContain('<xmp');
        expect(out).not.toContain('javascript:');
    });
});


/**
 * Attribute names actually present on the first matching element.
 *
 * Injection tests must assert on the PARSED document, not on the raw string:
 * once a quote is escaped the payload text still appears inside the attribute
 * value (as inert data), so a substring check would give a false failure. What
 * matters is whether the browser sees a new attribute.
 */
function attrsOf(html: string, selector: string): string[] {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const el = doc.querySelector(selector);
    return el ? Array.from(el.attributes).map((a) => a.name) : [];
}

describe('renderTemplate — attribute breakout (RC-2 güvenlik kilidi)', () => {
    it('a value cannot add an attribute to an img the template declared', () => {
        const out = renderSignatureHtml(
            '<img src="{{image_1}}" alt="logo" />',
            { image_1: 'https://cdn.example/l.png" onerror="alert(1)' },
        );
        expect(attrsOf(out, 'img')).toEqual(['src', 'alt']);
        expect(out).toContain('alt="logo"');
    });

    it('a value cannot break out of a single-quoted template attribute', () => {
        const out = renderTemplate("<span title='{{unvan}}'>T</span>", { unvan: "x' onmouseover='alert(1)" });
        expect(attrsOf(out, 'span')).toEqual(['title']);
        expect(out).toContain('T');
    });

    it('a value cannot add an event handler to an anchor', () => {
        const out = renderSignatureHtml(
            '<a href="mailto:{{eposta}}">mail</a>',
            { eposta: 'a@b.com" onclick="steal()' },
        );
        expect(attrsOf(out, 'a')).toEqual(['href']);
        expect(out).toContain('mail');
    });

    it('leaves a quote in element content visually intact after the full pipeline', () => {
        expect(renderSignatureHtml('<span>{{unvan}}</span>', { unvan: 'A"B' })).toBe('<span>A"B</span>');
    });

    it('renders Turkish apostrophes with no visible entity artefact', () => {
        expect(renderSignatureHtml('<span>{{ad_soyad}}</span>', { ad_soyad: "O'Brien" }))
            .toBe("<span>O'Brien</span>");
        expect(renderSignatureHtml('<span>{{kurum_adi}}</span>', { kurum_adi: "Atatürk'ün Okulu" }))
            .toBe("<span>Atatürk'ün Okulu</span>");
    });

    it('still escapes ampersands and strips tags from values', () => {
        expect(renderTemplate('<span>{{kurum_adi}}</span>', { kurum_adi: 'A & B' })).toBe('<span>A &amp; B</span>');
        expect(renderTemplate('<span>{{unvan}}</span>', { unvan: 'M<script>x</script>' })).not.toContain('<script');
    });
});

describe('renderSignatureHtml — Gmail çıktısı her zaman sanitize edilir', () => {
    it('is idempotent — re-running the sanitizer changes nothing', () => {
        const once = renderSignatureHtml('<span>{{ad_soyad}}</span>', { ad_soyad: 'Ada' });
        expect(sanitizeTemplateHtml(once)).toBe(once);
    });
});

describe('renderTemplate — data-condition kaçakçılığı (RC-2)', () => {
    it('a substituted value cannot delete an element via a smuggled data-condition', () => {
        const out = renderTemplate(
            '<div><span title="{{unvan}}">T</span><b data-condition="eposta">KEEP</b></div>',
            { unvan: 'x" data-condition="telefon', telefon: '', eposta: 'a@b.com' },
        );
        const doc = new DOMParser().parseFromString(out, 'text/html');
        // No element ends up carrying the attribute — the payload is inert text
        // inside title="...".
        expect(doc.querySelectorAll('[data-condition]').length).toBe(0);
        expect(attrsOf(out, 'span')).toEqual(['title']);
        expect(out).toContain('T');
        expect(out).toContain('KEEP');
    });

    it('the same payload is inert through the max-width modifier path', () => {
        const out = renderTemplate(
            '<div><span>{{kurum_adres|max-width:350}}</span><b data-condition="eposta">KEEP</b></div>',
            { kurum_adres: 'A" data-condition="telefon', telefon: '', eposta: 'a@b.com' },
        );
        const doc = new DOMParser().parseFromString(out, 'text/html');
        expect(doc.querySelectorAll('[data-condition]').length).toBe(0);
        expect(out).toContain('max-width:350px');
        expect(out).toContain('KEEP');
    });

    it('conditions are evaluated before substitution, so a value is never scanned', () => {
        // The value carries a well-formed data-condition and its variable is empty.
        // Ordering alone must make it inert, independent of quote escaping.
        const out = renderTemplate('<div><span>{{unvan}}</span></div>', {
            unvan: '<span data-condition="telefon">GHOST</span>',
            telefon: '',
        });
        expect(out).toContain('GHOST');
    });
});

describe('renderTemplate — media token önceliği (F-7b)', () => {
    it('template media wins over a caller-supplied image token', () => {
        // Mirrors the push-path spread order: buildMediaTokenVars(...) comes last.
        const callerVars = { image_1: 'https://evil.example/track.gif', ad_soyad: 'A' };
        const media = { image_1: 'https://lh3.googleusercontent.com/d/REAL' };
        const html = renderTemplate('<img src="{{image_1}}" />', { ...callerVars, ...media });
        expect(html).toContain('lh3.googleusercontent.com/d/REAL');
        expect(html).not.toContain('evil.example');
    });
});

describe('renderSignatureHtml — hash kararlılığı kilidi (signature_state uyumu)', () => {
    // signature-audit-service.computeDesired() fingerprints this function's output
    // and compares it against signature_state.desired_hash rows written by earlier
    // versions. This pin was captured from the pre-quote-escaping pipeline and
    // verified byte-identical across 10 value sets (apostrophes, ampersands,
    // embedded quotes, empty conditionals). If it moves, every already-audited
    // user silently flips to drift/data_changed — change it only deliberately,
    // and only alongside a plan for the existing rows.
    const TEMPLATE = sanitizeTemplateHtml(
        '<table style="font-family:Arial,sans-serif;font-size:13px;">'
        + '<tr><td style="padding-left:12px;">'
        + '<img src="{{image_1}}" width="80" height="80" alt="ABC" />'
        + '<strong>{{ad_soyad}}</strong><br />'
        + '<span data-condition="unvan" style="color:#555555;">{{unvan}}<br /></span>'
        + '{{kurum_adi}}<br /><a href="tel:{{telefon}}">{{telefon}}</a><br />'
        + '<span data-condition="kurum_adres">{{kurum_adres|max-width:350}}</span>'
        + '</td></tr></table>',
    );
    const VARS = {
        ad_soyad: 'Ayşe Yılmaz',
        unvan: 'Müdür',
        kurum_adi: 'Merkez Kurum',
        kurum_adres: 'Cumhuriyet Mah. Atatürk Cad. No:12 Kat:3',
        telefon: '0212 555 00 00',
        eposta: 'a@b.com',
        image_1: 'https://lh3.googleusercontent.com/d/ABC123',
    };

    it('produces the pinned signature bytes for a representative template', () => {
        const hash = createHash('sha256').update(renderSignatureHtml(TEMPLATE, VARS)).digest('hex');
        expect(hash).toBe('67431e67deb175a7843717c1d2c55af87ad1438b5a3be413d267876e983c4044');
    });

    it('sanitizeTemplateHtml is idempotent (the property the no-op rests on)', () => {
        const once = sanitizeTemplateHtml(TEMPLATE);
        expect(sanitizeTemplateHtml(once)).toBe(once);
    });

    it('template-service stores templates sanitize-stable (the other property)', () => {
        const stored = sanitizeTemplateHtml('<table><tr><td><br /><span>{{ad_soyad}}</span></td></tr></table>');
        expect(sanitizeTemplateHtml(stored)).toBe(stored);
    });
});

describe('processConditionalBlocks — void elementler (HR-4)', () => {
    it('removes a void element whose condition is empty', () => {
        expect(processConditionalBlocks('<img data-condition="telefon" src="http://x" />', { telefon: '' })).toBe('');
        expect(processConditionalBlocks('<br data-condition="telefon" />', { telefon: '' })).toBe('');
        expect(processConditionalBlocks('<hr data-condition="telefon" />', { telefon: '' })).toBe('');
    });

    it('keeps a void element on a filled condition and drops only the attribute', () => {
        const out = processConditionalBlocks('<img data-condition="telefon" src="http://x" />', { telefon: '0555' });
        expect(out).toContain('src="http://x"');
        expect(out).not.toContain('data-condition');
    });

    it('does not disturb a sibling non-void conditional', () => {
        const out = processConditionalBlocks(
            '<img data-condition="telefon" src="http://x" /><span data-condition="eposta">KEEP</span>',
            { telefon: '', eposta: 'a@b.com' },
        );
        expect(out).toBe('<span>KEEP</span>');
    });
});

describe('processConditionalBlocks — güvenlik sınırı fail-closed (HR-5)', () => {
    it('processes far more than the old 200-block cap without leaking', () => {
        const html = Array.from({ length: 400 }, (_, i) => `<span data-condition="telefon">L${i}</span>`).join('');
        expect(processConditionalBlocks(html, { telefon: '' })).toBe('');
    });

    it('keeps all 400 when the condition is filled', () => {
        const html = Array.from({ length: 400 }, (_, i) => `<span data-condition="telefon">L${i}</span>`).join('');
        const out = processConditionalBlocks(html, { telefon: '0555' });
        expect(out).toContain('L0');
        expect(out).toContain('L399');
        expect(out).not.toContain('data-condition');
    });

    it('throws rather than emitting a half-processed signature for an unbalanced element', () => {
        expect(() => processConditionalBlocks('<div data-condition="telefon">no close', { telefon: 'x' })).toThrow();
    });
});

describe('sanitizeTemplateHtml — border stilleri (C10 regresyon kilidi)', () => {
    it('preserves an accent rule with an rgb() colour', () => {
        // The exact idiom that was being flattened: a left accent bar on the
        // outer table. rgb() was rejected by the old colour alternation.
        const out = sanitizeTemplateHtml(
            '<table style="border-left: 4px solid rgb(192,152,105); padding-left: 12px;"><tr><td>x</td></tr></table>',
        );
        expect(out).toContain('border-left:4px solid rgb(192,152,105)');
        expect(out).toContain('padding-left:12px');
    });

    it('preserves horizontal separator rules with a hex colour', () => {
        const out = sanitizeTemplateHtml('<div style="border-top: 1px solid #dddddd">&nbsp;</div>');
        expect(out).toContain('border-top:1px solid #dddddd');
    });

    it('preserves the bare border:0 form used on signature images', () => {
        const out = sanitizeTemplateHtml('<img src="https://x/a.png" style="display:block;border:0px" />');
        expect(out).toContain('border:0px');
        expect(out).toContain('display:block');
    });

    it('preserves all four sides and the longhand width/style', () => {
        const out = sanitizeTemplateHtml(
            '<td style="border-right:2px dashed navy;border-bottom:1px solid #000;border-width:thin;border-style:dotted">x</td>',
        );
        expect(out).toContain('border-right:2px dashed navy');
        expect(out).toContain('border-bottom:1px solid #000');
        expect(out).toContain('border-width:thin');
        expect(out).toContain('border-style:dotted');
    });

    it('still rejects an injection dressed as a border value', () => {
        const out = sanitizeTemplateHtml(
            '<div style="border-left:url(javascript:alert(1));border-top:expression(alert(1));color:#000000">x</div>',
        );
        expect(out).not.toContain('javascript');
        expect(out).not.toContain('expression');
        expect(out).not.toContain('url(');
        // …while a legitimate neighbour still renders
        expect(out).toContain('color:#000000');
    });
});

describe('renderPreview modları — raw ile template aynı şey DEĞİL (F-14 HR-1)', () => {
    // The templates:renderPreview channel exposes both push modes. Collapsing them
    // is tempting and wrong: sanitizeTemplateHtml allowlists data-condition, so a
    // raw push delivers conditional blocks to the mailbox, while a template render
    // with no variables deletes every one of them. Previewing an already-rendered
    // Gmail signature through the template path would silently drop content.
    const gmailSignature =
        '<div>Ayşe Yılmaz</div><div data-condition="telefon">0212 555 00 00</div>';

    it('raw mode (Mode 1) preserves data-condition blocks', () => {
        const out = sanitizeTemplateHtml(gmailSignature);
        expect(out).toContain('0212 555 00 00');
        expect(out).toContain('data-condition');
    });

    it('template mode with empty variables strips them', () => {
        const out = renderSignatureHtml(gmailSignature, {});
        expect(out).not.toContain('0212 555 00 00');
    });

    it('raw mode is a fixed point — previewing twice cannot drift', () => {
        // The preview re-renders on every keystroke; a non-idempotent raw path
        // would mutate the buffer under the user as they type.
        const once = sanitizeTemplateHtml(gmailSignature);
        expect(sanitizeTemplateHtml(once)).toBe(once);
    });

    it('raw mode does not substitute tokens', () => {
        // Mode 1 pushes the buffer verbatim, so the preview must show the token
        // exactly as it will land in the mailbox.
        const out = sanitizeTemplateHtml('<div>{{ad_soyad}}</div>');
        expect(out).toContain('{{ad_soyad}}');
    });
});

describe('renderPreview — çağıran değişkenleri medya tokenını ezemez', () => {
    it('template media wins over a caller-supplied image token', () => {
        // The handler spreads media LAST. This is what keeps a renderer-supplied
        // image_1 out of an <img src> that reaches a real mailbox.
        const caller = { image_1: 'https://attacker.example/evil.png' };
        const media = { image_1: 'https://lh3.googleusercontent.com/legit' };
        const out = renderSignatureHtml('<img src="{{image_1}}">', { ...caller, ...media });
        expect(out).toContain('lh3.googleusercontent.com/legit');
        expect(out).not.toContain('attacker.example');
    });
});
