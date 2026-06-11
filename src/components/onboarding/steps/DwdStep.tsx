import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { DwdScopeGuide } from '../shared/DwdScopeGuide';
import { DwdTestButton } from '../shared/DwdTestButton';
import { serverApi, type ServiceAccountStatus } from '../../../services/server-api';

interface DwdStepProps {
    onTestSuccess: () => void;
    onSkip: () => void;
}

export function DwdStep({ onTestSuccess, onSkip }: DwdStepProps) {
    const { t } = useTranslation('onboarding');
    const [status, setStatus] = useState<ServiceAccountStatus | null>(null);

    useEffect(() => {
        serverApi.getServiceAccountStatus().then(setStatus).catch(() => setStatus(null));
    }, []);

    // When the test succeeds we only relay the signal to the parent (the footer
    // "İleri" becomes active). The markOnboardingComplete call happens in the
    // last step (CompletionStep) when the user clicks the "Uygulamaya Devam Et" button.
    const handleSkip = () => {
        if (!window.confirm(t('dwd.skipConfirm'))) return;
        onSkip();
    };

    return (
        <div className="mx-auto flex h-full max-w-6xl flex-col py-4">
            <div className="mb-4">
                <h1 className="text-3xl font-semibold tracking-tight text-on-surface">
                    {t('dwd.title')}
                </h1>
                <p className="mt-2 text-on-surface-variant">{t('dwd.subtitle')}</p>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
                <Card tone="default" padding="lg" className="overflow-y-auto pr-2">
                    <DwdScopeGuide clientId={status?.clientId ?? null} />
                </Card>

                <Card tone="highlighted" padding="lg" className="lg:sticky lg:top-6 self-start">
                    <h3 className="text-base font-semibold text-on-surface">
                        {t('dwd.testButton')}
                    </h3>
                    <p className="mt-1 mb-4 text-sm text-on-surface-variant">
                        {t('dwd.instructions')}
                    </p>
                    <DwdTestButton onSuccess={onTestSuccess} />
                    <div className="mt-4 border-t border-white/5 pt-4">
                        <Button variant="ghost" onClick={handleSkip} fullWidth>
                            {t('dwd.skip')}
                        </Button>
                    </div>
                </Card>
            </div>
        </div>
    );
}
