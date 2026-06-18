import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AdminUser, UserCountData } from '../types/admin';
import { adminApi, dashboardApi } from '../services/api';
import { useLocaleFormat } from '../i18n/useLocaleFormat';
import { HelpGuide } from '../components/HelpGuide';

export const Reports: React.FC = () => {
    const { t } = useTranslation('reports');
    const { formatDateTime } = useLocaleFormat();
    const [counts, setCounts] = useState<UserCountData | null>(null);
    const [suspendedUsers, setSuspendedUsers] = useState<AdminUser[]>([]);
    const [loginLogs, setLoginLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchReportData();
    }, []);

    const fetchReportData = async () => {
        setLoading(true);
        setError('');
        try {
            const countsResult = await dashboardApi.getUserCounts();
            if (countsResult.success && countsResult.data) {
                setCounts(countsResult.data);
            }

            const suspResult = await adminApi.getUsers({ maxResults: 100, query: 'isSuspended=true' });
            if (suspResult.success) {
                setSuspendedUsers(suspResult.users || []);
            }

            const logsResult = await adminApi.getLoginActivities(20);
            if (logsResult.success) {
                setLoginLogs(logsResult.activities as any[]);
            } else {
                console.warn('Reports API Error:', logsResult.error);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const totalUsers = counts?.totalUsers ?? 0;
    const activeUsers = counts?.activeUsers ?? 0;
    const suspendedCount = counts?.suspendedUsers ?? 0;

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-on-surface">{t('title')}</h1>
                <div className="flex items-center gap-2">
                    <button
                        onClick={fetchReportData}
                        disabled={loading}
                        className="bg-eth-primary-container text-on-eth-primary-container px-4 py-2 rounded-lg hover:brightness-110 transition"
                    >
                        {loading ? t('refreshing') : t('refresh')}
                    </button>
                    <HelpGuide namespace="reports" />
                </div>
            </div>

            {error && (
                <div className="bg-eth-danger/10 text-eth-danger p-4 rounded-lg border border-eth-danger/20">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-surface-container p-6 rounded-xl shadow-sm border border-outline-variant/30 flex flex-col items-center justify-center">
                    <span className="text-on-surface-variant text-sm font-medium mb-1">{t('metrics.totalUsers')}</span>
                    <span className="text-3xl font-bold text-on-surface">{totalUsers}</span>
                </div>
                <div className="bg-surface-container p-6 rounded-xl shadow-sm border border-outline-variant/30 flex flex-col items-center justify-center">
                    <span className="text-on-surface-variant text-sm font-medium mb-1">{t('metrics.activeUsers')}</span>
                    <span className="text-3xl font-bold text-eth-secondary">{activeUsers}</span>
                </div>
                <div className="bg-surface-container p-6 rounded-xl shadow-sm border border-outline-variant/30 flex flex-col items-center justify-center">
                    <span className="text-on-surface-variant text-sm font-medium mb-1">{t('metrics.suspendedUsers')}</span>
                    <span className="text-3xl font-bold text-eth-danger">{suspendedCount}</span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-surface-container p-6 rounded-xl shadow-sm border border-outline-variant/30">
                    <h2 className="text-lg font-bold mb-4">{t('audit.title')}</h2>
                    {loginLogs.length === 0 ? (
                        <div className="text-center text-on-surface-variant py-8 bg-surface-container-low rounded">
                            <p>{t('audit.empty')}</p>
                            <p className="text-xs mt-2">{t('audit.delayNote')}</p>
                        </div>
                    ) : (
                        <div className="overflow-auto max-h-[400px]">
                            <table className="min-w-full text-left text-sm">
                                <thead>
                                    <tr className="border-b bg-surface-container-low text-on-surface-variant">
                                        <th className="py-2 px-4 font-medium">{t('audit.table.date')}</th>
                                        <th className="py-2 px-4 font-medium">{t('audit.table.email')}</th>
                                        <th className="py-2 px-4 font-medium">{t('audit.table.ip')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loginLogs.map((log, idx) => (
                                        <tr key={idx} className="border-b hover:bg-surface-container-low">
                                            <td className="py-3 px-4">{formatDateTime(log.id.time)}</td>
                                            <td className="py-3 px-4 font-medium">{log.actor?.email}</td>
                                            <td className="py-3 px-4 text-on-surface-variant">{log.ipAddress}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="bg-surface-container p-6 rounded-xl shadow-sm border border-outline-variant/30">
                    <h2 className="text-lg font-bold mb-4 text-eth-danger">{t('suspended.title')}</h2>
                    {suspendedUsers.length === 0 ? (
                        <div className="text-center text-on-surface-variant py-8 bg-surface-container-low rounded">
                            {t('suspended.empty')}
                        </div>
                    ) : (
                        <div className="overflow-auto max-h-[400px]">
                            <ul className="space-y-3">
                                {suspendedUsers.map(user => (
                                    <li key={user.id} className="flex justify-between items-center bg-eth-danger/10 p-3 rounded border border-eth-danger/20">
                                        <div>
                                            <p className="font-medium text-on-surface">{user.name.fullName}</p>
                                            <p className="text-xs text-on-surface-variant">{user.primaryEmail}</p>
                                        </div>
                                        <span className="text-xs bg-eth-danger/30 text-eth-danger px-2 py-1 rounded">{t('suspended.badge')}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
