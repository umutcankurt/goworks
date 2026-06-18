import { useState, useEffect, useCallback, useRef } from 'react';
import { Trash2, Copy, Loader, Image, ImageOff, AlertTriangle, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { mediaApi } from '../services/server-api';
import { useToast } from '../contexts/ToastContext';
import { buildImageEmbed } from '../utils/signatureFormat';

interface MediaManagerProps {
  templateId: number;
  /** Insert a snippet (full <img> block) into the editor at the caret. */
  onInsertToken?: (snippet: string) => void;
  /** Notify the parent when the media list changes (drives the live preview). */
  onMediaChange?: (media: any[]) => void;
}

export function MediaManager({ templateId, onInsertToken, onMediaChange }: MediaManagerProps) {
  const [media, setMedia] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ name: '', driveUrl: '' });
  const [brokenImages, setBrokenImages] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addToast } = useToast();
  const { t } = useTranslation('signatures');
  const { t: tCommon } = useTranslation('common');
  const { t: tToast } = useTranslation('toast');

  const fetchMedia = useCallback(async () => {
    try {
      setLoading(true);
      const data = await mediaApi.getAll(templateId);
      setMedia(data);
      setBrokenImages(new Set());
    } catch (err: any) {
      addToast(tToast('media.loadFailed', { error: err.message }), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, templateId, tToast]);

  useEffect(() => { fetchMedia(); }, [fetchMedia]);

  // Keep the parent (and thus the live preview) in sync with the media list.
  useEffect(() => { onMediaChange?.(media); }, [media]);

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const created = await mediaApi.upload({
        name: file.name,
        data: buffer,
        mimeType: file.type || 'image/png',
        templateId,
      });
      setMedia(prev => [created, ...prev]);
      addToast(tToast('media.added'), 'success');
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleAddByUrl = async () => {
    if (!form.name.trim() || !form.driveUrl.trim()) return;
    try {
      const created = await mediaApi.create({ name: form.name.trim(), driveUrl: form.driveUrl.trim(), templateId });
      setMedia(prev => [created, ...prev]);
      setForm({ name: '', driveUrl: '' });
      addToast(tToast('media.added'), 'success');
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  const handleDelete = async (id: number) => {
    const prev = media;
    setMedia(m => m.filter(item => item.id !== id));
    try {
      await mediaApi.delete(id);
      addToast(tToast('media.deleted'), 'success');
    } catch (err: any) {
      setMedia(prev);
      addToast(err.message, 'error');
    }
  };

  // Both paths embed a full <img> block — never a bare {{token}} — so the image
  // always renders (a loose token would resolve to a raw URL string in the body).
  const handleInsert = (m: any) => {
    if (!m.token || !onInsertToken) return;
    onInsertToken(buildImageEmbed(m.token, m.name));
    addToast(t('media.inserted'), 'info');
  };

  const copyImage = (m: any) => {
    if (!m.token) return;
    navigator.clipboard.writeText(buildImageEmbed(m.token, m.name));
    addToast(t('media.imageCopied'), 'info');
  };

  if (loading) return <div className="flex items-center gap-2 text-on-surface-variant"><Loader className="animate-spin" size={18} /> {tCommon('loading')}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Image size={18} className="text-on-surface-variant" />
        <h3 className="font-medium text-on-surface text-sm">{t('media.heading')}</h3>
      </div>

      <p className="text-xs text-on-surface-variant flex items-start gap-1">
        <AlertTriangle size={12} className="mt-0.5 shrink-0" />
        {t('media.publicWarning')}
      </p>

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelected} />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        type="button"
        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-eth-primary-container text-on-eth-primary-container rounded-lg hover:brightness-110 transition-colors disabled:opacity-50"
      >
        {uploading ? <Loader className="animate-spin" size={16} /> : <Upload size={16} />}
        {uploading ? t('media.uploading') : t('media.addImage')}
      </button>

      {media.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {media.map(m => (
              <div key={m.id} className="relative group flex flex-col items-center gap-1.5 border border-outline-variant/30 rounded-lg p-2 hover:bg-surface-container-low">
                <button
                  onClick={() => handleInsert(m)}
                  type="button"
                  title={t('media.insertToken')}
                  className="block rounded overflow-hidden focus:outline-none focus:ring-2 focus:ring-eth-primary-container/40"
                >
                  {brokenImages.has(m.id) ? (
                    <div className="w-[90px] h-[90px] flex items-center justify-center rounded border border-outline-variant/30 bg-surface-container-low">
                      <ImageOff size={24} className="text-on-surface-variant" />
                    </div>
                  ) : (
                    <img
                      src={m.publicUrl}
                      alt={m.name}
                      className="w-[90px] h-[90px] object-contain rounded border border-outline-variant/30 bg-surface"
                      onError={() => setBrokenImages(prev => new Set(prev).add(m.id))}
                    />
                  )}
                </button>
                {m.token && (
                  <div className="flex flex-col items-center gap-0.5 max-w-full">
                    <button
                      onClick={() => copyImage(m)}
                      type="button"
                      title={t('media.copyImage')}
                      className="inline-flex items-center gap-1 text-xs text-eth-primary hover:underline"
                    >
                      <Copy size={11} className="shrink-0" /> {t('media.copyImage')}
                    </button>
                    <span className="text-[10px] font-mono text-on-surface-variant truncate max-w-full">{m.token}</span>
                  </div>
                )}
                <button
                  onClick={() => handleDelete(m.id)}
                  type="button"
                  title={t('media.delete')}
                  className="absolute top-1 right-1 p-1 rounded bg-surface-container/80 text-eth-danger opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs text-on-surface-variant">{t('media.tokenNote')}</p>
        </>
      )}

      <details className="text-sm">
        <summary className="text-xs text-on-surface-variant cursor-pointer hover:text-on-surface">{t('media.advancedUrl')}</summary>
        <div className="flex gap-2 mt-2">
          <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('media.namePlaceholder')} className="flex-1 px-3 py-2 bg-surface-container-high border border-outline-variant/30 rounded-lg text-sm focus:ring-2 focus:ring-eth-primary-container/40 focus:border-eth-primary-container/40" />
          <input type="text" value={form.driveUrl} onChange={e => setForm(f => ({ ...f, driveUrl: e.target.value }))} placeholder={t('media.drivePlaceholder')} className="flex-[2] px-3 py-2 bg-surface-container-high border border-outline-variant/30 rounded-lg text-sm focus:ring-2 focus:ring-eth-primary-container/40 focus:border-eth-primary-container/40" />
          <button onClick={handleAddByUrl} type="button" className="px-3 py-2 bg-surface-container-high text-on-surface border border-outline-variant/30 rounded-lg text-sm hover:bg-surface-container-highest transition-colors">
            {tCommon('add')}
          </button>
        </div>
      </details>
    </div>
  );
}
