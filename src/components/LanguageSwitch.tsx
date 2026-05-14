import { motion } from 'framer-motion';
import { useLanguage } from '../i18n/useLanguage';
import { LANGUAGES } from '../i18n/types';

type LanguageSwitchVariant = 'classic' | 'ethereal';

interface LanguageSwitchProps {
    className?: string;
    /**
     * `classic` — slate açık tema (mevcut sayfalar, login).
     * `ethereal` — dark glass tema (onboarding sihirbazı).
     */
    variant?: LanguageSwitchVariant;
}

const CONTAINER_VARIANTS: Record<LanguageSwitchVariant, string> = {
    classic: 'rounded-full bg-surface-container-high border border-outline-variant/30 p-0.5',
    ethereal: 'rounded-full bg-surface-container-high eth-border-ghost p-0.5 backdrop-blur-md',
};

const PILL_VARIANTS: Record<LanguageSwitchVariant, string> = {
    classic: 'bg-primary-600',
    ethereal: 'bg-eth-primary-container',
};

const ACTIVE_TEXT: Record<LanguageSwitchVariant, string> = {
    classic: 'text-white',
    ethereal: 'text-on-eth-primary-container',
};

const INACTIVE_TEXT: Record<LanguageSwitchVariant, string> = {
    classic: 'text-on-surface-variant hover:text-on-surface',
    ethereal: 'text-on-surface-variant hover:text-on-surface',
};

export function LanguageSwitch({ className, variant = 'classic' }: LanguageSwitchProps) {
    const { language, setLanguage } = useLanguage();
    const layoutId = `lang-switch-pill-${variant}`;

    return (
        <div
            role="radiogroup"
            aria-label="Language"
            className={`relative inline-flex items-center select-none ${CONTAINER_VARIANTS[variant]} ${className ?? ''}`}
        >
            {LANGUAGES.map((opt) => {
                const isActive = language === opt.code;
                return (
                    <button
                        key={opt.code}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        aria-label={opt.code === 'tr' ? 'Türkçe' : 'English'}
                        onClick={() => void setLanguage(opt.code)}
                        className="relative px-3 py-1 text-xs font-semibold rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1"
                    >
                        {isActive && (
                            <motion.span
                                layoutId={layoutId}
                                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                                className={`absolute inset-0 rounded-full shadow-sm ${PILL_VARIANTS[variant]}`}
                                aria-hidden
                            />
                        )}
                        <span className={`relative z-10 ${isActive ? ACTIVE_TEXT[variant] : INACTIVE_TEXT[variant]}`}>
                            {opt.label}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
