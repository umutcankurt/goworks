import { useTranslation } from 'react-i18next';
import { ShieldCheck, Cloud, Clock, ArrowRight } from 'lucide-react';
import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';

interface WelcomeStepProps {
    onStart: () => void;
}

export function WelcomeStep({ onStart }: WelcomeStepProps) {
    const { t } = useTranslation('onboarding');

    const cards = [
        { key: 'admin', Icon: ShieldCheck },
        { key: 'cloud', Icon: Cloud },
        { key: 'duration', Icon: Clock },
    ] as const;

    return (
        <div className="mx-auto flex h-full max-w-5xl flex-col items-center justify-center gap-6 py-6">
            <div className="text-center">
                <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-eth-primary">
                    {t('welcome.eyebrow')}
                </div>
                <h1 className="mt-3 text-4xl font-bold tracking-tight text-on-surface md:text-5xl">
                    {t('welcome.title')}
                </h1>
                <p className="mx-auto mt-4 max-w-2xl text-base text-on-surface-variant">
                    {t('welcome.subtitle')}
                </p>
            </div>

            <div className="grid w-full grid-cols-1 gap-5 md:grid-cols-3">
                {cards.map(({ key, Icon }) => (
                    <Card key={key} tone="default" padding="lg" className="transition-transform hover:scale-[1.01]">
                        <Icon className="h-7 w-7 text-eth-primary-container" />
                        <h3 className="mt-4 text-lg font-semibold text-on-surface">
                            {t(`welcome.cards.${key}.title`)}
                        </h3>
                        <p className="mt-2 text-sm text-on-surface-variant">
                            {t(`welcome.cards.${key}.body`)}
                        </p>
                    </Card>
                ))}
            </div>

            <Button
                variant="primary"
                size="lg"
                onClick={onStart}
                rightIcon={<ArrowRight className="h-5 w-5" />}
            >
                {t('welcome.cta')}
            </Button>
        </div>
    );
}
