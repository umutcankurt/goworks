import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, ChevronDown } from 'lucide-react';

interface SearchableSelectProps {
    options: string[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    emptyMessage?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
    options,
    value,
    onChange,
    placeholder,
    disabled = false,
    emptyMessage,
}) => {
    const { t } = useTranslation('common');
    const effectivePlaceholder = placeholder ?? t('searchControl.placeholder');
    const effectiveEmpty = emptyMessage ?? t('searchControl.noResults');
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const filteredOptions = useMemo(() => {
        if (!query) return options;
        const q = query.toLowerCase();
        return options.filter((opt) => opt.toLowerCase().includes(q));
    }, [options, query]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setQuery('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        setHighlightedIndex(0);
    }, [query]);

    const handleSelect = (option: string) => {
        onChange(option);
        setQuery('');
        setIsOpen(false);
    };

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange('');
        setQuery('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                setIsOpen(true);
                e.preventDefault();
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex((prev) =>
                    prev < filteredOptions.length - 1 ? prev + 1 : prev
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (filteredOptions[highlightedIndex]) {
                    handleSelect(filteredOptions[highlightedIndex]);
                }
                break;
            case 'Escape':
                setIsOpen(false);
                setQuery('');
                break;
        }
    };

    return (
        <div ref={containerRef} className="relative">
            {value && !isOpen ? (
                <div
                    role="button"
                    tabIndex={disabled ? -1 : 0}
                    aria-disabled={disabled}
                    aria-haspopup="listbox"
                    aria-expanded={isOpen}
                    className={`w-full p-2 border border-outline-variant/30 rounded-lg flex items-center justify-between cursor-pointer ${
                        disabled ? 'opacity-50 bg-surface-container-high' : 'bg-surface-container hover:border-outline-variant/40'
                    }`}
                    onClick={() => {
                        if (!disabled) {
                            setIsOpen(true);
                            setTimeout(() => inputRef.current?.focus(), 0);
                        }
                    }}
                    onKeyDown={(e) => {
                        if (disabled) return;
                        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
                            e.preventDefault();
                            setIsOpen(true);
                            setTimeout(() => inputRef.current?.focus(), 0);
                        }
                    }}
                >
                    <span className="text-on-surface truncate">{value}</span>
                    <div className="flex items-center gap-1">
                        {!disabled && (
                            <button
                                type="button"
                                onClick={handleClear}
                                aria-label={t('clear')}
                                title={t('clear')}
                                className="text-on-surface-variant hover:text-on-surface-variant"
                            >
                                <X size={16} aria-hidden="true" />
                            </button>
                        )}
                        <ChevronDown size={16} className="text-on-surface-variant" />
                    </div>
                </div>
            ) : (
                <div
                    role="presentation"
                    className={`w-full flex items-center border rounded-lg ${
                        isOpen ? 'border-eth-primary-container/40 ring-2 ring-blue-500' : 'border-outline-variant/30'
                    } ${disabled ? 'opacity-50 bg-surface-container-high' : 'bg-surface-container'}`}
                    onClick={() => {
                        if (!disabled) {
                            setIsOpen(true);
                            inputRef.current?.focus();
                        }
                    }}
                >
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setIsOpen(true);
                        }}
                        onFocus={() => setIsOpen(true)}
                        onKeyDown={handleKeyDown}
                        disabled={disabled}
                        placeholder={effectivePlaceholder}
                        className="w-full p-2 bg-transparent outline-none rounded-lg"
                    />
                    <ChevronDown size={16} className="text-on-surface-variant mr-2 shrink-0" />
                </div>
            )}

            {isOpen && filteredOptions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-surface-container border border-outline-variant/30 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredOptions.map((option, index) => (
                        <button
                            key={option}
                            type="button"
                            onClick={() => handleSelect(option)}
                            className={`w-full text-left px-4 py-2.5 cursor-pointer text-sm ${
                                index === highlightedIndex
                                    ? 'bg-eth-primary-container/10'
                                    : 'hover:bg-eth-primary-container/10'
                            } ${option === value ? 'font-medium text-eth-primary' : 'text-on-surface'}`}
                        >
                            {option}
                        </button>
                    ))}
                </div>
            )}

            {isOpen && query && filteredOptions.length === 0 && (
                <div className="absolute z-10 w-full mt-1 bg-surface-container border border-outline-variant/30 rounded-lg shadow-lg p-4 text-sm text-on-surface-variant text-center">
                    {effectiveEmpty}
                </div>
            )}
        </div>
    );
};
