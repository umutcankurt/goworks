import { describe, it, expect } from 'vitest';
import { applyWrap } from './signatureFormat';

describe('applyWrap', () => {
  it('seçili metni etiketle sarar ve caret\'i blok sonuna koyar', () => {
    const r = applyWrap('hello world', 0, 5, '<strong>', '</strong>');
    expect(r.value).toBe('<strong>hello</strong> world');
    // caret right after the wrapped block: '<strong>hello</strong>'.length === 22
    expect(r.selectionStart).toBe(22);
    expect(r.selectionEnd).toBe(22);
  });

  it('seçim yokken placeholder ekler ve placeholder\'ı seçili bırakır', () => {
    const r = applyWrap('', 0, 0, '<strong>', '</strong>', 'Kalın metin');
    expect(r.value).toBe('<strong>Kalın metin</strong>');
    expect(r.selectionStart).toBe('<strong>'.length);
    expect(r.selectionEnd).toBe('<strong>'.length + 'Kalın metin'.length);
    // selected slice is exactly the placeholder
    expect(r.value.substring(r.selectionStart, r.selectionEnd)).toBe('Kalın metin');
  });

  it('seçim ve placeholder yokken boş etiket ekler, caret\'i araya koyar', () => {
    const r = applyWrap('ab', 1, 1, '<em>', '</em>');
    expect(r.value).toBe('a<em></em>b');
    expect(r.selectionStart).toBe(1 + '<em>'.length);
    expect(r.selectionEnd).toBe(1 + '<em>'.length);
  });

  it('mevcut etiketin içindeki metni iç içe sarabilir', () => {
    const base = '<strong>hello</strong>';
    const r = applyWrap(base, 8, 13, '<em>', '</em>');
    expect(r.value).toBe('<strong><em>hello</em></strong>');
  });

  it('metnin ortasındaki seçimi doğru konumda sarar', () => {
    const r = applyWrap('abcdef', 2, 4, '<u>', '</u>');
    expect(r.value).toBe('ab<u>cd</u>ef');
    expect(r.selectionStart).toBe(2 + '<u>cd</u>'.length);
  });

  it('link/renk gibi öznitelikli etiketlerle çalışır', () => {
    const r = applyWrap('site', 0, 4, '<a href="https://x.com">', '</a>');
    expect(r.value).toBe('<a href="https://x.com">site</a>');
  });
});
