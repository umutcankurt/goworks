import { SelectHTMLAttributes, forwardRef, useId } from 'react';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';

interface SelectOption {
    value: string;
    label: string;
    disabled?: boolean;
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
    label?: string;
    error?: string | null;
    hint?: string;
    options?: SelectOption[];
    placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
    { label, error, hint, options, placeholder, className, id: idProp, children, ...rest },
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
                    'relative flex items-center rounded-lg bg-surface-container-highest eth-border-ghost transition-all',
                    'focus-within:border-eth-primary-container/60 focus-within:eth-glow-cyan-led',
                    error && 'border-eth-danger/60',
                    rest.disabled && 'opacity-60 cursor-not-allowed',
                )}
            >
                <select
                    ref={ref}
                    id={id}
                    aria-invalid={error ? 'true' : undefined}
                    aria-describedby={describedBy}
                    className={clsx(
                        'w-full appearance-none bg-transparent text-on-surface text-sm pl-3 pr-9 py-2.5 outline-none',
                        'disabled:cursor-not-allowed',
                        className,
                    )}
                    {...rest}
                >
                    {placeholder && (
                        <option value="" disabled>
                            {placeholder}
                        </option>
                    )}
                    {options
                        ? options.map((opt) => (
                              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                                  {opt.label}
                              </option>
                          ))
                        : children}
                </select>
                <ChevronDown
                    className="pointer-events-none absolute right-3 h-4 w-4 text-on-surface-variant"
                    aria-hidden
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
