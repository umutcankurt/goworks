import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { templatesApi } from '../services/server-api';

interface SignaturePreviewProps {
  html: string;
  /**
   * Which push mode to mirror. 'template' substitutes and re-sanitises (push
   * Mode 2/3); 'raw' only sanitises (Mode 1), so what is shown is byte-for-byte
   * what the mailbox receives.
   */
  mode?: 'template' | 'raw';
  templateId?: number;
  variables?: Record<string, string>;
  /**
   * Opaque cache-buster. Never sent to the main process — it exists so a caller
   * can force a re-render when something the server resolves (media assets)
   * changed while `html` and `variables` stayed identical.
   */
  revision?: string | number;
}

/** Debounce for keystroke-driven re-renders. Longer than the inter-key gap of a
 *  fast typist, short enough that the preview does not feel detached. */
const RENDER_DEBOUNCE_MS = 250;

/**
 * Content key for the `variables` object.
 *
 * Two of the three call sites build a fresh object literal on every render, so
 * depending on it by identity would re-fire the effect forever once the effect
 * calls setState. Sorting first matters: plain JSON.stringify is insertion-order
 * sensitive, and NewUser appends media keys via Object.fromEntries, so an
 * identical set could serialise two ways and cause a spurious extra render.
 *
 * Codepoint compare, NOT localeCompare — the app runs under a Turkish locale and
 * these keys are ASCII \w.
 */
function variablesKeyOf(vars: Record<string, string> | undefined): string {
  if (!vars) return '';
  return JSON.stringify(
    Object.keys(vars).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).map((k) => [k, vars[k]]),
  );
}

export function SignaturePreview({ html, mode = 'template', templateId, variables, revision }: SignaturePreviewProps) {
  const [iframeHeight, setIframeHeight] = useState(200);
  const [rendered, setRendered] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation('signatures');

  // Monotonic request counter. ipcRenderer.invoke has no cancellation channel, so
  // an AbortController would reduce to this same latch with more moving parts.
  // Bumping it in cleanup also makes a late response a no-op after unmount and
  // absorbs StrictMode's double-invoke.
  const seqRef = useRef(0);
  const firstRenderRef = useRef(true);

  const variablesKey = variablesKeyOf(variables);

  useEffect(() => {
    if (!html.trim()) {
      setRendered('');
      setError(null);
      return;
    }
    const seq = ++seqRef.current;
    // The first paint is not debounced: waiting 250ms to show anything reads as a
    // stall, and it also delays the iframe's first height measurement.
    const delay = firstRenderRef.current ? 0 : RENDER_DEBOUNCE_MS;

    const timer = window.setTimeout(async () => {
      firstRenderRef.current = false;
      setPending(true);
      try {
        // Closing over `variables` is safe: variablesKey changes exactly when the
        // content changes, so a closure held across renders holds content-identical
        // variables. react-hooks/exhaustive-deps is off in this repo, so there is no
        // automated backstop here — keep variablesKey in the dep list.
        const data = await templatesApi.renderPreview({ html, mode, templateId, variables });
        if (seq !== seqRef.current) return;
        setRendered(data.html);
        setError(null);
      } catch (err) {
        if (seq !== seqRef.current) return;
        setError((err as Error).message || t('preview.renderFailed'));
      } finally {
        if (seq === seqRef.current) setPending(false);
      }
    }, delay);

    return () => {
      window.clearTimeout(timer);
      seqRef.current++;
    };
    // `variables` is intentionally absent: variablesKey is its content hash, and
    // depending on the object itself would re-fire this effect on every render.
  }, [html, mode, templateId, variablesKey, revision]);

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
      <div className="px-3 py-2 bg-surface-container-low border-b border-outline-variant/30 text-xs font-medium text-on-surface-variant flex items-center justify-between gap-2">
        {/* The error replaces the heading but NOT the frame below it: the editor is
            a raw textarea, so a conditional block is unbalanced on nearly every
            keystroke while it is being typed and the render legitimately fails.
            Blanking the frame there would make the pane strobe as the user types. */}
        <span className={error ? 'text-eth-danger' : undefined}>
          {error ?? t('preview.heading')}
        </span>
        {pending && <Loader2 size={12} className="animate-spin shrink-0" aria-hidden="true" />}
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
