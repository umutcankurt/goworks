import { describe, it, expect } from 'vitest';
import { renderTemplate, processConditionalBlocks, sanitizeTemplateHtml, AVAILABLE_TAGS } from './template-renderer';

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

