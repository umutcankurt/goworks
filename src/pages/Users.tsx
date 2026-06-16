import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Users as UsersIcon } from 'lucide-react';
import { AdminUser } from '../types/admin';
import { adminApi } from '../services/api';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { DataTable, type Column } from '../components/ui/DataTable';
import { EmptyState } from '../components/ui/EmptyState';
import { HelpGuide } from '../components/HelpGuide';

const PAGE_SIZE = 50;

export const UsersPage: React.FC = () => {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [nextPageToken, setNextPageToken] = useState<string | undefined>();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [hasSearched, setHasSearched] = useState(false);
    const navigate = useNavigate();
    const { t } = useTranslation('users');

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;
        setLoading(true);
        setError('');
        setUsers([]);
        setNextPageToken(undefined);
        try {
            const result = await adminApi.getUsers({ maxResults: PAGE_SIZE, query: searchQuery });
            if (result.success) {
                setUsers(result.users || []);
                setNextPageToken(result.nextPageToken);
                setHasSearched(true);
            } else {
                setError(result.error || t('loadFailed'));
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleLoadMore = async () => {
        if (!nextPageToken) return;
        setLoading(true);
        try {
            const result = await adminApi.getUsers({
                maxResults: PAGE_SIZE,
                query: searchQuery,
                pageToken: nextPageToken,
            });
            if (result.success) {
                setUsers((prev) => [...prev, ...(result.users || [])]);
                setNextPageToken(result.nextPageToken);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleReset = () => {
        setSearchQuery('');
        setUsers([]);
        setNextPageToken(undefined);
        setHasSearched(false);
        setError('');
    };

    const columns: Column<AdminUser>[] = [
        {
            key: 'user',
            header: t('table.user'),
            render: (u) => (
                <div>
                    <div className="font-medium text-on-surface">{u.name.fullName}</div>
                    {u.orgUnitPath && <div className="text-xs text-on-surface-variant mt-0.5">{u.orgUnitPath}</div>}
                </div>
            ),
        },
        {
            key: 'email',
            header: t('table.email'),
            render: (u) => <span className="text-sm text-on-surface-variant">{u.primaryEmail}</span>,
        },
        {
            key: 'status',
            header: t('table.status'),
            render: (u) => (
                <div className="flex items-center gap-2">
                    {u.suspended ? (
                        <Badge tone="danger">{t('status.suspended')}</Badge>
                    ) : (
                        <Badge tone="success">{t('status.active')}</Badge>
                    )}
                    {u.isAdmin && <Badge tone="info">{t('status.superAdmin')}</Badge>}
                </div>
            ),
        },
        {
            key: 'action',
            header: t('table.action'),
            render: (u) => (
                <Button size="sm" variant="secondary" onClick={() => navigate(`/users/${u.id}`)}>
                    {t('viewDetails')}
                </Button>
            ),
        },
    ];

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h1 className="text-2xl font-bold text-on-surface tracking-tight">{t('pageTitle')}</h1>

                <div className="flex items-center gap-2 w-full md:w-auto">
                    <form onSubmit={handleSearch} className="flex gap-2 flex-1 md:flex-initial">
                        <input
                            type="text"
                            placeholder={t('searchPlaceholder')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="flex-1 md:w-64 px-4 py-2 rounded-lg bg-surface-container-highest eth-border-ghost text-on-surface placeholder:text-outline outline-none focus:border-eth-primary-container/60 focus:eth-glow-cyan-led transition-all"
                        />
                        <Button type="submit" disabled={loading || !searchQuery.trim()} loading={loading && users.length === 0}>
                            {t('search')}
                        </Button>
                        {hasSearched && (
                            <Button type="button" variant="ghost" onClick={handleReset}>
                                {t('clear')}
                            </Button>
                        )}
                    </form>
                    <HelpGuide namespace="users" />
                </div>
            </div>

            {error && (
                <div className="p-3 bg-eth-danger/10 text-eth-danger rounded-lg text-sm border border-eth-danger/30">
                    {error}
                </div>
            )}

            <div className="bg-surface-container border border-outline-variant/30 shadow-sm eth-glow-cyan-ambient rounded-xl p-6">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-lg font-semibold text-on-surface">
                        {t('resultsTitle')}
                        {hasSearched && users.length > 0 && (
                            <span className="ml-2 text-sm font-normal text-on-surface-variant">
                                {t('loadedCount', { count: users.length })}
                            </span>
                        )}
                    </h2>
                </div>

                {!hasSearched ? (
                    <EmptyState
                        icon={<Search className="h-5 w-5" />}
                        title={t('promptSearch')}
                    />
                ) : (
                    <>
                        <DataTable
                            columns={columns}
                            rows={users}
                            rowKey={(u) => u.id}
                            loading={loading && users.length === 0}
                            emptyIcon={<UsersIcon className="h-5 w-5" />}
                            emptyTitle={t('noResults')}
                        />

                        {nextPageToken && (
                            <div className="flex justify-center mt-6">
                                <Button
                                    variant="secondary"
                                    onClick={handleLoadMore}
                                    disabled={loading}
                                    loading={loading}
                                >
                                    {loading ? t('loadingShort') : t('loadMore', { count: users.length })}
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};
