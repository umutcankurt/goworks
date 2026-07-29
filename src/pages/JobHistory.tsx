import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Loader, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { jobsApi, bulkApi } from '../services/server-api';
import type { ServerJob, PaginatedJobs } from '../services/server-api';
import { JobDetailModal } from '../components/JobDetailModal';
import { useLocaleFormat } from '../i18n/useLocaleFormat';
import { HelpGuide } from '../components/HelpGuide';

const STATUS_COLORS: Record<string, string> = {
    COMPLETED: 'bg-eth-secondary/15 text-eth-secondary',
    FAILED: 'bg-eth-danger/15 text-eth-danger',
    CANCELLED: 'bg-amber-500/100/15 text-amber-500',
    RUNNING: 'bg-eth-primary-container/15 text-eth-primary',
    PENDING: 'bg-surface-container-high text-on-surface',
};

export const JobHistory: React.FC = () => {
    const { t } = useTranslation('jobs');
    const { formatDateTime } = useLocaleFormat();
    const [jobs, setJobs] = useState<ServerJob[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [statusFilter, setStatusFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [creatorFilter, setCreatorFilter] = useState('');
    const [creatorInput, setCreatorInput] = useState('');
    // The initial value is passed explicitly: React 19's useRef dropped the
    // zero-argument overload. React 18 resolves this to the same
    // `initialValue?: undefined` overload, so the ref's type is unchanged.
    const creatorDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const [loading, setLoading] = useState(true);
    const [selectedJob, setSelectedJob] = useState<ServerJob | null>(null);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const typeLabel = (type: string) => {
        const known = ['BULK_SIGNATURE_PUSH', 'BULK_SUSPEND', 'BULK_DELETE', 'BULK_GROUP_ADD', 'SIGNATURE_AUDIT'];
        return known.includes(type) ? t(`types.${type}`) : type;
    };

    const fetchJobs = useCallback(async () => {
        try {
            setLoading(true);
            const result: PaginatedJobs = await jobsApi.list({
                status: statusFilter || undefined,
                type: typeFilter || undefined,
                createdBy: creatorFilter || undefined,
                page,
                pageSize,
            });
            setJobs(result.jobs);
            setTotal(result.total);
        } catch {
            setJobs([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    }, [statusFilter, typeFilter, creatorFilter, page, pageSize]);

    useEffect(() => {
        fetchJobs();
    }, [fetchJobs]);

    useEffect(() => {
        creatorDebounceRef.current = setTimeout(() => {
            setCreatorFilter(creatorInput);
        }, 400);
        return () => clearTimeout(creatorDebounceRef.current);
    }, [creatorInput]);

    useEffect(() => {
        setPage(1);
    }, [statusFilter, typeFilter, creatorFilter, pageSize]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-6xl mx-auto"
        >
            <div className="mb-6 flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-on-surface">{t('history.title')}</h1>
                    <p className="text-on-surface-variant mt-1">{t('history.subtitle')}</p>
                </div>
                <HelpGuide namespace="jobs" />
            </div>

            <div className="flex flex-wrap gap-3 mb-4">
                <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="bg-surface-container-high border border-outline-variant/30 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                    <option value="">{t('history.filters.allStatuses')}</option>
                    <option value="COMPLETED">{t('status.COMPLETED')}</option>
                    <option value="FAILED">{t('status.FAILED')}</option>
                    <option value="CANCELLED">{t('status.CANCELLED')}</option>
                    <option value="RUNNING">{t('status.RUNNING')}</option>
                    <option value="PENDING">{t('status.PENDING')}</option>
                </select>

                <select
                    value={typeFilter}
                    onChange={e => setTypeFilter(e.target.value)}
                    className="bg-surface-container-high border border-outline-variant/30 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                    <option value="">{t('history.filters.allTypes')}</option>
                    <option value="BULK_DELETE">{t('types.BULK_DELETE')}</option>
                    <option value="BULK_SUSPEND">{t('types.BULK_SUSPEND')}</option>
                    <option value="BULK_SIGNATURE_PUSH">{t('types.BULK_SIGNATURE_PUSH')}</option>
                    <option value="BULK_GROUP_ADD">{t('types.BULK_GROUP_ADD')}</option>
                    <option value="SIGNATURE_AUDIT">{t('types.SIGNATURE_AUDIT')}</option>
                </select>

                <input
                    type="text"
                    value={creatorInput}
                    onChange={e => setCreatorInput(e.target.value)}
                    placeholder={t('history.filters.creatorPlaceholder')}
                    className="bg-surface-container-high border border-outline-variant/30 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 w-52"
                />

                <select
                    value={pageSize}
                    onChange={e => setPageSize(Number(e.target.value))}
                    className="bg-surface-container-high border border-outline-variant/30 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                    <option value={10}>{t('history.filters.perPage', { count: 10 })}</option>
                    <option value={20}>{t('history.filters.perPage', { count: 20 })}</option>
                    <option value={50}>{t('history.filters.perPage', { count: 50 })}</option>
                </select>

                <span className="flex items-center text-sm text-on-surface-variant ml-auto">
                    {t('history.filters.totalJobs', { count: total })}
                </span>
            </div>

            <div className="bg-surface-container rounded-xl shadow-sm border border-outline-variant/30 overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader size={24} className="animate-spin text-primary-500" />
                    </div>
                ) : jobs.length === 0 ? (
                    <div className="text-center py-16">
                        <p className="text-on-surface-variant">{t('history.empty')}</p>
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-surface-container-low text-left">
                                <th className="px-4 py-3 font-medium text-on-surface-variant">{t('history.table.type')}</th>
                                <th className="px-4 py-3 font-medium text-on-surface-variant">{t('history.table.creator')}</th>
                                <th className="px-4 py-3 font-medium text-on-surface-variant">{t('history.table.startedAt')}</th>
                                <th className="px-4 py-3 font-medium text-on-surface-variant">{t('history.table.completedAt')}</th>
                                <th className="px-4 py-3 font-medium text-on-surface-variant text-center">{t('history.table.total')}</th>
                                <th className="px-4 py-3 font-medium text-on-surface-variant text-center">{t('history.table.succeeded')}</th>
                                <th className="px-4 py-3 font-medium text-on-surface-variant text-center">{t('history.table.failed')}</th>
                                <th className="px-4 py-3 font-medium text-on-surface-variant">{t('history.table.status')}</th>
                                <th className="px-4 py-3 font-medium text-on-surface-variant text-center">{t('history.table.report')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {jobs.map(job => {
                                const statusKey = STATUS_COLORS[job.status] ? job.status : 'PENDING';
                                return (
                                    <tr
                                        key={job.id}
                                        onClick={() => setSelectedJob(job)}
                                        className="border-t border-outline-variant/30 hover:bg-surface-container-low cursor-pointer transition-colors"
                                    >
                                        <td className="px-4 py-3 font-medium text-on-surface">{typeLabel(job.type)}</td>
                                        <td className="px-4 py-3 text-on-surface-variant">{job.createdBy?.split('@')[0]}</td>
                                        <td className="px-4 py-3 text-on-surface-variant">{job.startedAt ? formatDateTime(job.startedAt) : '-'}</td>
                                        <td className="px-4 py-3 text-on-surface-variant">{job.completedAt ? formatDateTime(job.completedAt) : '-'}</td>
                                        <td className="px-4 py-3 text-on-surface text-center font-medium">{job.total}</td>
                                        <td className="px-4 py-3 text-eth-secondary text-center font-medium">{job.succeeded}</td>
                                        <td className="px-4 py-3 text-center font-medium">
                                            <span className={job.failed > 0 ? 'text-eth-danger' : 'text-on-surface-variant'}>{job.failed}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[statusKey]}`}>
                                                {t(`status.${statusKey}`)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {job.failed > 0 && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status) && (
                                                <button
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        await bulkApi.downloadReport(job.id, 'csv');
                                                    }}
                                                    className="text-rose-500 hover:text-eth-danger transition-colors"
                                                    title={t('history.downloadErrorReport')}
                                                >
                                                    <Download size={16} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-on-surface-variant">
                        {t('history.pagination', { page, total: totalPages })}
                    </p>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronLeft size={18} />
                        </button>
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let pageNum: number;
                            if (totalPages <= 5) {
                                pageNum = i + 1;
                            } else if (page <= 3) {
                                pageNum = i + 1;
                            } else if (page >= totalPages - 2) {
                                pageNum = totalPages - 4 + i;
                            } else {
                                pageNum = page - 2 + i;
                            }
                            return (
                                <button
                                    key={pageNum}
                                    onClick={() => setPage(pageNum)}
                                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                        page === pageNum
                                            ? 'bg-primary-500 text-white'
                                            : 'text-on-surface-variant hover:bg-surface-container-high'
                                    }`}
                                >
                                    {pageNum}
                                </button>
                            );
                        })}
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronRight size={18} />
                        </button>
                    </div>
                </div>
            )}

            {selectedJob && (
                <JobDetailModal job={selectedJob} onClose={() => setSelectedJob(null)} />
            )}
        </motion.div>
    );
};
