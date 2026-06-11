import { HTMLAttributes } from 'react';
import clsx from 'clsx';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
    /** Tailwind-based width. Defaults to w-full if omitted. */
    width?: string;
    /** Tailwind-based height. Defaults to h-4 if omitted. */
    height?: string;
    /** `circle` → fully round (avatar). `text` → text line. `box` → generic. */
    variant?: 'box' | 'text' | 'circle';
}

/**
 * Shimmer animation background:
 * surface-container-high → surface-container-highest gradient + animate-pulse.
 * Works cleanly in both light/dark — token-based.
 */
export function Skeleton({
    width,
    height,
    variant = 'box',
    className,
    ...rest
}: SkeletonProps) {
    return (
        <div
            aria-hidden
            className={clsx(
                'animate-pulse bg-surface-container-high',
                variant === 'circle' && 'rounded-full',
                variant === 'text' && 'rounded h-4',
                variant === 'box' && 'rounded-md',
                width ?? 'w-full',
                height ?? (variant === 'text' ? '' : 'h-4'),
                className,
            )}
            {...rest}
        />
    );
}

interface SkeletonStackProps {
    /** How many rows to render (each a text variant). */
    rows?: number;
    /** Width pattern array — circular, gives a more natural look with fewer widths. */
    widths?: string[];
    className?: string;
}

export function SkeletonStack({ rows = 3, widths = ['w-full', 'w-5/6', 'w-3/4'], className }: SkeletonStackProps) {
    return (
        <div className={clsx('flex flex-col gap-2', className)}>
            {Array.from({ length: rows }).map((_, i) => (
                <Skeleton key={i} variant="text" width={widths[i % widths.length]} />
            ))}
        </div>
    );
}
