import { HTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

type CardTone = 'default' | 'elevated' | 'highlighted';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
    tone?: CardTone;
    padding?: 'sm' | 'md' | 'lg' | 'none';
}

const TONE_CLASSES: Record<CardTone, string> = {
    default: 'eth-glass eth-glow-cyan-ambient',
    elevated: 'eth-glass eth-glow-cyan-panel',
    highlighted:
        'eth-glass eth-glow-cyan-panel border-eth-primary-container/25',
};

const PADDING_CLASSES: Record<NonNullable<CardProps['padding']>, string> = {
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
    none: '',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
    { tone = 'default', padding = 'lg', className, children, ...rest },
    ref,
) {
    return (
        <div
            ref={ref}
            className={clsx(TONE_CLASSES[tone], PADDING_CLASSES[padding], className)}
            {...rest}
        >
            {children}
        </div>
    );
});
