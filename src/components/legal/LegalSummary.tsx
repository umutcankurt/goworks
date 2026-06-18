import { useTranslation } from 'react-i18next';
import { ShieldAlert, Scale, CreditCard, Database } from 'lucide-react';

const SECTIONS = [
    { key: 'disclaimer', Icon: ShieldAlert },
    { key: 'liability', Icon: Scale },
    { key: 'charges', Icon: CreditCard },
    { key: 'dataResponsibility', Icon: Database },
] as const;

/**
 * Single source of truth for the legal disclaimer text blocks. Consumed by the
 * onboarding terms step, the one-time acceptance modal, and Settings → About.
 * All copy lives in the `legal` i18n namespace.
 */
export function LegalSummary() {
    const { t } = useTranslation('legal');
    return (
        <div className="space-y-4">
            {SECTIONS.map(({ key, Icon }) => (
                <div key={key} className="flex items-start gap-3">
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-eth-primary" aria-hidden />
                    <div>
                        <h3 className="text-sm font-semibold text-on-surface">
                            {t(`${key}.heading`)}
                        </h3>
                        <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">
                            {t(`${key}.body`)}
                        </p>
                    </div>
                </div>
            ))}
        </div>
    );
}
