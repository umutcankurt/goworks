import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, Loader2, LogIn } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useVault } from '../../contexts/VaultContext';
import { LanguageSwitch } from '../LanguageSwitch';
import { ThemeToggle } from '../ThemeToggle';

/**
 * Full-screen gate shown when the vault is UNLOCKED but the silent Google session
 * restore failed (`googleReauthNeeded`). The vault holds the encrypted keys, but
 * the stored refresh token is no longer usable (revoked / expired / issued for a
 * different OAuth client). Without this gate the app would render normally and the
 * first Google API call would fail with a cryptic "No access, refresh token..."
 * error. Here we stop at a clear "log in again" screen; a successful login mints a
 * fresh refresh token and clears the flag, after which the app proceeds normally.
 */
export function GoogleReauthScreen() {
    const { t } = useTranslation('vault');
    const { login } = useAuth();
    const { refresh } = useVault();

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleLogin = async () => {
        setError(null);
        setBusy(true);
        try {
            await login();
            // Login cleared googleReauthNeeded in the main process; pull fresh vault
            // state so VaultGate re-renders into the app.
            await refresh();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setError(t('reauth.error', { error: msg }));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="eth-app relative flex min-h-screen items-center justify-center overflow-hidden p-6">
            {/* Ambient blur blobs — mirrors the lock/login surfaces. */}
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
            <div
                className="eth-glass eth-glow-cyan-panel relative z-10 w-full max-w-sm rounded-3xl p-8"
                style={{ backgroundColor: 'var(--color-surface-container-high)' }}
            >
                <div className="mb-6 flex flex-col items-center text-center">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-500">
                        <ShieldAlert className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <h1 className="text-lg font-semibold">{t('reauth.title')}</h1>
                    <p className="mt-1 text-sm text-on-surface-variant">{t('reauth.subtitle')}</p>
                </div>

                {error && (
                    <p className="mb-3 text-sm text-eth-danger" role="alert" aria-live="polite">{error}</p>
                )}

                <button
                    type="button"
                    onClick={handleLogin}
                    disabled={busy}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-on-surface px-4 py-3 text-sm font-semibold text-surface shadow-lg transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-eth-primary-container/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {busy
                        ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        : <LogIn className="h-4 w-4" aria-hidden="true" />}
                    {busy ? t('reauth.signingIn') : t('reauth.button')}
                </button>

                <p className="mt-4 text-center text-[11px] text-on-surface-variant">{t('reauth.note')}</p>
            </div>
        </div>
    );
}
