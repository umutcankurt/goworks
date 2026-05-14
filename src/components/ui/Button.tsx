import { ButtonHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'success' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    fullWidth?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
    primary:
        'bg-eth-primary-container text-on-eth-primary-container eth-glow-cyan hover:eth-glow-cyan-strong hover:brightness-110',
    secondary:
        'bg-surface-container-high text-eth-primary eth-border-ghost hover:bg-surface-container-highest',
    ghost:
        'bg-transparent text-on-surface-variant hover:text-on-surface hover:bg-on-surface/5',
    success:
        'bg-eth-secondary text-surface eth-glow-success hover:brightness-110',
    danger:
        'bg-eth-danger text-white hover:brightness-110',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
    sm: 'px-3 py-1.5 text-sm rounded-md gap-1.5',
    md: 'px-6 py-2.5 text-sm rounded-lg gap-2',
    lg: 'px-8 py-3 text-base rounded-lg gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    { variant = 'primary', size = 'md', loading, disabled, fullWidth, leftIcon, rightIcon, className, children, ...rest },
    ref,
) {
    const isDisabled = disabled || loading;
    return (
        <button
            ref={ref}
            disabled={isDisabled}
            className={clsx(
                'inline-flex items-center justify-center font-semibold tracking-tight transition-all',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-eth-primary-container/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                SIZE_CLASSES[size],
                isDisabled
                    ? 'bg-surface-container-high text-on-surface-variant eth-border-ghost-soft cursor-not-allowed opacity-50'
                    : VARIANT_CLASSES[variant],
                fullWidth && 'w-full',
                className,
            )}
            {...rest}
        >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : leftIcon}
            <span>{children}</span>
            {!loading && rightIcon}
        </button>
    );
});
