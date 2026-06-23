import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, KeyRound, Loader2, Check, X } from 'lucide-react';
import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { useVault } from '../../../contexts/VaultContext';
import { PasswordField } from '../../vault/PasswordField';
import { PasswordStrengthMeter } from '../../vault/PasswordStrengthMeter';
import { MIN_PASSWORD_LENGTH } from '../../../utils/passwordStrength';

interface MasterPasswordStepProps {
    onValidChange: (valid: boolean) => void;
}

/**
 * Onboarding step: create the master-password vault BEFORE the Service Account /
 * admin-login steps write into it. Once created the vault stays unlocked for the
 * rest of the wizard.
 */
export function MasterPasswordStep({ onValidChange }: MasterPasswordStepProps) {
    const { t } = useTranslation('vault');
    const { state, setup } = useVault();

    const alreadyCreated = state?.status === 'UNLOCKED';
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(alreadyCreated);

    useEffect(() => {
        // If the vault was already created (e.g. navigating back/forward), the step
        // is satisfied.
        if (alreadyCreated) {
            setDone(true);
            onValidChange(true);
        }
    }, [alreadyCreated, onValidChange]);

    const handleCreate = async () => {
        setError(null);
        if (password.length < MIN_PASSWORD_LENGTH) {
            setError(t('setup.tooShort', { min: MIN_PASSWORD_LENGTH }));
            return;
        }
        if (password !== confirm) {
            setError(t('setup.mismatch'));
            return;
        }
        setBusy(true);
        try {
            await setup(password);
            setDone(true);
            onValidChange(true);
            setPassword('');
            setConfirm('');
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setError(t('setup.error', { error: msg }));
            onValidChange(false);
        } finally {
            setBusy(false);
        }
    };

    const showMatch = confirm.length > 0;
    const matches = password === confirm;

    return (
        <div className="mx-auto flex h-full max-w-2xl flex-col py-4">
            <div className="mb-4">
                <h1 className="text-3xl font-semibold tracking-tight text-on-surface">{t('onboarding.title')}</h1>
                <p className="mt-2 text-on-surface-variant">{t('onboarding.description')}</p>
            </div>

            <Card tone="elevated" padding="lg">
                {done ? (
                    <div className="flex items-center gap-3 text-on-surface">
                        <ShieldCheck className="h-6 w-6 text-emerald-500" aria-hidden="true" />
                        <span className="text-sm">{t('onboarding.done')}</span>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div>
                            <PasswordField
                                id="ob-master-password"
                                variant="surface"
                                label={t('setup.passwordLabel')}
                                value={password}
                                onChange={setPassword}
                                autoComplete="new-password"
                                autoFocus
                                disabled={busy}
                            />
                            <PasswordStrengthMeter password={password} />
                            <p className="mt-1 text-xs text-on-surface-variant">{t('onboarding.minHint', { min: MIN_PASSWORD_LENGTH })}</p>
                        </div>
                        <div>
                            <PasswordField
                                id="ob-master-confirm"
                                variant="surface"
                                label={t('setup.confirmLabel')}
                                value={confirm}
                                onChange={setConfirm}
                                autoComplete="new-password"
                                disabled={busy}
                            />
                            {showMatch && (
                                <p className={`mt-1 flex items-center gap-1 text-xs ${matches ? 'text-emerald-500' : 'text-red-500'}`}>
                                    {matches ? <Check className="h-3 w-3" aria-hidden="true" /> : <X className="h-3 w-3" aria-hidden="true" />}
                                    {matches ? t('common.match') : t('common.noMatch')}
                                </p>
                            )}
                        </div>

                        {error && <p className="text-sm text-eth-danger" role="alert" aria-live="polite">{error}</p>}

                        <Button
                            variant="primary"
                            size="md"
                            onClick={handleCreate}
                            disabled={busy || !password || !confirm}
                            leftIcon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                        >
                            {busy ? t('setup.creating') : t('setup.create')}
                        </Button>

                        <p className="text-xs text-on-surface-variant">{t('onboarding.note')}</p>
                    </div>
                )}
            </Card>
        </div>
    );
}
