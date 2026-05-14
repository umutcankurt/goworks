import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../services/api';
import { useToast } from '../contexts/ToastContext';
import { useAppConfig } from '../contexts/AppConfigContext';
import { SearchableSelect } from '../components/SearchableSelect';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpGuide } from '../components/HelpGuide';
import {
    Search, UserX, ShieldOff, KeyRound, Forward, BookX,
    CheckCircle2, Loader2, ChevronRight, AlertTriangle, RotateCcw,
    Building2
} from 'lucide-react';

type StepId = 'org_unit' | 'suspend' | 'groups' | 'reset_pwd' | 'forward' | 'directory';

interface OffboardStep {
    id: StepId;
    icon: React.ReactNode;
    status: 'pending' | 'running' | 'done' | 'error';
    errorMessage?: string;
    enabled: boolean;
}

export const Offboard: React.FC = () => {
    const navigate = useNavigate();
    const { addToast } = useToast();
    const { config } = useAppConfig();
    const { t } = useTranslation('offboard');
    const { t: tToast } = useTranslation('toast');
    const [searchEmail, setSearchEmail] = useState('');
    const [activeUser, setActiveUser] = useState<any | null>(null);
    const [loadingSearch, setLoadingSearch] = useState(false);
    const [error, setError] = useState('');
    const [forwardingEmail, setForwardingEmail] = useState('');
    const [isRunning, setIsRunning] = useState(false);

    const [orgUnits, setOrgUnits] = useState<{ orgUnitId: string; orgUnitPath: string }[]>([]);
    const [selectedOrgUnit, setSelectedOrgUnit] = useState('/Suspended');

    const [steps, setSteps] = useState<OffboardStep[]>([
        { id: 'org_unit', icon: <Building2 size={20} />, status: 'pending', enabled: false },
        { id: 'suspend', icon: <ShieldOff size={20} />, status: 'pending', enabled: true },
        { id: 'groups', icon: <UserX size={20} />, status: 'pending', enabled: true },
        { id: 'reset_pwd', icon: <KeyRound size={20} />, status: 'pending', enabled: true },
        { id: 'forward', icon: <Forward size={20} />, status: 'pending', enabled: false },
        { id: 'directory', icon: <BookX size={20} />, status: 'pending', enabled: true },
    ]);

    const resetSteps = () => {
        setSteps(prev => prev.map(s => ({ ...s, status: 'pending', errorMessage: undefined })));
        setIsRunning(false);
        setSelectedOrgUnit('/Suspended');
    };

    const handleSearch = async () => {
        if (!searchEmail.trim()) return;
        setLoadingSearch(true);
        setError('');
        setActiveUser(null);
        resetSteps();
        setForwardingEmail('');
        try {
            const res = await adminApi.getUser(searchEmail.trim());
            if (res.success && res.user) {
                setActiveUser(res.user);
                const ouRes = await adminApi.getOrgUnits();
                if (ouRes.success && ouRes.orgUnits) {
                    setOrgUnits(ouRes.orgUnits);
                    const currentOU = res.user.orgUnitPath || '/';
                    setSelectedOrgUnit(currentOU === '/' ? '/Suspended' : currentOU);
                }
            } else {
                setError(res.error || t('search.userNotFound'));
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoadingSearch(false);
        }
    };

    const toggleStep = (id: StepId) => {
        if (isRunning) return;
        setSteps(prev => prev.map(s =>
            s.id === id ? { ...s, enabled: !s.enabled } : s
        ));
    };

    const updateStepStatus = (id: StepId, status: OffboardStep['status'], errorMessage?: string) => {
        setSteps(prev => prev.map(s =>
            s.id === id ? { ...s, status, errorMessage } : s
        ));
    };

    const executeStep = async (stepId: StepId): Promise<boolean> => {
        if (!activeUser) return false;
        updateStepStatus(stepId, 'running');

        try {
            switch (stepId) {
                case 'suspend': {
                    const res = await adminApi.suspendUser(activeUser.primaryEmail);
                    if (!res.success) throw new Error(res.error || t('errors.suspend'));
                    setActiveUser({ ...activeUser, suspended: true });
                    break;
                }
                case 'groups': {
                    const groupsRes = await adminApi.getUserGroups(activeUser.primaryEmail);
                    if (!groupsRes.success || !groupsRes.groups) throw new Error(groupsRes.error || t('errors.groupsList'));
                    let removed = 0;
                    for (const group of groupsRes.groups) {
                        try {
                            await adminApi.removeUserFromGroup(activeUser.primaryEmail, group.id);
                            removed++;
                        } catch { /* tek grup hatası atlansın */ }
                    }
                    addToast(tToast('offboard.groupsRemoved', { count: removed }), 'info');
                    break;
                }
                case 'reset_pwd': {
                    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*';
                    const password = Array.from({ length: 24 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
                    const res = await adminApi.updateUser(activeUser.primaryEmail, {
                        password, changePasswordAtNextLogin: true,
                    } as any);
                    if (!res.success) throw new Error(res.error || t('errors.passwordReset'));
                    break;
                }
                case 'forward': {
                    if (!forwardingEmail.trim()) throw new Error(t('errors.forwardingMissing'));
                    const res = await adminApi.setEmailForwarding(activeUser.primaryEmail, forwardingEmail.trim());
                    if (!res.success) throw new Error(res.error || t('errors.forwardingFailed'));
                    break;
                }
                case 'directory': {
                    const res = await adminApi.updateUser(activeUser.primaryEmail, {
                        includeInGlobalAddressList: false,
                    } as any);
                    if (!res.success) throw new Error(res.error || t('errors.directoryFailed'));
                    break;
                }
                case 'org_unit': {
                    if (!selectedOrgUnit) throw new Error(t('errors.orgUnitMissing'));
                    const res = await adminApi.updateUser(activeUser.primaryEmail, {
                        orgUnitPath: selectedOrgUnit,
                    } as any);
                    if (!res.success) throw new Error(res.error || t('errors.orgUnitFailed'));
                    setActiveUser({ ...activeUser, orgUnitPath: selectedOrgUnit });
                    break;
                }
            }
            updateStepStatus(stepId, 'done');
            return true;
        } catch (e: any) {
            updateStepStatus(stepId, 'error', e.message);
            return false;
        }
    };

    const handleRunAll = async () => {
        const enabledSteps = steps.filter(s => s.enabled && s.status !== 'done');
        if (enabledSteps.length === 0) return;

        const forwardStep = enabledSteps.find(s => s.id === 'forward');
        if (forwardStep && !forwardingEmail.trim()) {
            addToast(tToast('offboard.forwardingMissing'), 'warning');
            return;
        }

        const orgUnitStep = enabledSteps.find(s => s.id === 'org_unit');
        if (orgUnitStep && !selectedOrgUnit.trim()) {
            addToast(tToast('offboard.orgUnitMissing'), 'warning');
            return;
        }

        setIsRunning(true);
        let allSuccess = true;

        for (const step of enabledSteps) {
            const success = await executeStep(step.id);
            if (!success) {
                allSuccess = false;
                break;
            }
        }

        setIsRunning(false);
        if (allSuccess) {
            addToast(tToast('offboard.allCompleted'), 'success');
        }
    };

    const completedCount = steps.filter(s => s.status === 'done').length;
    const enabledCount = steps.filter(s => s.enabled).length;
    const progress = enabledCount > 0 ? Math.round((completedCount / enabledCount) * 100) : 0;
    const allDone = enabledCount > 0 && completedCount === enabledCount;
    const hasError = steps.some(s => s.status === 'error');

    const statusColors = {
        pending: 'bg-surface-container-high text-on-surface-variant border-outline-variant/30',
        running: 'bg-eth-primary-container/10 text-eth-primary border-eth-primary-container/30',
        done: 'bg-eth-secondary/10 text-eth-secondary border-eth-secondary/30',
        error: 'bg-eth-danger/10 text-eth-danger border-eth-danger/30',
    };

    return (
        <div className="p-6 max-w-3xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-on-surface">{t('title')}</h1>
                    <p className="text-on-surface-variant mt-1">{t('subtitle')}</p>
                </div>
                <HelpGuide namespace="offboard" />
            </div>

            <div className="bg-surface-container p-5 rounded-xl shadow-sm border border-outline-variant/30">
                <label className="block text-sm font-medium text-on-surface mb-2">
                    {t('search.label')}
                </label>
                <div className="flex gap-3">
                    <div className="relative flex-1">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                        <input
                            type="text"
                            className="w-full pl-10 pr-4 py-2.5 border border-outline-variant/30 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-eth-primary-container/40 transition-colors"
                            placeholder={t('search.placeholder', { domain: config.allowedDomain || 'example.com' })}
                            value={searchEmail}
                            onChange={e => setSearchEmail(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSearch()}
                            disabled={isRunning}
                        />
                    </div>
                    <button
                        onClick={handleSearch}
                        disabled={loadingSearch || !searchEmail.trim() || isRunning}
                        className="px-5 py-2.5 bg-surface-container-lowest text-white rounded-lg hover:bg-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
                    >
                        {loadingSearch ? (
                            <Loader2 size={18} className="animate-spin" />
                        ) : (
                            <Search size={18} />
                        )}
                        {t('search.button')}
                    </button>
                </div>

                <AnimatePresence>
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            className="mt-3 p-3 bg-eth-danger/10 text-eth-danger rounded-lg text-sm flex items-center gap-2"
                        >
                            <AlertTriangle size={16} />
                            {error}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <AnimatePresence>
                {activeUser && (
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 16 }}
                        className="space-y-5"
                    >
                        <div className="bg-surface-container rounded-xl shadow-sm border border-outline-variant/30 p-5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant font-bold text-lg">
                                        {activeUser.name?.givenName?.[0] || '?'}{activeUser.name?.familyName?.[0] || ''}
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-semibold text-on-surface">
                                            {activeUser.name?.fullName}
                                        </h2>
                                        <p className="text-sm text-on-surface-variant">{activeUser.primaryEmail}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    {activeUser.suspended ? (
                                        <span className="px-2.5 py-1 bg-eth-danger/15 text-eth-danger text-xs rounded-full font-medium">
                                            {t('user.suspended')}
                                        </span>
                                    ) : (
                                        <span className="px-2.5 py-1 bg-eth-secondary/15 text-eth-secondary text-xs rounded-full font-medium">
                                            {t('user.active')}
                                        </span>
                                    )}
                                    <button
                                        onClick={() => navigate(`/users/${activeUser.id}`)}
                                        className="text-sm text-eth-primary hover:text-eth-primary flex items-center gap-1 transition-colors"
                                    >
                                        {t('user.profile')} <ChevronRight size={14} />
                                    </button>
                                </div>
                            </div>

                            {enabledCount > 0 && (
                                <div className="mt-4 pt-4 border-t border-outline-variant/30">
                                    <div className="flex justify-between items-center text-xs font-medium text-on-surface-variant mb-1.5">
                                        <span>{t('progress.label')}</span>
                                        <span>{t('progress.completed', { done: completedCount, total: enabledCount })}</span>
                                    </div>
                                    <div className="w-full bg-surface-container-high rounded-full h-2 overflow-hidden">
                                        <motion.div
                                            className={`h-2 rounded-full ${allDone ? 'bg-eth-secondary/100' : hasError ? 'bg-eth-danger/40' : 'bg-eth-primary-container/100'}`}
                                            initial={{ width: 0 }}
                                            animate={{ width: `${progress}%` }}
                                            transition={{ duration: 0.5, ease: 'easeOut' }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="bg-surface-container rounded-xl shadow-sm border border-outline-variant/30 overflow-hidden">
                            <div className="px-5 py-4 border-b border-outline-variant/30">
                                <h3 className="font-semibold text-on-surface">{t('stepsHeading')}</h3>
                                <p className="text-xs text-on-surface-variant mt-0.5">{t('stepsHelper')}</p>
                            </div>

                            <div className="divide-y divide-gray-50">
                                {steps.map((step) => (
                                    <div key={step.id} className="relative">
                                        <div
                                            className={`flex items-center gap-4 px-5 py-4 transition-colors ${
                                                step.status === 'done' ? 'bg-eth-secondary/10/40' :
                                                step.status === 'error' ? 'bg-eth-danger/10/40' :
                                                step.status === 'running' ? 'bg-eth-primary-container/10/30' : ''
                                            }`}
                                        >
                                            <button
                                                onClick={() => toggleStep(step.id)}
                                                disabled={isRunning || step.status === 'done'}
                                                className="shrink-0"
                                            >
                                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                                                    step.status === 'done'
                                                        ? 'bg-eth-secondary/100 border-eth-secondary/40'
                                                        : step.enabled
                                                            ? 'bg-eth-primary-container/100 border-eth-primary-container/40'
                                                            : 'bg-surface-container border-outline-variant/30 hover:border-outline-variant/40'
                                                }`}>
                                                    {(step.enabled || step.status === 'done') && (
                                                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    )}
                                                </div>
                                            </button>

                                            <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${statusColors[step.status]}`}>
                                                {step.status === 'running' ? (
                                                    <Loader2 size={18} className="animate-spin" />
                                                ) : step.status === 'done' ? (
                                                    <CheckCircle2 size={18} />
                                                ) : (
                                                    step.icon
                                                )}
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <h4 className={`text-sm font-medium ${
                                                    !step.enabled && step.status === 'pending' ? 'text-on-surface-variant' :
                                                    step.status === 'done' ? 'text-eth-secondary' :
                                                    step.status === 'error' ? 'text-eth-danger' :
                                                    'text-on-surface'
                                                }`}>
                                                    {t(`steps.${step.id}.label`)}
                                                </h4>
                                                <p className={`text-xs mt-0.5 ${
                                                    !step.enabled && step.status === 'pending' ? 'text-on-surface-variant' : 'text-on-surface-variant'
                                                }`}>
                                                    {t(`steps.${step.id}.description`)}
                                                </p>
                                                {step.status === 'error' && step.errorMessage && (
                                                    <p className="text-xs text-eth-danger mt-1">{step.errorMessage}</p>
                                                )}
                                            </div>

                                            <div className="shrink-0">
                                                {step.status === 'done' && (
                                                    <span className="text-xs font-medium text-eth-secondary">{t('stepStatus.done')}</span>
                                                )}
                                                {step.status === 'error' && (
                                                    <span className="text-xs font-medium text-eth-danger">{t('stepStatus.error')}</span>
                                                )}
                                                {step.status === 'running' && (
                                                    <span className="text-xs font-medium text-eth-primary">{t('stepStatus.running')}</span>
                                                )}
                                            </div>
                                        </div>

                                        <AnimatePresence>
                                            {step.id === 'forward' && step.enabled && step.status !== 'done' && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.2 }}
                                                    className="overflow-hidden"
                                                >
                                                    <div className="px-5 pb-4 pl-[4.5rem]">
                                                        <label className="block text-xs font-medium text-on-surface-variant mb-1">
                                                            {t('forwardingLabel')}
                                                        </label>
                                                        <input
                                                            type="email"
                                                            className="w-full max-w-sm px-3 py-2 text-sm border border-outline-variant/30 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-eth-primary-container/40 transition-colors"
                                                            placeholder={t('forwardingPlaceholder', { domain: config.allowedDomain || 'example.com' })}
                                                            value={forwardingEmail}
                                                            onChange={e => setForwardingEmail(e.target.value)}
                                                            disabled={isRunning}
                                                        />
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>

                                        <AnimatePresence>
                                            {step.id === 'org_unit' && step.enabled && step.status !== 'done' && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.2 }}
                                                    className="overflow-visible"
                                                >
                                                    <div className="px-5 pb-4 pl-[4.5rem]">
                                                        <label className="block text-xs font-medium text-on-surface-variant mb-1">
                                                            {t('orgUnitLabel')}
                                                        </label>
                                                        <SearchableSelect
                                                            options={orgUnits.map(ou => ou.orgUnitPath)}
                                                            value={selectedOrgUnit}
                                                            onChange={setSelectedOrgUnit}
                                                            placeholder={t('orgUnitPlaceholder')}
                                                            disabled={isRunning}
                                                            emptyMessage={t('orgUnitEmpty')}
                                                        />
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="text-xs text-on-surface-variant">
                                {allDone && t('allDone')}
                            </div>
                            <div className="flex gap-3">
                                {(hasError || allDone) && (
                                    <button
                                        onClick={resetSteps}
                                        className="px-4 py-2.5 bg-surface-container border border-outline-variant/30 text-on-surface rounded-lg hover:bg-surface-container-low transition-colors text-sm font-medium flex items-center gap-2"
                                    >
                                        <RotateCcw size={16} />
                                        {t('reset')}
                                    </button>
                                )}
                                <button
                                    onClick={handleRunAll}
                                    disabled={isRunning || enabledCount === 0 || allDone}
                                    className="px-6 py-2.5 bg-surface-container-lowest text-white rounded-lg hover:bg-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2"
                                >
                                    {isRunning ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" />
                                            {t('running')}
                                        </>
                                    ) : hasError ? (
                                        t('resume')
                                    ) : (
                                        t('start')
                                    )}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
