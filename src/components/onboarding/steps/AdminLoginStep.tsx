import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, LogIn } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';

export function AdminLoginStep() {
    const { t } = useTranslation('onboarding');
    const { login } = useAuth();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const checklist = (t('adminLogin.checklist', { returnObjects: true }) as string[]) || [];

    const handleLogin = async () => {
        setBusy(true);
        setError(null);
        try {
            await login();
            // Onboarding.tsx watches the isAuthenticated change and automatically advances to the DWD step.
        } catch (err: any) {
            setError(err?.message || 'Login failed');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center gap-4 py-4">
            <div
                className="flex h-16 w-16 items-center justify-center rounded-full border border-eth-primary/40 bg-eth-primary/15 text-eth-primary eth-glow-cyan-ambient"
                aria-hidden
            >
                <LogIn className="h-8 w-8" strokeWidth={2.5} />
            </div>

            <div className="text-center">
                <h1 className="text-3xl font-bold tracking-tight text-on-surface">
                    {t('adminLogin.title')}
                </h1>
                <p className="mt-3 text-on-surface-variant">{t('adminLogin.subtitle')}</p>
            </div>

            <Card tone="default" padding="lg" className="w-full">
                <ul className="space-y-3">
                    {checklist.map((item) => (
                        <li key={item} className="flex items-start gap-3 text-sm text-on-surface">
                            <Check className="mt-0.5 h-5 w-5 shrink-0 text-eth-secondary" />
                            <span>{item}</span>
                        </li>
                    ))}
                </ul>
            </Card>

            <div className="flex w-full max-w-md flex-col items-center gap-3">
                <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    leftIcon={<LogIn className="h-5 w-5" />}
                    loading={busy}
                    onClick={handleLogin}
                >
                    {t('adminLogin.googleCta')}
                </Button>

                {busy && (
                    <p className="text-xs text-on-surface-variant">{t('adminLogin.loginInProgress')}</p>
                )}
                {error && (
                    <p className="text-xs text-eth-danger">
                        {t('adminLogin.loginFailed', { error })}
                    </p>
                )}
                <p className="text-center text-xs text-on-surface-variant">
                    {t('adminLogin.footnote')}
                </p>
            </div>
        </div>
    );
}
