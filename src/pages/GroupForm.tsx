import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../services/api';
import { groupsApi } from '../services/server-api';
import { useToast } from '../contexts/ToastContext';
import { MemberPicker } from '../components/MemberPicker';
import type {
    DeliverySetting,
    Domain,
    GroupAlias,
    GroupMember,
    GroupRole,
    GroupSettings,
    SelectedMember,
} from '../types/admin';

type TabKey = 'general' | 'members' | 'access' | 'aliases';

interface GroupFormProps {
    mode: 'create' | 'edit';
}

interface ValidationErrors {
    groupName?: string;
    localPart?: string;
    domain?: string;
}

export const GroupForm: React.FC<GroupFormProps> = ({ mode }) => {
    const navigate = useNavigate();
    const { groupKey: routeKey } = useParams<{ groupKey: string }>();
    const groupKey = routeKey ? decodeURIComponent(routeKey) : '';
    const { addToast } = useToast();
    const { t } = useTranslation('groupForm');
    const { t: tGroups } = useTranslation('groups');
    const { t: tToast } = useTranslation('toast');

    const [activeTab, setActiveTab] = useState<TabKey>('general');

    const [groupName, setGroupName] = useState('');
    const [localPart, setLocalPart] = useState('');
    const [domain, setDomain] = useState('');
    const [domains, setDomains] = useState<Domain[]>([]);
    const [description, setDescription] = useState('');
    const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});

    const [pendingMembers, setPendingMembers] = useState<SelectedMember[]>([]);
    const [existingMembers, setExistingMembers] = useState<GroupMember[]>([]);
    const [memberOpInProgress, setMemberOpInProgress] = useState<string | null>(null);

    const [settings, setSettings] = useState<GroupSettings>({});
    const [savingSettings, setSavingSettings] = useState(false);
    const [aliases, setAliases] = useState<GroupAlias[]>([]);
    const [aliasLocal, setAliasLocal] = useState('');
    const [aliasDomain, setAliasDomain] = useState('');
    const [aliasSubmitting, setAliasSubmitting] = useState(false);
    const [aliasError, setAliasError] = useState('');

    const [loading, setLoading] = useState(mode === 'edit');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const existingEmails = useMemo(
        () => new Set(existingMembers.map((m) => m.email.toLowerCase())),
        [existingMembers],
    );

    useEffect(() => {
        adminApi.getDomains().then((r) => {
            if (r?.success && r.domains) {
                const sorted = [...r.domains].sort((a: Domain, b: Domain) => {
                    if (a.isPrimary && !b.isPrimary) return -1;
                    if (!a.isPrimary && b.isPrimary) return 1;
                    return a.domainName.localeCompare(b.domainName);
                });
                setDomains(sorted);
                if (mode === 'create' && sorted.length > 0) setDomain(sorted[0].domainName);
            }
        });
    }, [mode]);

    useEffect(() => {
        if (mode !== 'edit' || !groupKey) return;
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError('');
            try {
                const [group, members, groupSettings, groupAliases] = await Promise.all([
                    groupsApi.get(groupKey),
                    groupsApi.listMembers(groupKey),
                    groupsApi.getSettings(groupKey).catch(() => ({} as GroupSettings)),
                    groupsApi.listAliases(groupKey).catch(() => [] as GroupAlias[]),
                ]);
                if (cancelled) return;
                setGroupName(group.name || '');
                const [lp, dm] = (group.email || '').split('@');
                setLocalPart(lp || '');
                setDomain(dm || '');
                setDescription(group.description || '');
                setExistingMembers(members);
                setSettings(groupSettings);
                setAliases(groupAliases);
            } catch (err: any) {
                if (!cancelled) setError(err.message || t('errors.loadFailed'));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [mode, groupKey, t]);

    const validate = (): boolean => {
        const errs: ValidationErrors = {};
        if (!groupName.trim()) errs.groupName = t('errors.groupNameRequired');
        if (!localPart.trim()) errs.localPart = t('errors.localPartRequired');
        else if (!/^[a-z0-9._-]+$/i.test(localPart.trim())) errs.localPart = t('errors.localPartInvalid');
        if (!domain) errs.domain = t('errors.domainRequired');
        setValidationErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleSubmitGeneral = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) return;
        setSubmitting(true);
        setError('');
        try {
            const email = `${localPart.trim()}@${domain}`;
            if (mode === 'create') {
                const result = await groupsApi.create(
                    { email, name: groupName.trim(), description: description.trim() || undefined },
                    pendingMembers.length > 0
                        ? pendingMembers.map((m) => ({
                            email: m.email,
                            role: m.role,
                            deliverySettings: m.deliverySettings,
                        }))
                        : undefined,
                );
                if (result.memberResult && result.memberResult.failed.length > 0) {
                    addToast(tToast('groups.createdWithFailedMembers', { count: result.memberResult.failed.length }), 'warning');
                } else {
                    addToast(tToast('groups.created'), 'success');
                }
                navigate(`/groups/${encodeURIComponent(result.group.email)}`);
            } else {
                const updated = await groupsApi.update(groupKey, {
                    name: groupName.trim(),
                    description: description.trim() || undefined,
                    email,
                });
                addToast(tToast('groups.updated'), 'success');
                if (updated.email !== groupKey) {
                    navigate(`/groups/${encodeURIComponent(updated.email)}`, { replace: true });
                }
            }
        } catch (err: any) {
            setError(err.message || t('errors.saveFailed'));
            addToast(err.message || tToast('groups.saveFailed'), 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleAddPendingMembers = async () => {
        if (pendingMembers.length === 0) return;
        setMemberOpInProgress('add');
        try {
            const toAdd = pendingMembers.map((m) => ({
                email: m.email,
                role: m.role,
                deliverySettings: m.deliverySettings,
            }));
            const result = await groupsApi.addMembers(groupKey, toAdd);

            const succeededSet = new Set(result.succeeded.map((e) => e.toLowerCase()));
            const optimistic: GroupMember[] = pendingMembers
                .filter((m) => succeededSet.has(m.email.toLowerCase()))
                .map((m) => ({
                    id: m.email,
                    email: m.email,
                    role: m.role,
                    type: 'USER',
                    status: 'ACTIVE',
                    deliverySettings: m.deliverySettings,
                }));
            setExistingMembers((prev) => {
                const existing = new Set(prev.map((m) => m.email.toLowerCase()));
                const fresh = optimistic.filter((m) => !existing.has(m.email.toLowerCase()));
                return [...prev, ...fresh];
            });
            setPendingMembers([]);

            setTimeout(() => {
                groupsApi
                    .listMembers(groupKey)
                    .then((refreshed) => {
                        if (refreshed.length > 0) setExistingMembers(refreshed);
                    })
                    .catch(() => { /* optimistic state stays */ });
            }, 1500);

            if (result.failed.length > 0) {
                addToast(tToast('groups.membersPartialAdd', { succeeded: result.succeeded.length, failed: result.failed.length }), 'warning');
            } else {
                addToast(tToast('groups.membersAdded', { count: result.succeeded.length }), 'success');
            }
        } catch (err: any) {
            addToast(err.message || tToast('groups.memberAddFailed'), 'error');
        } finally {
            setMemberOpInProgress(null);
        }
    };

    const handleRemoveExistingMember = async (email: string) => {
        setMemberOpInProgress(email);
        try {
            await groupsApi.removeMembers(groupKey, [email]);
            setExistingMembers((prev) => prev.filter((m) => m.email !== email));
            addToast(tToast('groups.memberRemoved'), 'success');
        } catch (err: any) {
            addToast(err.message || tToast('groups.memberRemoveFailed'), 'error');
        } finally {
            setMemberOpInProgress(null);
        }
    };

    const handleAddAlias = async () => {
        const local = aliasLocal.trim();
        if (!local) {
            setAliasError(t('errors.aliasLocalRequired'));
            return;
        }
        if (!/^[a-z0-9._-]+$/i.test(local)) {
            setAliasError(t('errors.aliasInvalid'));
            return;
        }
        if (!aliasDomain) {
            setAliasError(t('errors.aliasDomainRequired'));
            return;
        }
        setAliasSubmitting(true);
        setAliasError('');
        try {
            const newAlias = await groupsApi.addAlias(groupKey, `${local}@${aliasDomain}`);
            setAliases((prev) => [...prev, newAlias]);
            setAliasLocal('');
            addToast(tToast('groups.aliasAdded'), 'success');
        } catch (err: any) {
            setAliasError(err.message || t('errors.aliasAddFailed'));
        } finally {
            setAliasSubmitting(false);
        }
    };

    const handleRemoveAlias = async (alias: string) => {
        try {
            await groupsApi.removeAlias(groupKey, alias);
            setAliases((prev) => prev.filter((a) => a.alias !== alias));
            addToast(tToast('groups.aliasDeleted'), 'success');
        } catch (err: any) {
            addToast(err.message || tToast('groups.aliasDeleteFailed'), 'error');
        }
    };

    const handleSaveSettings = async () => {
        setSavingSettings(true);
        try {
            const updated = await groupsApi.updateSettings(groupKey, settings);
            setSettings(updated);
            addToast(tToast('groups.settingsSaved'), 'success');
        } catch (err: any) {
            addToast(err.message || tToast('groups.settingsSaveFailed'), 'error');
        } finally {
            setSavingSettings(false);
        }
    };

    const setSettingsField = <K extends keyof GroupSettings>(key: K, value: GroupSettings[K]) => {
        setSettings((prev) => ({ ...prev, [key]: value }));
    };

    const handleChangeExistingRole = async (email: string, role: GroupRole) => {
        setMemberOpInProgress(email);
        try {
            await groupsApi.updateMemberRole(groupKey, email, role);
            setExistingMembers((prev) => prev.map((m) => (m.email === email ? { ...m, role } : m)));
            addToast(tToast('groups.roleUpdated'), 'success');
        } catch (err: any) {
            addToast(err.message || tToast('groups.roleUpdateFailed'), 'error');
        } finally {
            setMemberOpInProgress(null);
        }
    };

    const handleChangeExistingDelivery = async (email: string, deliverySettings: DeliverySetting) => {
        setMemberOpInProgress(email);
        try {
            await groupsApi.updateMemberDeliverySettings(groupKey, email, deliverySettings);
            setExistingMembers((prev) => prev.map((m) => (m.email === email ? { ...m, deliverySettings } : m)));
            addToast(tToast('groups.deliveryUpdated'), 'success');
        } catch (err: any) {
            addToast(err.message || tToast('groups.deliveryUpdateFailed'), 'error');
        } finally {
            setMemberOpInProgress(null);
        }
    };

    const titleText = mode === 'create' ? t('createTitle') : t('editTitle');

    if (loading) {
        return (
            <div className="p-6">
                <div className="flex justify-center items-center h-48 text-on-surface-variant font-medium bg-surface-container-low rounded-xl border border-outline-variant/30 border-dashed">
                    {t('loading')}
                </div>
            </div>
        );
    }

    const tabs: { key: TabKey; labelKey: string; disabled?: boolean }[] = [
        { key: 'general', labelKey: 'tabs.general' },
        { key: 'members', labelKey: 'tabs.members' },
        { key: 'access', labelKey: 'tabs.access', disabled: mode === 'create' },
        { key: 'aliases', labelKey: 'tabs.aliases', disabled: mode === 'create' },
    ];

    return (
        <div className="p-6 space-y-6 max-w-5xl">
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={() => navigate('/groups')}
                    className="p-2 rounded-lg hover:bg-surface-container-high transition-colors"
                >
                    <ArrowLeft size={20} />
                </button>
                <h1 className="text-2xl font-bold text-on-surface">{titleText}</h1>
            </div>

            {error && (
                <div className="p-3 bg-eth-danger/10 text-eth-danger rounded-lg text-sm">{error}</div>
            )}

            <div className="bg-surface-container rounded-xl shadow-sm border border-outline-variant/30">
                <div className="border-b border-outline-variant/30 flex">
                    {tabs.map((tab) => (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => !tab.disabled && setActiveTab(tab.key)}
                            disabled={tab.disabled}
                            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                                activeTab === tab.key
                                    ? 'border-eth-primary-container text-eth-primary'
                                    : tab.disabled
                                        ? 'border-transparent text-on-surface-variant cursor-not-allowed'
                                        : 'border-transparent text-on-surface-variant hover:text-on-surface'
                            }`}
                        >
                            {t(tab.labelKey)}
                        </button>
                    ))}
                </div>

                <div className="p-6">
                    {activeTab === 'general' && (
                        <form onSubmit={handleSubmitGeneral} className="space-y-5 max-w-2xl">
                            <div>
                                <label className="block text-sm font-medium text-on-surface mb-1">{t('general.groupName')} *</label>
                                <input
                                    type="text"
                                    value={groupName}
                                    onChange={(e) => setGroupName(e.target.value)}
                                    disabled={submitting}
                                    className={`w-full p-2 border rounded-lg focus:ring-2 ${validationErrors.groupName ? 'border-eth-danger/30 focus:ring-eth-danger/30' : 'border-outline-variant/30 focus:ring-eth-primary-container/40 focus:border-eth-primary-container/40'}`}
                                    placeholder={t('general.groupNamePlaceholder')}
                                />
                                {validationErrors.groupName && (
                                    <p className="mt-1 text-sm text-eth-danger">{validationErrors.groupName}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-on-surface mb-1">{t('general.groupEmail')} *</label>
                                <div className="flex items-center gap-1">
                                    <input
                                        type="text"
                                        value={localPart}
                                        onChange={(e) => setLocalPart(e.target.value)}
                                        disabled={submitting}
                                        placeholder={t('general.groupEmailPlaceholder')}
                                        className={`flex-1 p-2 border rounded-lg focus:ring-2 ${validationErrors.localPart ? 'border-eth-danger/30 focus:ring-eth-danger/30' : 'border-outline-variant/30 focus:ring-eth-primary-container/40 focus:border-eth-primary-container/40'}`}
                                    />
                                    <span className="text-on-surface-variant font-medium px-1">@</span>
                                    <select
                                        value={domain}
                                        onChange={(e) => setDomain(e.target.value)}
                                        disabled={submitting}
                                        className="p-2 border border-outline-variant/30 rounded-lg focus:ring-2 focus:ring-eth-primary-container/40 focus:border-eth-primary-container/40"
                                    >
                                        {domains.map((d) => (
                                            <option key={d.domainName} value={d.domainName}>
                                                {d.domainName}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                {(validationErrors.localPart || validationErrors.domain) && (
                                    <p className="mt-1 text-sm text-eth-danger">
                                        {validationErrors.localPart || validationErrors.domain}
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-on-surface mb-1">{t('general.description')}</label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    disabled={submitting}
                                    rows={3}
                                    className="w-full p-2 border border-outline-variant/30 rounded-lg focus:ring-2 focus:ring-eth-primary-container/40 focus:border-eth-primary-container/40"
                                    placeholder={t('general.descriptionPlaceholder')}
                                />
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => navigate('/groups')}
                                    disabled={submitting}
                                    className="px-5 py-2 bg-surface-container-high text-on-surface rounded-lg hover:bg-surface-container-highest transition-colors"
                                >
                                    {t('general.cancel')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="inline-flex items-center gap-2 px-5 py-2 bg-eth-primary-container text-on-eth-primary-container rounded-lg hover:brightness-110 transition-colors disabled:opacity-50"
                                >
                                    <Save size={16} />
                                    {submitting ? t('general.saving') : mode === 'create' ? t('general.create') : t('general.save')}
                                </button>
                            </div>
                        </form>
                    )}

                    {activeTab === 'members' && (
                        <div className="space-y-6 max-w-3xl">
                            {mode === 'edit' && (
                                <section>
                                    <h3 className="text-sm font-semibold text-on-surface mb-3">
                                        {t('members.existingHeading', { count: existingMembers.length })}
                                    </h3>
                                    {existingMembers.length === 0 ? (
                                        <p className="text-sm text-on-surface-variant italic">{t('members.empty')}</p>
                                    ) : (
                                        <div className="border border-outline-variant/30 rounded-lg divide-y divide-gray-100">
                                            <div className="flex items-center justify-between px-4 py-2 bg-surface-container-low text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                                                <div className="flex-1 min-w-0">{t('members.columns.member')}</div>
                                                <div className="flex items-center gap-2">
                                                    <span className="w-[110px] text-center">{t('members.columns.role')}</span>
                                                    <span className="w-[140px] text-center">{t('members.columns.delivery')}</span>
                                                    <span className="w-7" aria-hidden="true" />
                                                </div>
                                            </div>
                                            {existingMembers.map((m) => {
                                                const busy = memberOpInProgress === m.email;
                                                return (
                                                    <div key={m.id || m.email} className="flex items-center justify-between px-4 py-2.5">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-sm font-medium text-on-surface truncate">{m.email}</div>
                                                            <div className="text-xs text-on-surface-variant">{m.type} · {m.status || 'ACTIVE'}</div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <select
                                                                value={m.role}
                                                                onChange={(e) => handleChangeExistingRole(m.email, e.target.value as GroupRole)}
                                                                disabled={busy}
                                                                className="w-[110px] bg-surface-container border border-outline-variant/30 rounded text-xs px-2 py-1"
                                                            >
                                                                <option value="MEMBER">{tGroups('roles.MEMBER')}</option>
                                                                <option value="MANAGER">{tGroups('roles.MANAGER')}</option>
                                                                <option value="OWNER">{tGroups('roles.OWNER')}</option>
                                                            </select>
                                                            <select
                                                                value={m.deliverySettings}
                                                                onChange={(e) => handleChangeExistingDelivery(m.email, e.target.value as DeliverySetting)}
                                                                disabled={busy}
                                                                className="w-[140px] bg-surface-container border border-outline-variant/30 rounded text-xs px-2 py-1"
                                                                title={tGroups('delivery.label')}
                                                            >
                                                                <option value="ALL_MAIL">{tGroups('delivery.ALL_MAIL')}</option>
                                                                <option value="DAILY">{tGroups('delivery.DAILY')}</option>
                                                                <option value="DIGEST">{tGroups('delivery.DIGEST')}</option>
                                                                <option value="NONE">{tGroups('delivery.NONE')}</option>
                                                            </select>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemoveExistingMember(m.email)}
                                                                disabled={busy}
                                                                className="w-7 h-7 inline-flex items-center justify-center text-eth-danger hover:bg-eth-danger/10 rounded transition-colors disabled:opacity-50"
                                                                title={t('members.removeMember')}
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </section>
                            )}

                            <section>
                                <h3 className="text-sm font-semibold text-on-surface mb-3">
                                    {mode === 'create' ? t('members.newMembers') : t('members.addNew')}
                                </h3>
                                <MemberPicker
                                    selectedMembers={pendingMembers}
                                    onChange={setPendingMembers}
                                    disabled={memberOpInProgress !== null || submitting}
                                    allowFreeForm
                                    excludeEmails={existingEmails}
                                />
                                {mode === 'edit' && pendingMembers.length > 0 && (
                                    <div className="flex justify-end mt-3 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setPendingMembers([])}
                                            disabled={memberOpInProgress !== null}
                                            className="px-4 py-2 bg-surface-container-high text-on-surface rounded-lg hover:bg-surface-container-highest transition-colors text-sm"
                                        >
                                            <X size={14} className="inline mr-1" /> {t('members.clear')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleAddPendingMembers}
                                            disabled={memberOpInProgress !== null}
                                            className="px-4 py-2 bg-eth-primary-container text-on-eth-primary-container rounded-lg hover:brightness-110 transition-colors text-sm disabled:opacity-50"
                                        >
                                            {memberOpInProgress === 'add' ? t('members.addingMembers') : t('members.addMembers', { count: pendingMembers.length })}
                                        </button>
                                    </div>
                                )}
                                {mode === 'create' && (
                                    <p className="mt-3 text-xs text-on-surface-variant">{t('members.createHelper')}</p>
                                )}
                            </section>
                        </div>
                    )}

                    {activeTab === 'access' && (
                        <div className="space-y-5 max-w-2xl">
                            <SettingsSelect
                                label={t('access.whoCanJoin')}
                                value={settings.whoCanJoin || ''}
                                onChange={(v) => setSettingsField('whoCanJoin', v as GroupSettings['whoCanJoin'])}
                                options={[
                                    { value: 'INVITED_CAN_JOIN', label: t('access.whoCanJoinOptions.INVITED_CAN_JOIN') },
                                    { value: 'CAN_REQUEST_TO_JOIN', label: t('access.whoCanJoinOptions.CAN_REQUEST_TO_JOIN') },
                                    { value: 'ALL_IN_DOMAIN_CAN_JOIN', label: t('access.whoCanJoinOptions.ALL_IN_DOMAIN_CAN_JOIN') },
                                    { value: 'ANYONE_CAN_JOIN', label: t('access.whoCanJoinOptions.ANYONE_CAN_JOIN') },
                                ]}
                                disabled={savingSettings}
                                placeholder={t('access.selectPlaceholder')}
                            />

                            <SettingsSelect
                                label={t('access.whoCanPostMessage')}
                                value={settings.whoCanPostMessage || ''}
                                onChange={(v) => setSettingsField('whoCanPostMessage', v as GroupSettings['whoCanPostMessage'])}
                                options={[
                                    { value: 'NONE_CAN_POST', label: t('access.whoCanPostOptions.NONE_CAN_POST') },
                                    { value: 'ALL_OWNERS_CAN_POST', label: t('access.whoCanPostOptions.ALL_OWNERS_CAN_POST') },
                                    { value: 'ALL_MANAGERS_CAN_POST', label: t('access.whoCanPostOptions.ALL_MANAGERS_CAN_POST') },
                                    { value: 'ALL_MEMBERS_CAN_POST', label: t('access.whoCanPostOptions.ALL_MEMBERS_CAN_POST') },
                                    { value: 'ALL_IN_DOMAIN_CAN_POST', label: t('access.whoCanPostOptions.ALL_IN_DOMAIN_CAN_POST') },
                                    { value: 'ANYONE_CAN_POST', label: t('access.whoCanPostOptions.ANYONE_CAN_POST') },
                                ]}
                                disabled={savingSettings}
                                placeholder={t('access.selectPlaceholder')}
                            />

                            <SettingsSelect
                                label={t('access.whoCanViewGroup')}
                                value={settings.whoCanViewGroup || ''}
                                onChange={(v) => setSettingsField('whoCanViewGroup', v as GroupSettings['whoCanViewGroup'])}
                                options={[
                                    { value: 'ALL_OWNERS_CAN_VIEW', label: t('access.whoCanViewOptions.ALL_OWNERS_CAN_VIEW') },
                                    { value: 'ALL_MANAGERS_CAN_VIEW', label: t('access.whoCanViewOptions.ALL_MANAGERS_CAN_VIEW') },
                                    { value: 'ALL_MEMBERS_CAN_VIEW', label: t('access.whoCanViewOptions.ALL_MEMBERS_CAN_VIEW') },
                                    { value: 'ALL_IN_DOMAIN_CAN_VIEW', label: t('access.whoCanViewOptions.ALL_IN_DOMAIN_CAN_VIEW') },
                                    { value: 'ANYONE_CAN_VIEW', label: t('access.whoCanViewOptions.ANYONE_CAN_VIEW') },
                                ]}
                                disabled={savingSettings}
                                placeholder={t('access.selectPlaceholder')}
                            />

                            <SettingsSelect
                                label={t('access.whoCanViewMembership')}
                                value={settings.whoCanViewMembership || ''}
                                onChange={(v) => setSettingsField('whoCanViewMembership', v as GroupSettings['whoCanViewMembership'])}
                                options={[
                                    { value: 'ALL_OWNERS_CAN_VIEW', label: t('access.whoCanViewOptions.ALL_OWNERS_CAN_VIEW') },
                                    { value: 'ALL_MANAGERS_CAN_VIEW', label: t('access.whoCanViewOptions.ALL_MANAGERS_CAN_VIEW') },
                                    { value: 'ALL_MEMBERS_CAN_VIEW', label: t('access.whoCanViewOptions.ALL_MEMBERS_CAN_VIEW') },
                                    { value: 'ALL_IN_DOMAIN_CAN_VIEW', label: t('access.whoCanViewOptions.ALL_IN_DOMAIN_CAN_VIEW') },
                                ]}
                                disabled={savingSettings}
                                placeholder={t('access.selectPlaceholder')}
                            />

                            <SettingsSelect
                                label={t('access.whoCanContactOwner')}
                                value={settings.whoCanContactOwner || ''}
                                onChange={(v) => setSettingsField('whoCanContactOwner', v as GroupSettings['whoCanContactOwner'])}
                                options={[
                                    { value: 'ALL_MANAGERS_CAN_CONTACT', label: t('access.whoCanContactOptions.ALL_MANAGERS_CAN_CONTACT') },
                                    { value: 'ALL_MEMBERS_CAN_CONTACT', label: t('access.whoCanContactOptions.ALL_MEMBERS_CAN_CONTACT') },
                                    { value: 'ALL_IN_DOMAIN_CAN_CONTACT', label: t('access.whoCanContactOptions.ALL_IN_DOMAIN_CAN_CONTACT') },
                                    { value: 'ANYONE_CAN_CONTACT', label: t('access.whoCanContactOptions.ANYONE_CAN_CONTACT') },
                                ]}
                                disabled={savingSettings}
                                placeholder={t('access.selectPlaceholder')}
                            />

                            <SettingsSelect
                                label={t('access.messageModerationLevel')}
                                value={settings.messageModerationLevel || ''}
                                onChange={(v) => setSettingsField('messageModerationLevel', v as GroupSettings['messageModerationLevel'])}
                                options={[
                                    { value: 'MODERATE_NONE', label: t('access.moderationOptions.MODERATE_NONE') },
                                    { value: 'MODERATE_NEW_MEMBERS', label: t('access.moderationOptions.MODERATE_NEW_MEMBERS') },
                                    { value: 'MODERATE_NON_MEMBERS', label: t('access.moderationOptions.MODERATE_NON_MEMBERS') },
                                    { value: 'MODERATE_ALL_MESSAGES', label: t('access.moderationOptions.MODERATE_ALL_MESSAGES') },
                                ]}
                                disabled={savingSettings}
                                placeholder={t('access.selectPlaceholder')}
                            />

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                <SettingsToggle
                                    label={t('access.toggles.allowExternalMembers')}
                                    value={settings.allowExternalMembers === 'true'}
                                    onChange={(b) => setSettingsField('allowExternalMembers', b ? 'true' : 'false')}
                                    disabled={savingSettings}
                                />
                                <SettingsToggle
                                    label={t('access.toggles.allowWebPosting')}
                                    value={settings.allowWebPosting === 'true'}
                                    onChange={(b) => setSettingsField('allowWebPosting', b ? 'true' : 'false')}
                                    disabled={savingSettings}
                                />
                                <SettingsToggle
                                    label={t('access.toggles.isArchived')}
                                    value={settings.isArchived === 'true'}
                                    onChange={(b) => setSettingsField('isArchived', b ? 'true' : 'false')}
                                    disabled={savingSettings}
                                />
                                <SettingsToggle
                                    label={t('access.toggles.archiveOnly')}
                                    value={settings.archiveOnly === 'true'}
                                    onChange={(b) => setSettingsField('archiveOnly', b ? 'true' : 'false')}
                                    disabled={savingSettings}
                                />
                            </div>

                            <div className="flex justify-end pt-2">
                                <button
                                    type="button"
                                    onClick={handleSaveSettings}
                                    disabled={savingSettings}
                                    className="inline-flex items-center gap-2 px-5 py-2 bg-eth-primary-container text-on-eth-primary-container rounded-lg hover:brightness-110 transition-colors disabled:opacity-50"
                                >
                                    <Save size={16} />
                                    {savingSettings ? t('access.saving') : t('access.save')}
                                </button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'aliases' && (
                        <div className="space-y-5 max-w-2xl">
                            <section>
                                <h3 className="text-sm font-semibold text-on-surface mb-3">
                                    {t('aliases.existingHeading', { count: aliases.length })}
                                </h3>
                                {aliases.length === 0 ? (
                                    <p className="text-sm text-on-surface-variant italic">{t('aliases.empty')}</p>
                                ) : (
                                    <div className="flex flex-wrap gap-2">
                                        {aliases.map((a) => (
                                            <div
                                                key={a.alias}
                                                className="inline-flex items-center gap-2 bg-surface-container-high text-on-surface px-3 py-1.5 rounded-lg text-sm border border-outline-variant/30"
                                            >
                                                <span>{a.alias}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveAlias(a.alias)}
                                                    className="text-on-surface-variant hover:text-eth-danger"
                                                    title={t('aliases.deleteAlias')}
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>

                            <section>
                                <h3 className="text-sm font-semibold text-on-surface mb-3">{t('aliases.addNewHeading')}</h3>
                                <div className="flex items-center gap-1">
                                    <input
                                        type="text"
                                        value={aliasLocal}
                                        onChange={(e) => setAliasLocal(e.target.value)}
                                        disabled={aliasSubmitting}
                                        placeholder={t('aliases.aliasPlaceholder')}
                                        className="flex-1 p-2 border border-outline-variant/30 rounded-lg focus:ring-2 focus:ring-eth-primary-container/40 focus:border-eth-primary-container/40"
                                    />
                                    <span className="text-on-surface-variant font-medium px-1">@</span>
                                    <select
                                        value={aliasDomain || domain}
                                        onChange={(e) => setAliasDomain(e.target.value)}
                                        disabled={aliasSubmitting}
                                        className="p-2 border border-outline-variant/30 rounded-lg focus:ring-2 focus:ring-eth-primary-container/40 focus:border-eth-primary-container/40"
                                    >
                                        {domains.map((d) => (
                                            <option key={d.domainName} value={d.domainName}>
                                                {d.domainName}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={handleAddAlias}
                                        disabled={aliasSubmitting}
                                        className="ml-2 px-4 py-2 bg-eth-primary-container text-on-eth-primary-container rounded-lg hover:brightness-110 transition-colors disabled:opacity-50"
                                    >
                                        {aliasSubmitting ? t('aliases.adding') : t('aliases.add')}
                                    </button>
                                </div>
                                {aliasError && (
                                    <p className="mt-2 text-sm text-eth-danger">{aliasError}</p>
                                )}
                            </section>
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
};

interface SettingsSelectProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
    disabled?: boolean;
    placeholder: string;
}

const SettingsSelect: React.FC<SettingsSelectProps> = ({ label, value, onChange, options, disabled, placeholder }) => (
    <div>
        <label className="block text-sm font-medium text-on-surface mb-1">{label}</label>
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className="w-full p-2 border border-outline-variant/30 rounded-lg focus:ring-2 focus:ring-eth-primary-container/40 focus:border-eth-primary-container/40 disabled:opacity-50"
        >
            <option value="">{placeholder}</option>
            {options.map((o) => (
                <option key={o.value} value={o.value}>
                    {o.label}
                </option>
            ))}
        </select>
    </div>
);

interface SettingsToggleProps {
    label: string;
    value: boolean;
    onChange: (value: boolean) => void;
    disabled?: boolean;
}

const SettingsToggle: React.FC<SettingsToggleProps> = ({ label, value, onChange, disabled }) => (
    <label className="inline-flex items-center gap-2 cursor-pointer">
        <input
            type="checkbox"
            checked={value}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
            className="h-4 w-4 rounded border-outline-variant/30 text-eth-primary focus:ring-eth-primary-container/40 disabled:opacity-50"
        />
        <span className="text-sm text-on-surface">{label}</span>
    </label>
);
