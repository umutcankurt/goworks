import { ReactNode } from 'react';
import clsx from 'clsx';

interface EmptyStateProps {
    icon?: ReactNode;
    title: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
    className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
    return (
        <div
            className={clsx(
                'flex flex-col items-center justify-center text-center px-6 py-12',
                className,
            )}
        >
            {icon && (
                <div
                    className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant eth-border-ghost-soft border"
                    aria-hidden
                >
                    {icon}
                </div>
            )}
            <h3 className="text-base font-semibold tracking-tight text-on-surface">{title}</h3>
            {description && (
                <p className="mt-1 max-w-md text-sm text-on-surface-variant">{description}</p>
            )}
            {action && <div className="mt-5">{action}</div>}
        </div>
    );
}
