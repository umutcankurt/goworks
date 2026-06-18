import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollText } from 'lucide-react';
import { useAppConfig } from '../../contexts/AppConfigContext';
import { Button } from '../ui/Button';
import { LanguageSwitch } from '../LanguageSwitch';
import { ThemeToggle } from '../ThemeToggle';
import { LegalSummary } from './LegalSummary';
import { LegalLinks } from './LegalLinks';
import { googleWorkspaceTermsUrl, CURRENT_TERMS_VERSION } from '../../lib/legal';

/**
 * One-time, non-dismissable acceptance gate for users who completed onboarding
 * before the legal terms existed (or before a newer version). New installs
 * accept inside the onboarding terms step, which writes the current version, so
 * this gate is already satisfied for them.
 */
export function TermsAcceptanceModal() {
    const { config, acceptTerms } = useAppConfig();
    const { t, i18n } = useTranslation('legal');
    const [accepted, setAccepted] = useState(false);
    const [busy, setBusy] = useState(false);

    const needsAcceptance =
        !!config.onboardingCompletedAt && config.termsVersion !== CURRENT_TERMS_VERSION;
    if (!needsAcceptance) return null;

    const handleAccept = async () => {
        if (!accepted) return;
        setBusy(true);
        try {
            await acceptTerms(CURRENT_TERMS_VERSION);
        } catch {
            // acceptTerms flashes its own error badge; let the user retry.
            setBusy(false);
        }
    };

    return (
        <div
            className="eth-app fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="terms-modal-title"
        >
            <div className="eth-glass eth-glow-cyan-panel my-auto w-full max-w-2xl rounded-2xl p-8">
                <div className="mb-4 flex items-center justify-end gap-3">
                    <ThemeToggle variant="ethereal" />
                    <LanguageSwitch variant="ethereal" />
                </div>

                <div className="mb-5 flex items-center gap-3">
                    <div
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-eth-primary/40 bg-eth-primary/15 text-eth-primary"
                        aria-hidden
                    >
                        <ScrollText className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 id="terms-modal-title" className="text-xl font-semibold text-on-surface">
                            {t('modal.title')}
                        </h1>
                        <p className="mt-1 text-sm text-on-surface-variant">{t('modal.updatedNote')}</p>
                    </div>
                </div>

                <div className="max-h-[50vh] overflow-y-auto pr-1">
                    <LegalSummary />
                    <p className="mt-4 text-sm leading-relaxed text-on-surface-variant">
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
                    </p>

                    <LegalLinks />
                </div>

                <label
                    htmlFor="terms-modal-accept"
                    className="mt-6 flex cursor-pointer items-start gap-3 border-t border-outline-variant/30 pt-5"
                >
                    <input
                        id="terms-modal-accept"
                        type="checkbox"
                        checked={accepted}
                        onChange={(e) => setAccepted(e.target.checked)}
                        className="mt-0.5 shrink-0 rounded border-outline-variant/30 text-eth-primary focus:ring-blue-500"
                    />
                    <span className="text-sm text-on-surface">{t('modal.acceptLabel')}</span>
                </label>

                <div className="mt-6 flex justify-end">
                    <Button
                        variant="primary"
                        size="lg"
                        loading={busy}
                        disabled={!accepted}
                        onClick={handleAccept}
                    >
                        {t('modal.cta')}
                    </Button>
                </div>
            </div>
        </div>
    );
}
