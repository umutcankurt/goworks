import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdminGroup, SelectedGroup, GroupRole } from '../types/admin';
import { X } from 'lucide-react';

interface GroupAutocompleteProps {
    allGroups: AdminGroup[];
    selectedGroups: SelectedGroup[];
    onChange: (groups: SelectedGroup[]) => void;
    disabled?: boolean;
}

export const GroupAutocomplete: React.FC<GroupAutocompleteProps> = ({
    allGroups,
    selectedGroups,
    onChange,
    disabled = false,
}) => {
    const { t } = useTranslation('groups');
    const { t: tCommon } = useTranslation('common');
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const selectedIds = useMemo(() => new Set(selectedGroups.map(sg => sg.group.id)), [selectedGroups]);

    const filteredGroups = useMemo(() => {
        return allGroups.filter((g) => {
            if (selectedIds.has(g.id)) return false;
            if (!query) return true;
            const q = query.toLowerCase();
            return g.name.toLowerCase().includes(q) || g.email.toLowerCase().includes(q);
        });
    }, [allGroups, selectedIds, query]);

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
        setHighlightedIndex(0);
    }, [query]);

    const handleSelect = (group: AdminGroup) => {
        onChange([...selectedGroups, { group, role: 'MEMBER' }]);
        setQuery('');
        setIsOpen(false);
        inputRef.current?.focus();
    };

    const handleRemove = (groupId: string) => {
        onChange(selectedGroups.filter((sg) => sg.group.id !== groupId));
    };

    const handleRoleChange = (groupId: string, role: GroupRole) => {
        onChange(
            selectedGroups.map((sg) =>
                sg.group.id === groupId ? { ...sg, role } : sg
            )
        );
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
                    prev < filteredGroups.length - 1 ? prev + 1 : prev
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (filteredGroups[highlightedIndex]) {
                    handleSelect(filteredGroups[highlightedIndex]);
                }
                break;
            case 'Escape':
                setIsOpen(false);
                break;
        }
    };

    return (
        <div ref={containerRef} className="relative">
            {/* Selected groups as chips */}
            {selectedGroups.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                    {selectedGroups.map((sg) => (
                        <div
                            key={sg.group.id}
                            className="inline-flex items-center gap-2 bg-eth-primary-container/10 text-eth-primary px-3 py-1.5 rounded-lg text-sm border border-eth-primary-container/30"
                        >
                            <span className="font-medium">{sg.group.name}</span>
                            <select
                                value={sg.role}
                                onChange={(e) =>
                                    handleRoleChange(sg.group.id, e.target.value as GroupRole)
                                }
                                disabled={disabled}
                                className="bg-surface-container-high border border-outline-variant/30 rounded text-xs px-1 py-0.5"
                            >
                                <option value="MEMBER">MEMBER</option>
                                <option value="MANAGER">MANAGER</option>
                                <option value="OWNER">OWNER</option>
                            </select>
                            <button
                                onClick={() => handleRemove(sg.group.id)}
                                disabled={disabled}
                                className="text-eth-primary hover:text-eth-primary disabled:opacity-50"
                                type="button"
                                aria-label={tCommon('remove')}
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Search input */}
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
                placeholder={t('groupPicker.searchPlaceholder')}
                className="w-full bg-surface-container-high p-2 border border-outline-variant/30 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-eth-primary-container/40 disabled:opacity-50 disabled:bg-surface-container-high"
            />

            {/* Dropdown */}
            {isOpen && filteredGroups.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-surface-container border border-outline-variant/30 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredGroups.map((group, index) => (
                        <button
                            key={group.id}
                            type="button"
                            onClick={() => handleSelect(group)}
                            className={`w-full text-left px-4 py-2.5 cursor-pointer text-sm ${
                                index === highlightedIndex
                                    ? 'bg-eth-primary-container/10'
                                    : 'hover:bg-eth-primary-container/10'
                            }`}
                        >
                            <div className="font-medium text-on-surface">{group.name}</div>
                            <div className="text-on-surface-variant text-xs">{group.email}</div>
                        </button>
                    ))}
                </div>
            )}

            {isOpen && query && filteredGroups.length === 0 && (
                <div className="absolute z-10 w-full mt-1 bg-surface-container border border-outline-variant/30 rounded-lg shadow-lg p-4 text-sm text-on-surface-variant text-center">
                    {t('groupPicker.noMatch')}
                </div>
            )}
        </div>
    );
};
