import { useTranslation } from 'react-i18next';
import { Card } from '../../ui/Card';
import { ServiceAccountUpload } from '../shared/ServiceAccountUpload';
import type { ServiceAccountStatus } from '../../../services/server-api';

interface ServiceAccountStepProps {
    onStatusChange: (status: ServiceAccountStatus | null) => void;
}

export function ServiceAccountStep({ onStatusChange }: ServiceAccountStepProps) {
    const { t } = useTranslation('onboarding');

    return (
        <div className="mx-auto max-w-3xl py-8">
            <div className="mb-8">
                <h1 className="text-3xl font-semibold tracking-tight text-on-surface">
                    {t('serviceAccount.title')}
                </h1>
                <p className="mt-2 text-on-surface-variant">{t('serviceAccount.subtitle')}</p>
            </div>

            <Card tone="default" padding="lg">
                <ServiceAccountUpload onStatusChange={onStatusChange} />
            </Card>
        </div>
    );
}
