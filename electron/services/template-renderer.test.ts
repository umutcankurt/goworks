import { describe, it, expect } from 'vitest';
import { renderTemplate, processConditionalBlocks, AVAILABLE_TAGS } from './template-renderer';

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

