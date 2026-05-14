import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { groupsApi } from '../services/server-api';
import { useToast } from '../contexts/ToastContext';
import type { AdminGroup } from '../types/admin';
import { HelpGuide } from '../components/HelpGuide';

const PAGE_SIZE = 50;

export const GroupsList: React.FC = () => {
    const [groups, setGroups] = useState<AdminGroup[]>([]);
    const [nextPageToken, setNextPageToken] = useState<string | undefined>();
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [appliedQuery, setAppliedQuery] = useState('');
    const [error, setError] = useState('');
    const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    const navigate = useNavigate();
    const { addToast } = useToast();
    const { t } = useTranslation('groups');
    const { t: tToast } = useTranslation('toast');

    const fetchPage = async (search: string, pageToken?: string, append = false) => {
        setLoading(true);
        setError('');
        try {
            if (search) {
                const [byName, byEmail] = await Promise.all([
                    groupsApi.list({ query: `name:${search}*`, maxResults: PAGE_SIZE }),
                    groupsApi.list({ query: `email:${search}*`, maxResults: PAGE_SIZE }),
                ]);
                const seen = new Set<string>();
                const merged: AdminGroup[] = [];
                for (const g of [...(byName.groups || []), ...(byEmail.groups || [])]) {
                    const key = g.id || g.email;
                    if (key && !seen.has(key)) {
                        seen.add(key);
                        merged.push(g);
                    }
                }
                setGroups(merged);
                setNextPageToken(undefined);
            } else {
                const data = await groupsApi.list({ pageToken, maxResults: PAGE_SIZE });
                setGroups((prev) => (append ? [...prev, ...(data.groups || [])] : data.groups || []));
                setNextPageToken(data.nextPageToken);
            }
        } catch (err: any) {
            setError(err.message || t('list.loadFailed'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPage('');
    }, []);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = searchQuery.trim();
        setAppliedQuery(trimmed);
        fetchPage(trimmed);
    };

    const handleReset = () => {
        setSearchQuery('');
        setAppliedQuery('');
        fetchPage('');
    };

    const handleLoadMore = () => {
        if (nextPageToken && !appliedQuery) fetchPage('', nextPageToken, true);
    };

    const handleDelete = async (key: string) => {
        setDeleting(true);
        try {
            await groupsApi.delete(key);
            setGroups((prev) => prev.filter((g) => g.id !== key && g.email !== key));
            addToast(tToast('groups.deleted'), 'success');
        } catch (err: any) {
            addToast(err.message || tToast('groups.deleteFailed'), 'error');
        } finally {
            setDeleting(false);
            setPendingDeleteKey(null);
        }
    };

    const pendingGroup = pendingDeleteKey
        ? groups.find((g) => g.id === pendingDeleteKey || g.email === pendingDeleteKey)
        : null;

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h1 className="text-2xl font-bold text-on-surface">{t('list.title')}</h1>

                <div className="flex gap-2 items-center">
                    <form onSubmit={handleSearch} className="flex gap-2">
                        <input
                            type="text"
                            placeholder={t('list.searchPlaceholder')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="px-4 py-2 border border-outline-variant/30 rounded-lg focus:ring-2 focus:ring-eth-primary-container/40 focus:border-eth-primary-container/40 w-64"
                        />
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-4 py-2 bg-eth-primary-container text-on-eth-primary-container rounded-lg hover:brightness-110 transition-colors disabled:opacity-50"
                        >
                            {t('list.search')}
                        </button>
                        {appliedQuery && (
                            <button
                                type="button"
                                onClick={handleReset}
                                className="px-4 py-2 bg-surface-container-high text-on-surface rounded-lg hover:bg-surface-container-highest transition-colors"
                            >
                                {t('list.clear')}
                            </button>
                        )}
                    </form>
                    <button
                        type="button"
                        onClick={() => navigate('/groups/new')}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-eth-secondary text-surface rounded-lg hover:brightness-110 transition-colors"
                    >
                        <Plus size={18} />
                        {t('list.newGroup')}
                    </button>
                    <HelpGuide namespace="groups" />
                </div>
            </div>

            <div className="bg-surface-container rounded-xl shadow-sm border border-outline-variant/30 p-6 min-h-[400px]">
                {error && (
                    <div className="mb-4 p-3 bg-eth-danger/10 text-eth-danger rounded-lg text-sm">{error}</div>
                )}

                {loading && groups.length === 0 ? (
                    <div className="flex justify-center items-center h-48 text-on-surface-variant font-medium bg-surface-container-low rounded-xl border border-outline-variant/30 border-dashed">
                        {t('list.loading')}
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto border rounded-xl shadow-sm">
                            <table className="min-w-full divide-y divide-outline-variant/30">
                                <thead className="bg-surface-container-low">
                                    <tr>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{t('list.table.name')}</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{t('list.table.email')}</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{t('list.table.description')}</th>
                                        <th className="px-6 py-4 text-right text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{t('list.table.action')}</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-surface-container divide-y divide-outline-variant/30">
                                    {groups.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-12 text-center text-on-surface-variant font-medium">
                                                {appliedQuery ? t('list.noResults') : t('list.empty')}
                                            </td>
                                        </tr>
                                    ) : (
                                        groups.map((g) => (
                                            <tr key={g.id} className="hover:bg-surface-container-low transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="font-medium text-on-surface">{g.name}</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-on-surface-variant">{g.email}</td>
                                                <td className="px-6 py-4 text-sm text-on-surface-variant max-w-md truncate">{g.description || '—'}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                                    <div className="inline-flex gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => navigate(`/groups/${encodeURIComponent(g.email)}`)}
                                                            className="inline-flex items-center gap-1 text-eth-primary hover:text-eth-primary font-medium bg-eth-primary-container/10 hover:bg-eth-primary-container/15 px-3 py-1.5 rounded-lg transition-colors"
                                                        >
                                                            <Pencil size={14} /> {t('list.edit')}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setPendingDeleteKey(g.email)}
                                                            className="inline-flex items-center gap-1 text-eth-danger hover:text-eth-danger font-medium bg-eth-danger/10 hover:bg-eth-danger/15 px-3 py-1.5 rounded-lg transition-colors"
                                                        >
                                                            <Trash2 size={14} /> {t('list.delete')}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {nextPageToken && (
                            <div className="flex justify-center mt-6">
                                <button
                                    onClick={handleLoadMore}
                                    disabled={loading}
                                    className="px-6 py-2.5 bg-surface-container-high text-on-surface rounded-lg hover:bg-surface-container-highest transition-colors font-medium disabled:opacity-50 border border-outline-variant/30"
                                >
                                    {loading ? t('list.loadingShort') : t('list.loadMore', { count: groups.length })}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>

            {pendingGroup && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                    <div className="bg-surface-container rounded-xl shadow-xl p-6 w-full max-w-md">
                        <h3 className="text-lg font-semibold text-on-surface mb-2">{t('list.deleteDialog.title')}</h3>
                        <p className="text-sm text-on-surface-variant mb-4">
                            <Trans
                                i18nKey="list.deleteDialog.message"
                                t={t}
                                values={{ name: pendingGroup.name, email: pendingGroup.email }}
                                components={{ b: <span className="font-medium" /> }}
                            />
                        </p>
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setPendingDeleteKey(null)}
                                disabled={deleting}
                                className="px-4 py-2 bg-surface-container-high text-on-surface rounded-lg hover:bg-surface-container-highest transition-colors"
                            >
                                {t('list.deleteDialog.cancel')}
                            </button>
                            <button
                                type="button"
                                onClick={() => handleDelete(pendingGroup.email)}
                                disabled={deleting}
                                className="px-4 py-2 bg-eth-danger text-white rounded-lg hover:bg-eth-danger transition-colors disabled:opacity-50"
                            >
                                {deleting ? t('list.deleteDialog.deleting') : t('list.deleteDialog.confirm')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
