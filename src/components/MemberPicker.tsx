import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { UserAutocomplete } from './UserAutocomplete';
import type { SelectedMember, GroupRole } from '../types/admin';

interface MemberPickerProps {
    selectedMembers: SelectedMember[];
    onChange: (members: SelectedMember[]) => void;
    disabled?: boolean;
    allowFreeForm?: boolean;
    label?: string;
    excludeEmails?: Set<string>;
}

export const MemberPicker: React.FC<MemberPickerProps> = ({
    selectedMembers,
    onChange,
    disabled = false,
    allowFreeForm = false,
    label,
    excludeEmails: extraExclude,
}) => {
    const { t } = useTranslation('groups');
    const excludeEmails = useMemo(() => {
        const set = new Set(selectedMembers.map((m) => m.email.toLowerCase()));
        if (extraExclude) {
            for (const e of extraExclude) set.add(e.toLowerCase());
        }
        return set;
    }, [selectedMembers, extraExclude]);

    const handleAdd = (user: { email: string; displayName?: string }) => {
        if (selectedMembers.some((m) => m.email.toLowerCase() === user.email.toLowerCase())) return;
        onChange([...selectedMembers, { email: user.email, displayName: user.displayName, role: 'MEMBER' }]);
    };

    const handleRoleChange = (email: string, role: GroupRole) => {
        onChange(
            selectedMembers.map((m) =>
                m.email === email ? { ...m, role } : m,
            ),
        );
    };

    const handleRemove = (email: string) => {
        onChange(selectedMembers.filter((m) => m.email !== email));
    };

    return (
        <div className="space-y-3">
            {label && <label className="block text-sm font-medium text-on-surface">{label}</label>}

            {selectedMembers.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {selectedMembers.map((m) => (
                        <div
                            key={m.email}
                            className="inline-flex items-center gap-2 bg-eth-primary-container/10 text-eth-primary px-3 py-1.5 rounded-lg text-sm border border-eth-primary-container/30"
                        >
                            <span className="font-medium">{m.displayName || m.email}</span>
                            {m.displayName && <span className="text-eth-primary text-xs">{m.email}</span>}
                            <select
                                value={m.role}
                                onChange={(e) => handleRoleChange(m.email, e.target.value as GroupRole)}
                                disabled={disabled}
                                className="bg-surface-container border border-outline-variant/30 rounded text-xs px-1 py-0.5"
                            >
                                <option value="MEMBER">{t('roles.MEMBER')}</option>
                                <option value="MANAGER">{t('roles.MANAGER')}</option>
                                <option value="OWNER">{t('roles.OWNER')}</option>
                            </select>
                            <button
                                type="button"
                                onClick={() => handleRemove(m.email)}
                                disabled={disabled}
                                className="text-eth-primary hover:text-eth-primary disabled:opacity-50"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <UserAutocomplete
                onSelect={handleAdd}
                excludeEmails={excludeEmails}
                disabled={disabled}
                allowFreeForm={allowFreeForm}
                placeholder={t('memberPicker.searchPlaceholder')}
            />
        </div>
    );
};
