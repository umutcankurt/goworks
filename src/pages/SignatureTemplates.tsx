import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { Plus, Save, Trash2, Star, Loader } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../contexts/ToastContext';
import { templatesApi } from '../services/server-api';
import { useAppConfig } from '../contexts/AppConfigContext';
import { SignatureEditor, type SignatureEditorHandle } from '../components/SignatureEditor';
import { SignaturePreview } from '../components/SignaturePreview';
import { MediaManager } from '../components/MediaManager';
import { HelpGuide } from '../components/HelpGuide';
import { useLocaleFormat } from '../i18n/useLocaleFormat';
import { Button } from '../components/ui/Button';
import { SIGNATURE_STARTERS } from '../utils/signatureStarters';

export function SignatureTemplates() {
  const { addToast } = useToast();
  const { config } = useAppConfig();
  const { t, i18n } = useTranslation('signatures');
  const { t: tToast } = useTranslation('toast');
  const { formatDate } = useLocaleFormat();

  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [media, setMedia] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [originalName, setOriginalName] = useState('');
  const [originalHtml, setOriginalHtml] = useState('');
  const editorRef = useRef<SignatureEditorHandle>(null);

  const isDirty = name !== originalName || htmlContent !== originalHtml;

  const SAMPLE_VARIABLES = useMemo<Record<string, string>>(() => {
    const institutionName = t('preview.sample.institutionName');
    const institutionAddress = t('preview.sample.institutionAddress');
    const institutionPhone = t('preview.sample.institutionPhone');
    return {
      ad_soyad: t('preview.sample.fullName'),
      unvan: t('preview.sample.title'),
      kurum_adi: institutionName,
      kurum_adres: institutionAddress,
      kurum_telefon: institutionPhone,
      telefon: t('preview.sample.phone'),
      eposta: `${t('preview.sample.emailLocalPart')}@${config.allowedDomain || 'example.com'}`,
    };
  }, [t, i18n.language, config.allowedDomain]);

  // Media tokens are no longer merged in here: the main process resolves them
  // from templateId and spreads them last, exactly as the push worker does, so
  // the preview cannot disagree with what gets sent. What is left is a
  // cache-buster — media lives outside `htmlContent`, so uploading an image
  // changes nothing the render effect depends on unless we say so.
  const mediaRevision = useMemo(
    () => media.map((m) => `${m.token}:${m.publicUrl}`).join('|'),
    [media],
  );

  // Insert at the editor caret (not appended at the end) so images land where
  // the user is editing — the editor exposes this via its ref handle.
  const handleInsertToken = (snippet: string) => {
    editorRef.current?.insertAtCaret(snippet);
  };

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const data = await templatesApi.getAll();
      setTemplates(data);
    } catch (err: any) {
      addToast(tToast('signatures.loadFailed', { error: err.message }));
    } finally {
      setLoading(false);
    }
  }, [addToast, tToast]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const selectTemplate = (tmpl: any) => {
    if (isDirty && !window.confirm(t('list.unsavedConfirm'))) return;
    setSelectedId(tmpl.id);
    setName(tmpl.name);
    setHtmlContent(tmpl.htmlContent);
    setOriginalName(tmpl.name);
    setOriginalHtml(tmpl.htmlContent);
    setMedia([]); // MediaManager re-fetches for the new template and reports back
  };

  const handleNew = () => {
    if (isDirty && !window.confirm(t('list.unsavedConfirm'))) return;
    setSelectedId(null);
    setName('');
    setHtmlContent('');
    setOriginalName('');
    setOriginalHtml('');
    setMedia([]);
  };

  const handleSave = async () => {
    if (!name.trim() || !htmlContent.trim()) {
      addToast(tToast('signatures.nameAndContentRequired'));
      return;
    }

    setSaving(true);
    try {
      if (selectedId) {
        await templatesApi.update(selectedId, { name: name.trim(), htmlContent });
        addToast(tToast('signatures.updated'));
      } else {
        const created = await templatesApi.create({ name: name.trim(), htmlContent });
        setSelectedId(created.id);
        addToast(tToast('signatures.created'));
      }
      setOriginalName(name.trim());
      setOriginalHtml(htmlContent);
      fetchTemplates();
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    const tmpl = templates.find(x => x.id === id);
    if (!window.confirm(t('list.deleteConfirm', { name: tmpl?.name || '' }))) return;
    try {
      await templatesApi.delete(id);
      addToast(tToast('signatures.deleted'));
      if (selectedId === id) {
        setSelectedId(null);
        setName('');
        setHtmlContent('');
        setOriginalName('');
        setOriginalHtml('');
        setMedia([]);
      }
      fetchTemplates();
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  const handleSetDefault = async (id: number) => {
    try {
      await templatesApi.setDefault(id);
      addToast(tToast('signatures.defaultSet'));
      fetchTemplates();
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-on-surface">{t('list.title')}</h1>
        <HelpGuide namespace="signatures" />
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-3 space-y-3">
          <Button onClick={handleNew} fullWidth size="sm" leftIcon={<Plus size={16} />}>
            {t('list.newTemplate')}
          </Button>

          {loading ? (
            <div className="flex items-center gap-2 text-on-surface-variant justify-center py-8"><Loader className="animate-spin" size={18} /></div>
          ) : (
            <div className="space-y-2">
              {templates.map(tmpl => (
                <div
                  key={tmpl.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selectedId === tmpl.id}
                  onClick={() => selectTemplate(tmpl)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      selectTemplate(tmpl);
                    }
                  }}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${selectedId === tmpl.id
                      ? 'border-eth-primary-container/40 bg-eth-primary-container/15 ring-1 ring-eth-primary-container/40'
                      : 'border-outline-variant/30 hover:border-outline-variant/60 bg-surface-container'
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-on-surface truncate">{tmpl.name}</p>
                    <div className="flex items-center gap-1">
                      {tmpl.isDefault && <Star size={14} className="text-amber-500 fill-amber-400" />}
                    </div>
                  </div>
                  <p className="text-xs text-on-surface-variant mt-1">
                    {formatDate(tmpl.updatedAt)}
                  </p>
                  <div className="flex gap-1 mt-2">
                    <button onClick={e => { e.stopPropagation(); handleSetDefault(tmpl.id); }} className="text-xs text-on-surface-variant hover:text-amber-500" title={t('list.setDefault')}>
                      <Star size={12} />
                    </button>
                    <button onClick={e => { e.stopPropagation(); handleDelete(tmpl.id); }} className="text-xs text-on-surface-variant hover:text-eth-danger" title={t('list.delete')}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
              {templates.length === 0 && (
                <p className="text-sm text-on-surface-variant text-center py-4">{t('list.empty')}</p>
              )}
            </div>
          )}
        </div>

        <div className="col-span-5 space-y-4">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('list.templateNamePlaceholder')}
            className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/30 rounded-lg text-sm font-medium focus:ring-2 focus:ring-eth-primary-container/40 focus:border-eth-primary-container/40"
          />

          {!htmlContent.trim() && (
            <div className="space-y-2 rounded-lg border border-dashed border-outline-variant/40 bg-surface-container p-3">
              <p className="text-xs text-on-surface-variant">{t('starters.heading')}</p>
              <div className="grid grid-cols-3 gap-2">
                {SIGNATURE_STARTERS.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setHtmlContent(s.build(i18n.language))}
                    className="px-2 py-2 text-xs font-medium text-on-surface bg-surface-container-high rounded border border-outline-variant/30 hover:border-eth-primary-container/50 hover:bg-eth-primary-container/10 transition-colors"
                  >
                    {t(`starters.${s.id}`)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <SignatureEditor ref={editorRef} value={htmlContent} onChange={setHtmlContent} />

          <div className="flex gap-2">
            <Button onClick={handleSave} loading={saving} size="sm" leftIcon={<Save size={16} />}>
              {selectedId ? t('list.updateButton') : t('list.saveButton')}
            </Button>
          </div>

          {selectedId && (
            <div className="border-t border-outline-variant/30 pt-4">
              <MediaManager templateId={selectedId} onMediaChange={setMedia} onInsertToken={handleInsertToken} />
            </div>
          )}
          {!selectedId && (
            <div className="border-t border-outline-variant/30 pt-4">
              <p className="text-xs text-on-surface-variant">{t('list.mediaUnsavedNote')}</p>
            </div>
          )}
        </div>

        <div className="col-span-4">
          <SignaturePreview
            html={htmlContent}
            templateId={selectedId ?? undefined}
            variables={SAMPLE_VARIABLES}
            revision={mediaRevision}
          />
        </div>
      </div>
    </motion.div>
  );
}
