import { describe, it, expect } from 'vitest';
import { categorize, escapeQueryLiteral, normalizeSignatureHtml, type DesiredSignature } from './signature-audit-service';
import { hashSignatureHtml, type SignatureStateRow } from './signature-state-service';

const desired: DesiredSignature = {
    variables: { ad_soyad: 'Ada Lovelace' },
    html: '<p>Ada Lovelace</p>',
    hash: hashSignatureHtml('<p>Ada Lovelace</p>'),
    templateId: 1,
};

function stateRow(over: Partial<SignatureStateRow>): SignatureStateRow {
    return {
        email: 'ada@x.com',
        templateId: 1,
        desiredHash: desired.hash,
        variablesSnapshot: null,
        lastPushedAt: '2026-05-14T00:00:00.000Z',
        ...over,
    };
}

describe('escapeQueryLiteral', () => {
    it('leaves an ordinary org unit path untouched', () => {
        expect(escapeQueryLiteral('/Ogretmenler/Matematik')).toBe('/Ogretmenler/Matematik');
    });

    it('escapes a single quote', () => {
        expect(escapeQueryLiteral("/Ali'nin Birimi")).toBe("/Ali\\'nin Birimi");
    });

    // The regression: escaping quotes alone turned `\'` into `\\'`, where the first
    // backslash escapes the second and the quote then closes the literal.
    it('escapes backslashes before quotes so a quote cannot break out', () => {
        expect(escapeQueryLiteral("\\'")).toBe("\\\\\\'");
    });

    it('does not let a crafted path terminate the query literal', () => {
        const query = `orgUnitPath='${escapeQueryLiteral("\\' OR name='x")}'`;
        // Every quote that is not the delimiter must stay escaped.
        expect(query.slice(('orgUnitPath=').length + 1, -1)).not.toMatch(/(^|[^\\])'/);
        expect(query.startsWith("orgUnitPath='")).toBe(true);
        expect(query.endsWith("'")).toBe(true);
    });
});

describe('hashSignatureHtml', () => {
    it('is deterministic for the same input', () => {
        expect(hashSignatureHtml('<p>x</p>')).toBe(hashSignatureHtml('<p>x</p>'));
    });

    it('differs for different input', () => {
        expect(hashSignatureHtml('<p>x</p>')).not.toBe(hashSignatureHtml('<p>y</p>'));
    });
});

describe('normalizeSignatureHtml', () => {
    it('ignores whitespace and tag-gap differences', () => {
        const a = '<table>\n  <tr>\n    <td>Ada</td>\n  </tr>\n</table>';
        const b = '<table><tr><td>Ada</td></tr></table>';
        expect(normalizeSignatureHtml(a)).toBe(normalizeSignatureHtml(b));
    });

    it('detects a real content difference', () => {
        expect(normalizeSignatureHtml('<p>Ada</p>')).not.toBe(normalizeSignatureHtml('<p>Grace</p>'));
    });
});

describe('categorize — Hızlı mod', () => {
    it('resolveError → error', () => {
        const r = categorize({ depth: 'fast', resolveError: 'boom', missingReason: null, desired, state: null });
        expect(r.category).toBe('error');
        expect(r.reason).toBe('resolve_error');
    });

    it('missingReason → missing_data', () => {
        const r = categorize({ depth: 'fast', missingReason: 'missing_fields', desired, state: null });
        expect(r.category).toBe('missing_data');
        expect(r.reason).toBe('missing_fields');
    });

    it('durum kaydı yoksa → drift / no_state', () => {
        const r = categorize({ depth: 'fast', missingReason: null, desired, state: null });
        expect(r).toEqual({ category: 'drift', reason: 'no_state' });
    });

    it('şablon farklıysa → drift / template_changed', () => {
        const r = categorize({ depth: 'fast', missingReason: null, desired, state: stateRow({ templateId: 99 }) });
        expect(r).toEqual({ category: 'drift', reason: 'template_changed' });
    });

    it('hash farklıysa → drift / data_changed', () => {
        const r = categorize({ depth: 'fast', missingReason: null, desired, state: stateRow({ desiredHash: 'farkli' }) });
        expect(r).toEqual({ category: 'drift', reason: 'data_changed' });
    });

    it('hash ve şablon uyuşuyorsa → ok', () => {
        const r = categorize({ depth: 'fast', missingReason: null, desired, state: stateRow({}) });
        expect(r).toEqual({ category: 'ok', reason: null });
    });
});

describe('categorize — Derin mod', () => {
    it('canlı imza boşsa → no_signature', () => {
        const r = categorize({ depth: 'deep', missingReason: null, desired, state: stateRow({}), liveSignature: '   ' });
        expect(r.category).toBe('no_signature');
    });

    it('canlı imza hedefle (normalize edilmiş) eşitse → ok', () => {
        const html = '<table><tr><td>Ada</td></tr></table>';
        const d: DesiredSignature = { variables: {}, html, hash: hashSignatureHtml(html), templateId: 1 };
        const r = categorize({
            depth: 'deep', missingReason: null, desired: d, state: null,
            liveSignature: '<table>\n  <tr>\n    <td>Ada</td>\n  </tr>\n</table>',
        });
        expect(r).toEqual({ category: 'ok', reason: null });
    });

    it('canlı imza farklı ve durum kaydı hedefle uyumluysa → drift / manual_edit', () => {
        const r = categorize({
            depth: 'deep', missingReason: null, desired, state: stateRow({}),
            liveSignature: '<p>Elle değişmiş imza</p>',
        });
        expect(r).toEqual({ category: 'drift', reason: 'manual_edit' });
    });

    it('canlı imza farklı ve durum kaydı yoksa → drift / no_state', () => {
        const r = categorize({
            depth: 'deep', missingReason: null, desired, state: null,
            liveSignature: '<p>Eski imza</p>',
        });
        expect(r).toEqual({ category: 'drift', reason: 'no_state' });
    });
});
