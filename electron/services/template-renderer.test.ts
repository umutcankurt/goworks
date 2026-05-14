import { describe, it, expect } from 'vitest';
import { renderTemplate, processConditionalBlocks, AVAILABLE_TAGS } from './template-renderer';

describe('renderTemplate — Kurum/Kampüs token aliasing', () => {
    it('renders new {{kurum_*}} tokens from kurum_* variables', () => {
        const html = renderTemplate(
            '{{kurum_adi}} - {{kurum_adres}} ({{kurum_telefon}})',
            { kurum_adi: 'X', kurum_adres: 'Y', kurum_telefon: '0212' },
        );
        expect(html).toBe('X - Y (0212)');
    });

    it('falls back to kurum_* when template uses old {{kampus_*}} tokens (defansif)', () => {
        const html = renderTemplate(
            '{{kampus_adi}} - {{kampus_adres}} ({{kampus_telefon}})',
            { kurum_adi: 'X', kurum_adres: 'Y', kurum_telefon: '0212' },
        );
        expect(html).toBe('X - Y (0212)');
    });

    it('falls back to kampus_* when template uses new {{kurum_*}} but variables only have legacy keys', () => {
        const html = renderTemplate(
            '{{kurum_adi}} - {{kurum_adres}}',
            { kampus_adi: 'A', kampus_adres: 'B' },
        );
        expect(html).toBe('A - B');
    });

    it('leaves unknown tokens intact (no value, no alias)', () => {
        const html = renderTemplate('{{kurum_telefon}}', {});
        expect(html).toBe('{{kurum_telefon}}');
    });

    it('AVAILABLE_TAGS uses new kurum_* keys (not kampus_*)', () => {
        const keys = AVAILABLE_TAGS.map((t) => t.key);
        expect(keys).toContain('kurum_adi');
        expect(keys).toContain('kurum_adres');
        expect(keys).toContain('kurum_telefon');
        expect(keys).not.toContain('kampus_adi');
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

describe('processConditionalBlocks — kurum_* alias awareness', () => {
    it('removes element when condition refers to legacy kampus_* but only kurum_* set with empty', () => {
        const html = '<span data-condition="kampus_adres">x</span>';
        // kurum_adres boş; eski alias çağrısı boş döner → element kaldırılır
        const out = processConditionalBlocks(html, { kurum_adres: '' });
        expect(out).toBe('');
    });

    it('keeps element when alias resolves to a non-empty value', () => {
        const html = '<span data-condition="kampus_adres">addr</span>';
        const out = processConditionalBlocks(html, { kurum_adres: 'Bağdat Cd.' });
        expect(out).toContain('addr');
    });
});
