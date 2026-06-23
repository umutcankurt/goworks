import { useState, useEffect, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, ShieldAlert, Loader2, Check, X } from 'lucide-react';
import { useVault } from '../../contexts/VaultContext';
import { LanguageSwitch } from '../LanguageSwitch';
import { ThemeToggle } from '../ThemeToggle';
import { PasswordField } from './PasswordField';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';
import { MIN_PASSWORD_LENGTH } from '../../utils/passwordStrength';

type Mode = 'unlock' | 'setup';

/**
 * Full-screen gate shown when the vault is LOCKED ('unlock' mode) or when a
 * master password must be (re)created outside the wizard — legacy upgrade or
 * post-reset ('setup' mode). The DEK never reaches the renderer; we only send the
 * password and reflect the returned status. Carries the app's language + theme
 * toggles so the lock screen behaves like every other GoWorks surface.
 */
export function VaultLockScreen({ mode }: { mode: Mode }) {
    const { t } = useTranslation('vault');
    const { state, unlock, setup, reset, refresh } = useVault();

    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [confirmingReset, setConfirmingReset] = useState(false);
    const [resetKeyword, setResetKeyword] = useState('');
    const [now, setNow] = useState(() => Date.now());

    const corrupt = !!state?.corrupt;
    const pending = state?.pendingJobs ?? 0;
    const lockedUntil = state?.lockedUntil ?? 0;
    const lockedOutMs = Math.max(0, lockedUntil - now);
    const lockedOut = mode === 'unlock' && lockedOutMs > 0;

    // Tick once a second while locked out so the countdown stays live.
    useEffect(() => {
        if (!lockedOut) return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [lockedOut]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        if (mode === 'setup') {
            if (password.length < MIN_PASSWORD_LENGTH) {
                setError(t('setup.tooShort', { min: MIN_PASSWORD_LENGTH }));
                return;
            }
            if (password !== confirm) {
                setError(t('setup.mismatch'));
                return;
            }
        } else if (!password) {
            return;
        }
        setBusy(true);
        try {
            if (mode === 'setup') {
                await setup(password);
            } else {
                await unlock(password);
            }
            setPassword('');
            setConfirm('');
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setError(mode === 'setup' ? t('setup.error', { error: msg }) : msg);
            // Pull fresh state so a brute-force lockout countdown (lockedUntil) shows.
            if (mode === 'unlock') {
                setNow(Date.now());
                refresh().catch(() => { /* ignore */ });
            }
        } finally {
            setBusy(false);
        }
    };

    const keyword = t('reset.confirmKeyword');
    const resetMatches = resetKeyword.trim().toUpperCase() === keyword.toUpperCase();

    const handleReset = async () => {
        if (!resetMatches) return;
        setBusy(true);
        try {
            await reset();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
            setConfirmingReset(false);
            setResetKeyword('');
        }
    };

    const showMatch = mode === 'setup' && confirm.length > 0;
    const matches = password === confirm;

    const title = mode === 'setup' ? t('setup.title') : t('lock.title');
    const subtitle = mode === 'setup' ? t('setup.subtitle') : t('lock.subtitle');

    return (
        <div className="eth-app relative flex min-h-screen items-center justify-center overflow-hidden p-6">
            {/* Ambient blur blobs — mirrors the Login screen so the two pre-auth
                surfaces read as twins. */}
            <div
                className="pointer-events-none absolute -left-1/4 -top-1/4 h-1/2 w-1/2 rounded-full blur-3xl"
                style={{ background: 'color-mix(in srgb, var(--color-eth-primary-container) 18%, transparent)' }}
                aria-hidden
            />
            <div
                className="pointer-events-none absolute -bottom-1/4 -right-1/4 h-1/2 w-1/2 rounded-full blur-3xl"
                style={{ background: 'color-mix(in srgb, var(--color-eth-secondary) 12%, transparent)' }}
                aria-hidden
            />
            <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
                <ThemeToggle variant="ethereal" />
                <LanguageSwitch variant="ethereal" />
            </div>
            {/* Override eth-glass's translucent fill with an opaque surface token so
                the card sits ~1 tone above the eth-app background — in light mode the
                translucent glass fill was nearly identical to the page background.
                Token-based, so it stays correct in dark mode too. */}
            <div
                className="eth-glass eth-glow-cyan-panel relative z-10 w-full max-w-sm rounded-3xl p-8"
                style={{ backgroundColor: 'var(--color-surface-container-high)' }}
            >
                <div className="mb-6 flex flex-col items-center text-center">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-eth-primary-container text-on-eth-primary-container eth-glow-cyan">
                        <Lock className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <h1 className="text-lg font-semibold">{title}</h1>
                    <p className="mt-1 text-sm text-on-surface-variant">{subtitle}</p>
                </div>

                {pending > 0 && (
                    <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-500">
                        {t('lock.pending', { count: pending })}
                    </div>
                )}

                {corrupt && (
                    <div className="mb-4 flex items-start gap-2 rounded-lg border border-eth-danger/40 bg-eth-danger/10 px-3 py-2 text-xs text-eth-danger">
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>{t('lock.corrupt')}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                        <PasswordField
                            id="vault-password"
                            variant="ethereal"
                            label={mode === 'setup' ? t('setup.passwordLabel') : t('lock.passwordLabel')}
                            value={password}
                            onChange={setPassword}
                            autoFocus
                            autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
                            placeholder={t('lock.passwordPlaceholder')}
                            disabled={busy || lockedOut}
                        />
                        {mode === 'setup' && <PasswordStrengthMeter password={password} />}
                        {mode === 'setup' && (
                            <p className="mt-1 text-[11px] text-on-surface-variant">{t('setup.recommend')}</p>
                        )}
                    </div>

                    {mode === 'setup' && (
                        <div>
                            <PasswordField
                                id="vault-confirm"
                                variant="ethereal"
                                label={t('setup.confirmLabel')}
                                value={confirm}
                                onChange={setConfirm}
                                autoComplete="new-password"
                                disabled={busy}
                            />
                            {showMatch && (
                                <p className={`mt-1 flex items-center gap-1 text-[11px] ${matches ? 'text-emerald-500' : 'text-red-500'}`}>
                                    {matches ? <Check className="h-3 w-3" aria-hidden="true" /> : <X className="h-3 w-3" aria-hidden="true" />}
                                    {matches ? t('common.match') : t('common.noMatch')}
                                </p>
                            )}
                        </div>
                    )}

                    {lockedOut && (
                        <p className="text-sm text-amber-500" role="alert" aria-live="polite">
                            {t('lock.lockedOut', { seconds: Math.ceil(lockedOutMs / 1000) })}
                        </p>
                    )}
                    {error && !lockedOut && (
                        <p className="text-sm text-eth-danger" role="alert" aria-live="polite">{error}</p>
                    )}

                    <button
                        type="submit"
                        disabled={
                            busy ||
                            lockedOut ||
                            (mode === 'unlock' && !password) ||
                            (mode === 'setup' && (!password || !confirm))
                        }
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-on-surface px-4 py-3 text-sm font-semibold text-surface shadow-lg transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-eth-primary-container/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                        {mode === 'setup'
                            ? (busy ? t('setup.creating') : t('setup.create'))
                            : (busy ? t('lock.unlocking') : t('lock.unlock'))}
                    </button>
                </form>

                {mode === 'unlock' && (
                    <div className="mt-5 border-t border-outline-variant/40 pt-4">
                        {!confirmingReset ? (
                            <div className="text-center">
                                <button
                                    type="button"
                                    onClick={() => setConfirmingReset(true)}
                                    className="text-xs text-on-surface-variant underline-offset-2 hover:underline"
                                >
                                    {t('lock.forgot')}
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <p className="text-xs text-eth-danger">{t('reset.warningDetailed')}</p>
                                <div>
                                    <label htmlFor="vault-reset-keyword" className="mb-1 block text-[11px] text-on-surface-variant">
                                        {t('reset.confirmPrompt', { keyword })}
                                    </label>
                                    <input
                                        id="vault-reset-keyword"
                                        type="text"
                                        value={resetKeyword}
                                        onChange={(e) => setResetKeyword(e.target.value)}
                                        placeholder={keyword}
                                        autoComplete="off"
                                        className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface outline-none focus:border-eth-primary"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={handleReset}
                                        disabled={busy || !resetMatches}
                                        className="flex-1 rounded-lg bg-eth-danger px-3 py-2 text-xs font-medium text-white transition hover:brightness-110 disabled:opacity-50"
                                    >
                                        {t('reset.confirm')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setConfirmingReset(false); setResetKeyword(''); }}
                                        disabled={busy}
                                        className="flex-1 rounded-lg border eth-border-ghost px-3 py-2 text-xs text-on-surface hover:bg-surface-container-low"
                                    >
                                        {t('reset.cancel')}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
