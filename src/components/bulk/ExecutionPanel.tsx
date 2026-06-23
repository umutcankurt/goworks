import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, XCircle, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ipcEvents } from '../../services/api';
import { jobsApi, bulkApi } from '../../services/server-api';
import { useToast } from '../../contexts/ToastContext';
import type { BulkActionType, BulkProgressEvent, ValidatedRow } from '../../types/admin';

interface ExecutionPanelProps {
    action: BulkActionType;
    rows: Record<string, string>[];
    validatedRows?: ValidatedRow[];
    templateId: number | null;
    onReset: () => void;
}

export const ExecutionPanel: React.FC<ExecutionPanelProps> = ({
    action,
    rows,
    validatedRows,
    templateId,
    onReset,
}) => {
    const { addToast } = useToast();
    const { t } = useTranslation('bulk');
    const { t: tToast } = useTranslation('toast');
    const [isProcessing, setIsProcessing] = useState(true);
    const [progress, setProgress] = useState<BulkProgressEvent>({
        total: rows.length,
        current: 0,
        success: 0,
        failed: 0,
        currentUser: '',
        errors: [],
        status: 'running',
    });
    const [serverJobId, setServerJobId] = useState<string | null>(null);
    const startedRef = useRef(false);
    const jobUnsubsRef = useRef<Array<() => void>>([]);

    useEffect(() => {
        return () => {
            for (const unsub of jobUnsubsRef.current) unsub();
            jobUnsubsRef.current = [];
        };
    }, []);

    useEffect(() => {
        const handleProgress = (_event: any, data: BulkProgressEvent) => {
            setProgress(data);
            if (data.status === 'completed' || data.status === 'cancelled') {
                setIsProcessing(false);
            }
        };

        ipcEvents.on('admin:bulkProgress', handleProgress as (...args: unknown[]) => void);
        return () => {
            ipcEvents.off('admin:bulkProgress', handleProgress as (...args: unknown[]) => void);
        };
    }, []);

    useEffect(() => {
        if (startedRef.current) return;
        startedRef.current = true;
        startServerSide();
    }, []);

    const startServerSide = async () => {
        const emails = rows.map(r => r.email).filter(Boolean);
        const typeMap: Record<string, string> = {
            suspend: 'BULK_SUSPEND',
            delete: 'BULK_DELETE',
            signature_push: 'BULK_SIGNATURE_PUSH',
            add_to_group: 'BULK_GROUP_ADD',
        };

        const payload: any = {};
        if (action === 'signature_push' && validatedRows) {
            payload.rows = validatedRows;
            payload.templateId = templateId;
        } else if (action === 'add_to_group' && validatedRows) {
            // Worker reads grup_email + email + rol from each row's `data`.
            payload.rows = validatedRows;
        } else {
            payload.emails = emails;
            if (action === 'signature_push' && templateId) {
                payload.templateId = templateId;
            }
        }

        try {
            const result = await jobsApi.create({
                type: typeMap[action] || 'BULK_SUSPEND',
                payload,
            });
            const jid = result.id;
            setServerJobId(jid);
            subscribeToJob(jid, emails.length);
            addToast(tToast('bulk.jobQueued'), 'success');
        } catch (err: any) {
            addToast(tToast('bulk.jobStartFailed', { error: err.message }), 'error');
            setIsProcessing(false);
        }
    };

    const subscribeToJob = (jid: string, fallbackTotal: number) => {
        const onProgress = (_e: any, data: any) => {
            if (!data || data.jobId !== jid) return;
            setProgress({
                total: data.total || fallbackTotal,
                current: data.progress || 0,
                success: data.succeeded || 0,
                failed: data.failed || 0,
                currentUser: data.currentUser || '',
                errors: data.errors || [],
                status: 'running',
            });
        };
        const onDone = (_e: any, data: any) => {
            if (!data || data.jobId !== jid) return;
            setProgress(prev => ({
                ...prev,
                status: data.status === 'COMPLETED' ? 'completed' : 'cancelled',
            }));
            setIsProcessing(false);
            for (const unsub of jobUnsubsRef.current) unsub();
            jobUnsubsRef.current = [];
        };
        ipcEvents.on('jobs:progress', onProgress as (...args: unknown[]) => void);
        ipcEvents.on('jobs:done', onDone as (...args: unknown[]) => void);
        jobUnsubsRef.current.push(() => ipcEvents.off('jobs:progress', onProgress as (...args: unknown[]) => void));
        jobUnsubsRef.current.push(() => ipcEvents.off('jobs:done', onDone as (...args: unknown[]) => void));
    };

    const handleCancel = async () => {
        try {
            if (serverJobId) {
                await jobsApi.cancel(serverJobId);
                addToast(tToast('bulk.cancelling'), 'info');
            }
        } catch (error: any) {
            addToast(tToast('bulk.cancelFailed', { error: error.message }), 'error');
        }
    };

    const handleDownloadReport = async (format: 'csv' | 'json') => {
        if (serverJobId) {
            await bulkApi.downloadReport(serverJobId, format);
        }
    };

    const progressPercentage = progress.total > 0
        ? Math.round((progress.current / progress.total) * 100)
        : 0;

    return (
        <div className="space-y-4">
            <div className="bg-surface-container rounded-xl p-6 border border-outline-variant/30 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                    <span className="text-on-surface font-semibold">{t('execution.progressLabel')}</span>
                    <span className="text-on-surface-variant font-medium text-sm bg-surface-container-high px-3 py-1 rounded-lg border border-outline-variant/30">
                        {progressPercentage}% ({progress.current}/{progress.total})
                    </span>
                </div>

                <div className="w-full bg-surface-container-highest rounded-full h-2.5 mb-6 overflow-hidden">
                    <div
                        className="bg-eth-primary-container h-2.5 rounded-full transition-all duration-300"
                        style={{ width: `${progressPercentage}%` }}
                    />
                </div>

                {isProcessing && (
                    <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300 border border-amber-500/20">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>{t('execution.powerWarning')}</span>
                    </div>
                )}

                <div className="grid grid-cols-3 gap-6 mb-4">
                    <div className="bg-eth-secondary/10 p-4 rounded-xl border border-eth-secondary/20 flex flex-col items-center">
                        <span className="text-eth-secondary text-sm font-medium mb-1">{t('execution.succeeded')}</span>
                        <span className="text-eth-secondary font-bold text-2xl">{progress.success}</span>
                    </div>
                    <div className="bg-eth-danger/10 p-4 rounded-xl border border-eth-danger/20 flex flex-col items-center">
                        <span className="text-eth-danger text-sm font-medium mb-1">{t('execution.failed')}</span>
                        <span className="text-eth-danger font-bold text-2xl">{progress.failed}</span>
                    </div>
                    <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/30 flex flex-col items-center justify-center">
                        {isProcessing ? (
                            <button
                                onClick={handleCancel}
                                className="text-on-surface hover:text-on-surface hover:bg-surface-container-high px-4 py-2 rounded-lg flex items-center space-x-2 text-sm font-medium transition-colors border border-outline-variant/30 bg-surface-container shadow-sm"
                            >
                                <XCircle size={16} />
                                <span>{t('execution.cancel')}</span>
                            </button>
                        ) : (
                            <span className={`text-sm font-medium px-4 py-2 rounded-lg shadow-sm ${
                                progress.status === 'completed'
                                    ? 'bg-eth-secondary/15 text-eth-secondary border border-eth-secondary/30'
                                    : 'bg-surface-container-highest text-on-surface border border-outline-variant/30'
                            }`}>
                                {progress.status === 'completed' ? t('execution.completed') : t('execution.cancelled')}
                            </span>
                        )}
                    </div>
                </div>

                {progress.currentUser && isProcessing && (
                    <p className="text-sm text-eth-primary font-medium text-center animate-pulse mt-4">
                        {t('execution.processing', { user: progress.currentUser })}
                    </p>
                )}

                {progress.errors && progress.errors.length > 0 && (
                    <div className="mt-6 border border-eth-danger/30 bg-eth-danger/10 rounded-xl max-h-48 overflow-y-auto">
                        <ul className="divide-y divide-rose-100">
                            {progress.errors.map((error, idx) => (
                                <li key={idx} className="p-3 text-sm flex items-start space-x-2 text-eth-danger">
                                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                                    <span>
                                        <strong>{error.user}</strong>: {error.error}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            {!isProcessing && (
                <div className="flex items-center justify-between pt-2">
                    <button
                        onClick={onReset}
                        className="px-4 py-2 text-sm text-on-surface-variant hover:text-on-surface border border-outline-variant/30 rounded-lg hover:bg-surface-container-low transition-colors"
                    >
                        {t('execution.newOperation')}
                    </button>
                    {serverJobId && progress.failed > 0 && (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => handleDownloadReport('csv')}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-eth-danger bg-eth-danger/10 hover:bg-eth-danger/15 rounded-lg transition-colors"
                            >
                                <Download size={14} />
                                {t('execution.errorReportCsv')}
                            </button>
                            <button
                                onClick={() => handleDownloadReport('json')}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-on-surface-variant bg-surface-container-low hover:bg-surface-container-high rounded-lg transition-colors"
                            >
                                <Download size={14} />
                                {t('execution.errorReportJson')}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
