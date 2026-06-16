import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../services/api';
import type { AdminUser } from '../types/admin';

interface UserAutocompleteProps {
    onSelect: (user: { email: string; displayName?: string }) => void;
    excludeEmails?: Set<string>;
    placeholder?: string;
    disabled?: boolean;
    allowFreeForm?: boolean;
}

export const UserAutocomplete: React.FC<UserAutocompleteProps> = ({
    onSelect,
    excludeEmails,
    placeholder,
    disabled = false,
    allowFreeForm = false,
}) => {
    const { t } = useTranslation('groups');
    const { t: tCommon } = useTranslation('common');
    const effectivePlaceholder = placeholder ?? t('userPicker.defaultPlaceholder');
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<AdminUser[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        const trimmed = query.trim();
        if (trimmed.length < 2) {
            setResults([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        debounceRef.current = setTimeout(async () => {
            try {
                const res = await adminApi.getUsers({ query: trimmed, maxResults: 20 });
                if (res?.success) {
                    const users: AdminUser[] = res.users || [];
                    setResults(
                        excludeEmails
                            ? users.filter((u) => !excludeEmails.has(u.primaryEmail.toLowerCase()))
                            : users,
                    );
                } else {
                    setResults([]);
                }
            } catch {
                setResults([]);
            } finally {
                setLoading(false);
                setHighlightedIndex(0);
            }
        }, 300);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [query, excludeEmails]);

    const handleSelect = (user: AdminUser) => {
        onSelect({ email: user.primaryEmail, displayName: user.name?.fullName });
        setQuery('');
        setResults([]);
        setIsOpen(false);
        inputRef.current?.focus();
    };

    const handleFreeForm = () => {
        const trimmed = query.trim();
        if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return;
        if (excludeEmails?.has(trimmed.toLowerCase())) return;
        onSelect({ email: trimmed });
        setQuery('');
        setResults([]);
        setIsOpen(false);
        inputRef.current?.focus();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setIsOpen(true);
            setHighlightedIndex((i) => (i < results.length - 1 ? i + 1 : i));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex((i) => (i > 0 ? i - 1 : 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (results[highlightedIndex]) {
                handleSelect(results[highlightedIndex]);
            } else if (allowFreeForm) {
                handleFreeForm();
            }
        } else if (e.key === 'Escape') {
            setIsOpen(false);
        }
    };

    return (
        <div ref={containerRef} className="relative">
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
                className="w-full bg-surface-container-high p-2 border border-outline-variant/30 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-eth-primary-container/40 disabled:opacity-50 disabled:bg-surface-container-high"
            />

            {isOpen && (loading || results.length > 0 || (allowFreeForm && query.trim())) && (
                <div className="absolute z-10 w-full mt-1 bg-surface-container border border-outline-variant/30 rounded-lg shadow-lg max-h-72 overflow-y-auto">
                    {loading && (
                        <div className="px-4 py-2 text-sm text-on-surface-variant">{tCommon('searchControl.searching')}</div>
                    )}
                    {!loading && results.map((user, index) => (
                        <button
                            key={user.id}
                            type="button"
                            onClick={() => handleSelect(user)}
                            className={`w-full text-left px-4 py-2.5 text-sm ${
                                index === highlightedIndex ? 'bg-eth-primary-container/10' : 'hover:bg-eth-primary-container/10'
                            }`}
                        >
                            <div className="font-medium text-on-surface">{user.name?.fullName || user.primaryEmail}</div>
                            <div className="text-on-surface-variant text-xs">{user.primaryEmail}</div>
                        </button>
                    ))}
                    {!loading && allowFreeForm && query.trim() && results.length === 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query.trim()) && (
                        <button
                            type="button"
                            onClick={handleFreeForm}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-eth-primary-container/10"
                        >
                            <div className="font-medium text-on-surface">{t('userPicker.externalEmail')}</div>
                            <div className="text-on-surface-variant text-xs">{query.trim()}</div>
                        </button>
                    )}
                    {!loading && results.length === 0 && !allowFreeForm && query.trim().length >= 2 && (
                        <div className="px-4 py-2 text-sm text-on-surface-variant">{t('userPicker.noUserMatch')}</div>
                    )}
                </div>
            )}
        </div>
    );
};
