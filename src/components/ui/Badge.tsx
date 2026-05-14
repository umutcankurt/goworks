import { HTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
type BadgeSize = 'sm' | 'md';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
    tone?: BadgeTone;
    size?: BadgeSize;
    icon?: ReactNode;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
    neutral:
        'bg-surface-container-high text-on-surface-variant eth-border-ghost-soft',
    info:
        'bg-eth-primary-container/15 text-eth-primary border border-eth-primary-container/30',
    success:
        'bg-eth-secondary/15 text-eth-secondary border border-eth-secondary/30',
    warning:
        'bg-amber-500/15 text-amber-500 border border-amber-500/30',
    danger:
        'bg-eth-danger/15 text-eth-danger border border-eth-danger/30',
};

const SIZE_CLASSES: Record<BadgeSize, string> = {
    sm: 'text-[10px] px-1.5 py-0.5 gap-1',
    md: 'text-xs px-2 py-0.5 gap-1.5',
};

export function Badge({ tone = 'neutral', size = 'md', icon, className, children, ...rest }: BadgeProps) {
    return (
        <span
            className={clsx(
                'inline-flex items-center rounded-full font-medium tracking-tight',
                TONE_CLASSES[tone],
                SIZE_CLASSES[size],
                className,
            )}
            {...rest}
        >
            {icon}
            {children}
        </span>
    );
}
