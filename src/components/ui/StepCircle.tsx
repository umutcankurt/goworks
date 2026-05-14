import clsx from 'clsx';
import { Check } from 'lucide-react';

export type StepState = 'inactive' | 'active' | 'completed';

interface StepCircleProps {
    state: StepState;
    index: number;
    label?: string;
    description?: string;
}

export function StepCircle({ state, index, label, description }: StepCircleProps) {
    return (
        <div
            className={clsx(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors',
                state === 'active' && 'bg-surface-container-highest eth-glow-cyan-panel',
                state === 'completed' && 'bg-eth-secondary/10',
                state === 'inactive' && 'opacity-70',
            )}
        >
            <div
                className={clsx(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                    state === 'active' &&
                        'bg-eth-primary-container text-on-eth-primary-container eth-glow-cyan-led',
                    state === 'completed' &&
                        'bg-eth-secondary/15 text-eth-secondary border border-eth-secondary/40',
                    state === 'inactive' &&
                        'border border-outline-variant text-on-surface-variant',
                )}
            >
                {state === 'completed' ? <Check className="h-4 w-4" /> : index}
            </div>
            {label && (
                <div className="min-w-0">
                    <div
                        className={clsx(
                            'text-sm leading-tight',
                            state === 'active'
                                ? 'font-semibold text-eth-primary'
                                : state === 'completed'
                                ? 'text-on-surface'
                                : 'text-on-surface-variant',
                        )}
                    >
                        {label}
                    </div>
                    {description && state === 'active' && (
                        <div className="mt-0.5 text-xs text-on-surface-variant">{description}</div>
                    )}
                </div>
            )}
        </div>
    );
}
