import { motion } from 'framer-motion';
import { Sun, Moon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme, type Theme } from '../contexts/ThemeContext';

type ThemeToggleVariant = 'classic' | 'ethereal';

interface ThemeToggleProps {
    className?: string;
    /**
     * `classic` — slate açık tema (eski sayfalar, login öncesi).
     * `ethereal` — dark glass tema (onboarding + Faz 5+ migrate edilmiş sayfalar).
     */
    variant?: ThemeToggleVariant;
}

const CONTAINER_VARIANTS: Record<ThemeToggleVariant, string> = {
    classic: 'rounded-full bg-surface-container-high border border-outline-variant/30 p-0.5',
    ethereal: 'rounded-full bg-surface-container-high eth-border-ghost p-0.5 backdrop-blur-md',
};

const PILL_VARIANTS: Record<ThemeToggleVariant, string> = {
    classic: 'bg-primary-600',
    ethereal: 'bg-eth-primary-container',
};

const ACTIVE_TEXT: Record<ThemeToggleVariant, string> = {
    classic: 'text-white',
    ethereal: 'text-on-eth-primary-container',
};

const INACTIVE_TEXT: Record<ThemeToggleVariant, string> = {
    classic: 'text-on-surface-variant hover:text-on-surface',
    ethereal: 'text-on-surface-variant hover:text-on-surface',
};

const OPTIONS: Array<{ value: Theme; Icon: typeof Sun; labelKey: 'theme.light' | 'theme.dark' }> = [
    { value: 'light', Icon: Sun, labelKey: 'theme.light' },
    { value: 'dark', Icon: Moon, labelKey: 'theme.dark' },
];

export function ThemeToggle({ className, variant = 'classic' }: ThemeToggleProps) {
    const { theme, setTheme } = useTheme();
    const { t } = useTranslation('common');
    const layoutId = `theme-switch-pill-${variant}`;

    return (
        <div
            role="radiogroup"
            aria-label={t('theme.aria')}
            className={`relative inline-flex items-center select-none ${CONTAINER_VARIANTS[variant]} ${className ?? ''}`}
        >
            {OPTIONS.map(({ value, Icon, labelKey }) => {
                const isActive = theme === value;
                const label = t(labelKey);
                return (
                    <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        aria-label={label}
                        title={label}
                        onClick={() => setTheme(value)}
                        className="relative inline-flex items-center justify-center px-2.5 py-1 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1"
                    >
                        {isActive && (
                            <motion.span
                                layoutId={layoutId}
                                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                                className={`absolute inset-0 rounded-full shadow-sm ${PILL_VARIANTS[variant]}`}
                                aria-hidden
                            />
                        )}
                        <Icon
                            className={`relative z-10 h-3.5 w-3.5 ${isActive ? ACTIVE_TEXT[variant] : INACTIVE_TEXT[variant]}`}
                            aria-hidden
                        />
                    </button>
                );
            })}
        </div>
    );
}
