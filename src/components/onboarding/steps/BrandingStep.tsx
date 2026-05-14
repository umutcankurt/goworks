import { useTranslation } from 'react-i18next';
import { Card } from '../../ui/Card';
import { BrandingForm } from '../shared/BrandingForm';
import { LivePreview } from '../shared/LivePreview';

interface BrandingStepProps {
    onValidChange: (valid: boolean) => void;
}

export function BrandingStep({ onValidChange }: BrandingStepProps) {
    const { t } = useTranslation('onboarding');

    return (
        <div className="mx-auto max-w-6xl py-8">
            <div className="mb-8">
                <h1 className="text-3xl font-semibold tracking-tight text-on-surface">
                    {t('branding.title')}
                </h1>
                <p className="mt-2 text-on-surface-variant">{t('branding.subtitle')}</p>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
                <Card tone="default" padding="lg">
                    <BrandingForm onValid={onValidChange} />
                </Card>
                <div className="lg:sticky lg:top-6 self-start">
                    <LivePreview />
                </div>
            </div>
        </div>
    );
}
