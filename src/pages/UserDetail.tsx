import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AdminUser, AdminGroup, OrgUnit, Domain, SelectedGroup } from '../types/admin';
import { adminApi } from '../services/api';
import { titlesApi, institutionsApi, signaturesApi, serverApi, templatesApi } from '../services/server-api';
import { useToast } from '../contexts/ToastContext';
import { GroupAutocomplete } from '../components/GroupAutocomplete';
import { SearchableSelect } from '../components/SearchableSelect';
import { CheckCircle, AlertCircle, Loader2, Send, Pencil, Eye, EyeOff } from 'lucide-react';
import { SignatureEditor } from '../components/SignatureEditor';
import { SignaturePreview } from '../components/SignaturePreview';
import { capitalizeWords, toUpperCaseTr, formatPhoneNumber, phoneToE164, e164ToDisplay, formatPhoneForSignature } from '../utils/turkish-helpers';
import { useLocaleFormat } from '../i18n/useLocaleFormat';

type Tab = 'overview' | 'groups' | 'security' | 'signature';

export const UserDetail: React.FC = () => {
    const { userKey } = useParams<{ userKey: string }>();
    const navigate = useNavigate();
    const { addToast } = useToast();
    const { t } = useTranslation('userDetail');
    const { t: tToast } = useTranslation('toast');
    const { formatDateTime } = useLocaleFormat();

    const [user, setUser] = useState<AdminUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState<Tab>('overview');

    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({
        givenName: '',
        familyName: '',
        phone: '',
        title: '',
        orgUnitPath: '',
        username: '',
        domain: '',
        buildingId: '',
    });

    const [aliases, setAliases] = useState<string[]>([]);
    const [newAliasUsername, setNewAliasUsername] = useState('');
    const [newAliasDomain, setNewAliasDomain] = useState('');
    const [aliasLoading, setAliasLoading] = useState(false);

    const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
    const [domains, setDomains] = useState<Domain[]>([]);

    const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
    const [checkingEmail, setCheckingEmail] = useState(false);
    const emailCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [userGroups, setUserGroups] = useState<AdminGroup[]>([]);
    const [allGroups, setAllGroups] = useState<AdminGroup[]>([]);
    const [groupsToAdd, setGroupsToAdd] = useState<SelectedGroup[]>([]);
    const [addingGroups, setAddingGroups] = useState(false);
    const [groupActionLoading, setGroupActionLoading] = useState(false);

    const [passwordInput, setPasswordInput] = useState('');
    const [showResetPassword, setShowResetPassword] = useState(false);
    const [securityActionLoading, setSecurityActionLoading] = useState(false);

    const [titleOptions, setTitleOptions] = useState<string[]>([]);
    const [institutionOptions, setInstitutionOptions] = useState<{ name: string; address?: string; phone?: string }[]>([]);

    const [currentSignature, setCurrentSignature] = useState('');
    const [signatureLoading, setSignatureLoading] = useState(false);
    const [signaturePushing, setSignaturePushing] = useState(false);
    const [serviceAccountConfigured, setServiceAccountConfigured] = useState(false);

    const [templates, setTemplates] = useState<any[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
    const [templatesLoading, setTemplatesLoading] = useState(false);
    const [templatePreviewHtml, setTemplatePreviewHtml] = useState<string | null>(null);
    const [templatePreviewLoading, setTemplatePreviewLoading] = useState(false);

    const [editingSignature, setEditingSignature] = useState(false);
    const [editedHtml, setEditedHtml] = useState('');
    const [savingEditedSignature, setSavingEditedSignature] = useState(false);

    useEffect(() => {
        return () => {
            if (emailCheckTimer.current) clearTimeout(emailCheckTimer.current);
        };
    }, []);

    useEffect(() => {
        if (userKey) {
            fetchUserDetails();
        }
    }, [userKey]);

    useEffect(() => {
        if (activeTab === 'signature' && user && serviceAccountConfigured && templates.length === 0) {
            fetchTemplates();
        }
    }, [activeTab, user, serviceAccountConfigured]);

    useEffect(() => {
        if (selectedTemplateId && user && activeTab === 'signature') {
            handleTemplateSelect(selectedTemplateId);
        }
    }, [selectedTemplateId, user, activeTab]);

    const checkEmailAvailability = (uname: string, dom: string) => {
        if (emailCheckTimer.current) clearTimeout(emailCheckTimer.current);

        const USERNAME_REGEX = /^[a-zA-Z0-9._-]+$/;
        if (!uname.trim() || !USERNAME_REGEX.test(uname)) {
            setEmailAvailable(null);
            setCheckingEmail(false);
            return;
        }

        if (user && `${uname}@${dom}` === user.primaryEmail) {
            setEmailAvailable(null);
            setCheckingEmail(false);
            return;
        }

        setCheckingEmail(true);
        setEmailAvailable(null);

        emailCheckTimer.current = setTimeout(async () => {
            try {
                const result = await adminApi.getUser(`${uname}@${dom}`);
                setEmailAvailable(result.success ? !result.user : null);
            } catch {
                setEmailAvailable(null);
            } finally {
                setCheckingEmail(false);
            }
        }, 500);
    };

    const fetchUserDetails = async () => {
        setLoading(true);
        setError('');
        try {
            const [userResult, groupsResult, allGroupsResult, orgUnitsResult, domainsResult] = await Promise.all([
                adminApi.getUser(userKey!),
                adminApi.getUserGroups(userKey!),
                adminApi.getAvailableGroups(),
                adminApi.getOrgUnits(),
                adminApi.getDomains(),
            ]);

            if (userResult.success && userResult.user) {
                const u = userResult.user as AdminUser;
                setUser(u);

                const emailParts = u.primaryEmail.split('@');
                const rawPhone = u.phones && u.phones.length > 0 ? u.phones[0].value : '';

                setEditForm({
                    givenName: u.name.givenName || '',
                    familyName: u.name.familyName || '',
                    phone: e164ToDisplay(rawPhone),
                    title: u.organizations && u.organizations.length > 0 ? u.organizations[0].title || '' : '',
                    orgUnitPath: u.orgUnitPath || '/',
                    username: emailParts[0] || '',
                    domain: emailParts[1] || '',
                    buildingId: u.organizations?.[0]?.department || '',
                });
                setAliases(u.aliases || []);
                setNewAliasDomain(emailParts[1] || '');
            } else {
                setError(userResult.error || t('errors.loadFailed'));
            }

            if (groupsResult.success) {
                setUserGroups(groupsResult.groups!);
            }
            if (allGroupsResult.success) {
                setAllGroups(allGroupsResult.groups!);
            }
            if (orgUnitsResult.success && orgUnitsResult.orgUnits) {
                setOrgUnits(
                    [...orgUnitsResult.orgUnits].sort((a, b) =>
                        a.orgUnitPath.localeCompare(b.orgUnitPath)
                    )
                );
            }
            if (domainsResult.success && domainsResult.domains) {
                const sorted = [...domainsResult.domains].sort((a, b) => {
                    if (a.isPrimary && !b.isPrimary) return -1;
                    if (!a.isPrimary && b.isPrimary) return 1;
                    return a.domainName.localeCompare(b.domainName);
                });
                setDomains(sorted);
            }
            try {
                const [titlesData, institutionsData] = await Promise.all([
                    titlesApi.getAll(),
                    institutionsApi.getAll(),
                ]);
                setTitleOptions(titlesData.map((x: any) => x.name));
                setInstitutionOptions(institutionsData.map((c: any) => ({ name: c.name, address: c.address, phone: c.phone })));
            } catch { /* optional */ }
            try {
                const saStatus = await serverApi.getServiceAccountStatus();
                setServiceAccountConfigured(saStatus.configured);
            } catch { /* optional */ }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchSignature = async () => {
        if (!user || !serviceAccountConfigured) return;
        setSignatureLoading(true);
        try {
            const result = await signaturesApi.get(user.primaryEmail);
            setCurrentSignature(result.signature || '');
        } catch {
            /* optional */
        } finally {
            setSignatureLoading(false);
        }
    };

    const extractUserVariables = (): Record<string, string> => {
        if (!user) return {};
        const org = user.organizations?.[0];
        const phone = user.phones?.[0]?.value || '';
        const institutionName = org?.department || '';
        let institutionAddress = '';
        let institutionPhone = '';
        if (institutionName && institutionOptions.length > 0) {
            const institution = institutionOptions.find((c: any) => c.name === institutionName);
            if (institution && (institution as any).address) institutionAddress = (institution as any).address;
            if (institution && (institution as any).phone) institutionPhone = (institution as any).phone;
        }
        if (!institutionAddress && user.addresses && user.addresses.length > 0) {
            institutionAddress = user.addresses[0]?.formatted || '';
        }
        return {
            ad_soyad: user.name.fullName,
            unvan: org?.title || '',
            kurum_adi: institutionName,
            kurum_adres: institutionAddress,
            kurum_telefon: institutionPhone ? formatPhoneForSignature(institutionPhone) : '',
            telefon: phone ? formatPhoneForSignature(phone) : '',
            eposta: user.primaryEmail,
        };
    };

    const fetchTemplates = async () => {
        setTemplatesLoading(true);
        try {
            const allTemplates = await templatesApi.getAll();
            setTemplates(allTemplates);
            const defaultTpl = allTemplates.find((tpl: any) => tpl.isDefault);
            if (defaultTpl) {
                setSelectedTemplateId(defaultTpl.id);
            } else if (allTemplates.length > 0) {
                setSelectedTemplateId(allTemplates[0].id);
            }
        } catch { /* optional */ } finally {
            setTemplatesLoading(false);
        }
    };

    const handleTemplateSelect = async (templateId: number) => {
        if (!user) return;
        setSelectedTemplateId(templateId);
        setTemplatePreviewLoading(true);
        setTemplatePreviewHtml(null);
        try {
            const vars = extractUserVariables();
            const result = await templatesApi.preview(templateId, vars);
            setTemplatePreviewHtml(result.html);
        } catch (err: any) {
            addToast(tToast('signatures.previewFailed', { error: err.message }), 'error');
        } finally {
            setTemplatePreviewLoading(false);
        }
    };

    const handlePushTemplateSignature = async () => {
        if (!user || !selectedTemplateId) return;
        setSignaturePushing(true);
        try {
            const vars = extractUserVariables();
            await signaturesApi.push(user.primaryEmail, { templateId: selectedTemplateId, variables: vars });
            addToast(tToast('signatures.pushed'), 'success');
            fetchSignature();
        } catch (err: any) {
            addToast(tToast('signatures.pushFailed', { error: err.message }), 'error');
        } finally {
            setSignaturePushing(false);
        }
    };

    const handleStartEditing = () => {
        setEditingSignature(true);
        setEditedHtml(currentSignature);
    };

    const handleCancelEditing = () => {
        setEditingSignature(false);
        setEditedHtml('');
    };

    const handleSaveEditedSignature = async () => {
        if (!user) return;
        setSavingEditedSignature(true);
        try {
            await signaturesApi.push(user.primaryEmail, { html: editedHtml });
            addToast(tToast('signatures.saved'), 'success');
            setCurrentSignature(editedHtml);
            setEditingSignature(false);
            setEditedHtml('');
        } catch (err: any) {
            addToast(tToast('signatures.saveFailed', { error: err.message }), 'error');
        } finally {
            setSavingEditedSignature(false);
        }
    };

    const handleSaveProfile = async () => {
        if (!user) return;

        if (editForm.phone.trim()) {
            const phoneDigits = editForm.phone.replace(/\s/g, '');
            if (!/^90\d{10}$/.test(phoneDigits)) {
                setError(t('errors.phoneInvalid'));
                return;
            }
        }

        if (checkingEmail) {
            setError(t('errors.emailChecking'));
            return;
        }
        const newEmail = `${editForm.username}@${editForm.domain}`;
        const emailChanged = newEmail !== user.primaryEmail;
        if (emailChanged && emailAvailable === false) {
            setError(t('errors.emailTaken'));
            return;
        }

        setSaving(true);
        setError('');

        try {
            const payload: any = {
                name: {
                    givenName: editForm.givenName,
                    familyName: editForm.familyName,
                },
                phones: editForm.phone.trim() ? [{ value: phoneToE164(editForm.phone), type: 'work' }] : [],
                organizations: editForm.title || editForm.buildingId.trim()
                    ? [{ title: editForm.title || undefined, department: editForm.buildingId.trim() || undefined, primary: true }]
                    : [],
                orgUnitPath: editForm.orgUnitPath,
                addresses: (() => {
                    if (!editForm.buildingId.trim()) return [];
                    const institution = institutionOptions.find(c => c.name === editForm.buildingId.trim());
                    return institution?.address ? [{ type: 'work', formatted: institution.address }] : [];
                })(),
            };

            if (emailChanged) {
                payload.primaryEmail = newEmail;
            }

            const result = await adminApi.updateUser(user.primaryEmail, payload);

            if (result.success) {
                setUser(result.user as AdminUser);
                setIsEditing(false);
                setEmailAvailable(null);
                setCheckingEmail(false);
                if (emailChanged) {
                    addToast(tToast('userDetail.profileUpdatedNewEmail', { email: newEmail }), 'success');
                    navigate(`/users/${encodeURIComponent(newEmail)}`, { replace: true });
                } else {
                    addToast(tToast('userDetail.profileUpdated'), 'success');
                }
            } else {
                setError(result.error || t('errors.updateFailed'));
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleAddGroupsFromAutocomplete = async () => {
        if (!user || groupsToAdd.length === 0) return;
        setAddingGroups(true);
        setError('');
        let errorCount = 0;

        try {
            for (const sg of groupsToAdd) {
                try {
                    await adminApi.addUserToGroup(user.primaryEmail, sg.group.email, sg.role);
                    await new Promise((resolve) => setTimeout(resolve, 500));
                } catch {
                    errorCount++;
                    addToast(tToast('userDetail.groupAddFailed', { name: sg.group.name }), 'warning');
                }
            }

            const groupsResult = await adminApi.getUserGroups(user.primaryEmail);
            if (groupsResult.success) setUserGroups(groupsResult.groups!);
            setGroupsToAdd([]);

            if (errorCount === 0) {
                addToast(tToast('userDetail.groupsAdded'), 'success');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setAddingGroups(false);
        }
    };

    const handleRemoveUserFromGroup = async (groupKey: string) => {
        if (!user) return;
        if (!confirm(t('groups.removeConfirm'))) return;

        setGroupActionLoading(true);
        setError('');
        try {
            const result = await adminApi.removeUserFromGroup(user.primaryEmail, groupKey);
            if (result.success) {
                setUserGroups(userGroups.filter(g => g.email !== groupKey));
            } else {
                setError(result.error || t('errors.removeFromGroupFailed'));
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setGroupActionLoading(false);
        }
    };

    const handleResetPassword = async () => {
        if (!user || !passwordInput) return;
        if (passwordInput.length < 8) {
            setError(t('errors.passwordTooShort'));
            return;
        }
        setSecurityActionLoading(true);
        setError('');
        try {
            const result = await adminApi.updateUser(user.primaryEmail, { password: passwordInput } as any);
            if (result.success) {
                setUser(result.user as AdminUser);
                setPasswordInput('');
                addToast(tToast('userDetail.passwordUpdated'), 'success');
            } else {
                setError(result.error || t('errors.passwordUpdateFailed'));
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSecurityActionLoading(false);
        }
    };

    const handleToggleSuspend = async () => {
        if (!user) return;
        const confirmMsg = user.suspended ? t('security.suspendConfirmActivate') : t('security.suspendConfirmSuspend');
        if (!confirm(confirmMsg)) return;

        setSecurityActionLoading(true);
        setError('');
        try {
            const newStatus = !user.suspended;
            const result = await adminApi.updateUser(user.primaryEmail, { suspended: newStatus } as any);
            if (result.success) {
                setUser(result.user as AdminUser);
            } else {
                setError(result.error || t('errors.suspendFailed'));
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSecurityActionLoading(false);
        }
    };

    const handleDeleteUser = async () => {
        if (!user) return;
        if (!confirm(t('security.deleteConfirm'))) return;

        setSecurityActionLoading(true);
        setError('');
        try {
            const result = await adminApi.deleteUser(user.primaryEmail);
            if (result.success) {
                addToast(tToast('userDetail.userDeleted'), 'success');
                navigate('/users');
            } else {
                setError(result.error || t('errors.deleteFailed'));
                setSecurityActionLoading(false);
            }
        } catch (err: any) {
            setError(err.message);
            setSecurityActionLoading(false);
        }
    };

    const handleAddAlias = async () => {
        if (!user || !newAliasUsername.trim() || !newAliasDomain) return;
        const alias = `${newAliasUsername.trim()}@${newAliasDomain}`;
        if (aliases.includes(alias) || alias === user.primaryEmail) {
            addToast(tToast('userDetail.aliasExists'), 'warning');
            return;
        }
        setAliasLoading(true);
        try {
            const result = await adminApi.addAlias(user.primaryEmail, alias);
            if (result.success) {
                setAliases([...aliases, alias]);
                setNewAliasUsername('');
                addToast(tToast('userDetail.aliasAdded', { alias }), 'success');
            } else {
                addToast(result.error || tToast('userDetail.aliasAddDefault'), 'error');
            }
        } catch (err: any) {
            addToast(tToast('userDetail.aliasAddFailed', { error: err.message }), 'error');
        } finally {
            setAliasLoading(false);
        }
    };

    const handleRemoveAlias = async (alias: string) => {
        if (!user) return;
        setAliasLoading(true);
        try {
            const result = await adminApi.removeAlias(user.primaryEmail, alias);
            if (result.success) {
                setAliases(aliases.filter(a => a !== alias));
                addToast(tToast('userDetail.aliasRemoved', { alias }), 'success');
            } else {
                addToast(result.error || tToast('userDetail.aliasRemoveDefault'), 'error');
            }
        } catch (err: any) {
            addToast(tToast('userDetail.aliasRemoveFailed', { error: err.message }), 'error');
        } finally {
            setAliasLoading(false);
        }
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        if (user) {
            const emailParts = user.primaryEmail.split('@');
            const rawPhone = user.phones && user.phones.length > 0 ? user.phones[0].value : '';
            setEditForm({
                givenName: user.name.givenName || '',
                familyName: user.name.familyName || '',
                phone: e164ToDisplay(rawPhone),
                title: user.organizations && user.organizations.length > 0 ? user.organizations[0].title || '' : '',
                orgUnitPath: user.orgUnitPath || '/',
                username: emailParts[0] || '',
                domain: emailParts[1] || '',
                buildingId: user.organizations?.[0]?.department || '',
            });
        }
        setEmailAvailable(null);
        setCheckingEmail(false);
        setError('');
    };

    const emailInputBorderClass =
        emailAvailable === true
            ? 'border-green-300 focus:ring-green-500 focus:border-green-500'
            : emailAvailable === false
                ? 'border-eth-danger/30 focus:ring-eth-danger/40 focus:border-eth-danger/40'
                : 'eth-border-ghost focus:ring-eth-primary-container/40 focus:border-eth-primary-container/40';

    if (loading) {
        return (
            <div className="p-6 flex justify-center items-center h-64 text-on-surface-variant">
                {t('loading')}
            </div>
        );
    }

    if (error || !user) {
        return (
            <div className="p-6">
                <div className="mb-4">
                    <button onClick={() => navigate('/users')} className="text-eth-primary hover:underline">
                        {t('backToUsers')}
                    </button>
                </div>
                <div className="bg-eth-danger/10 text-eth-danger p-4 rounded-lg">
                    {error || t('notFound')}
                </div>
            </div>
        );
    }

    const availableGroupsForAutocomplete = allGroups.filter(
        (ag) => !userGroups.some((ug) => ug.email === ag.email)
    );

    const TABS: { id: Tab; labelKey: string }[] = [
        { id: 'overview', labelKey: 'tabs.overview' },
        { id: 'groups', labelKey: 'tabs.groups' },
        { id: 'signature', labelKey: 'tabs.signature' },
        { id: 'security', labelKey: 'tabs.security' },
    ];

    return (
        <div className="p-6 max-w-5xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <button onClick={() => navigate('/users')} className="text-eth-primary hover:underline mb-2 inline-block">
                        {t('backToUsers')}
                    </button>
                    <h1 className="text-2xl font-bold flex items-center gap-3">
                        {user.name.fullName}
                        {user.suspended ? (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-eth-danger/15 text-eth-danger">{t('badges.suspended')}</span>
                        ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-eth-secondary/15 text-eth-secondary">{t('badges.active')}</span>
                        )}
                        {user.isAdmin && (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-eth-primary-container/15 text-eth-primary">{t('badges.admin')}</span>
                        )}
                    </h1>
                    <p className="text-on-surface-variant">{user.primaryEmail}</p>
                </div>
            </div>

            <div className="border-b border-outline-variant/30">
                <nav className="-mb-px flex space-x-8">
                    {TABS.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === tab.id
                                    ? 'border-eth-primary-container/40 text-eth-primary'
                                    : 'border-transparent text-on-surface-variant hover:text-on-surface hover:eth-border-ghost'}`}
                        >
                            {t(tab.labelKey)}
                        </button>
                    ))}
                </nav>
            </div>

            {error && (
                <div className="mb-4 p-3 bg-eth-danger/10 text-eth-danger rounded-lg text-sm border border-eth-danger/30">
                    {error}
                </div>
            )}

            <div className="bg-surface-container rounded-xl shadow-sm border eth-border-ghost-soft p-6 min-h-[300px]">
                {activeTab === 'overview' && (
                    <div className="space-y-6" id="overview-tab">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-semibold">{t('overview.summaryTitle')}</h2>
                            {!isEditing ? (
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="px-3 py-1.5 bg-eth-primary-container/10 text-eth-primary rounded hover:bg-eth-primary-container/15 transition-colors text-sm font-medium"
                                >
                                    {t('overview.edit')}
                                </button>
                            ) : (
                                <div className="space-x-2">
                                    <button
                                        onClick={handleCancelEdit}
                                        className="px-3 py-1.5 bg-surface-container-high text-on-surface-variant rounded hover:bg-surface-container-highest transition-colors text-sm font-medium"
                                        disabled={saving}
                                    >
                                        {t('overview.cancel')}
                                    </button>
                                    <button
                                        onClick={handleSaveProfile}
                                        className="px-3 py-1.5 bg-eth-primary-container text-on-eth-primary-container rounded hover:brightness-110 transition-colors text-sm font-medium"
                                        disabled={saving}
                                    >
                                        {saving ? t('overview.saving') : t('overview.save')}
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-on-surface mb-1">{t('overview.fields.email')}</label>
                                {isEditing ? (
                                    <div>
                                        <div className="flex items-center gap-1">
                                            <input
                                                type="text"
                                                className={`flex-1 p-2 border rounded focus:ring-2 ${emailInputBorderClass}`}
                                                value={editForm.username}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setEditForm({ ...editForm, username: val });
                                                    checkEmailAvailability(val, editForm.domain);
                                                }}
                                                disabled={saving}
                                            />
                                            <span className="text-on-surface-variant font-medium px-1">@</span>
                                            <select
                                                value={editForm.domain}
                                                onChange={(e) => {
                                                    const newDomain = e.target.value;
                                                    setEditForm({ ...editForm, domain: newDomain });
                                                    checkEmailAvailability(editForm.username, newDomain);
                                                }}
                                                disabled={saving}
                                                className="p-2 border eth-border-ghost rounded focus:ring-2 focus:ring-eth-primary-container/40 focus:border-eth-primary-container/40"
                                            >
                                                {domains.map((d) => (
                                                    <option key={d.domainName} value={d.domainName}>{d.domainName}</option>
                                                ))}
                                            </select>
                                        </div>
                                        {checkingEmail && (
                                            <p className="mt-1 text-sm text-on-surface-variant flex items-center gap-1">
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                {t('overview.email.checking')}
                                            </p>
                                        )}
                                        {!checkingEmail && emailAvailable === false && (
                                            <p className="mt-1 text-sm text-eth-danger flex items-center gap-1">
                                                <AlertCircle className="w-4 h-4" />
                                                {t('overview.email.taken')}
                                            </p>
                                        )}
                                        {!checkingEmail && emailAvailable === true && (
                                            <p className="mt-1 text-sm text-eth-secondary flex items-center gap-1">
                                                <CheckCircle className="w-4 h-4" />
                                                {t('overview.email.available')}
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <div className="p-2 bg-surface-container-low rounded border eth-border-ghost text-on-surface">{user.primaryEmail}</div>
                                )}
                            </div>

                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-on-surface mb-1">{t('overview.fields.aliases')}</label>
                                {isEditing ? (
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap gap-2">
                                            {aliases.length === 0 && (
                                                <span className="text-on-surface-variant text-sm">{t('overview.fields.noAliases')}</span>
                                            )}
                                            {aliases.map((alias) => (
                                                <span
                                                    key={alias}
                                                    className="inline-flex items-center gap-1 px-3 py-1 bg-eth-primary-container/10 text-eth-primary rounded-full text-sm"
                                                >
                                                    {alias}
                                                    <button
                                                        onClick={() => handleRemoveAlias(alias)}
                                                        disabled={aliasLoading}
                                                        className="ml-1 text-eth-primary hover:text-eth-danger disabled:opacity-50"
                                                        title={t('overview.fields.removeAlias')}
                                                    >
                                                        ×
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <input
                                                type="text"
                                                className="flex-1 p-2 border eth-border-ghost rounded focus:ring-eth-primary-container/40 focus:border-eth-primary-container/40"
                                                value={newAliasUsername}
                                                onChange={(e) => setNewAliasUsername(e.target.value.toLowerCase())}
                                                placeholder={t('overview.fields.aliasPlaceholder')}
                                                disabled={aliasLoading}
                                            />
                                            <span className="text-on-surface-variant font-medium px-1">@</span>
                                            <select
                                                value={newAliasDomain}
                                                onChange={(e) => setNewAliasDomain(e.target.value)}
                                                disabled={aliasLoading}
                                                className="p-2 border eth-border-ghost rounded focus:ring-2 focus:ring-eth-primary-container/40 focus:border-eth-primary-container/40"
                                            >
                                                {domains.map((d) => (
                                                    <option key={d.domainName} value={d.domainName}>{d.domainName}</option>
                                                ))}
                                            </select>
                                            <button
                                                onClick={handleAddAlias}
                                                disabled={aliasLoading || !newAliasUsername.trim()}
                                                className="px-4 py-2 bg-eth-primary-container text-on-eth-primary-container rounded hover:brightness-110 transition-colors text-sm font-medium disabled:opacity-50"
                                            >
                                                {aliasLoading ? t('overview.fields.addingAlias') : t('overview.fields.addAlias')}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="p-2 bg-surface-container-low rounded border eth-border-ghost">
                                        {aliases.length > 0 ? (
                                            <div className="flex flex-wrap gap-2">
                                                {aliases.map((alias) => (
                                                    <span
                                                        key={alias}
                                                        className="inline-flex items-center px-3 py-1 bg-eth-primary-container/10 text-eth-primary rounded-full text-sm"
                                                    >
                                                        {alias}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="text-on-surface">{t('overview.fields.emptyValue')}</span>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-on-surface mb-1">{t('overview.fields.firstName')}</label>
                                {isEditing ? (
                                    <input
                                        type="text"
                                        className="w-full p-2 border eth-border-ghost rounded focus:ring-eth-primary-container/40 focus:border-eth-primary-container/40"
                                        value={editForm.givenName}
                                        onChange={(e) => setEditForm({ ...editForm, givenName: capitalizeWords(e.target.value) })}
                                        disabled={saving}
                                    />
                                ) : (
                                    <div className="p-2 bg-surface-container-low rounded border eth-border-ghost text-on-surface">{user.name.givenName || t('overview.fields.emptyValue')}</div>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-on-surface mb-1">{t('overview.fields.lastName')}</label>
                                {isEditing ? (
                                    <input
                                        type="text"
                                        className="w-full p-2 border eth-border-ghost rounded focus:ring-eth-primary-container/40 focus:border-eth-primary-container/40"
                                        value={editForm.familyName}
                                        onChange={(e) => setEditForm({ ...editForm, familyName: toUpperCaseTr(e.target.value) })}
                                        disabled={saving}
                                    />
                                ) : (
                                    <div className="p-2 bg-surface-container-low rounded border eth-border-ghost text-on-surface">{user.name.familyName || t('overview.fields.emptyValue')}</div>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-on-surface mb-1">{t('overview.fields.title')}</label>
                                {isEditing ? (
                                    <SearchableSelect
                                        options={titleOptions}
                                        value={editForm.title}
                                        onChange={(val) => setEditForm({ ...editForm, title: val })}
                                        placeholder={t('overview.fields.titleSearch')}
                                        disabled={saving}
                                        emptyMessage={t('overview.fields.titleEmpty')}
                                    />
                                ) : (
                                    <div className="p-2 bg-surface-container-low rounded border eth-border-ghost text-on-surface">
                                        {user.organizations && user.organizations.length > 0 ? user.organizations[0].title : t('overview.fields.emptyValue')}
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-on-surface mb-1">{t('overview.fields.phone')}</label>
                                {isEditing ? (
                                    <input
                                        type="text"
                                        className="w-full p-2 border eth-border-ghost rounded focus:ring-eth-primary-container/40 focus:border-eth-primary-container/40"
                                        value={editForm.phone}
                                        onChange={(e) => setEditForm({ ...editForm, phone: formatPhoneNumber(e.target.value) })}
                                        onPaste={(e) => {
                                            e.preventDefault();
                                            const pasted = e.clipboardData.getData('text');
                                            setEditForm({ ...editForm, phone: formatPhoneNumber(pasted) });
                                        }}
                                        maxLength={16}
                                        placeholder={t('overview.fields.phonePlaceholder')}
                                        disabled={saving}
                                    />
                                ) : (
                                    <div className="p-2 bg-surface-container-low rounded border eth-border-ghost text-on-surface">
                                        {user.phones && user.phones.length > 0 ? e164ToDisplay(user.phones[0].value) || user.phones[0].value : t('overview.fields.emptyValue')}
                                    </div>
                                )}
                            </div>

                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-on-surface mb-1">{t('overview.fields.orgUnit')}</label>
                                {isEditing ? (
                                    <select
                                        className="w-full p-2 border eth-border-ghost rounded focus:ring-eth-primary-container/40 focus:border-eth-primary-container/40"
                                        value={editForm.orgUnitPath}
                                        onChange={(e) => setEditForm({ ...editForm, orgUnitPath: e.target.value })}
                                        disabled={saving}
                                    >
                                        <option value="/">{t('overview.fields.rootOrg')}</option>
                                        {orgUnits.map((ou) => (
                                            <option key={ou.orgUnitId} value={ou.orgUnitPath}>
                                                {ou.orgUnitPath}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <div className="p-2 bg-surface-container-low rounded border eth-border-ghost text-on-surface">{user.orgUnitPath || '/'}</div>
                                )}
                            </div>

                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-on-surface mb-1">{t('overview.fields.institution')}</label>
                                {isEditing ? (
                                    <SearchableSelect
                                        options={institutionOptions.map(c => c.name)}
                                        value={editForm.buildingId}
                                        onChange={(val) => setEditForm({ ...editForm, buildingId: val })}
                                        placeholder={t('overview.fields.institutionSearch')}
                                        disabled={saving}
                                        emptyMessage={t('overview.fields.institutionEmpty')}
                                    />
                                ) : (
                                    <div className="p-2 bg-surface-container-low rounded border eth-border-ghost text-on-surface">
                                        {user.organizations?.[0]?.department || t('overview.fields.emptyValue')}
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-on-surface mb-1">{t('overview.fields.lastLogin')}</label>
                                <div className="p-2 bg-surface-container-low rounded border eth-border-ghost text-on-surface">{user.lastLoginTime ? formatDateTime(user.lastLoginTime) : t('overview.fields.neverLoggedIn')}</div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'groups' && (
                    <div className="space-y-6" id="groups-tab">
                        <div>
                            <h2 className="text-lg font-semibold mb-4">{t('groups.title')}</h2>

                            <div className="mb-4">
                                <GroupAutocomplete
                                    allGroups={availableGroupsForAutocomplete}
                                    selectedGroups={groupsToAdd}
                                    onChange={setGroupsToAdd}
                                    disabled={addingGroups}
                                />
                                {groupsToAdd.length > 0 && (
                                    <button
                                        onClick={handleAddGroupsFromAutocomplete}
                                        disabled={addingGroups}
                                        className="mt-3 bg-eth-primary-container text-on-eth-primary-container px-4 py-2 rounded-lg hover:brightness-110 transition-colors text-sm font-medium disabled:opacity-50"
                                    >
                                        {addingGroups ? t('groups.adding') : t('groups.addingButton', { count: groupsToAdd.length })}
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="border rounded-lg overflow-hidden">
                            <table className="min-w-full divide-y divide-outline-variant/30">
                                <thead className="bg-surface-container-low">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-on-surface-variant uppercase">{t('groups.table.name')}</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-on-surface-variant uppercase">{t('groups.table.email')}</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-on-surface-variant uppercase">{t('groups.table.action')}</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-surface-container divide-y divide-outline-variant/30">
                                    {userGroups.length === 0 ? (
                                        <tr>
                                            <td colSpan={3} className="px-6 py-8 text-center text-on-surface-variant">
                                                {t('groups.empty')}
                                            </td>
                                        </tr>
                                    ) : (
                                        userGroups.map(group => (
                                            <tr key={group.id} className="hover:bg-surface-container-low">
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-on-surface">{group.name}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-on-surface-variant">{group.email}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                    <button
                                                        onClick={() => handleRemoveUserFromGroup(group.email)}
                                                        disabled={groupActionLoading}
                                                        className="text-eth-danger hover:text-eth-danger disabled:opacity-50"
                                                    >
                                                        {t('groups.table.removeButton')}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'signature' && (
                    <div className="space-y-6" id="signature-tab">
                        <h2 className="text-lg font-semibold text-on-surface">{t('signature.title')}</h2>

                        {!serviceAccountConfigured ? (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-500">
                                {t('signature.saMissing')}
                            </div>
                        ) : (
                            <>
                                <div className="border eth-border-ghost rounded-lg p-5 space-y-4 shadow-sm">
                                    <h3 className="font-medium text-on-surface">{t('signature.section1')}</h3>

                                    {templatesLoading ? (
                                        <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                                            <Loader2 size={16} className="animate-spin" />
                                            {t('signature.templatesLoading')}
                                        </div>
                                    ) : templates.length === 0 ? (
                                        <div className="bg-surface-container-low border eth-border-ghost rounded-lg p-4 text-sm text-on-surface-variant">
                                            {t('signature.noTemplates')}
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex items-end gap-3">
                                                <div className="flex-1 max-w-sm">
                                                    <label className="block text-sm font-medium text-on-surface mb-1">{t('signature.templateLabel')}</label>
                                                    <select
                                                        value={selectedTemplateId || ''}
                                                        onChange={(e) => {
                                                            const id = Number(e.target.value);
                                                            if (id) handleTemplateSelect(id);
                                                        }}
                                                        className="w-full p-2 border eth-border-ghost rounded-lg text-sm focus:ring-primary-500 focus:border-primary-500"
                                                    >
                                                        <option value="" disabled>{t('signature.templateSelect')}</option>
                                                        {templates.map((tpl: any) => (
                                                            <option key={tpl.id} value={tpl.id}>
                                                                {tpl.name}{tpl.isDefault ? t('signature.defaultSuffix') : ''}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <button
                                                    onClick={handlePushTemplateSignature}
                                                    disabled={!selectedTemplateId || signaturePushing}
                                                    className="px-4 py-2 bg-eth-secondary text-surface rounded-lg text-sm hover:bg-eth-secondary font-medium disabled:opacity-50 flex items-center gap-1"
                                                >
                                                    <Send size={16} />
                                                    {signaturePushing ? t('signature.sending') : t('signature.send')}
                                                </button>
                                            </div>

                                            {templatePreviewLoading && (
                                                <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                                                    <Loader2 size={16} className="animate-spin" />
                                                    {t('signature.previewLoading')}
                                                </div>
                                            )}

                                            {templatePreviewHtml && !templatePreviewLoading && (
                                                <div className="border border-eth-primary-container/30 rounded-lg overflow-hidden">
                                                    <div className="px-3 py-2 bg-eth-primary-container/10 border-b border-eth-primary-container/30 text-xs font-medium text-eth-primary">
                                                        {t('signature.previewLabel')}
                                                    </div>
                                                    <iframe
                                                        srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:8px;font-family:Arial,sans-serif;font-size:14px;}</style></head><body>${templatePreviewHtml}</body></html>`}
                                                        className="w-full border-0"
                                                        style={{ minHeight: 200 }}
                                                        title="Template Preview"
                                                        sandbox="allow-same-origin"
                                                    />
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>

                                <hr className="eth-border-ghost" />

                                <div className="border eth-border-ghost rounded-lg p-5 space-y-4 shadow-sm">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-medium text-on-surface">{t('signature.section2')}</h3>
                                        <button
                                            onClick={fetchSignature}
                                            disabled={signatureLoading}
                                            className="px-4 py-2 bg-surface-container-high text-on-surface rounded-lg text-sm hover:bg-surface-container-highest font-medium disabled:opacity-50"
                                        >
                                            {signatureLoading ? t('signature.fetching') : t('signature.fetch')}
                                        </button>
                                    </div>

                                    {currentSignature && !editingSignature && (
                                        <div className="space-y-3">
                                            <div className="border eth-border-ghost rounded-lg overflow-hidden">
                                                <div className="px-3 py-2 bg-surface-container-low border-b border-outline-variant/30 flex items-center justify-between">
                                                    <span className="text-xs font-medium text-on-surface-variant">{t('signature.currentLabel')}</span>
                                                    <button
                                                        onClick={handleStartEditing}
                                                        className="px-2 py-1 text-xs bg-surface-container border eth-border-ghost text-on-surface-variant rounded hover:bg-surface-container-low flex items-center gap-1 transition-colors"
                                                    >
                                                        <Pencil size={12} />
                                                        {t('signature.edit')}
                                                    </button>
                                                </div>
                                                <iframe
                                                    srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:8px;font-family:Arial,sans-serif;font-size:14px;background:#ffffff;color:#000000;}</style></head><body>${currentSignature}</body></html>`}
                                                    className="w-full border-0"
                                                    style={{ minHeight: 200 }}
                                                    title="Current Signature"
                                                    sandbox="allow-same-origin"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {editingSignature && (
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-on-surface mb-1">{t('signature.htmlEditor')}</label>
                                                    <SignatureEditor
                                                        value={editedHtml}
                                                        onChange={setEditedHtml}
                                                        showTags={false}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-on-surface mb-1">{t('signature.livePreview')}</label>
                                                    <SignaturePreview html={editedHtml} variables={extractUserVariables()} />
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={handleSaveEditedSignature}
                                                    disabled={savingEditedSignature}
                                                    className="px-4 py-2 bg-eth-secondary text-surface rounded-lg text-sm hover:bg-eth-secondary font-medium disabled:opacity-50 flex items-center gap-1"
                                                >
                                                    <Send size={16} />
                                                    {savingEditedSignature ? t('signature.savingSignature') : t('signature.saveAndSend')}
                                                </button>
                                                <button
                                                    onClick={handleCancelEditing}
                                                    className="px-4 py-2 bg-surface-container-high text-on-surface rounded-lg text-sm hover:bg-surface-container-highest font-medium"
                                                >
                                                    {t('signature.cancelEdit')}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {!currentSignature && !signatureLoading && (
                                        <p className="text-sm text-on-surface-variant">
                                            {t('signature.fetchHint')}
                                        </p>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                )}

                {activeTab === 'security' && (
                    <div className="space-y-6" id="security-tab">
                        <h2 className="text-lg font-semibold text-on-surface">{t('security.title')}</h2>

                        <div className="border eth-border-ghost rounded-lg p-5 space-y-4 shadow-sm">
                            <div>
                                <h3 className="font-medium text-on-surface">{t('security.passwordReset')}</h3>
                                <p className="text-sm text-on-surface-variant mt-1">{t('security.passwordResetHelp')}</p>
                            </div>
                            <div className="flex gap-3 max-w-sm">
                                <div className="relative flex-1">
                                    <input
                                        type={showResetPassword ? 'text' : 'password'}
                                        placeholder={t('security.newPasswordPlaceholder')}
                                        value={passwordInput}
                                        onChange={(e) => setPasswordInput(e.target.value)}
                                        className="w-full p-2 pr-10 border eth-border-ghost rounded focus:ring-eth-primary-container/40 focus:border-eth-primary-container/40"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowResetPassword(!showResetPassword)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-on-surface-variant hover:text-on-surface-variant transition-colors"
                                        title={showResetPassword ? t('security.hidePassword') : t('security.showPassword')}
                                    >
                                        {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                <button
                                    onClick={handleResetPassword}
                                    disabled={securityActionLoading || !passwordInput || passwordInput.length < 8}
                                    className="bg-eth-primary-container hover:brightness-110 text-on-eth-primary-container px-4 py-2 rounded font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
                                >
                                    {securityActionLoading ? t('security.processing') : t('security.setPassword')}
                                </button>
                            </div>
                        </div>

                        <h2 className="text-lg font-semibold text-eth-danger pt-4">{t('security.dangerZone')}</h2>
                        <div className="border border-eth-danger/30 rounded-lg p-5 bg-eth-danger/10 space-y-4 shadow-sm">
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <h3 className="font-medium text-on-surface">
                                        {user.suspended ? t('security.activate') : t('security.suspend')}
                                    </h3>
                                    <p className="text-sm text-on-surface-variant">
                                        {user.suspended ? t('security.activateHelp') : t('security.suspendHelp')}
                                    </p>
                                </div>
                                <button
                                    onClick={handleToggleSuspend}
                                    disabled={securityActionLoading}
                                    className={`${user.suspended
                                        ? 'bg-eth-secondary/100 hover:bg-eth-secondary'
                                        : 'bg-yellow-500 hover:bg-yellow-600'
                                        } text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 whitespace-nowrap min-w-[140px] shadow-sm`}
                                >
                                    {securityActionLoading ? t('security.processing') : (user.suspended ? t('security.activateButton') : t('security.suspendButton'))}
                                </button>
                            </div>

                            <div className="border-t border-eth-danger/30 pt-5 mt-2 flex items-center justify-between gap-4">
                                <div>
                                    <h3 className="font-medium text-on-surface">{t('security.deleteTitle')}</h3>
                                    <p className="text-sm text-on-surface-variant">{t('security.deleteHelp')}</p>
                                </div>
                                <button
                                    onClick={handleDeleteUser}
                                    disabled={securityActionLoading}
                                    className="bg-eth-danger hover:bg-eth-danger text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 whitespace-nowrap min-w-[140px] shadow-sm"
                                >
                                    {securityActionLoading ? t('security.processing') : t('security.deleteButton')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
