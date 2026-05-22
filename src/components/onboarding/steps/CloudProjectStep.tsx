import { useTranslation } from 'react-i18next';
import { ExternalLink, Lightbulb } from 'lucide-react';
import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { OAuthCredentialsForm } from '../shared/OAuthCredentialsForm';
import { RequiredApisCard } from '../../shared/RequiredApisCard';

const CLOUD_CONSOLE_URL = 'https://console.cloud.google.com/';

interface CloudProjectStepProps {
    onValidChange: (valid: boolean) => void;
}

export function CloudProjectStep({ onValidChange }: CloudProjectStepProps) {
    const { t } = useTranslation('onboarding');
    const instructions = (t('cloud.instructions', { returnObjects: true }) as Array<{ title: string; body: string }>) || [];

    return (
        <div className="mx-auto flex h-full max-w-6xl flex-col py-4">
            <div className="mb-4">
                <h1 className="text-3xl font-semibold tracking-tight text-on-surface">{t('cloud.title')}</h1>
                <p className="mt-2 text-on-surface-variant">{t('cloud.subtitle')}</p>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
                <div className="space-y-3 overflow-y-auto pr-2">
                    {instructions.map((step, idx) => (
                        <Card key={idx} tone="default" padding="md">
                            <div className="flex items-start gap-4">
                                <span className="text-3xl font-bold text-eth-primary leading-none">
                                    {String(idx + 1).padStart(2, '0')}
                                </span>
                                <div>
                                    <h3 className="font-semibold text-on-surface">{step.title}</h3>
                                    <p className="mt-1 text-sm text-on-surface-variant">{step.body}</p>
                                </div>
                            </div>
                        </Card>
                    ))}

                    <div className="pt-2">
                        <Button
                            variant="secondary"
                            size="md"
                            leftIcon={<ExternalLink className="h-4 w-4" />}
                            onClick={() => window.open(CLOUD_CONSOLE_URL, '_blank', 'noopener,noreferrer')}
                        >
                            {t('cloud.openConsole')}
                        </Button>
                    </div>

                    <Card tone="elevated" padding="lg" className="mt-4">
                        <div className="mb-3">
                            <h2 className="text-base font-semibold text-on-surface">
                                {t('cloud.credentials.title')}
                            </h2>
                            <p className="mt-1 text-sm text-on-surface-variant">
                                {t('cloud.credentials.subtitle')}
                            </p>
                        </div>
                        <OAuthCredentialsForm requireSecret onValidChange={onValidChange} />
                    </Card>
                </div>

                <div className="space-y-4 lg:sticky lg:top-6 self-start">
                    <RequiredApisCard variant="compact" />

                    <div className="flex items-start gap-2 rounded-lg bg-surface-container-lowest px-3 py-2.5 text-xs text-on-surface-variant">
                        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-eth-primary" />
                        <span>{t('cloud.tip')}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
