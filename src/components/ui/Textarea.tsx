import { TextareaHTMLAttributes, forwardRef, useId } from 'react';
import clsx from 'clsx';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
    error?: string | null;
    hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
    { label, error, hint, className, id: idProp, rows = 4, ...rest },
    ref,
) {
    const generatedId = useId();
    const id = idProp ?? generatedId;
    const hintId = hint ? `${id}-hint` : undefined;
    const errorId = error ? `${id}-error` : undefined;
    const describedBy = errorId ?? hintId;

    return (
        <div className="flex flex-col gap-1.5">
            {label && (
                <label
                    htmlFor={id}
                    className="text-[11px] font-medium uppercase tracking-[0.08em] text-on-surface-variant"
                >
                    {label}
                </label>
            )}
            <div
                className={clsx(
                    'rounded-lg bg-surface-container-highest eth-border-ghost px-3 py-2.5 transition-all',
                    'focus-within:border-eth-primary-container/60 focus-within:eth-glow-cyan-led',
                    error && 'border-eth-danger/60',
                    rest.disabled && 'opacity-60 cursor-not-allowed',
                )}
            >
                <textarea
                    ref={ref}
                    id={id}
                    rows={rows}
                    aria-invalid={error ? 'true' : undefined}
                    aria-describedby={describedBy}
                    className={clsx(
                        'w-full bg-transparent text-on-surface placeholder:text-outline outline-none text-sm resize-y',
                        className,
                    )}
                    {...rest}
                />
            </div>
            {error ? (
                <p id={errorId} className="text-xs text-eth-danger">
                    {error}
                </p>
            ) : hint ? (
                <p id={hintId} className="text-xs text-on-surface-variant">
                    {hint}
                </p>
            ) : null}
        </div>
    );
});
