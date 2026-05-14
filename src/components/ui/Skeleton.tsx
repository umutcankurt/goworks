import { HTMLAttributes } from 'react';
import clsx from 'clsx';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
    /** Tailwind tabanlı genişlik. Eksikse w-full. */
    width?: string;
    /** Tailwind tabanlı yükseklik. Eksikse h-4. */
    height?: string;
    /** `circle` → tam yuvarlak (avatar). `text` → text satırı. `box` → genel. */
    variant?: 'box' | 'text' | 'circle';
}

/**
 * Shimmer animation arka planı:
 * surface-container-high → surface-container-highest gradyan + animate-pulse.
 * Light/dark her ikisinde de düzgün — token tabanlı.
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
    /** Kaç satır render edilsin (her biri text variant). */
    rows?: number;
    /** Width pattern array — circular, fewer width'lerle daha doğal görünüm. */
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
