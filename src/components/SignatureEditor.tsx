import { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CANONICAL_TAG_KEYS, localeToken, type CanonicalTagKey } from '../utils/signatureTokens';

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
  const { t, i18n } = useTranslation('signatures');

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
    setShowWidthPicker(false);
    setShowConditionPicker(prev => !prev);
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
    setShowConditionPicker(false);
    setShowWidthPicker(prev => !prev);
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
    if (!showConditionPicker && !showWidthPicker) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (showConditionPicker && conditionPickerRef.current && !conditionPickerRef.current.contains(e.target as Node)) {
        setShowConditionPicker(false);
      }
      if (showWidthPicker && widthPickerRef.current && !widthPickerRef.current.contains(e.target as Node)) {
        setShowWidthPicker(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowConditionPicker(false);
        setShowWidthPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showConditionPicker, showWidthPicker]);

  return (
    <div className="space-y-2">
      {showTags && (
        <div className="space-y-1.5">
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
                        className="w-full px-2 py-1.5 pr-8 text-sm border border-outline-variant/30 rounded focus:ring-1 focus:ring-eth-primary-container/40 focus:border-eth-primary-container/40"
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
        className="w-full h-64 px-3 py-2 border border-outline-variant/30 rounded-lg text-sm font-mono focus:ring-2 focus:ring-eth-primary-container/40 focus:border-eth-primary-container/40 resize-y"
        placeholder="<table>&#10;  <tr>&#10;    <td>{{ad_soyad}}</td>&#10;  </tr>&#10;</table>"
        spellCheck={false}
      />
    </div>
  );
}
