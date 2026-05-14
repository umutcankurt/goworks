import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Copy, Loader, Image, ImageOff, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { mediaApi } from '../services/server-api';
import { useToast } from '../contexts/ToastContext';

interface MediaManagerProps {
  templateId: number;
}

export function MediaManager({ templateId }: MediaManagerProps) {
  const [media, setMedia] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', driveUrl: '' });
  const [brokenImages, setBrokenImages] = useState<Set<number>>(new Set());
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

  const handleAdd = async () => {
    if (!form.name.trim() || !form.driveUrl.trim()) return;
    try {
      const created = await mediaApi.create({ name: form.name.trim(), driveUrl: form.driveUrl.trim(), templateId });
      setMedia(prev => [...prev, created]);
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

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    addToast(tToast('media.urlCopied'), 'info');
  };

  if (loading) return <div className="flex items-center gap-2 text-on-surface-variant"><Loader className="animate-spin" size={18} /> {tCommon('loading')}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Image size={18} className="text-on-surface-variant" />
        <h3 className="font-medium text-on-surface text-sm">{t('media.heading')}</h3>
      </div>

      <p className="text-xs text-on-surface-variant flex items-center gap-1">
        <AlertTriangle size={12} />
        {t('media.publicWarning')}
      </p>

      <div className="flex gap-2">
        <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('media.namePlaceholder')} className="flex-1 px-3 py-2 border border-outline-variant/30 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
        <input type="text" value={form.driveUrl} onChange={e => setForm(f => ({ ...f, driveUrl: e.target.value }))} placeholder={t('media.drivePlaceholder')} className="flex-2 px-3 py-2 border border-outline-variant/30 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
        <button onClick={handleAdd} className="px-3 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 flex items-center gap-1">
          <Plus size={16} /> {tCommon('add')}
        </button>
      </div>

      {media.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {media.map(m => (
            <div key={m.id} className="border border-outline-variant/30 rounded-lg p-3 flex items-center gap-3 hover:bg-surface-container-low">
              {brokenImages.has(m.id) ? (
                <div className="w-12 h-12 flex items-center justify-center rounded border border-outline-variant/30 bg-surface-container-low">
                  <ImageOff size={20} className="text-on-surface-variant" />
                </div>
              ) : (
                <img
                  src={m.publicUrl}
                  alt={m.name}
                  className="w-12 h-12 object-cover rounded border"
                  onError={() => setBrokenImages(prev => new Set(prev).add(m.id))}
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-on-surface truncate">{m.name}</p>
                <p className="text-xs text-on-surface-variant truncate">{m.publicUrl}</p>
              </div>
              <button onClick={() => copyUrl(m.publicUrl)} className="text-on-surface-variant hover:text-on-surface-variant" title={t('media.copyUrl')}><Copy size={14} /></button>
              <button onClick={() => handleDelete(m.id)} className="text-eth-danger hover:text-eth-danger" title={t('media.delete')}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
