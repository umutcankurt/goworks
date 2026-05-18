import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Plus, Trash2, Upload, Server, CheckCircle, XCircle, Loader, Pencil, Check, X, Search, Image as ImageIcon, Building2, Languages, ShieldCheck, RefreshCw, RotateCcw, Copy, ExternalLink } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { titlesApi, institutionsApi, serverApi, appConfigApi, type ServiceAccountStatus, type DwdTestResult } from '../services/server-api';
import { useAppConfig } from '../contexts/AppConfigContext';
import { useAuth } from '../contexts/AuthContext';
import { initialsFrom } from '../utils/initials';
import { useLanguage } from '../i18n/useLanguage';
import { LANGUAGES } from '../i18n/types';
import { HelpGuide } from '../components/HelpGuide';
import { OAuthCredentialsForm } from '../components/onboarding/shared/OAuthCredentialsForm';

type Tab = 'general' | 'titles' | 'institutions';

export function Settings() {
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const { t } = useTranslation('settings');

  const tabs: { key: Tab; labelKey: string }[] = [
    { key: 'general', labelKey: 'tabs.general' },
    { key: 'titles', labelKey: 'tabs.titles' },
    { key: 'institutions', labelKey: 'tabs.institutions' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-on-surface">{t('title')}</h1>
        <HelpGuide namespace="settings" />
      </div>

      <div className="bg-surface-container rounded-xl shadow-sm border eth-border-ghost overflow-hidden">
        <div className="border-b border-outline-variant/30">
          <nav className="flex">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.key
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-on-surface-variant hover:text-on-surface'
                  }`}
              >
                {t(tab.labelKey)}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'general' && <GeneralTab />}
          {activeTab === 'titles' && <TitlesTab disabled={false} />}
          {activeTab === 'institutions' && <InstitutionsTab disabled={false} />}
        </div>
      </div>
    </motion.div>
  );
}

function TitlesTab({ disabled }: { disabled: boolean }) {
  const [titles, setTitles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [csvText, setCsvText] = useState('');
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const { addToast } = useToast();
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { t: tToast } = useTranslation('toast');

  const fetchTitles = useCallback(async () => {
    if (disabled) { setLoading(false); return; }
    try {
      setLoading(true);
      const data = await titlesApi.getAll();
      setTitles(data);
    } catch (err: any) {
      addToast(tToast('settings.titlesLoadFailed', { error: err.message }));
    } finally {
      setLoading(false);
    }
  }, [disabled, addToast, tToast]);

  useEffect(() => { fetchTitles(); }, [fetchTitles]);

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    try {
      await titlesApi.create(newTitle.trim());
      setNewTitle('');
      addToast(tToast('settings.titleAdded'));
      fetchTitles();
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  const handleUpdate = async (id: number) => {
    if (!editingName.trim()) return;
    try {
      await titlesApi.update(id, editingName.trim());
      setEditingId(null);
      addToast(tToast('settings.titleUpdated'));
      fetchTitles();
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await titlesApi.delete(id);
      addToast(tToast('settings.titleDeleted'));
      fetchTitles();
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  const handleCsvImport = async () => {
    if (!csvText.trim()) return;
    try {
      const result = await titlesApi.importCsv(csvText);
      addToast(tToast('settings.titlesImported', { created: result.created, skipped: result.skipped }));
      setCsvText('');
      setShowCsvImport(false);
      fetchTitles();
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  if (disabled) return <p className="text-on-surface-variant">{t('serverRequired')}</p>;
  if (loading) return <div className="flex items-center gap-2 text-on-surface-variant"><Loader className="animate-spin" size={18} /> {tCommon('loading')}</div>;

  const filtered = searchQuery.length >= 3
    ? titles.filter(x => x.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : titles;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder={t('titles.newPlaceholder')}
          className="flex-1 px-3 py-2 border eth-border-ghost rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
        <button onClick={handleAdd} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 flex items-center gap-1">
          <Plus size={16} /> {tCommon('add')}
        </button>
        <button onClick={() => setShowCsvImport(!showCsvImport)} className="px-4 py-2 bg-surface-container-high text-on-surface rounded-lg text-sm hover:bg-surface-container-highest flex items-center gap-1">
          <Upload size={16} /> {tCommon('csv')}
        </button>
      </div>

      {showCsvImport && (
        <div className="border eth-border-ghost rounded-lg p-4 space-y-2 bg-surface-container-low">
          <p className="text-xs text-on-surface-variant" dangerouslySetInnerHTML={{ __html: t('titles.csvFormat') }} />
          <textarea
            value={csvText}
            onChange={e => setCsvText(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border eth-border-ghost rounded-lg text-sm font-mono"
            placeholder={t('titles.csvPlaceholder')}
          />
          <button onClick={handleCsvImport} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700">{tCommon('import')}</button>
        </div>
      )}

      {titles.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('titles.searchPlaceholder')}
              className="w-full pl-9 pr-8 py-2 border eth-border-ghost rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface-variant">
                <X size={14} />
              </button>
            )}
          </div>
          {searchQuery.length >= 3 && (
            <span className="text-xs text-on-surface-variant whitespace-nowrap">
              {t('titles.searchSummary', { matches: filtered.length, total: titles.length })}
            </span>
          )}
          {searchQuery.length > 0 && searchQuery.length < 3 && (
            <span className="text-xs text-on-surface-variant whitespace-nowrap">{tCommon('minSearchChars')}</span>
          )}
        </div>
      )}

      <div className="border eth-border-ghost rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-container-low">
            <tr>
              <th className="text-left px-4 py-2 text-on-surface-variant font-medium">{t('titles.tableHeader')}</th>
              <th className="w-24"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row: any) => (
              <tr key={row.id} className="border-t border-outline-variant/30 hover:bg-surface-container-low">
                {editingId === row.id ? (
                  <>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleUpdate(row.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        autoFocus
                        className="w-full px-2 py-1 border border-primary-300 rounded text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </td>
                    <td className="px-4 py-2 flex items-center gap-1">
                      <button onClick={() => handleUpdate(row.id)} aria-label={tCommon('save')} title={tCommon('save')} className="text-eth-secondary hover:text-eth-secondary"><Check size={16} aria-hidden="true" /></button>
                      <button onClick={() => setEditingId(null)} aria-label={tCommon('cancel')} title={tCommon('cancel')} className="text-on-surface-variant hover:text-on-surface-variant"><X size={16} aria-hidden="true" /></button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-2">{row.name}</td>
                    <td className="px-4 py-2 flex items-center gap-5">
                      <button onClick={() => { setEditingId(row.id); setEditingName(row.name); }} aria-label={tCommon('edit')} title={tCommon('edit')} className="text-on-surface-variant hover:text-primary-600"><Pencil size={16} aria-hidden="true" /></button>
                      <button onClick={() => handleDelete(row.id)} aria-label={tCommon('delete')} title={tCommon('delete')} className="text-eth-danger hover:text-eth-danger"><Trash2 size={16} aria-hidden="true" /></button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={2} className="px-4 py-8 text-center text-on-surface-variant">
                {searchQuery.length >= 3 ? t('titles.noMatches') : t('titles.empty')}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      {titles.length > 0 && (
        <p className="text-xs text-on-surface-variant text-right">
          {searchQuery.length >= 3
            ? t('titles.filteredSummary', { matches: filtered.length, total: titles.length })
            : t('titles.totalSummary', { total: titles.length })}
        </p>
      )}
    </div>
  );
}

function InstitutionsTab({ disabled }: { disabled: boolean }) {
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', address: '', phone: '' });
  const [csvText, setCsvText] = useState('');
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: '', address: '', phone: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const { addToast } = useToast();
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { t: tToast } = useTranslation('toast');

  const fetchInstitutions = useCallback(async () => {
    if (disabled) { setLoading(false); return; }
    try {
      setLoading(true);
      const data = await institutionsApi.getAll();
      setInstitutions(data);
    } catch (err: any) {
      addToast(tToast('settings.institutionsLoadFailed', { error: err.message }));
    } finally {
      setLoading(false);
    }
  }, [disabled, addToast, tToast]);

  useEffect(() => { fetchInstitutions(); }, [fetchInstitutions]);

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    try {
      await institutionsApi.create({ name: form.name.trim(), address: form.address.trim() || undefined, phone: form.phone.trim() || undefined });
      setForm({ name: '', address: '', phone: '' });
      addToast(tToast('settings.institutionAdded'));
      fetchInstitutions();
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  const handleUpdate = async (id: number) => {
    if (!editForm.name.trim()) return;
    try {
      await institutionsApi.update(id, {
        name: editForm.name.trim(),
        address: editForm.address.trim() || undefined,
        phone: editForm.phone.trim() || undefined,
      });
      setEditingId(null);
      addToast(tToast('settings.institutionUpdated'));
      fetchInstitutions();
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await institutionsApi.delete(id);
      addToast(tToast('settings.institutionDeleted'));
      fetchInstitutions();
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  const handleCsvImport = async () => {
    if (!csvText.trim()) return;
    try {
      const result = await institutionsApi.importCsv(csvText);
      addToast(tToast('settings.institutionsImported', { created: result.created, skipped: result.skipped }));
      setCsvText('');
      setShowCsvImport(false);
      fetchInstitutions();
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  if (disabled) return <p className="text-on-surface-variant">{t('serverRequired')}</p>;
  if (loading) return <div className="flex items-center gap-2 text-on-surface-variant"><Loader className="animate-spin" size={18} /> {tCommon('loading')}</div>;

  const filterFn = (c: any) => [c.name, c.address, c.phone].some((f: any) => f?.toLowerCase().includes(searchQuery.toLowerCase()));
  const filtered = searchQuery.length >= 3 ? institutions.filter(filterFn) : institutions;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('institutions.namePlaceholder')} className="px-3 py-2 border eth-border-ghost rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
        <input type="text" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder={t('institutions.addressPlaceholder')} className="px-3 py-2 border eth-border-ghost rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
        <input type="text" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder={t('institutions.phonePlaceholder')} className="px-3 py-2 border eth-border-ghost rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
      </div>
      <div className="flex gap-2">
        <button onClick={handleAdd} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 flex items-center gap-1">
          <Plus size={16} /> {tCommon('add')}
        </button>
        <button onClick={() => setShowCsvImport(!showCsvImport)} className="px-4 py-2 bg-surface-container-high text-on-surface rounded-lg text-sm hover:bg-surface-container-highest flex items-center gap-1">
          <Upload size={16} /> {tCommon('csv')}
        </button>
      </div>

      {showCsvImport && (
        <div className="border eth-border-ghost rounded-lg p-4 space-y-2 bg-surface-container-low">
          <p className="text-xs text-on-surface-variant" dangerouslySetInnerHTML={{ __html: t('institutions.csvFormat') }} />
          <textarea
            value={csvText}
            onChange={e => setCsvText(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border eth-border-ghost rounded-lg text-sm font-mono"
            placeholder={t('institutions.csvPlaceholder')}
          />
          <button onClick={handleCsvImport} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700">{tCommon('import')}</button>
        </div>
      )}

      {institutions.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('institutions.searchPlaceholder')}
              className="w-full pl-9 pr-8 py-2 border eth-border-ghost rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface-variant">
                <X size={14} />
              </button>
            )}
          </div>
          {searchQuery.length >= 3 && (
            <span className="text-xs text-on-surface-variant whitespace-nowrap">
              {t('titles.searchSummary', { matches: filtered.length, total: institutions.length })}
            </span>
          )}
          {searchQuery.length > 0 && searchQuery.length < 3 && (
            <span className="text-xs text-on-surface-variant whitespace-nowrap">{tCommon('minSearchChars')}</span>
          )}
        </div>
      )}

      <div className="border eth-border-ghost rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-container-low">
            <tr>
              <th className="text-left px-4 py-2 text-on-surface-variant font-medium">{t('institutions.headers.name')}</th>
              <th className="text-left px-4 py-2 text-on-surface-variant font-medium">{t('institutions.headers.address')}</th>
              <th className="text-left px-4 py-2 text-on-surface-variant font-medium">{t('institutions.headers.phone')}</th>
              <th className="w-24"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c: any) => (
              <tr key={c.id} className="border-t border-outline-variant/30 hover:bg-surface-container-low">
                {editingId === c.id ? (
                  <>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleUpdate(c.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        autoFocus
                        className="w-full px-2 py-1 border border-primary-300 rounded text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={editForm.address}
                        onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleUpdate(c.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        placeholder={t('institutions.headers.address')}
                        className="w-full px-2 py-1 border border-primary-300 rounded text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={editForm.phone}
                        onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleUpdate(c.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        placeholder={t('institutions.headers.phone')}
                        className="w-full px-2 py-1 border border-primary-300 rounded text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </td>
                    <td className="px-4 py-2 flex items-center gap-1">
                      <button onClick={() => handleUpdate(c.id)} aria-label={tCommon('save')} title={tCommon('save')} className="text-eth-secondary hover:text-eth-secondary"><Check size={16} aria-hidden="true" /></button>
                      <button onClick={() => setEditingId(null)} aria-label={tCommon('cancel')} title={tCommon('cancel')} className="text-on-surface-variant hover:text-on-surface-variant"><X size={16} aria-hidden="true" /></button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-2">{c.name}</td>
                    <td className="px-4 py-2 text-on-surface-variant">{c.address || '-'}</td>
                    <td className="px-4 py-2 text-on-surface-variant">{c.phone || '-'}</td>
                    <td className="px-4 py-2 flex items-center gap-5">
                      <button onClick={() => { setEditingId(c.id); setEditForm({ name: c.name, address: c.address || '', phone: c.phone || '' }); }} aria-label={tCommon('edit')} title={tCommon('edit')} className="text-on-surface-variant hover:text-primary-600"><Pencil size={16} aria-hidden="true" /></button>
                      <button onClick={() => handleDelete(c.id)} aria-label={tCommon('delete')} title={tCommon('delete')} className="text-eth-danger hover:text-eth-danger"><Trash2 size={16} aria-hidden="true" /></button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-on-surface-variant">
                {searchQuery.length >= 3 ? t('institutions.noMatches') : t('institutions.empty')}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      {institutions.length > 0 && (
        <p className="text-xs text-on-surface-variant text-right">
          {searchQuery.length >= 3
            ? t('institutions.filteredSummary', { matches: filtered.length, total: institutions.length })
            : t('institutions.totalSummary', { total: institutions.length })}
        </p>
      )}
    </div>
  );
}

function GeneralTab() {
  const { config, effectiveSidebarAbbr, logoDataUrl, saveStatus, setConfig, setConfigLocal, commitConfig, uploadLogo, deleteLogo } = useAppConfig();
  const { addToast } = useToast();
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { t: tToast } = useTranslation('toast');
  const { language, setLanguage } = useLanguage();

  const [draftSidebarAbbr, setDraftSidebarAbbr] = useState(config.sidebarAbbr ?? '');
  const [draftAllowedDomain, setDraftAllowedDomain] = useState(config.allowedDomain);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    setDraftSidebarAbbr(config.sidebarAbbr ?? '');
    setDraftAllowedDomain(config.allowedDomain);
  }, [config.sidebarAbbr, config.allowedDomain]);

  const handleLiveChange = (key: 'companyName' | 'emailSenderName', value: string) => {
    setConfig(key, value).catch((err: any) => {
      addToast(err.message || tCommon('saveError'), 'error');
    });
  };

  const handleSidebarAbbrChange = (value: string) => {
    setDraftSidebarAbbr(value);
    setConfigLocal('sidebarAbbr', value.trim() || null);
  };
  const handleSidebarAbbrBlur = async () => {
    const next = draftSidebarAbbr.trim() || null;
    if (next === (config.sidebarAbbr ?? null)) return;
    try {
      await commitConfig('sidebarAbbr', next);
    } catch (err: any) {
      addToast(err.message || tCommon('saveError'), 'error');
    }
  };

  const handleAllowedDomainBlur = async () => {
    const next = draftAllowedDomain.trim();
    if (!next) {
      addToast(t('general.allowedDomain.requiredError'), 'error');
      // Form-level zorunluluk: domain boş bırakılamaz. Eski değere geri dön.
      setDraftAllowedDomain(config.allowedDomain);
      return;
    }
    if (next === config.allowedDomain) return;
    try {
      await commitConfig('allowedDomain', next);
      addToast(tToast('settings.domainUpdated'));
    } catch (err: any) {
      addToast(err.message || tCommon('saveError'), 'error');
    }
  };

  const handleLogoFile = async (file: File) => {
    if (file.size > 1024 * 1024) {
      addToast(tToast('settings.logoTooLarge'), 'error');
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!['png', 'jpg', 'jpeg', 'svg', 'webp'].includes(ext)) {
      addToast(tToast('settings.logoFormatInvalid'), 'error');
      return;
    }
    try {
      setUploadingLogo(true);
      const buf = await file.arrayBuffer();
      await uploadLogo(buf, ext);
      addToast(tToast('settings.logoUploaded'));
    } catch (err: any) {
      addToast(err.message || tToast('settings.logoUploadFailed'), 'error');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleLogoDelete = async () => {
    if (!window.confirm(t('general.logo.confirmDelete'))) return;
    try {
      await deleteLogo();
      addToast(tToast('settings.logoDeleted'));
    } catch (err: any) {
      addToast(err.message || tToast('settings.logoDeleteFailed'), 'error');
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-start gap-3">
        <Building2 size={24} className="text-on-surface-variant mt-0.5" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-on-surface">{t('general.company.heading')}</h3>
            {saveStatus === 'saving' && <span className="text-xs text-on-surface-variant">{tCommon('saving')}</span>}
            {saveStatus === 'saved' && <span className="text-xs text-eth-secondary">✓ {tCommon('saved')}</span>}
            {saveStatus === 'error' && <span className="text-xs text-eth-danger">✕ {tCommon('saveFailed')}</span>}
          </div>
          <p className="text-sm text-on-surface-variant">{t('general.company.description')}</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-on-surface mb-1">
            {t('general.companyName.label')} <span className="text-eth-danger">*</span>
          </label>
          <input
            type="text"
            value={config.companyName}
            onChange={(e) => handleLiveChange('companyName', e.target.value)}
            maxLength={80}
            placeholder={t('general.companyName.placeholder')}
            className="w-full px-3 py-2 border eth-border-ghost rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          <p className="text-xs text-on-surface-variant mt-1">
            {config.companyName ? (
              <Trans
                i18nKey="general.companyName.helperWith"
                t={t}
                values={{ name: config.companyName }}
                components={{ b: <strong /> }}
              />
            ) : (
              <Trans
                i18nKey="general.companyName.helperEmpty"
                t={t}
                components={{ b: <strong /> }}
              />
            )}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-on-surface mb-1">
            {t('general.sidebarAbbr.label')}
          </label>
          <input
            type="text"
            value={draftSidebarAbbr}
            onChange={(e) => handleSidebarAbbrChange(e.target.value)}
            onBlur={handleSidebarAbbrBlur}
            maxLength={5}
            placeholder={initialsFrom(config.companyName) || 'GW'}
            className="w-full px-3 py-2 border eth-border-ghost rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          <p className="text-xs text-on-surface-variant mt-1">
            {t('general.sidebarAbbr.helper')}
            <span className="ml-2 inline-flex w-7 h-7 rounded bg-primary-500 text-white items-center justify-center font-bold text-xs align-middle">
              {effectiveSidebarAbbr}
            </span>
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-on-surface mb-1">
            {t('general.allowedDomain.label')} <span className="text-eth-danger">*</span>
          </label>
          <input
            type="text"
            value={draftAllowedDomain}
            onChange={(e) => setDraftAllowedDomain(e.target.value)}
            onBlur={handleAllowedDomainBlur}
            placeholder={t('general.allowedDomain.placeholder')}
            className="w-full px-3 py-2 border eth-border-ghost rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          <p className="text-xs text-on-surface-variant mt-1">
            {config.allowedDomain ? t('general.allowedDomain.helperWith') : t('general.allowedDomain.helperEmpty')}
            {' '}{t('general.allowedDomain.helperBlur')}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-on-surface mb-1">
            {t('general.emailSenderName.label')}
          </label>
          <input
            type="text"
            value={config.emailSenderName}
            onChange={(e) => handleLiveChange('emailSenderName', e.target.value)}
            maxLength={80}
            placeholder={t('general.emailSenderName.placeholder')}
            className="w-full px-3 py-2 border eth-border-ghost rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          <p className="text-xs text-on-surface-variant mt-1">
            {t('general.emailSenderName.helper', { name: config.emailSenderName })}
          </p>
        </div>
      </div>

      <div className="border-t border-outline-variant/30 pt-6">
        <div className="flex items-start gap-3 mb-3">
          <Languages size={24} className="text-on-surface-variant mt-0.5" />
          <div>
            <h3 className="font-medium text-on-surface">{t('general.language.heading')}</h3>
            <p className="text-sm text-on-surface-variant">{t('general.language.description')}</p>
          </div>
        </div>
        <div className="max-w-xs">
          <label className="block text-sm font-medium text-on-surface mb-1">{t('general.language.label')}</label>
          <select
            value={language}
            onChange={(e) => { void setLanguage(e.target.value as 'tr' | 'en'); }}
            className="w-full px-3 py-2 border eth-border-ghost rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-surface-container"
          >
            {LANGUAGES.map((lng) => (
              <option key={lng.code} value={lng.code}>
                {t(`general.language.options.${lng.code}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="border-t border-outline-variant/30 pt-6">
        <div className="flex items-center gap-3 mb-3">
          <ImageIcon size={24} className="text-on-surface-variant" />
          <div>
            <h3 className="font-medium text-on-surface">{t('general.logo.heading')}</h3>
            <p className="text-sm text-on-surface-variant">{t('general.logo.description')}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-lg border eth-border-ghost bg-surface-container-low flex items-center justify-center overflow-hidden">
            {logoDataUrl ? (
              <img src={logoDataUrl} alt="Logo" className="w-full h-full object-contain" />
            ) : (
              <span className="text-3xl font-bold text-on-surface-variant">{effectiveSidebarAbbr}</span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer transition-colors w-fit ${uploadingLogo ? 'bg-surface-container-high text-on-surface-variant' : 'bg-primary-500 hover:bg-primary-600 text-white'}`}>
              <Upload size={18} />
              {uploadingLogo ? t('general.logo.uploading') : (logoDataUrl ? t('general.logo.replace') : t('general.logo.upload'))}
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.svg,.webp"
                className="hidden"
                disabled={uploadingLogo}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleLogoFile(f);
                  e.target.value = '';
                }}
              />
            </label>
            {logoDataUrl && (
              <button
                onClick={handleLogoDelete}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-eth-danger/30 text-eth-danger hover:bg-eth-danger/10 transition-colors w-fit"
              >
                <Trash2 size={18} />
                {t('general.logo.deleteButton')}
              </button>
            )}
          </div>
        </div>
      </div>

      <GoogleCloudSection />
      <ServiceAccountSection />
      <DwdSection />
      <ResetWizardSection />
    </div>
  );
}

/* ============================================================
 * Google Cloud OAuth credentials — clientId + clientSecret (Faz 31)
 * ============================================================ */
function GoogleCloudSection() {
  const { t } = useTranslation('settings');
  return (
    <div className="rounded-2xl bg-surface-container-low border border-outline-variant/40 p-6">
      <h2 className="text-lg font-semibold text-on-surface mb-1">
        {t('general.googleCloud.title')}
      </h2>
      <p className="text-sm text-on-surface-variant mb-4">
        {t('general.googleCloud.subtitle')}
      </p>
      <OAuthCredentialsForm requireSecret={false} showClearButton />
    </div>
  );
}

/* ============================================================
 * Service Account — eski "Servis Hesabı" sekmesi yerine GeneralTab altında
 * ============================================================ */
function ServiceAccountSection() {
  const { addToast } = useToast();
  const { t } = useTranslation('settings');
  const { t: tToast } = useTranslation('toast');
  const [status, setStatus] = useState<ServiceAccountStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const s = await serverApi.getServiceAccountStatus();
      setStatus(s);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleFileSelect = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.json')) {
      addToast(t('general.serviceAccount.selectJsonFile'));
      return;
    }
    try {
      setUploading(true);
      const content = await file.text();
      await serverApi.uploadServiceAccount(content);
      addToast(tToast('settings.serviceAccountUploaded'));
      await refresh();
    } catch (err: any) {
      addToast(tToast('settings.serviceAccountUploadFailed', { error: err.message }));
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!window.confirm(t('general.serviceAccount.confirmDelete'))) return;
    try {
      await serverApi.deleteServiceAccount();
      addToast(tToast('settings.serviceAccountDeleted'));
      await refresh();
    } catch (err: any) {
      addToast(tToast('settings.serviceAccountDeleteFailed', { error: err.message }));
    }
  };

  return (
    <div className="border-t border-outline-variant/30 pt-6">
      <div className="flex items-start gap-3 mb-3">
        <Server size={24} className="text-on-surface-variant mt-0.5" />
        <div>
          <h3 className="font-medium text-on-surface">{t('general.serviceAccount.heading')}</h3>
          <p className="text-sm text-on-surface-variant" dangerouslySetInnerHTML={{ __html: t('general.serviceAccount.description') }} />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-on-surface-variant"><Loader className="animate-spin" size={18} /> {t('general.serviceAccount.checking')}</div>
      ) : (
        <div className="space-y-3">
          {status?.configured ? (
            <div className="flex items-center justify-between gap-3 text-eth-secondary bg-eth-secondary/10 px-4 py-3 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle size={20} />
                <div>
                  <p className="font-medium">{t('general.serviceAccount.configured')}</p>
                  <p className="text-sm font-mono">{status.email}</p>
                </div>
              </div>
              <button
                onClick={handleRemove}
                className="px-3 py-1.5 text-sm border border-eth-danger/30 text-eth-danger hover:bg-eth-danger/10 rounded-lg transition-colors"
              >
                {t('general.serviceAccount.deleteKey')}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-amber-600 bg-amber-500/10 px-4 py-3 rounded-lg">
              <XCircle size={20} />
              <div>
                <p className="font-medium">{t('general.serviceAccount.notConfigured')}</p>
                <p className="text-sm">{t('general.serviceAccount.notConfiguredHelp')}</p>
              </div>
            </div>
          )}

          <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer transition-colors w-fit ${uploading ? 'bg-surface-container-high text-on-surface-variant' : 'bg-primary-500 hover:bg-primary-600 text-white'}`}>
            <Upload size={18} />
            {uploading ? t('general.serviceAccount.uploading') : (status?.configured ? t('general.serviceAccount.uploadNew') : t('general.serviceAccount.uploadJson'))}
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * Domain-Wide Delegation — Client ID + scope listesi + test butonu
 * ============================================================ */
function DwdSection() {
  const { t } = useTranslation('settings');
  const { user } = useAuth();
  const [status, setStatus] = useState<ServiceAccountStatus | null>(null);
  const [scopes, setScopes] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<DwdTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    serverApi.getServiceAccountStatus().then(setStatus).catch(() => setStatus(null));
    appConfigApi.getDwdScopes().then(setScopes).catch(() => setScopes([]));
  }, []);

  const copy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 1500);
    } catch { /* clipboard blocked */ }
  };

  const runTest = async () => {
    setTesting(true);
    setError(null);
    try {
      const res = await appConfigApi.testDwdScopes(user?.email);
      setResult(res);
    } catch (err: any) {
      setError(err.message || 'Test failed');
      setResult(null);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="border-t border-outline-variant/30 pt-6">
      <div className="flex items-start gap-3 mb-3">
        <ShieldCheck size={24} className="text-on-surface-variant mt-0.5" />
        <div>
          <h3 className="font-medium text-on-surface">{t('general.dwd.heading')}</h3>
          <p className="text-sm text-on-surface-variant">{t('general.dwd.description')}</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="rounded-lg border eth-border-ghost bg-surface-container-low p-3">
          <div className="text-xs font-medium uppercase tracking-wider text-on-surface-variant mb-1">{t('general.dwd.clientIdLabel')}</div>
          {status?.clientId ? (
            <div className="flex items-center justify-between gap-3">
              <code className="font-mono text-sm text-on-surface break-all">{status.clientId}</code>
              <button
                type="button"
                onClick={() => copy(status.clientId!, 'cid')}
                className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-surface-container border eth-border-ghost text-xs text-on-surface-variant hover:bg-surface-container-low"
              >
                {copiedKey === 'cid' ? <Check size={14} className="text-eth-secondary" /> : <Copy size={14} />}
                {copiedKey === 'cid' ? t('general.dwd.copied') : t('general.dwd.copy')}
              </button>
            </div>
          ) : (
            <div className="text-sm text-on-surface-variant">{t('general.dwd.clientIdMissing')}</div>
          )}
        </div>

        <div className="rounded-lg border eth-border-ghost bg-surface-container-low p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-on-surface-variant">{t('general.dwd.scopesLabel')}</span>
            <button
              type="button"
              onClick={() => copy(scopes.join(','), 'all')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-surface-container border eth-border-ghost text-xs text-primary-600 hover:bg-surface-container-low"
            >
              {copiedKey === 'all' ? <Check size={14} className="text-eth-secondary" /> : <Copy size={14} />}
              {copiedKey === 'all' ? t('general.dwd.copied') : t('general.dwd.copyAll')}
            </button>
          </div>
          <ul className="space-y-1">
            {scopes.map((scope) => (
              <li key={scope} className="font-mono text-xs text-on-surface-variant truncate">{scope}</li>
            ))}
          </ul>
        </div>

        <a
          href="https://admin.google.com/ac/owl/domainwidedelegation"
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:underline"
        >
          <ExternalLink size={14} />
          {t('general.dwd.openConsole')}
        </a>

        <div className="pt-2">
          <button
            type="button"
            onClick={runTest}
            disabled={testing || !status?.configured}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm disabled:bg-surface-container-highest disabled:text-on-surface-variant disabled:cursor-not-allowed"
          >
            {testing ? <Loader className="animate-spin" size={16} /> : <RefreshCw size={16} />}
            {testing ? t('general.dwd.testing') : t('general.dwd.testButton')}
          </button>

          {error && (
            <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-eth-danger/10 border border-eth-danger/30 text-sm text-eth-danger">
              <XCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {result?.ok && (
            <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-eth-secondary/10 border border-eth-secondary/30 text-sm text-eth-secondary">
              <CheckCircle size={16} className="mt-0.5 shrink-0" />
              <span>{t('general.dwd.testSuccess', { adminEmail: result.adminEmail })}</span>
            </div>
          )}
          {result && !result.ok && (
            <div className="mt-2 px-3 py-2 rounded-lg bg-eth-danger/10 border border-eth-danger/30 text-sm text-eth-danger">
              <div className="flex items-start gap-2">
                <XCircle size={16} className="mt-0.5 shrink-0" />
                <span>{t('general.dwd.testFail', { error: result.errorMessage || 'unauthorized_client' })}</span>
              </div>
              <div className="mt-1 text-xs text-on-surface-variant">{t('general.dwd.testHelper', { adminEmail: result.adminEmail })}</div>
              {result.errorMessage?.includes('unauthorized_client') && (
                <div className="mt-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-500">
                  <p className="font-medium mb-1">{t('general.dwd.unauthorizedClientHint.heading')}</p>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    <li>{t('general.dwd.unauthorizedClientHint.step1')}</li>
                    <li>{t('general.dwd.unauthorizedClientHint.step2')}</li>
                    <li>{t('general.dwd.unauthorizedClientHint.step3')}</li>
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * "Sihirbazı tekrar başlat" — onboarding'i sıfırlar
 * ============================================================ */
function ResetWizardSection() {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { resetOnboarding } = useAppConfig();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const handleReset = async () => {
    if (!window.confirm(t('general.resetWizard.confirm'))) return;
    try {
      setBusy(true);
      await resetOnboarding();
      navigate('/onboarding');
    } catch (err: any) {
      addToast(err.message || tCommon('saveError'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-outline-variant/30 pt-6">
      <div className="flex items-start gap-3 mb-3">
        <RotateCcw size={24} className="text-on-surface-variant mt-0.5" />
        <div>
          <h3 className="font-medium text-on-surface">{t('general.resetWizard.heading')}</h3>
          <p className="text-sm text-on-surface-variant">{t('general.resetWizard.description')}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleReset}
        disabled={busy}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border eth-border-ghost text-on-surface hover:bg-surface-container-low text-sm disabled:opacity-50"
      >
        {busy ? <Loader className="animate-spin" size={16} /> : <RotateCcw size={16} />}
        {t('general.resetWizard.button')}
      </button>
    </div>
  );
}
