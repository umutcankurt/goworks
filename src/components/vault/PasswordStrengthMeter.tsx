import { useTranslation } from 'react-i18next';
import { evaluatePasswordStrength, type PasswordStrengthLevel } from '../../utils/passwordStrength';

const BAR_COLOR: Record<PasswordStrengthLevel, string> = {
    weak: 'bg-red-500',
    medium: 'bg-amber-500',
    strong: 'bg-emerald-500',
};
const TEXT_COLOR: Record<PasswordStrengthLevel, string> = {
    weak: 'text-red-500',
    medium: 'text-amber-500',
    strong: 'text-emerald-500',
};

/**
 * 4-segment strength meter for a chosen master password. Renders nothing for an
 * empty password. Purely a UX hint — see `utils/passwordStrength`.
 */
export function PasswordStrengthMeter({ password }: { password: string }) {
    const { t } = useTranslation('vault');
    if (!password) return null;

    const { score, level } = evaluatePasswordStrength(password);

    return (
        <div className="mt-1.5">
            <div className="flex gap-1" aria-hidden="true">
                {[0, 1, 2, 3].map((i) => (
                    <span
                        key={i}
                        className={`h-1 flex-1 rounded-full ${i < score ? BAR_COLOR[level] : 'bg-outline-variant'}`}
                    />
                ))}
            </div>
            <p className={`mt-1 text-[11px] ${TEXT_COLOR[level]}`}>
                {t('strength.label')} {t(`strength.${level}`)}
            </p>
        </div>
    );
}
