import { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Bold, Italic, Underline, Link2, Palette, Type } from 'lucide-react';
import { CANONICAL_TAG_KEYS, localeToken, type CanonicalTagKey } from '../utils/signatureTokens';
import { applyWrap } from '../utils/signatureFormat';

/** Preset swatches offered in the colour popover; users may also type a free HEX. */
const COLOR_PRESETS = ['#1a1a1a', '#555555', '#0066cc', '#0a7d3c', '#c0392b', '#8e44ad'];

interface SignatureEditorProps {
  value: string;
  onChange: (value: string) => void;
  showTags?: boolean;
}

const TAG_FIND_REGEX = /\{\{(\w+)(?:\|[^}]*)?\}\}/g;

function findTagAtCursor(text: string, cursorPos: number): { start: number; end: number; key: string; fullMatch: string } | null {
  let match;
  TAG_FIND_REGEX.lastIndex = 0;
  while ((match = TAG_FIND_REGEX.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (cursorPos >= start && cursorPos <= end) {
      return { start, end, key: match[1], fullMatch: match[0] };
    }
  }
  return null;
}

export function SignatureEditor({ value, onChange, showTags = true }: SignatureEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showConditionPicker, setShowConditionPicker] = useState(false);
  const [showWidthPicker, setShowWidthPicker] = useState(false);
  const [widthValue, setWidthValue] = useState('350');
  const [widthTarget, setWidthTarget] = useState<{ start: number; end: number; key: string } | null>(null);
  const conditionPickerRef = useRef<HTMLDivElement>(null);
  const widthPickerRef = useRef<HTMLDivElement>(null);
  // Formatting popovers (link / colour / font-size). Each captures the textarea
  // selection at open time, since focusing a popover input clears it.
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showSizePicker, setShowSizePicker] = useState(false);
  const [linkUrl, setLinkUrl] = useState('https://');
  const [colorValue, setColorValue] = useState('#0066cc');
  const [sizeValue, setSizeValue] = useState('14');
  const [pendingSel, setPendingSel] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const linkPickerRef = useRef<HTMLDivElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const sizePickerRef = useRef<HTMLDivElement>(null);
  const { t, i18n } = useTranslation('signatures');

  /** Wrap a fixed range, push the new value, then restore caret/selection. */
  const wrapRange = (start: number, end: number, before: string, after: string, placeholder?: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const result = applyWrap(value, start, end, before, after, placeholder);
    onChange(result.value);
    requestAnimationFrame(() => {
      textarea.selectionStart = result.selectionStart;
      textarea.selectionEnd = result.selectionEnd;
      textarea.focus();
    });
  };

  /** Wrap the live textarea selection (used by B/I/U + keyboard shortcuts). */
  const wrapSelection = (before: string, after: string, placeholder?: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    wrapRange(textarea.selectionStart, textarea.selectionEnd, before, after, placeholder);
  };

  const closeAllPickers = () => {
    setShowConditionPicker(false);
    setShowWidthPicker(false);
    setShowLinkPicker(false);
    setShowColorPicker(false);
    setShowSizePicker(false);
  };

  /** Open one of the inline-format popovers, capturing the current selection. */
  const openFormatPicker = (which: 'link' | 'color' | 'size') => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    setPendingSel({ start: textarea.selectionStart, end: textarea.selectionEnd });
    const isOpen = which === 'link' ? showLinkPicker : which === 'color' ? showColorPicker : showSizePicker;
    closeAllPickers();
    if (which === 'link') setShowLinkPicker(!isOpen);
    else if (which === 'color') setShowColorPicker(!isOpen);
    else setShowSizePicker(!isOpen);
  };

  const handleLinkApply = () => {
    const url = linkUrl.trim();
    if (!url) return;
    const escaped = url.replace(/"/g, '&quot;');
    wrapRange(pendingSel.start, pendingSel.end, `<a href="${escaped}">`, '</a>', url);
    setShowLinkPicker(false);
  };

  const handleColorApply = (hex: string) => {
    if (!/^#[0-9a-fA-F]{3,6}$/.test(hex)) return;
    wrapRange(pendingSel.start, pendingSel.end, `<span style="color:${hex}">`, '</span>', t('editor.colorPlaceholder'));
    setShowColorPicker(false);
  };

  const handleSizeApply = () => {
    if (!/^\d+$/.test(sizeValue)) return;
    wrapRange(pendingSel.start, pendingSel.end, `<span style="font-size:${sizeValue}px">`, '</span>', t('editor.sizePlaceholder'));
    setShowSizePicker(false);
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const key = e.key.toLowerCase();
    if (key === 'b') { e.preventDefault(); wrapSelection('<strong>', '</strong>', t('editor.boldPlaceholder')); }
    else if (key === 'i') { e.preventDefault(); wrapSelection('<em>', '</em>', t('editor.italicPlaceholder')); }
    else if (key === 'u') { e.preventDefault(); wrapSelection('<u>', '</u>', t('editor.underlinePlaceholder')); }
  };

  const insertTag = (key: CanonicalTagKey) => {
    const tag = `{{${localeToken(key, i18n.language)}}}`;
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newValue = value.substring(0, start) + tag + value.substring(end);
      onChange(newValue);
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + tag.length;
        textarea.focus();
      });
    } else {
      onChange(value + tag);
    }
  };

  const handleConditionWrap = (conditionKey: CanonicalTagKey) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);
    const wrapped = `<span data-condition="${localeToken(conditionKey, i18n.language)}">${selectedText}</span>`;
    const newValue = value.substring(0, start) + wrapped + value.substring(end);
    onChange(newValue);
    setShowConditionPicker(false);

    requestAnimationFrame(() => {
      textarea.selectionStart = textarea.selectionEnd = start + wrapped.length;
      textarea.focus();
    });
  };

  const handleConditionClick = () => {
    const textarea = textareaRef.current;
    if (!textarea || textarea.selectionStart === textarea.selectionEnd) {
      alert(t('editor.conditionalSelectMetin'));
      return;
    }
    const wasOpen = showConditionPicker;
    closeAllPickers();
    setShowConditionPicker(!wasOpen);
  };

  const handleWidthClick = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const found = findTagAtCursor(value, textarea.selectionStart);
    if (!found) {
      alert(t('editor.widthAlertCursor'));
      return;
    }

    const existingMatch = found.fullMatch.match(/\|max-width:(\d+)/);
    setWidthValue(existingMatch ? existingMatch[1] : '350');
    setWidthTarget({ start: found.start, end: found.end, key: found.key });
    const wasOpen = showWidthPicker;
    closeAllPickers();
    setShowWidthPicker(!wasOpen);
  };

  const handleWidthApply = () => {
    if (!widthTarget || !widthValue || !/^\d+$/.test(widthValue)) return;

    const newTag = `{{${widthTarget.key}|max-width:${widthValue}}}`;
    const newValue = value.substring(0, widthTarget.start) + newTag + value.substring(widthTarget.end);
    onChange(newValue);
    setShowWidthPicker(false);

    const textarea = textareaRef.current;
    if (textarea) {
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = widthTarget.start + newTag.length;
        textarea.focus();
      });
    }
  };

  const handleWidthRemove = () => {
    if (!widthTarget) return;

    const newTag = `{{${widthTarget.key}}}`;
    const newValue = value.substring(0, widthTarget.start) + newTag + value.substring(widthTarget.end);
    onChange(newValue);
    setShowWidthPicker(false);

    const textarea = textareaRef.current;
    if (textarea) {
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = widthTarget.start + newTag.length;
        textarea.focus();
      });
    }
  };

  useEffect(() => {
    if (!showConditionPicker && !showWidthPicker && !showLinkPicker && !showColorPicker && !showSizePicker) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (showConditionPicker && conditionPickerRef.current && !conditionPickerRef.current.contains(target)) {
        setShowConditionPicker(false);
      }
      if (showWidthPicker && widthPickerRef.current && !widthPickerRef.current.contains(target)) {
        setShowWidthPicker(false);
      }
      if (showLinkPicker && linkPickerRef.current && !linkPickerRef.current.contains(target)) {
        setShowLinkPicker(false);
      }
      if (showColorPicker && colorPickerRef.current && !colorPickerRef.current.contains(target)) {
        setShowColorPicker(false);
      }
      if (showSizePicker && sizePickerRef.current && !sizePickerRef.current.contains(target)) {
        setShowSizePicker(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAllPickers();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showConditionPicker, showWidthPicker, showLinkPicker, showColorPicker, showSizePicker]);

  const fmtBtn = 'flex items-center justify-center w-7 h-7 text-xs bg-surface-container-high text-on-surface rounded border border-outline-variant/30 hover:bg-surface-container-highest transition-colors';

  return (
    <div className="space-y-2">
      {showTags && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1">
            <button onClick={() => wrapSelection('<strong>', '</strong>', t('editor.boldPlaceholder'))} type="button" title={`${t('editor.bold')} (Ctrl/⌘+B)`} className={`${fmtBtn} font-bold`}>
              <Bold size={14} />
            </button>
            <button onClick={() => wrapSelection('<em>', '</em>', t('editor.italicPlaceholder'))} type="button" title={`${t('editor.italic')} (Ctrl/⌘+I)`} className={fmtBtn}>
              <Italic size={14} />
            </button>
            <button onClick={() => wrapSelection('<u>', '</u>', t('editor.underlinePlaceholder'))} type="button" title={`${t('editor.underline')} (Ctrl/⌘+U)`} className={fmtBtn}>
              <Underline size={14} />
            </button>
            <span className="w-px h-5 bg-outline-variant/30 mx-0.5" />
            <div className="relative inline-block" ref={linkPickerRef}>
              <button onClick={() => openFormatPicker('link')} type="button" title={t('editor.link')} className={fmtBtn}>
                <Link2 size={14} />
              </button>
              {showLinkPicker && (
                <div className="absolute left-0 top-full mt-1 z-50 bg-surface-container border border-outline-variant/30 rounded-lg shadow-lg p-3 min-w-[240px]">
                  <div className="text-xs text-on-surface-variant mb-2">{t('editor.linkUrlPrompt')}</div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={linkUrl}
                      onChange={e => setLinkUrl(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleLinkApply(); }}
                      className="flex-1 bg-surface-container-high px-2 py-1.5 text-sm border border-outline-variant/30 rounded focus:ring-1 focus:ring-eth-primary-container/40 focus:border-eth-primary-container/40"
                      placeholder="https://example.com"
                      autoFocus
                    />
                    <button onClick={handleLinkApply} type="button" className="px-3 py-1.5 text-xs bg-eth-primary-container text-on-eth-primary-container rounded hover:brightness-110 transition-colors">
                      {t('editor.apply')}
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="relative inline-block" ref={colorPickerRef}>
              <button onClick={() => openFormatPicker('color')} type="button" title={t('editor.color')} className={fmtBtn}>
                <Palette size={14} />
              </button>
              {showColorPicker && (
                <div className="absolute left-0 top-full mt-1 z-50 bg-surface-container border border-outline-variant/30 rounded-lg shadow-lg p-3 min-w-[200px]">
                  <div className="text-xs text-on-surface-variant mb-2">{t('editor.colorPrompt')}</div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {COLOR_PRESETS.map(hex => (
                      <button
                        key={hex}
                        onClick={() => handleColorApply(hex)}
                        type="button"
                        title={hex}
                        className="w-6 h-6 rounded border border-outline-variant/40 hover:scale-110 transition-transform"
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={colorValue}
                      onChange={e => setColorValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleColorApply(colorValue); }}
                      className="flex-1 bg-surface-container-high px-2 py-1.5 text-sm font-mono border border-outline-variant/30 rounded focus:ring-1 focus:ring-eth-primary-container/40 focus:border-eth-primary-container/40"
                      placeholder="#0066cc"
                    />
                    <button onClick={() => handleColorApply(colorValue)} type="button" className="px-3 py-1.5 text-xs bg-eth-primary-container text-on-eth-primary-container rounded hover:brightness-110 transition-colors">
                      {t('editor.apply')}
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="relative inline-block" ref={sizePickerRef}>
              <button onClick={() => openFormatPicker('size')} type="button" title={t('editor.fontSize')} className={fmtBtn}>
                <Type size={14} />
              </button>
              {showSizePicker && (
                <div className="absolute left-0 top-full mt-1 z-50 bg-surface-container border border-outline-variant/30 rounded-lg shadow-lg p-3 min-w-[200px]">
                  <div className="text-xs text-on-surface-variant mb-2">{t('editor.fontSizePrompt')}</div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        value={sizeValue}
                        onChange={e => setSizeValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSizeApply(); }}
                        className="w-full bg-surface-container-high px-2 py-1.5 pr-8 text-sm border border-outline-variant/30 rounded focus:ring-1 focus:ring-eth-primary-container/40 focus:border-eth-primary-container/40"
                        placeholder="14"
                        min="8"
                        max="72"
                        autoFocus
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant">px</span>
                    </div>
                    <button onClick={handleSizeApply} type="button" className="px-3 py-1.5 text-xs bg-eth-primary-container text-on-eth-primary-container rounded hover:brightness-110 transition-colors">
                      {t('editor.apply')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {CANONICAL_TAG_KEYS.map(key => (
              <button
                key={key}
                onClick={() => insertTag(key)}
                className="px-2 py-1 text-xs bg-eth-primary-container/15 text-eth-primary rounded border border-eth-primary-container/30 hover:bg-eth-primary-container/25 transition-colors"
                type="button"
                title={t('editor.insertTagTitle', { value: `{{${localeToken(key, i18n.language)}}}` })}
              >
                {`{{${localeToken(key, i18n.language)}}}`}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <div className="relative inline-block" ref={conditionPickerRef}>
              <button
                onClick={handleConditionClick}
                className="px-2 py-1 text-xs bg-amber-500/10 text-amber-500 rounded border border-amber-500/30 hover:bg-amber-500/15 transition-colors"
                type="button"
                title={t('editor.conditionalTitle')}
              >
                &#123;?&#125; {t('editor.conditionalButton')}
              </button>
              {showConditionPicker && (
                <div className="absolute left-0 top-full mt-1 z-50 bg-surface-container border border-outline-variant/30 rounded-lg shadow-lg py-1 min-w-[180px]">
                  <div className="px-3 py-1.5 text-xs text-on-surface-variant border-b border-outline-variant/30">
                    {t('editor.conditionalDropdownLabel')}
                  </div>
                  {CANONICAL_TAG_KEYS.map(key => (
                    <button
                      key={key}
                      onClick={() => handleConditionWrap(key)}
                      className="w-full text-left px-3 py-1.5 text-sm font-mono hover:bg-amber-500/10 transition-colors"
                      type="button"
                    >
                      {`{{${localeToken(key, i18n.language)}}}`}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative inline-block" ref={widthPickerRef}>
              <button
                onClick={handleWidthClick}
                className="px-2 py-1 text-xs bg-eth-primary-container/15 text-eth-primary rounded border border-eth-primary-container/30 hover:bg-eth-primary-container/25 transition-colors"
                type="button"
                title={t('editor.widthTitle')}
              >
                &#8596; {t('editor.widthButton')}
              </button>
              {showWidthPicker && (
                <div className="absolute left-0 top-full mt-1 z-50 bg-surface-container border border-outline-variant/30 rounded-lg shadow-lg p-3 min-w-[220px]">
                  <div className="text-xs text-on-surface-variant mb-2">
                    <span className="font-medium text-eth-primary">{`{{${widthTarget?.key}}}`}</span> {t('editor.widthLabel', { tag: '' }).replace(/^\s*\{\{\}\}\s*/, '')}
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        value={widthValue}
                        onChange={e => setWidthValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleWidthApply(); }}
                        className="w-full bg-surface-container-high px-2 py-1.5 pr-8 text-sm border border-outline-variant/30 rounded focus:ring-1 focus:ring-eth-primary-container/40 focus:border-eth-primary-container/40"
                        placeholder="350"
                        min="50"
                        max="1000"
                        autoFocus
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant">px</span>
                    </div>
                    <button
                      onClick={handleWidthApply}
                      className="px-3 py-1.5 text-xs bg-eth-primary-container text-on-eth-primary-container rounded hover:brightness-110 transition-colors"
                      type="button"
                    >
                      {t('editor.widthApply')}
                    </button>
                  </div>
                  {widthTarget && value.substring(widthTarget.start, widthTarget.end).includes('|max-width:') && (
                    <button
                      onClick={handleWidthRemove}
                      className="mt-2 text-xs text-eth-danger hover:text-eth-danger transition-colors"
                      type="button"
                    >
                      {t('editor.widthRemove')}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleEditorKeyDown}
        className="w-full bg-surface-container-high h-64 px-3 py-2 border border-outline-variant/30 rounded-lg text-sm font-mono focus:ring-2 focus:ring-eth-primary-container/40 focus:border-eth-primary-container/40 resize-y"
        placeholder="<table>&#10;  <tr>&#10;    <td>{{ad_soyad}}</td>&#10;  </tr>&#10;</table>"
        spellCheck={false}
      />
    </div>
  );
}
