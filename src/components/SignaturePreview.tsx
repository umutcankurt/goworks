import { useMemo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveVariable } from '../utils/signatureTokens';

interface SignaturePreviewProps {
  html: string;
  variables?: Record<string, string>;
}

const TAG_REGEX = /\{\{(\w+)(?:\|([^}]*))?\}\}/g;
const TURKISH_ADDRESS_ABBR_REGEX = /\s+(Mah\.|Sk\.|Sok\.|Cad\.|Cd\.|Blv\.|No:|Kat:|D:|Apt\.)/gi;

export function SignaturePreview({ html, variables = {} }: SignaturePreviewProps) {
  const [iframeHeight, setIframeHeight] = useState(200);
  const { t } = useTranslation('signatures');

  const rendered = useMemo(() => {
    const replaced = html.replace(TAG_REGEX, (match, key, modifierStr) => {
      const value = resolveVariable(key, variables);
      if (value === undefined) return match;
      if (!modifierStr) return value;
      const mods: Record<string, string> = {};
      for (const part of modifierStr.split(',')) {
        const [k, v] = part.trim().split(':').map((s: string) => s.trim());
        if (k === 'max-width' && v && /^\d+$/.test(v)) mods[k] = v;
      }
      if (mods['max-width']) {
        const processed = value.replace(TURKISH_ADDRESS_ABBR_REGEX, '\u00a0$1');
        return `<span style="display:inline-block;max-width:${mods['max-width']}px;word-wrap:break-word;vertical-align:top">${processed}</span>`;
      }
      return value;
    });

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<body>${replaced}</body>`, 'text/html');
      doc.querySelectorAll('[data-condition]').forEach(el => {
        const keys = (el.getAttribute('data-condition') || '').split(',').map(k => k.trim()).filter(Boolean);
        if (keys.length === 0) return;
        const allEmpty = keys.every(k => !resolveVariable(k, variables)?.trim());
        if (allEmpty) {
          el.remove();
        } else {
          el.removeAttribute('data-condition');
        }
      });
      return doc.body.innerHTML;
    } catch {
      return replaced;
    }
  }, [html, variables]);

  const handleIframeLoad = useCallback((e: React.SyntheticEvent<HTMLIFrameElement>) => {
    try {
      const doc = e.currentTarget.contentDocument;
      if (doc?.body) {
        const height = doc.body.scrollHeight;
        if (height > 0) setIframeHeight(Math.max(height + 16, 200));
      }
    } catch {
      // Cross-origin or sandbox restriction — keep default
    }
  }, []);

  return (
    <div className="border border-outline-variant/30 rounded-lg overflow-hidden bg-surface-container">
      <div className="px-3 py-2 bg-surface-container-low border-b border-outline-variant/30 text-xs font-medium text-on-surface-variant">
        {t('preview.heading')}
      </div>
      <iframe
        srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:8px;font-family:Arial,sans-serif;font-size:14px;background:#ffffff;color:#000000;}</style></head><body>${rendered}</body></html>`}
        className="w-full border-0"
        style={{ height: iframeHeight }}
        title="Signature Preview"
        sandbox="allow-same-origin"
        onLoad={handleIframeLoad}
      />
    </div>
  );
}
