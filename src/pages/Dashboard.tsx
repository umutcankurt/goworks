import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { dashboardApi } from '../services/api';
import { jobsApi } from '../services/server-api';
import type { StorageUsageData, UserCountData } from '../types/admin';
import { useLocaleFormat } from '../i18n/useLocaleFormat';
import { Skeleton } from '../components/ui/Skeleton';
import { HelpGuide } from '../components/HelpGuide';

// Fixed Recharts colors — a mid-saturation palette readable in both light and dark.
// CSS vars can't be used (Recharts expects a string literal).
const CHART_PRIMARY = '#06b6d4'; // cyan-500
const CHART_NEUTRAL_TRACK = '#cbd5e1'; // slate-300
const CHART_SUCCESS = '#10b981'; // emerald-500
const CHART_DANGER = '#ef4444'; // red-500

function formatStorage(mb: number): string {
    if (mb >= 1024 * 1024) return `${(mb / (1024 * 1024)).toFixed(2)} TB`;
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${mb} MB`;
}

function useRelativeTime() {
    const { t } = useTranslation('dashboard');
    return (timestamp: number): string => {
        const diff = Math.floor((Date.now() - timestamp) / 1000);
        if (diff < 60) return t('relativeTime.justNow');
        if (diff < 3600) return t('relativeTime.minutesAgo', { count: Math.floor(diff / 60) });
        if (diff < 86400) return t('relativeTime.hoursAgo', { count: Math.floor(diff / 3600) });
        return t('relativeTime.daysAgo', { count: Math.floor(diff / 86400) });
    };
}

function UpdatedAtLabel({ timestamp }: { timestamp: number | null }) {
    const { t } = useTranslation('dashboard');
    const relative = useRelativeTime();
    if (!timestamp) return null;
    return (
        <p className="text-xs text-on-surface-variant mt-3 pt-3 border-t border-outline-variant/30">
            {t('lastUpdate', { value: relative(timestamp) })}
        </p>
    );
}

function SkeletonCard() {
    return (
        <div className="bg-surface-container border border-outline-variant/30 shadow-sm eth-glow-cyan-ambient rounded-xl p-6">
            <Skeleton variant="text" width="w-1/2" className="mb-4" />
            <Skeleton variant="box" height="h-40" />
        </div>
    );
}

function ErrorCard({ title, message }: { title: string; message: string }) {
    const { t } = useTranslation('dashboard');
    const isAuthError =
        message.includes('403') ||
        message.includes('yetki') ||
        message.includes('Yetkisiz') ||
        message.includes('permission');
    return (
        <div className="bg-surface-container border border-eth-danger/40 shadow-sm rounded-xl p-6">
            <h3 className="text-lg font-semibold text-on-surface mb-3">{title}</h3>
            <div className="text-sm text-eth-danger">
                {isAuthError ? (
                    <p>
                        <Trans i18nKey="authError" t={t} components={{ b: <strong /> }} />
                    </p>
                ) : (
                    <p>{message}</p>
                )}
            </div>
        </div>
    );
}

function StorageWidget() {
    const { t } = useTranslation('dashboard');
    const [data, setData] = useState<StorageUsageData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [updatedAt, setUpdatedAt] = useState<number | null>(null);

    useEffect(() => {
        dashboardApi
            .getStorageUsage()
            .then((res) => {
                if (res.success && res.data) {
                    setData(res.data);
                    setUpdatedAt(res.updatedAt || null);
                } else setError(res.error || t('loadFailed'));
            })
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, [t]);

    if (loading) return <SkeletonCard />;
    if (error) return <ErrorCard title={t('storage.title')} message={error} />;
    if (!data) return null;

    const isUnlimited = data.totalStorageMb === 0;

    if (isUnlimited) {
        return (
            <div className="bg-surface-container border border-outline-variant/30 shadow-sm eth-glow-cyan-ambient rounded-xl p-6">
                <h3 className="text-lg font-semibold text-on-surface mb-4">{t('storage.title')}</h3>
                <div className="flex flex-col items-center justify-center py-4">
                    <p className="text-3xl font-bold text-eth-primary">{formatStorage(data.usedStorageMb)}</p>
                    <p className="text-sm text-on-surface-variant mt-2">{t('storage.totalUsed')}</p>
                    <p className="text-xs text-on-surface-variant mt-1">{t('storage.unlimited')}</p>
                </div>
                <UpdatedAtLabel timestamp={updatedAt} />
            </div>
        );
    }

    const usedPct = Math.round((data.usedStorageMb / data.totalStorageMb) * 100);
    const freeMb = data.totalStorageMb - data.usedStorageMb;
    const chartData = [
        { name: t('storage.used'), value: data.usedStorageMb },
        { name: t('storage.free'), value: freeMb > 0 ? freeMb : 0 },
    ];
    const COLORS = [CHART_PRIMARY, CHART_NEUTRAL_TRACK];

    return (
        <div className="bg-surface-container border border-outline-variant/30 shadow-sm eth-glow-cyan-ambient rounded-xl p-6">
            <h3 className="text-lg font-semibold text-on-surface mb-4">{t('storage.title')}</h3>
            <div className="flex items-center gap-4">
                <div className="w-36 h-36 flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie data={chartData} innerRadius={40} outerRadius={60} dataKey="value" stroke="none">
                                {chartData.map((_, index) => (
                                    <Cell key={index} fill={COLORS[index]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value) => formatStorage(value as number)} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                <div className="flex-1">
                    <p className="text-2xl font-bold text-on-surface">%{usedPct}</p>
                    <p className="text-sm text-on-surface-variant">
                        {formatStorage(data.usedStorageMb)} / {formatStorage(data.totalStorageMb)}
                    </p>
                    <div className="flex items-center gap-4 mt-3 text-xs text-on-surface-variant">
                        <span className="flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: CHART_PRIMARY }} /> {t('storage.used')}
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: CHART_NEUTRAL_TRACK }} /> {t('storage.free')}
                        </span>
                    </div>
                </div>
            </div>
            <UpdatedAtLabel timestamp={updatedAt} />
        </div>
    );
}

interface RecentUser {
    email: string;
    fullName: string;
    createdAt: string;
    createdBy: string;
}

function RecentUsersWidget() {
    const navigate = useNavigate();
    const { t } = useTranslation('dashboard');
    const { formatDateTime } = useLocaleFormat();
    const [users, setUsers] = useState<RecentUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [updatedAt, setUpdatedAt] = useState<number | null>(null);

    useEffect(() => {
        dashboardApi
            .getRecentUsers()
            .then((res) => {
                if (res.success && res.data) {
                    setUsers(res.data);
                    setUpdatedAt(res.updatedAt || null);
                } else setError(res.error || t('loadFailed'));
            })
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, [t]);

    if (loading) return <SkeletonCard />;
    if (error) return <ErrorCard title={t('recentUsers.title')} message={error} />;

    if (users.length === 0) {
        return (
            <div className="bg-surface-container border border-outline-variant/30 shadow-sm eth-glow-cyan-ambient rounded-xl p-6">
                <h3 className="text-lg font-semibold text-on-surface mb-4">{t('recentUsers.title')}</h3>
                <p className="text-sm text-on-surface-variant text-center py-6">{t('recentUsers.empty')}</p>
                <UpdatedAtLabel timestamp={updatedAt} />
            </div>
        );
    }

    return (
        <div className="bg-surface-container border border-outline-variant/30 shadow-sm eth-glow-cyan-ambient rounded-xl p-6">
            <h3 className="text-lg font-semibold text-on-surface mb-4">{t('recentUsers.title')}</h3>
            <ul className="divide-y divide-outline-variant/30">
                {users.map((u) => (
                    <li key={u.email} className="py-2.5 flex items-center justify-between">
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-on-surface truncate">{u.email}</p>
                            <p className="text-xs text-on-surface-variant truncate">
                                {u.createdAt ? formatDateTime(u.createdAt) : ''}
                                {u.createdBy ? ` • ${u.createdBy.split('@')[0]}` : ''}
                            </p>
                        </div>
                        <button
                            onClick={() => navigate(`/users/${u.email}`)}
                            className="ml-3 text-xs text-eth-primary hover:brightness-125 font-medium whitespace-nowrap"
                        >
                            {t('recentUsers.details')}
                        </button>
                    </li>
                ))}
            </ul>
            <UpdatedAtLabel timestamp={updatedAt} />
        </div>
    );
}

function UserCountsWidget() {
    const { t } = useTranslation('dashboard');
    const [data, setData] = useState<UserCountData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [updatedAt, setUpdatedAt] = useState<number | null>(null);

    useEffect(() => {
        dashboardApi
            .getUserCounts()
            .then((res) => {
                if (res.success && res.data) {
                    setData(res.data);
                    setUpdatedAt(res.updatedAt || null);
                } else setError(res.error || t('loadFailed'));
            })
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, [t]);

    if (loading) return <SkeletonCard />;
    if (error) return <ErrorCard title={t('userCounts.title')} message={error} />;
    if (!data) return null;

    const chartData = [
        { name: t('userCounts.active'), value: data.activeUsers },
        { name: t('userCounts.suspended'), value: data.suspendedUsers },
    ];
    const COLORS = [CHART_SUCCESS, CHART_DANGER];

    return (
        <div className="bg-surface-container border border-outline-variant/30 shadow-sm eth-glow-cyan-ambient rounded-xl p-6">
            <h3 className="text-lg font-semibold text-on-surface mb-4">{t('userCounts.title')}</h3>
            <div className="flex items-center gap-4">
                <div className="w-36 h-36 relative flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie data={chartData} innerRadius={40} outerRadius={60} dataKey="value" stroke="none">
                                {chartData.map((_, index) => (
                                    <Cell key={index} fill={COLORS[index]} />
                                ))}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-lg font-bold text-on-surface">{data.totalUsers}</span>
                    </div>
                </div>
                <div className="flex-1">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-sm text-on-surface-variant">
                                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: CHART_SUCCESS }} /> {t('userCounts.active')}
                            </span>
                            <span className="text-sm font-semibold text-on-surface">{data.activeUsers}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-sm text-on-surface-variant">
                                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: CHART_DANGER }} /> {t('userCounts.suspended')}
                            </span>
                            <span className="text-sm font-semibold text-on-surface">{data.suspendedUsers}</span>
                        </div>
                    </div>
                </div>
            </div>
            <UpdatedAtLabel timestamp={updatedAt} />
        </div>
    );
}

function ActiveJobsWidget() {
    const navigate = useNavigate();
    const { t } = useTranslation('dashboard');
    const { t: tJobs } = useTranslation('jobs');
    const [jobs, setJobs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchJobs = useCallback(async () => {
        try {
            const data = await jobsApi.list({ status: 'RUNNING,PENDING', limit: 5 });
            setJobs(data);
        } catch {
            setJobs([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchJobs();
        const interval = setInterval(fetchJobs, 10000);
        return () => clearInterval(interval);
    }, [fetchJobs]);

    if (loading && jobs.length === 0) return null;
    if (jobs.length === 0) return null;

    const typeLabel = (type: string) => {
        const known = ['BULK_SIGNATURE_PUSH', 'BULK_SUSPEND', 'BULK_DELETE'];
        return known.includes(type) ? tJobs(`types.${type}`) : type;
    };

    const handleCancel = async (id: string) => {
        try {
            await jobsApi.cancel(id);
            fetchJobs();
        } catch {
            // ignore
        }
    };

    return (
        <div className="bg-surface-container border border-outline-variant/30 shadow-sm eth-glow-cyan-ambient rounded-xl p-6 col-span-full">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-on-surface">{t('activeJobs.title')}</h3>
                <button
                    onClick={() => navigate('/job-history')}
                    className="text-sm text-eth-primary hover:brightness-125 font-medium transition-colors"
                >
                    {t('activeJobs.viewAll')}
                </button>
            </div>
            <div className="space-y-3">
                {jobs.map((job) => {
                    const pct = job.total > 0 ? Math.round((job.progress / job.total) * 100) : 0;
                    return (
                        <div key={job.id} className="eth-border-ghost-soft border rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                                <div>
                                    <span className="text-sm font-medium text-on-surface">{typeLabel(job.type)}</span>
                                    <span className="text-xs text-on-surface-variant ml-2">
                                        ({tJobs(`status.${job.status}`, { defaultValue: job.status })})
                                    </span>
                                </div>
                                {(job.status === 'RUNNING' || job.status === 'PENDING') && (
                                    <button
                                        onClick={() => handleCancel(job.id)}
                                        className="text-xs text-eth-danger hover:brightness-125 font-medium"
                                    >
                                        {t('activeJobs.cancel')}
                                    </button>
                                )}
                            </div>
                            <div className="w-full bg-surface-container-highest rounded-full h-2 mb-1">
                                <div
                                    className="bg-eth-primary-container h-2 rounded-full transition-all duration-300 eth-glow-cyan-led"
                                    style={{ width: `${pct}%` }}
                                />
                            </div>
                            <div className="flex justify-between text-xs text-on-surface-variant">
                                <span>
                                    {job.progress} / {job.total}
                                </span>
                                <span className="text-eth-secondary">{t('activeJobs.successCount', { count: job.succeeded })}</span>
                                {job.failed > 0 && (
                                    <span className="text-eth-danger">{t('activeJobs.failedCount', { count: job.failed })}</span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export const Dashboard: React.FC = () => {
    const { t } = useTranslation('dashboard');
    return (
        <div className="p-6">
            <div className="mb-6 flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-on-surface tracking-tight">{t('title')}</h1>
                    <p className="text-on-surface-variant mt-1">{t('subtitle')}</p>
                </div>
                <HelpGuide namespace="dashboard" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ActiveJobsWidget />
                <StorageWidget />
                <UserCountsWidget />
                <RecentUsersWidget />
            </div>
        </div>
    );
};
