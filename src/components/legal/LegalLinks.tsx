import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import { googleTermsOfServiceUrl, googleWorkspaceUserFeaturesUrl } from '../../lib/legal';

/**
 * Plan-agnostic Google reference links shown alongside the acceptance UI.
 * URLs are locale-aware (built from the active i18n language). Rendered in the
 * onboarding terms step, the acceptance modal, and Settings → About.
 */
export function LegalLinks() {
    const { t, i18n } = useTranslation('legal');
    const lang = i18n.language;

    const links = [
        { key: 'googleTos', url: googleTermsOfServiceUrl(lang) },
        { key: 'userFeatures', url: googleWorkspaceUserFeaturesUrl(lang) },
    ] as const;

    return (
        <div className="mt-5 border-t border-outline-variant/30 pt-4">
            <p className="text-xs leading-relaxed text-on-surface-variant">{t('links.planNote')}</p>
            <ul className="mt-2 space-y-1.5">
                {links.map(({ key, url }) => (
                    <li key={key}>
                        <button
                            type="button"
                            onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                            className="inline-flex items-center gap-1.5 text-sm text-eth-primary underline-offset-2 hover:underline"
                        >
                            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            {t(`links.${key}`)}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
