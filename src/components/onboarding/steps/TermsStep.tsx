import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../ui/Card';
import { LegalSummary } from '../../legal/LegalSummary';
import { LegalLinks } from '../../legal/LegalLinks';
import { googleWorkspaceTermsUrl } from '../../../lib/legal';

interface TermsStepProps {
    onValidChange: (valid: boolean) => void;
}

export function TermsStep({ onValidChange }: TermsStepProps) {
    const { t, i18n } = useTranslation('legal');
    const [appAccepted, setAppAccepted] = useState(false);
    const [googleAccepted, setGoogleAccepted] = useState(false);

    useEffect(() => {
        onValidChange(appAccepted && googleAccepted);
    }, [appAccepted, googleAccepted, onValidChange]);

    return (
        <div className="mx-auto flex h-full max-w-3xl flex-col py-4">
            <div className="mb-4">
                <h1 className="text-3xl font-semibold tracking-tight text-on-surface">
                    {t('title')}
                </h1>
                <p className="mt-2 text-on-surface-variant">{t('subtitle')}</p>
            </div>

            <Card tone="default" padding="lg" className="overflow-y-auto">
                <LegalSummary />

                <div className="mt-6 space-y-3 border-t border-outline-variant/30 pt-5">
                    <label htmlFor="terms-accept-app" className="flex cursor-pointer items-start gap-3">
                        <input
                            id="terms-accept-app"
                            type="checkbox"
                            checked={appAccepted}
                            onChange={(e) => setAppAccepted(e.target.checked)}
                            className="mt-0.5 shrink-0 rounded border-outline-variant/30 text-eth-primary focus:ring-blue-500"
                        />
                        <span className="text-sm text-on-surface">{t('accept.app')}</span>
                    </label>

                    <div className="flex items-start gap-3">
                        <input
                            id="terms-accept-google"
                            type="checkbox"
                            checked={googleAccepted}
                            onChange={(e) => setGoogleAccepted(e.target.checked)}
                            className="mt-0.5 shrink-0 rounded border-outline-variant/30 text-eth-primary focus:ring-blue-500"
                        />
                        <label htmlFor="terms-accept-google" className="cursor-pointer text-sm text-on-surface">
                            {t('accept.googlePrefix')}
                            <button
                                type="button"
                                onClick={() =>
                                    window.open(
                                        googleWorkspaceTermsUrl(i18n.language),
                                        '_blank',
                                        'noopener,noreferrer',
                                    )
                                }
                                className="text-eth-primary underline underline-offset-2 hover:no-underline"
                            >
                                {t('accept.googleLink')}
                            </button>
                            {t('accept.googleSuffix')}
                        </label>
                    </div>

                    <LegalLinks />
                </div>
            </Card>
        </div>
    );
}
