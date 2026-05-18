import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { useToast } from '../../../contexts/ToastContext';
import { appConfigApi } from '../../../services/server-api';

interface OAuthCredentialsFormProps {
    /**
     * Onboarding: secret zorunlu (yeni kurulum). Settings: secret boş bırakılırsa
     * mevcut kayıtlı secret korunur (rotasyon).
     */
    requireSecret: boolean;
    /** Status değiştiğinde parent'a haber verir (canGoNext / kart "kayıtlı" rozeti). */
    onValidChange?: (valid: boolean) => void;
    /** Settings'te kaydetme sonrası "Sil" butonu gösterilebilir. */
    showClearButton?: boolean;
}

type TestState =
    | { kind: 'idle' }
    | { kind: 'testing' }
    | { kind: 'ok' }
    | { kind: 'fail'; error: string };

export function OAuthCredentialsForm({
    requireSecret,
    onValidChange,
    showClearButton = false,
}: OAuthCredentialsFormProps) {
    const { t } = useTranslation('onboarding');
    const { addToast } = useToast();

    const [clientId, setClientId] = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const [hasStoredSecret, setHasStoredSecret] = useState(false);
    const [revealSecret, setRevealSecret] = useState(false);
    const [test, setTest] = useState<TestState>({ kind: 'idle' });
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);

    const isComplete = clientId.trim().length > 0 && (hasStoredSecret || clientSecret.trim().length > 0);

    const refresh = useCallback(async () => {
        try {
            setLoading(true);
            const status = await appConfigApi.getOAuthCredentials();
            setClientId(status.clientId ?? '');
            setHasStoredSecret(status.hasSecret);
            const valid = !!status.clientId && status.hasSecret;
            onValidChange?.(valid);
        } catch {
            // sessiz: ilk kurulumda key yoksa servis hata dönmez, ama IPC unavailable
            // gibi extreme durumlarda buraya düşeriz.
            onValidChange?.(false);
        } finally {
            setLoading(false);
        }
    }, [onValidChange]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    useEffect(() => {
        // clientId/secret değiştikçe önceki test sonucunu invalide et.
        if (test.kind !== 'idle' && test.kind !== 'testing') {
            setTest({ kind: 'idle' });
        }
    }, [clientId, clientSecret]);

    const canTest = clientId.trim().length > 0 && clientSecret.trim().length > 0;
    const canSave = requireSecret
        ? clientId.trim().length > 0 && clientSecret.trim().length > 0
        : isComplete;

    const handleTest = async () => {
        if (!canTest) return;
        setTest({ kind: 'testing' });
        try {
            const result = await appConfigApi.testOAuthCredentials(clientId.trim(), clientSecret.trim());
            if (result.ok) {
                setTest({ kind: 'ok' });
            } else {
                setTest({ kind: 'fail', error: t('cloud.credentials.testFailedUnknown') });
            }
        } catch (err: any) {
            setTest({ kind: 'fail', error: err.message || t('cloud.credentials.testFailedUnknown') });
        }
    };

    const handleSave = async () => {
        if (!canSave) return;
        setSaving(true);
        try {
            await appConfigApi.setOAuthCredentials(clientId.trim(), clientSecret.trim());
            addToast(t('cloud.credentials.saved'));
            setClientSecret('');
            setRevealSecret(false);
            await refresh();
        } catch (err: any) {
            addToast(t('cloud.credentials.saveFailed', { error: err.message }), 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleClear = async () => {
        if (!window.confirm(t('cloud.credentials.clearConfirm'))) return;
        try {
            await appConfigApi.clearOAuthCredentials();
            addToast(t('cloud.credentials.cleared'));
            setClientId('');
            setClientSecret('');
            setHasStoredSecret(false);
            onValidChange?.(false);
        } catch (err: any) {
            addToast(t('cloud.credentials.saveFailed', { error: err.message }), 'error');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('cloud.credentials.loading')}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <Input
                label={t('cloud.credentials.clientIdLabel')}
                placeholder={t('cloud.credentials.clientIdPlaceholder')}
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                hint={t('cloud.credentials.clientIdHint')}
                autoComplete="off"
                spellCheck={false}
            />

            <div className="space-y-1.5">
                <Input
                    label={t('cloud.credentials.clientSecretLabel')}
                    type={revealSecret ? 'text' : 'password'}
                    placeholder={
                        hasStoredSecret
                            ? t('cloud.credentials.clientSecretStoredPlaceholder')
                            : t('cloud.credentials.clientSecretPlaceholder')
                    }
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    hint={
                        hasStoredSecret && !requireSecret
                            ? t('cloud.credentials.clientSecretRotateHint')
                            : t('cloud.credentials.clientSecretHint')
                    }
                    autoComplete="off"
                    spellCheck={false}
                />
                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={() => setRevealSecret((v) => !v)}
                        className="inline-flex items-center gap-1.5 text-xs text-on-surface-variant hover:text-on-surface transition-colors"
                        aria-pressed={revealSecret}
                        aria-label={revealSecret ? t('cloud.credentials.hideSecret') : t('cloud.credentials.revealSecret')}
                    >
                        {revealSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        {revealSecret ? t('cloud.credentials.hideSecret') : t('cloud.credentials.revealSecret')}
                    </button>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    onClick={handleTest}
                    disabled={!canTest || test.kind === 'testing'}
                    leftIcon={
                        test.kind === 'testing' ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined
                    }
                >
                    {test.kind === 'testing'
                        ? t('cloud.credentials.testing')
                        : t('cloud.credentials.testButton')}
                </Button>

                <Button
                    type="button"
                    variant="primary"
                    size="md"
                    onClick={handleSave}
                    disabled={!canSave || saving}
                    leftIcon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
                >
                    {saving ? t('cloud.credentials.saving') : t('cloud.credentials.saveButton')}
                </Button>

                {showClearButton && hasStoredSecret && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="md"
                        onClick={handleClear}
                    >
                        {t('cloud.credentials.clearButton')}
                    </Button>
                )}

                {test.kind === 'ok' && (
                    <span className="inline-flex items-center gap-1.5 text-sm text-eth-success">
                        <CheckCircle2 className="h-4 w-4" />
                        {t('cloud.credentials.testSuccess')}
                    </span>
                )}
                {test.kind === 'fail' && (
                    <span className="inline-flex items-center gap-1.5 text-sm text-eth-danger">
                        <AlertCircle className="h-4 w-4" />
                        {test.error}
                    </span>
                )}

                {hasStoredSecret && test.kind === 'idle' && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-on-surface-variant">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {t('cloud.credentials.savedBadge')}
                    </span>
                )}
            </div>
        </div>
    );
}
