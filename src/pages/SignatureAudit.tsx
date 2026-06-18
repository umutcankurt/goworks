import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { XCircle, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { HelpGuide } from '../components/HelpGuide';
import { AuditConfigStep } from '../components/signatureAudit/AuditConfigStep';
import { AuditReviewTable } from '../components/signatureAudit/AuditReviewTable';
import { useToast } from '../contexts/ToastContext';
import { ipcEvents } from '../services/api';
import {
    signatureAuditApi,
    jobsApi,
    bulkApi,
    type SignatureAuditItem,
    type AuditScope,
    type AuditDepth,
} from '../services/server-api';

type AuditStep = 'configure' | 'scanning' | 'review' | 'applying' | 'done';

const STEP_ORDER: AuditStep[] = ['configure', 'scanning', 'review', 'applying', 'done'];

interface JobProgress {
    current: number;
    total: number;
    currentUser: string;
    succeeded: number;
    failed: number;
    status: 'running' | 'completed' | 'cancelled' | 'failed';
}

const EMPTY_PROGRESS: JobProgress = {
    current: 0, total: 0, currentUser: '', succeeded: 0, failed: 0, status: 'running',
};

export function SignatureAudit() {
    const { t } = useTranslation('signatureAudit');
    const { addToast } = useToast();

    const [step, setStep] = useState<AuditStep>('configure');
    const [templateId, setTemplateId] = useState<number | null>(null);
    const [scanJobId, setScanJobId] = useState<string | null>(null);
    const [applyJobId, setApplyJobId] = useState<string | null>(null);
    const [items, setItems] = useState<SignatureAuditItem[]>([]);
    const [progress, setProgress] = useState<JobProgress>(EMPTY_PROGRESS);
    const startedRef = useRef(false);

    // Progress subscription for the active job (scan or apply)
    useEffect(() => {
        if (step !== 'scanning' && step !== 'applying') return;
        const phase = step;
        const jid = phase === 'scanning' ? scanJobId : applyJobId;
        if (!jid) return;

        const onProgress = (_e: unknown, data: any) => {
            if (!data || data.jobId !== jid) return;
            setProgress((p) => ({
                ...p,
                current: data.progress ?? 0,
                total: data.total ?? p.total,
                currentUser: data.currentUser ?? '',
                succeeded: data.succeeded ?? 0,
                failed: data.failed ?? 0,
                status: 'running',
            }));
        };
        const onDone = (_e: unknown, data: any) => {
            if (!data || data.jobId !== jid) return;
            const finalStatus: JobProgress['status'] =
                data.status === 'COMPLETED' ? 'completed'
                : data.status === 'CANCELLED' ? 'cancelled'
                : 'failed';
            setProgress((p) => ({ ...p, status: finalStatus }));

            if (phase === 'scanning') {
                if (finalStatus === 'cancelled') {
                    setStep('configure');
                    return;
                }
                signatureAuditApi.getItems(jid)
                    .then((result) => { setItems(result); setStep('review'); })
                    .catch((err: any) => {
                        addToast(t('toast.itemsFailed', { error: err?.message || String(err) }), 'error');
                        setStep('configure');
                    });
            } else {
                setStep('done');
            }
        };

        ipcEvents.on('jobs:progress', onProgress as (...a: unknown[]) => void);
        ipcEvents.on('jobs:done', onDone as (...a: unknown[]) => void);
        return () => {
            ipcEvents.off('jobs:progress', onProgress as (...a: unknown[]) => void);
            ipcEvents.off('jobs:done', onDone as (...a: unknown[]) => void);
        };
    }, [step, scanJobId, applyJobId]);

    const handleStartScan = async (config: { scope: AuditScope; templateId: number; depth: AuditDepth }) => {
        if (startedRef.current) return;
        startedRef.current = true;
        setTemplateId(config.templateId);
        setProgress(EMPTY_PROGRESS);
        try {
            const { jobId } = await signatureAuditApi.startScan(config);
            setScanJobId(jobId);
            setStep('scanning');
        } catch (err: any) {
            addToast(t('toast.scanFailed', { error: err?.message || String(err) }), 'error');
        } finally {
            startedRef.current = false;
        }
    };

    const handleApply = async (emails: string[]) => {
        if (!templateId || emails.length === 0) return;
        setProgress({ ...EMPTY_PROGRESS, total: emails.length });
        try {
            const { jobId } = await signatureAuditApi.apply({ emails, templateId });
            setApplyJobId(jobId);
            setStep('applying');
        } catch (err: any) {
            addToast(t('toast.applyFailed', { error: err?.message || String(err) }), 'error');
        }
    };

    const handleCancel = async () => {
        const jid = step === 'scanning' ? scanJobId : applyJobId;
        if (!jid) return;
        try {
            await jobsApi.cancel(jid);
            addToast(t('toast.cancelling'), 'info');
        } catch (err: any) {
            addToast(t('toast.cancelFailed', { error: err?.message || String(err) }), 'error');
        }
    };

    const handleReset = () => {
        setStep('configure');
        setScanJobId(null);
        setApplyJobId(null);
        setItems([]);
        setProgress(EMPTY_PROGRESS);
    };

    // Re-scan from review so a new scan can be run once the scan finishes
    const handleRescan = () => {
        setItems([]);
        setScanJobId(null);
        setProgress(EMPTY_PROGRESS);
        setStep('configure');
    };

    const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
    const currentStepIndex = STEP_ORDER.indexOf(step);

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-on-surface">{t('title')}</h2>
                    <p className="text-on-surface-variant mt-1">{t('subtitle')}</p>
                </div>
                <HelpGuide namespace="signatureAudit" />
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-2 text-sm">
                {STEP_ORDER.map((s, i) => {
                    const isActive = i === currentStepIndex;
                    const isPast = i < currentStepIndex;
                    return (
                        <div key={s} className="flex items-center gap-2">
                            {i > 0 && <div className={`w-8 h-px ${isPast ? 'bg-eth-primary-container/60' : 'bg-surface-container-highest'}`} />}
                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                                isActive
                                    ? 'bg-eth-primary-container/15 text-eth-primary'
                                    : isPast
                                    ? 'bg-eth-secondary/15 text-eth-secondary'
                                    : 'bg-surface-container-high text-on-surface-variant'
                            }`}>
                                {t(`steps.${s}`)}
                            </span>
                        </div>
                    );
                })}
            </div>

            <motion.div
                key={step}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-surface-container rounded-xl p-6 shadow-sm border border-outline-variant/30"
            >
                {step === 'configure' && <AuditConfigStep onStart={handleStartScan} />}

                {(step === 'scanning' || step === 'applying') && (
                    <div className="space-y-5">
                        <div className="flex items-center justify-between">
                            <span className="text-on-surface font-semibold">
                                {t(step === 'scanning' ? 'progress.scanning' : 'progress.applying')}
                            </span>
                            <span className="text-on-surface-variant text-sm bg-surface-container-high px-3 py-1 rounded-lg border border-outline-variant/30">
                                {progress.total > 0 ? `${pct}% (${progress.current}/${progress.total})` : t('progress.preparing')}
                            </span>
                        </div>
                        <div className="w-full bg-surface-container-highest rounded-full h-2.5 overflow-hidden">
                            <div
                                className="bg-eth-primary-container h-2.5 rounded-full transition-all duration-300"
                                style={{ width: `${progress.total > 0 ? pct : 8}%` }}
                            />
                        </div>
                        {progress.currentUser && (
                            <p className="text-sm text-eth-primary font-medium text-center animate-pulse">
                                {t('progress.processing', { user: progress.currentUser })}
                            </p>
                        )}
                        <div className="flex justify-center">
                            <button
                                type="button"
                                onClick={handleCancel}
                                className="px-4 py-2 text-sm rounded-lg border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high transition-colors flex items-center gap-1.5"
                            >
                                <XCircle size={16} />
                                {t('progress.cancel')}
                            </button>
                        </div>
                    </div>
                )}

                {step === 'review' && (
                    <AuditReviewTable items={items} onApply={handleApply} onReset={handleRescan} />
                )}

                {step === 'done' && (
                    <div className="space-y-5 text-center py-4">
                        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-eth-secondary/15">
                            <span className="text-eth-secondary text-2xl">✓</span>
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-on-surface">{t('done.heading')}</h3>
                            <p className="text-on-surface-variant text-sm mt-1">
                                {t('done.summary', { succeeded: progress.succeeded, failed: progress.failed })}
                            </p>
                        </div>
                        <div className="flex items-center justify-center gap-2">
                            {applyJobId && progress.failed > 0 && (
                                <button
                                    type="button"
                                    onClick={() => bulkApi.downloadReport(applyJobId, 'csv')}
                                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-eth-danger bg-eth-danger/10 hover:bg-eth-danger/15 rounded-lg transition-colors"
                                >
                                    <Download size={14} />
                                    {t('done.downloadReport')}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={handleReset}
                                className="px-4 py-2 text-sm font-medium rounded-lg bg-eth-primary-container text-on-eth-primary-container hover:brightness-110 transition-all"
                            >
                                {t('done.newAudit')}
                            </button>
                        </div>
                    </div>
                )}
            </motion.div>
        </div>
    );
}
