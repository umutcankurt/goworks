import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react';

type Variant = 'ethereal' | 'surface';

interface PasswordFieldProps {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    autoComplete?: string;
    autoFocus?: boolean;
    disabled?: boolean;
    placeholder?: string;
    /** 'ethereal' = dark glass (lock screen); 'surface' = onboarding / Settings. */
    variant?: Variant;
}

/**
 * Master-password text input with a show/hide toggle and a live Caps Lock
 * warning. Shared by the lock screen, the onboarding step and the change-password
 * modal so the password-entry UX (and its a11y) stays identical everywhere.
 */
export function PasswordField({
    id,
    label,
    value,
    onChange,
    autoComplete,
    autoFocus,
    disabled,
    placeholder,
    variant = 'surface',
}: PasswordFieldProps) {
    const { t } = useTranslation('vault');
    const [show, setShow] = useState(false);
    const [capsOn, setCapsOn] = useState(false);

    const detectCaps = (e: KeyboardEvent<HTMLInputElement>) => {
        const caps = e.getModifierState?.('CapsLock');
        if (typeof caps === 'boolean') setCapsOn(caps);
    };

    // Theme-aware input used on every surface (lock screen, onboarding, Settings
    // modal) so the control looks identical in both light and dark mode. `variant`
    // only tunes the label size for its context.
    const inputClass =
        'w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 pr-10 text-sm text-on-surface outline-none focus:border-eth-primary';
    const labelClass =
        variant === 'ethereal'
            ? 'mb-1 block text-xs text-on-surface-variant'
            : 'mb-1 block text-sm text-on-surface-variant';

    return (
        <div>
            <label className={labelClass} htmlFor={id}>
                {label}
            </label>
            <div className="relative">
                <input
                    id={id}
                    type={show ? 'text' : 'password'}
                    autoComplete={autoComplete}
                    autoFocus={autoFocus}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyUp={detectCaps}
                    onKeyDown={detectCaps}
                    placeholder={placeholder}
                    disabled={disabled}
                    className={inputClass}
                />
                <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    aria-label={show ? t('common.hidePassword') : t('common.showPassword')}
                    aria-pressed={show}
                    tabIndex={-1}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-on-surface-variant transition hover:text-on-surface"
                >
                    {show ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                </button>
            </div>
            {capsOn && (
                <p className="mt-1 text-[11px] text-amber-500" role="status">
                    {t('common.capsLock')}
                </p>
            )}
        </div>
    );
}
