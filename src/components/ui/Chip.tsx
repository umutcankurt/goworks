import { ReactNode } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';

interface ChipProps {
    children: ReactNode;
    selected?: boolean;
    onClick?: () => void;
    onRemove?: () => void;
    icon?: ReactNode;
    disabled?: boolean;
    className?: string;
}

export function Chip({ children, selected, onClick, onRemove, icon, disabled, className }: ChipProps) {
    const interactive = !!onClick && !disabled;

    return (
        <span
            className={clsx(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                selected
                    ? 'bg-eth-primary-container/15 text-eth-primary border border-eth-primary-container/30'
                    : 'bg-surface-container-high text-on-surface-variant eth-border-ghost-soft border',
                interactive && 'cursor-pointer hover:bg-surface-container-highest',
                disabled && 'opacity-50 cursor-not-allowed',
                className,
            )}
            onClick={interactive ? onClick : undefined}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            onKeyDown={(e) => {
                if (interactive && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onClick?.();
                }
            }}
            aria-pressed={interactive ? selected : undefined}
            aria-disabled={disabled || undefined}
        >
            {icon}
            {children}
            {onRemove && !disabled && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onRemove();
                    }}
                    aria-label="Remove"
                    className="ml-0.5 rounded-full p-0.5 hover:bg-on-surface/10 transition-colors"
                >
                    <X className="h-3 w-3" aria-hidden />
                </button>
            )}
        </span>
    );
}
