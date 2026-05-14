import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, CheckCircle, XCircle, Clock, User, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ServerJob } from '../services/server-api';
import { bulkApi } from '../services/server-api';
import { useLocaleFormat } from '../i18n/useLocaleFormat';

interface JobDetailModalProps {
    job: ServerJob;
    onClose: () => void;
}

const STATUS_COLORS: Record<string, string> = {
    COMPLETED: 'bg-eth-secondary/15 text-eth-secondary',
    FAILED: 'bg-eth-danger/15 text-eth-danger',
    CANCELLED: 'bg-amber-500/100/15 text-amber-500',
    RUNNING: 'bg-eth-primary-container/15 text-eth-primary',
    PENDING: 'bg-surface-container-high text-on-surface',
};

export const JobDetailModal: React.FC<JobDetailModalProps> = ({ job, onClose }) => {
    const { t } = useTranslation('jobs');
    const { t: tCommon } = useTranslation('common');
    const { formatDateTime } = useLocaleFormat();
    const [activeTab, setActiveTab] = useState<'succeeded' | 'failed'>('succeeded');
    const [isDownloading, setIsDownloading] = useState(false);

    const errors = job.result?.errors || [];
    const succeededEmails = job.result?.succeededEmails || [];
    const statusKey = STATUS_COLORS[job.status] ? job.status : 'PENDING';

    const typeLabel = (type: string) => {
        const known = ['BULK_SIGNATURE_PUSH', 'BULK_SUSPEND', 'BULK_DELETE', 'SIGNATURE_AUDIT'];
        return known.includes(type) ? t(`types.${type}`) : type;
    };

    const formatDuration = (start: string | null, end: string | null) => {
        if (!start || !end) return '-';
        const ms = new Date(end).getTime() - new Date(start).getTime();
        if (ms < 0) return '-';
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        if (hours > 0) return t('detail.duration.hours', { h: hours, m: minutes % 60 });
        if (minutes > 0) return t('detail.duration.minutes', { m: minutes, s: seconds % 60 });
        return t('detail.duration.seconds', { s: seconds });
    };

    const downloadCsv = (filename: string, rows: string[][], headers: string[]) => {
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleExportSucceeded = () => {
        downloadCsv(
            `succeeded-${job.type.toLowerCase()}-${job.id.slice(0, 8)}.csv`,
            succeededEmails.map(email => [email]),
            [t('detail.csvHeaders.email')]
        );
    };

    const handleExportFailed = () => {
        downloadCsv(
            `failed-${job.type.toLowerCase()}-${job.id.slice(0, 8)}.csv`,
            errors.map(e => [e.email, e.error]),
            [t('detail.csvHeaders.email'), t('detail.csvHeaders.error')]
        );
    };

    const handleDownloadReport = async (format: 'csv' | 'json') => {
        try {
            setIsDownloading(true);
            await bulkApi.downloadReport(job.id, format);
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-surface-container rounded-xl shadow-xl max-w-3xl w-full max-h-[85vh] flex flex-col"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/30">
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg font-semibold text-on-surface">{typeLabel(job.type)}</h2>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[statusKey]}`}>
                                {t(`status.${statusKey}`)}
                            </span>
                        </div>
                        <button onClick={onClose} aria-label={tCommon('close')} className="text-on-surface-variant hover:text-on-surface-variant transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="px-6 py-4 border-b border-outline-variant/30 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                            <p className="text-on-surface-variant text-xs mb-1 flex items-center gap-1"><User size={12} /> {t('detail.metadata.creator')}</p>
                            <p className="text-on-surface font-medium truncate">{job.createdBy?.split('@')[0]}</p>
                        </div>
                        <div>
                            <p className="text-on-surface-variant text-xs mb-1 flex items-center gap-1"><Clock size={12} /> {t('detail.metadata.startedAt')}</p>
                            <p className="text-on-surface font-medium">{job.startedAt ? formatDateTime(job.startedAt) : '-'}</p>
                        </div>
                        <div>
                            <p className="text-on-surface-variant text-xs mb-1 flex items-center gap-1"><Clock size={12} /> {t('detail.metadata.completedAt')}</p>
                            <p className="text-on-surface font-medium">{job.completedAt ? formatDateTime(job.completedAt) : '-'}</p>
                        </div>
                        <div>
                            <p className="text-on-surface-variant text-xs mb-1">{t('detail.metadata.duration')}</p>
                            <p className="text-on-surface font-medium">{formatDuration(job.startedAt, job.completedAt)}</p>
                        </div>
                    </div>

                    <div className="px-6 py-4 border-b border-outline-variant/30 grid grid-cols-3 gap-3">
                        <div className="bg-surface-container-low rounded-lg p-3 text-center">
                            <p className="text-2xl font-bold text-on-surface">{job.total}</p>
                            <p className="text-xs text-on-surface-variant">{t('detail.summary.total')}</p>
                        </div>
                        <div className="bg-eth-secondary/10 rounded-lg p-3 text-center">
                            <p className="text-2xl font-bold text-eth-secondary">{job.succeeded}</p>
                            <p className="text-xs text-eth-secondary">{t('detail.summary.succeeded')}</p>
                        </div>
                        <div className="bg-eth-danger/10 rounded-lg p-3 text-center">
                            <p className="text-2xl font-bold text-eth-danger">{job.failed}</p>
                            <p className="text-xs text-rose-500">{t('detail.summary.failed')}</p>
                        </div>
                    </div>

                    <div className="px-6 pt-3 flex gap-1 border-b border-outline-variant/30">
                        <button
                            onClick={() => setActiveTab('succeeded')}
                            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                                activeTab === 'succeeded'
                                    ? 'border-eth-secondary/40 text-eth-secondary'
                                    : 'border-transparent text-on-surface-variant hover:text-on-surface-variant'
                            }`}
                        >
                            <CheckCircle size={14} className="inline mr-1.5 -mt-0.5" />
                            {t('detail.tabs.succeeded', { count: succeededEmails.length })}
                        </button>
                        <button
                            onClick={() => setActiveTab('failed')}
                            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                                activeTab === 'failed'
                                    ? 'border-eth-danger/40 text-eth-danger'
                                    : 'border-transparent text-on-surface-variant hover:text-on-surface-variant'
                            }`}
                        >
                            <XCircle size={14} className="inline mr-1.5 -mt-0.5" />
                            {t('detail.tabs.failed', { count: errors.length })}
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-6 py-3 min-h-0">
                        {activeTab === 'succeeded' && (
                            <>
                                {succeededEmails.length === 0 ? (
                                    <p className="text-sm text-on-surface-variant text-center py-8">
                                        {job.result?.succeededEmails !== undefined
                                            ? t('detail.noSucceeded')
                                            : t('detail.noSuccessDetails')}
                                    </p>
                                ) : (
                                    <div className="space-y-1">
                                        {succeededEmails.map((email, i) => (
                                            <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-surface-container-low text-sm">
                                                <CheckCircle size={14} className="text-eth-secondary shrink-0" />
                                                <span className="text-on-surface">{email}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                        {activeTab === 'failed' && (
                            <>
                                {errors.length === 0 ? (
                                    <p className="text-sm text-on-surface-variant text-center py-8">{t('detail.noFailed')}</p>
                                ) : (
                                    <div className="space-y-1">
                                        {errors.map((err, i) => (
                                            <div key={i} className="py-2 px-2 rounded hover:bg-surface-container-low">
                                                <div className="flex items-center gap-2">
                                                    <XCircle size={14} className="text-rose-500 shrink-0" />
                                                    <span className="text-sm font-medium text-on-surface">{err.email}</span>
                                                </div>
                                                <p className="text-xs text-rose-500 ml-6 mt-0.5">{err.error}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    <div className="px-6 py-3 border-t border-outline-variant/30 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            {job.failed > 0 && (
                                <>
                                    <button
                                        onClick={() => handleDownloadReport('csv')}
                                        disabled={isDownloading}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 rounded-lg transition-colors disabled:opacity-50"
                                    >
                                        <FileText size={14} />
                                        {t('detail.errorReportCsv')}
                                    </button>
                                    <button
                                        onClick={() => handleDownloadReport('json')}
                                        disabled={isDownloading}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-on-surface-variant bg-surface-container-low hover:bg-surface-container-high rounded-lg transition-colors disabled:opacity-50"
                                    >
                                        <FileText size={14} />
                                        {t('detail.errorReportJson')}
                                    </button>
                                </>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {activeTab === 'succeeded' && succeededEmails.length > 0 && (
                                <button
                                    onClick={handleExportSucceeded}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-eth-secondary bg-eth-secondary/10 hover:bg-eth-secondary/15 rounded-lg transition-colors"
                                >
                                    <Download size={14} />
                                    {t('detail.downloadCsv')}
                                </button>
                            )}
                            {activeTab === 'failed' && errors.length > 0 && (
                                <button
                                    onClick={handleExportFailed}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-eth-danger bg-eth-danger/10 hover:bg-eth-danger/15 rounded-lg transition-colors"
                                >
                                    <Download size={14} />
                                    {t('detail.downloadCsv')}
                                </button>
                            )}
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
