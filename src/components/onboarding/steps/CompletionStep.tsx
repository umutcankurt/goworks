import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, ArrowRight, Check, Clock } from 'lucide-react';
import { Button } from '../../ui/Button';
import { useAppConfig } from '../../../contexts/AppConfigContext';

interface CompletionStepProps {
    dwdVerified?: boolean;
}

export function CompletionStep({ dwdVerified }: CompletionStepProps) {
    const { t } = useTranslation('onboarding');
    const { markOnboardingComplete } = useAppConfig();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const items = (t('completion.items', { returnObjects: true }) as string[]) || [];

    const handleContinue = async () => {
        setBusy(true);
        setError(null);
        try {
            await markOnboardingComplete();
            // Once OnboardingGate sees onboardingCompletedAt, it redirects to /.
        } catch (err: any) {
            setError(err?.message || 'Failed');
            setBusy(false);
        }
    };

    return (
        <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-4 py-4">
            <div
                className="flex h-16 w-16 items-center justify-center rounded-full border border-eth-secondary/40 bg-eth-secondary/15 text-eth-secondary eth-glow-success"
                aria-hidden
            >
                <CheckCircle2 className="h-8 w-8" strokeWidth={2.5} />
            </div>

            <div className="text-center">
                <h1 className="text-3xl font-bold tracking-tight text-on-surface">
                    {t('completion.title')}
                </h1>
                <p className="mt-3 text-on-surface-variant">{t('completion.subtitle')}</p>
            </div>

            <div className="w-full rounded-xl bg-surface-container-high eth-border-ghost-soft p-6">
                <span className="mb-3 block text-[11px] font-medium uppercase tracking-[0.12em] text-on-surface-variant">
                    {t('completion.checklistHeading')}
                </span>
                <ul className="space-y-2">
                    {items.map((item) => (
                        <li key={item} className="flex items-center gap-3 text-sm text-on-surface">
                            <Check className="h-5 w-5 shrink-0 text-eth-secondary" />
                            <span>{item}</span>
                        </li>
                    ))}
                    {dwdVerified ? (
                        <li className="flex items-center gap-3 text-sm text-on-surface">
                            <Check className="h-5 w-5 shrink-0 text-eth-secondary" />
                            <span>{t('completion.dwdVerified')}</span>
                        </li>
                    ) : (
                        <li className="flex items-center gap-3 text-sm text-on-surface-variant">
                            <Clock className="h-5 w-5 shrink-0 text-on-surface-variant" />
                            <span>{t('completion.dwdPending')}</span>
                        </li>
                    )}
                </ul>
            </div>

            <Button
                variant="primary"
                size="lg"
                fullWidth
                rightIcon={<ArrowRight className="h-5 w-5" />}
                loading={busy}
                onClick={handleContinue}
            >
                {t('completion.cta')}
            </Button>

            {error && (
                <p className="text-xs text-eth-danger">{error}</p>
            )}

            <p className="text-center text-xs italic text-on-surface-variant">
                {t('completion.resetNote')}
            </p>
        </div>
    );
}
