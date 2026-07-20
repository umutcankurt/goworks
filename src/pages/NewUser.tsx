import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../services/api';
import { titlesApi, institutionsApi, serverApi, signaturesApi, templatesApi } from '../services/server-api';
import { GroupAutocomplete } from '../components/GroupAutocomplete';
import { SearchableSelect } from '../components/SearchableSelect';
import { SignaturePreview } from '../components/SignaturePreview';
import { UserCreatedModal, GroupStatus } from '../components/UserCreatedModal';
import { HelpGuide } from '../components/HelpGuide';
import { CheckCircle, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import type { AdminGroup, OrgUnit, Domain, SelectedGroup, CreateUserPayload } from '../types/admin';
import { capitalizeWords, toUpperCaseTr, generateUsername, formatPhoneNumber, phoneToE164, formatPhoneForSignature } from '../utils/turkish-helpers';

const USERNAME_REGEX = /^[a-zA-Z0-9._-]+$/;

interface ValidationErrors {
    givenName?: string;
    familyName?: string;
    username?: string;
    password?: string;
    phone?: string;
}

export const NewUser: React.FC = () => {
    const navigate = useNavigate();
    const { t } = useTranslation('newUser');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});

    const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
    const [checkingEmail, setCheckingEmail] = useState(false);
    const emailCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const usernameManuallyEdited = useRef(false);

    const [titleOptions, setTitleOptions] = useState<string[]>([]);
    const [institutionOptions, setInstitutionOptions] = useState<{ name: string; address?: string; phone?: string }[]>([]);
    const [templates, setTemplates] = useState<any[]>([]);
    const [serviceAccountConfigured, setServiceAccountConfigured] = useState(false);

    const [allGroups, setAllGroups] = useState<AdminGroup[]>([]);
    const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
    const [domains, setDomains] = useState<Domain[]>([]);

    const [givenName, setGivenName] = useState('');
    const [familyName, setFamilyName] = useState('');
    const [username, setUsername] = useState('');
    const [domain, setDomain] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [changePasswordAtNextLogin, setChangePasswordAtNextLogin] = useState(true);
    const [orgUnitPath, setOrgUnitPath] = useState('/');
    const [phone, setPhone] = useState('');
    const [jobTitle, setJobTitle] = useState('');
    const [buildingId, setBuildingId] = useState('');
    const [selectedGroups, setSelectedGroups] = useState<SelectedGroup[]>([]);
    const [assignSignature, setAssignSignature] = useState(true);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [modalUserData, setModalUserData] = useState<{
        fullName: string;
        primaryEmail: string;
        password: string;
        phone: string;
        institution: string;
        jobTitle: string;
    } | null>(null);
    const [modalGroups, setModalGroups] = useState<GroupStatus[]>([]);
    const [groupsLoading, setGroupsLoading] = useState(false);
    const [modalSignatureStatus, setModalSignatureStatus] = useState<'pending' | 'success' | 'failed' | 'skipped'>('skipped');

    const domainRef = useRef(domain);
    domainRef.current = domain;

    const checkEmailAvailability = (uname: string, dom: string) => {
        if (emailCheckTimer.current) clearTimeout(emailCheckTimer.current);

        if (!uname.trim() || !USERNAME_REGEX.test(uname)) {
            setEmailAvailable(null);
            setCheckingEmail(false);
            return;
        }

        setCheckingEmail(true);
        setEmailAvailable(null);

        emailCheckTimer.current = setTimeout(async () => {
            try {
                const result = await adminApi.getUser(`${uname}@${dom}`);
                if (result.success) {
                    setEmailAvailable(!result.user);
                } else {
                    setEmailAvailable(null);
                }
            } catch {
                setEmailAvailable(null);
            } finally {
                setCheckingEmail(false);
            }
        }, 500);
    };

    useEffect(() => {
        return () => {
            if (emailCheckTimer.current) clearTimeout(emailCheckTimer.current);
        };
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [groupsResult, orgUnitsResult, domainsResult] = await Promise.all([
                    adminApi.getAvailableGroups(),
                    adminApi.getOrgUnits(),
                    adminApi.getDomains(),
                ]);

                if (groupsResult.success && groupsResult.groups) {
                    setAllGroups(groupsResult.groups);
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
                    if (sorted.length > 0) setDomain(sorted[0].domainName);
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
                    const [saStatus, templatesData] = await Promise.all([
                        serverApi.getServiceAccountStatus(),
                        templatesApi.getAll(),
                    ]);
                    setTemplates(templatesData);
                    if (templatesData.length > 0) {
                        const defaultTpl = templatesData.find((tpl: any) => tpl.isDefault);
                        setSelectedTemplateId(defaultTpl ? defaultTpl.id.toString() : templatesData[0].id.toString());
                    }
                    if (saStatus && saStatus.configured) {
                        setServiceAccountConfigured(true);
                    }
                } catch { /* optional */ }
            } catch (err: any) {
                setError(t('errors.loadFailed', { error: err.message }));
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [t]);

    const validate = (): boolean => {
        const errors: ValidationErrors = {};

        if (!givenName.trim()) {
            errors.givenName = t('errors.firstNameRequired');
        }
        if (!familyName.trim()) {
            errors.familyName = t('errors.lastNameRequired');
        }
        if (!username.trim()) {
            errors.username = t('errors.usernameRequired');
        } else if (!USERNAME_REGEX.test(username)) {
            errors.username = t('errors.usernameInvalid');
        } else if (checkingEmail) {
            errors.username = t('errors.usernameChecking');
        } else if (emailAvailable === false) {
            errors.username = t('errors.usernameTaken');
        }
        if (!password) {
            errors.password = t('errors.passwordRequired');
        } else if (password.length < 8) {
            errors.password = t('errors.passwordTooShort');
        }

        if (phone.trim()) {
            const phoneDigits = phone.replace(/\s/g, '');
            if (!/^90\d{10}$/.test(phoneDigits)) {
                errors.phone = t('errors.phoneInvalid');
            }
        }

        setValidationErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!validate()) return;

        setSubmitting(true);

        try {
            const payload: CreateUserPayload = {
                primaryEmail: `${username}@${domain}`,
                name: { givenName: givenName.trim(), familyName: familyName.trim() },
                password,
                changePasswordAtNextLogin,
                orgUnitPath,
            };

            if (phone.trim()) {
                payload.phones = [{ value: phoneToE164(phone), type: 'work' }];
            }

            if (jobTitle.trim() || buildingId.trim()) {
                payload.organizations = [
                    {
                        title: jobTitle.trim() || undefined,
                        department: buildingId.trim() || undefined,
                        primary: true,
                    },
                ];
            }

            if (buildingId.trim()) {
                const selectedInstitution = institutionOptions.find(c => c.name === buildingId.trim());
                if (selectedInstitution?.address) {
                    payload.addresses = [{ type: 'work', formatted: selectedInstitution.address }];
                }
            }

            const result = await adminApi.createUser(payload);

            if (!result.success) {
                setError(result.error || t('errors.createFailed'));
                setSubmitting(false);
                return;
            }

            const newUser = result.user!;
            const email = newUser.primaryEmail;

            setModalUserData({
                fullName: `${givenName.trim()} ${familyName.trim()}`,
                primaryEmail: email,
                password,
                phone: phone.trim(),
                institution: buildingId.trim(),
                jobTitle: jobTitle.trim(),
            });

            const initialGroups: GroupStatus[] = selectedGroups.map(sg => ({
                name: sg.group.name,
                status: 'pending' as const,
            }));
            setModalGroups(initialGroups);
            setGroupsLoading(selectedGroups.length > 0);

            const willPushSignature = serviceAccountConfigured && assignSignature;
            setModalSignatureStatus(willPushSignature ? 'pending' : 'skipped');

            setShowSuccessModal(true);
            setSubmitting(false);

            for (let i = 0; i < selectedGroups.length; i++) {
                const sg = selectedGroups[i];
                try {
                    await adminApi.addUserToGroup(email, sg.group.email, sg.role);
                    setModalGroups(prev => prev.map((g, idx) =>
                        idx === i ? { ...g, status: 'success' } : g
                    ));
                } catch {
                    setModalGroups(prev => prev.map((g, idx) =>
                        idx === i ? { ...g, status: 'failed' } : g
                    ));
                }
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            setGroupsLoading(false);

            if (willPushSignature) {
                await new Promise(resolve => setTimeout(resolve, 10000));

                const maxRetries = 3;
                let retryDelay = 10000;
                for (let attempt = 0; attempt < maxRetries; attempt++) {
                    try {
                        const selectedInstitution = institutionOptions.find(c => c.name === buildingId.trim());
                        const institutionAddress = selectedInstitution?.address || '';
                        const institutionPhone = selectedInstitution?.phone || '';

                        await signaturesApi.push(email, {
                            templateId: selectedTemplateId ? Number(selectedTemplateId) : undefined,
                            variables: {
                                ad_soyad: `${givenName.trim()} ${familyName.trim()}`,
                                unvan: jobTitle.trim(),
                                kurum_adi: buildingId.trim(),
                                kurum_adres: institutionAddress,
                                kurum_telefon: institutionPhone ? formatPhoneForSignature(institutionPhone) : '',
                                telefon: phone ? formatPhoneForSignature(phone) : '',
                                eposta: email
                            }
                        });
                        setModalSignatureStatus('success');
                        break;
                    } catch {
                        if (attempt >= maxRetries - 1) {
                            setModalSignatureStatus('failed');
                        } else {
                            await new Promise(resolve => setTimeout(resolve, retryDelay));
                            retryDelay *= 2;
                        }
                    }
                }
            }
        } catch (err: any) {
            setError(err.message || t('errors.unexpected'));
            setSubmitting(false);
        }
    };

    const handleGivenNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const formatted = capitalizeWords(e.target.value);
        setGivenName(formatted);
        if (validationErrors.givenName) setValidationErrors((v) => ({ ...v, givenName: undefined }));
        if (!usernameManuallyEdited.current) {
            const newUsername = generateUsername(formatted, familyName);
            setUsername(newUsername);
            checkEmailAvailability(newUsername, domainRef.current);
        }
    };

    const handleFamilyNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const formatted = toUpperCaseTr(e.target.value);
        setFamilyName(formatted);
        if (validationErrors.familyName) setValidationErrors((v) => ({ ...v, familyName: undefined }));
        if (!usernameManuallyEdited.current) {
            const newUsername = generateUsername(givenName, formatted);
            setUsername(newUsername);
            checkEmailAvailability(newUsername, domainRef.current);
        }
    };

    const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setUsername(val);
        if (validationErrors.username) setValidationErrors((v) => ({ ...v, username: undefined }));
        if (val === '') {
            usernameManuallyEdited.current = false;
            const newUsername = generateUsername(givenName, familyName);
            setUsername(newUsername);
            checkEmailAvailability(newUsername, domainRef.current);
        } else {
            usernameManuallyEdited.current = true;
            checkEmailAvailability(val, domainRef.current);
        }
    };

    const handleDomainChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newDomain = e.target.value;
        setDomain(newDomain);
        checkEmailAvailability(username, newDomain);
    };

    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setPhone(formatPhoneNumber(e.target.value));
        if (validationErrors.phone) setValidationErrors((v) => ({ ...v, phone: undefined }));
    };

    const handlePhonePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text');
        setPhone(formatPhoneNumber(pasted));
        if (validationErrors.phone) setValidationErrors((v) => ({ ...v, phone: undefined }));
    };

    if (loading) {
        return (
            <div className="p-6 flex justify-center items-center h-64 text-on-surface-variant">
                {t('loading')}
            </div>
        );
    }

    const usernameInputBorderClass =
        emailAvailable === true
            ? 'border-green-300 focus:ring-green-500 focus:border-green-500'
            : emailAvailable === false
                ? 'border-eth-danger/30 focus:ring-red-500 focus:border-eth-danger/40'
                : 'border-outline-variant/30 focus:ring-blue-500 focus:border-eth-primary-container/40';

    return (
        <div className="max-w-4xl mx-auto">
            <div className="mb-6 flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-on-surface">{t('title')}</h1>
                    <p className="text-on-surface-variant mt-1">{t('subtitle')}</p>
                </div>
                <HelpGuide namespace="newUser" />
            </div>

            {error && (
                <div className="mb-6 p-4 bg-eth-danger/10 text-eth-danger rounded-lg border border-eth-danger/30">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-8">
                <div className="bg-surface-container rounded-xl shadow-sm border border-outline-variant/30 p-6">
                    <h2 className="text-lg font-semibold text-on-surface mb-4">{t('sections.personal')}</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-on-surface mb-1">
                                {t('fields.firstName')} <span className="text-eth-danger">*</span>
                            </label>
                            <input
                                type="text"
                                value={givenName}
                                onChange={handleGivenNameChange}
                                disabled={submitting}
                                className="w-full bg-surface-container-high p-2 border border-outline-variant/30 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-eth-primary-container/40"
                                placeholder={t('fields.firstNamePlaceholder')}
                            />
                            {validationErrors.givenName && (
                                <p className="mt-1 text-sm text-eth-danger">{validationErrors.givenName}</p>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-on-surface mb-1">
                                {t('fields.lastName')} <span className="text-eth-danger">*</span>
                            </label>
                            <input
                                type="text"
                                value={familyName}
                                onChange={handleFamilyNameChange}
                                disabled={submitting}
                                className="w-full bg-surface-container-high p-2 border border-outline-variant/30 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-eth-primary-container/40"
                                placeholder={t('fields.lastNamePlaceholder')}
                            />
                            {validationErrors.familyName && (
                                <p className="mt-1 text-sm text-eth-danger">{validationErrors.familyName}</p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="bg-surface-container rounded-xl shadow-sm border border-outline-variant/30 p-6">
                    <h2 className="text-lg font-semibold text-on-surface mb-4">{t('sections.account')}</h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-on-surface mb-1">
                                {t('fields.email')} <span className="text-eth-danger">*</span>
                            </label>
                            <div className="flex items-center gap-1">
                                <input
                                    type="text"
                                    value={username}
                                    onChange={handleUsernameChange}
                                    disabled={submitting}
                                    className={`flex-1 bg-surface-container-high p-2 border rounded-lg focus:ring-2 ${usernameInputBorderClass}`}
                                    placeholder={t('fields.emailPlaceholder')}
                                />
                                <span className="text-on-surface-variant font-medium px-1">@</span>
                                <select
                                    value={domain}
                                    onChange={handleDomainChange}
                                    disabled={submitting}
                                    className="bg-surface-container-high p-2 border border-outline-variant/30 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-eth-primary-container/40"
                                >
                                    {domains.map((d) => (
                                        <option key={d.domainName} value={d.domainName}>{d.domainName}</option>
                                    ))}
                                </select>
                            </div>
                            {validationErrors.username && (
                                <p className="mt-1 text-sm text-eth-danger">{validationErrors.username}</p>
                            )}
                            {!validationErrors.username && checkingEmail && (
                                <p className="mt-1 text-sm text-on-surface-variant flex items-center gap-1">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    {t('email.checking')}
                                </p>
                            )}
                            {!validationErrors.username && !checkingEmail && emailAvailable === false && (
                                <p className="mt-1 text-sm text-eth-danger flex items-center gap-1">
                                    <AlertCircle className="w-4 h-4" />
                                    {t('email.taken')}
                                </p>
                            )}
                            {!validationErrors.username && !checkingEmail && emailAvailable === true && (
                                <p className="mt-1 text-sm text-eth-secondary flex items-center gap-1">
                                    <CheckCircle className="w-4 h-4" />
                                    {t('email.available')}
                                </p>
                            )}
                        </div>

                        <div className="max-w-sm">
                            <label className="block text-sm font-medium text-on-surface mb-1">
                                {t('fields.password')} <span className="text-eth-danger">*</span>
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => {
                                        setPassword(e.target.value);
                                        if (validationErrors.password) setValidationErrors((v) => ({ ...v, password: undefined }));
                                    }}
                                    disabled={submitting}
                                    className="w-full bg-surface-container-high p-2 pr-10 border border-outline-variant/30 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-eth-primary-container/40"
                                    placeholder={t('fields.passwordPlaceholder')}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-on-surface-variant hover:text-on-surface-variant transition-colors"
                                    title={showPassword ? t('fields.hidePassword') : t('fields.showPassword')}
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                            {validationErrors.password && (
                                <p className="mt-1 text-sm text-eth-danger">{validationErrors.password}</p>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="changePassword"
                                checked={changePasswordAtNextLogin}
                                onChange={(e) => setChangePasswordAtNextLogin(e.target.checked)}
                                disabled={submitting}
                                className="rounded border-outline-variant/30 text-eth-primary focus:ring-blue-500"
                            />
                            <label htmlFor="changePassword" className="text-sm text-on-surface">
                                {t('fields.forceChange')}
                            </label>
                        </div>

                        <div className="max-w-md">
                            <label className="block text-sm font-medium text-on-surface mb-1">
                                {t('fields.orgUnit')}
                            </label>
                            <select
                                value={orgUnitPath}
                                onChange={(e) => setOrgUnitPath(e.target.value)}
                                disabled={submitting}
                                className="w-full bg-surface-container-high p-2 border border-outline-variant/30 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-eth-primary-container/40"
                            >
                                <option value="/">{t('fields.rootOrg')}</option>
                                {orgUnits.map((ou) => (
                                    <option key={ou.orgUnitId} value={ou.orgUnitPath}>
                                        {ou.orgUnitPath}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="bg-surface-container rounded-xl shadow-sm border border-outline-variant/30 p-6">
                    <h2 className="text-lg font-semibold text-on-surface mb-4">
                        {t('sections.contact')}
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-on-surface mb-1">
                                {t('fields.phone')}
                            </label>
                            <input
                                type="text"
                                value={phone}
                                onChange={handlePhoneChange}
                                onPaste={handlePhonePaste}
                                disabled={submitting}
                                maxLength={16}
                                className="w-full bg-surface-container-high p-2 border border-outline-variant/30 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-eth-primary-container/40"
                                placeholder={t('fields.phonePlaceholder')}
                            />
                            {validationErrors.phone && (
                                <p className="mt-1 text-sm text-eth-danger">{validationErrors.phone}</p>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-on-surface mb-1">
                                {t('fields.jobTitle')}
                            </label>
                            <SearchableSelect
                                options={titleOptions}
                                value={jobTitle}
                                onChange={setJobTitle}
                                placeholder={t('fields.jobTitleSearch')}
                                disabled={submitting}
                                emptyMessage={t('fields.jobTitleEmpty')}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-on-surface mb-1">
                                {t('fields.institution')}
                            </label>
                            <SearchableSelect
                                options={institutionOptions.map(c => c.name)}
                                value={buildingId}
                                onChange={setBuildingId}
                                placeholder={t('fields.institutionSearch')}
                                disabled={submitting}
                                emptyMessage={t('fields.institutionEmpty')}
                            />
                        </div>
                    </div>
                </div>

                <div className="bg-surface-container rounded-xl shadow-sm border border-outline-variant/30 p-6">
                    <h2 className="text-lg font-semibold text-on-surface mb-4">{t('sections.groups')}</h2>
                    <p className="text-sm text-on-surface-variant mb-3">{t('groupsHelper')}</p>
                    <GroupAutocomplete
                        allGroups={allGroups}
                        selectedGroups={selectedGroups}
                        onChange={setSelectedGroups}
                        disabled={submitting}
                    />
                </div>

                <div className="bg-surface-container rounded-xl shadow-sm border border-outline-variant/30 p-6 flex flex-col gap-4">
                    <div className="flex justify-between items-center">
                        <div>
                            <h2 className="text-lg font-semibold text-on-surface">{t('sections.signature')}</h2>
                            <p className="text-sm text-on-surface-variant mt-1">
                                {t('signatureSection.description')}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <label htmlFor="assignSignature" className={`text-sm font-medium ${!serviceAccountConfigured ? 'text-on-surface-variant cursor-not-allowed' : 'text-on-surface cursor-pointer'}`}>
                                {t('signatureSection.toggle')}
                            </label>
                            <input
                                type="checkbox"
                                id="assignSignature"
                                checked={serviceAccountConfigured && assignSignature}
                                onChange={(e) => setAssignSignature(e.target.checked)}
                                disabled={submitting || !serviceAccountConfigured}
                                className="w-5 h-5 cursor-pointer rounded border-outline-variant/30 text-eth-primary focus:ring-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                        </div>
                    </div>

                    {serviceAccountConfigured && assignSignature && templates.length > 0 && (
                        <div className="mt-2 p-4 bg-surface-container-low border border-outline-variant/30 rounded-lg space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-on-surface mb-1">
                                    {t('signatureSection.templateLabel')}
                                </label>
                                <select
                                    value={selectedTemplateId}
                                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                                    disabled={submitting}
                                    className="w-full bg-surface-container-high md:w-1/2 p-2 border border-outline-variant/30 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-eth-primary-container/40"
                                >
                                    {templates.map(tpl => (
                                        <option key={tpl.id} value={tpl.id}>{tpl.name} {tpl.isDefault ? t('signatureSection.defaultSuffix') : ''}</option>
                                    ))}
                                </select>
                            </div>
                            {selectedTemplateId && (
                                <div className="mt-4">
                                    <label className="block text-sm font-medium text-on-surface mb-2">{t('signatureSection.preview')}</label>
                                    <SignaturePreview
                                        html={templates.find(tpl => tpl.id.toString() === selectedTemplateId)?.htmlContent || ''}
                                        templateId={Number(selectedTemplateId)}
                                        variables={{
                                            ad_soyad: `${givenName.trim() || t('fields.firstName')} ${familyName.trim() || t('fields.lastName')}`,
                                            unvan: jobTitle.trim() || t('fields.jobTitle'),
                                            kurum_adi: buildingId.trim() || t('fields.institution'),
                                            kurum_adres: institutionOptions.find(c => c.name === buildingId.trim())?.address || '',
                                            kurum_telefon: formatPhoneForSignature(institutionOptions.find(c => c.name === buildingId.trim())?.phone || '') || '',
                                            telefon: formatPhoneForSignature(phone) || t('fields.phonePlaceholder'),
                                            eposta: `${username || t('fields.emailPlaceholder')}@${domain}`,
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {serviceAccountConfigured && assignSignature && templates.length === 0 && (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-sm text-amber-500">
                            <p className="font-medium flex items-center gap-2">
                                <AlertCircle className="w-4 h-4" /> {t('signatureSection.noTemplates')}
                            </p>
                        </div>
                    )}
                    {!serviceAccountConfigured && (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-sm text-amber-500 flex items-start gap-2">
                            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                            <div>
                                <p className="font-medium">{t('signatureSection.saMissingTitle')}</p>
                                <p className="mt-1">{t('signatureSection.saMissingHelp')}</p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={() => navigate('/users')}
                        disabled={submitting}
                        className="px-6 py-2.5 border border-outline-variant/30 text-on-surface rounded-lg hover:bg-surface-container-low transition-colors font-medium disabled:opacity-50"
                    >
                        {t('actions.cancel')}
                    </button>
                    <button
                        type="submit"
                        disabled={submitting}
                        className="px-6 py-2.5 bg-eth-primary-container text-on-eth-primary-container rounded-lg hover:brightness-110 transition-colors font-medium disabled:opacity-50"
                    >
                        {submitting ? t('actions.submitting') : t('actions.submit')}
                    </button>
                </div>
            </form>

            {modalUserData && (
                <UserCreatedModal
                    isOpen={showSuccessModal}
                    onClose={() => navigate('/')}
                    onEdit={() => navigate(`/users/${modalUserData.primaryEmail}`)}
                    userData={modalUserData}
                    groups={modalGroups}
                    groupsLoading={groupsLoading}
                    signatureStatus={modalSignatureStatus}
                />
            )}
        </div>
    );
};
