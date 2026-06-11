import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, AlertCircle, Trash2, Upload, Loader2 } from 'lucide-react';
import { serverApi, type ServiceAccountStatus } from '../../../services/server-api';
import { useToast } from '../../../contexts/ToastContext';
import { Button } from '../../ui/Button';

interface ServiceAccountUploadProps {
    /** Notifies the parent when the status changes (for the onboarding "Devam et" button). */
    onStatusChange?: (status: ServiceAccountStatus | null) => void;
}

export function ServiceAccountUpload({ onStatusChange }: ServiceAccountUploadProps) {
    const { t } = useTranslation('onboarding');
    const { addToast } = useToast();
    const [status, setStatus] = useState<ServiceAccountStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(async () => {
        try {
            setLoading(true);
            const s = await serverApi.getServiceAccountStatus();
            setStatus(s);
            onStatusChange?.(s);
        } catch {
            setStatus(null);
            onStatusChange?.(null);
        } finally {
            setLoading(false);
        }
    }, [onStatusChange]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const handleFile = async (file: File) => {
        if (!file.name.toLowerCase().endsWith('.json')) {
            addToast(t('serviceAccount.errors.notJson'), 'error');
            return;
        }
        try {
            setBusy(true);
            const content = await file.text();
            await serverApi.uploadServiceAccount(content);
            addToast(t('serviceAccount.toast.uploaded'));
            await refresh();
        } catch (err: any) {
            addToast(t('serviceAccount.errors.uploadFailed', { error: err.message }), 'error');
        } finally {
            setBusy(false);
        }
    };

    const handleRemove = async () => {
        if (!window.confirm(t('serviceAccount.confirmDelete'))) return;
        try {
            await serverApi.deleteServiceAccount();
            addToast(t('serviceAccount.toast.deleted'));
            await refresh();
        } catch (err: any) {
            addToast(err.message, 'error');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-on-surface-variant">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t('serviceAccount.checking')}</span>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {status?.configured ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-eth-secondary/30 bg-eth-secondary/10 px-4 py-3">
                    <div className="flex items-center gap-2 text-eth-secondary">
                        <CheckCircle2 className="h-5 w-5" />
                        <div>
                            <div className="font-medium">{t('serviceAccount.configured')}</div>
                            <div className="font-mono text-xs text-on-surface-variant">
                                {status.email}
                            </div>
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<Trash2 className="h-4 w-4" />}
                        onClick={handleRemove}
                    >
                        {t('serviceAccount.delete')}
                    </Button>
                </div>
            ) : (
                <label className="block cursor-pointer">
                    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-eth-primary-container/30 bg-surface-container-high px-6 py-10 text-center transition-colors hover:bg-surface-container-highest">
                        <Upload className="h-12 w-12 text-eth-primary-container" />
                        <div>
                            <div className="font-semibold text-on-surface">
                                {busy ? t('serviceAccount.uploading') : t('serviceAccount.dropzoneTitle')}
                            </div>
                            <div className="mt-1 text-xs text-on-surface-variant">
                                {t('serviceAccount.dropzoneHint')}
                            </div>
                        </div>
                        <input
                            type="file"
                            accept="application/json,.json"
                            className="hidden"
                            disabled={busy}
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleFile(f);
                                e.target.value = '';
                            }}
                        />
                    </div>
                </label>
            )}

            {!status?.configured && (
                <div className="flex items-start gap-2 rounded-lg bg-surface-container-lowest px-3 py-2 text-xs text-on-surface-variant">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-eth-primary" />
                    <span>{t('serviceAccount.guideHint')}</span>
                </div>
            )}
        </div>
    );
}
