import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, KeyRound, Loader2, Check, X } from 'lucide-react';
import { useVault } from '../../contexts/VaultContext';
import { useToast } from '../../contexts/ToastContext';
import { PasswordField } from './PasswordField';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';
import { MIN_PASSWORD_LENGTH } from '../../utils/passwordStrength';

/**
 * Settings → Security modal that re-keys the vault to a new master password.
 * The backend only re-wraps the DEK, so the encrypted payload (Service Account +
 * refresh token) is preserved — the vault stays unlocked and the Google session
 * keeps working. Non-destructive, so a simple confirm (no type-to-confirm).
 */
export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
    const { t } = useTranslation('vault');
    const { changePassword } = useVault();
    const { addToast } = useToast();

    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const showMatch = confirm.length > 0;
    const matches = next === confirm;
    const canSubmit = !busy && current.length > 0 && next.length >= MIN_PASSWORD_LENGTH && matches;

    const close = () => { if (!busy) onClose(); };

    const handleSubmit = async () => {
        setError(null);
        if (next.length < MIN_PASSWORD_LENGTH) {
            setError(t('setup.tooShort', { min: MIN_PASSWORD_LENGTH }));
            return;
        }
        if (next !== confirm) {
            setError(t('setup.mismatch'));
            return;
        }
        setBusy(true);
        try {
            await changePassword(current, next);
            addToast(t('changePassword.success'), 'success');
            onClose();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setError(t('changePassword.error', { error: msg }));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            className="eth-app fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="change-pw-title"
        >
            <div className="eth-glass eth-glow-cyan-panel w-full max-w-md rounded-2xl p-6">
                <div className="flex items-start gap-3">
                    <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-eth-primary/40 bg-eth-primary/15 text-eth-primary"
                        aria-hidden
                    >
                        <KeyRound className="h-6 w-6" />
                    </div>
                    <div>
                        <h3 id="change-pw-title" className="text-lg font-semibold text-on-surface">
                            {t('changePassword.title')}
                        </h3>
                        <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">
                            {t('changePassword.description')}
                        </p>
                    </div>
                </div>

                <div className="mt-5 space-y-4">
                    <PasswordField
                        id="cp-current"
                        variant="surface"
                        label={t('changePassword.currentLabel')}
                        value={current}
                        onChange={setCurrent}
                        autoComplete="current-password"
                        autoFocus
                        disabled={busy}
                    />
                    <div>
                        <PasswordField
                            id="cp-new"
                            variant="surface"
                            label={t('changePassword.newLabel')}
                            value={next}
                            onChange={setNext}
                            autoComplete="new-password"
                            disabled={busy}
                        />
                        <PasswordStrengthMeter password={next} />
                    </div>
                    <div>
                        <PasswordField
                            id="cp-confirm"
                            variant="surface"
                            label={t('changePassword.confirmLabel')}
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
                </div>

                <div className="mt-6 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={close}
                        disabled={busy}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border eth-border-ghost text-on-surface hover:bg-surface-container-low text-sm disabled:opacity-50"
                    >
                        {t('changePassword.cancel')}
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-eth-primary text-white text-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                        {busy ? t('changePassword.submitting') : t('changePassword.submit')}
                    </button>
                </div>
            </div>
        </div>
    );
}
