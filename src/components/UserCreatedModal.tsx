import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, Copy, Check, Eye, EyeOff, XCircle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface GroupStatus {
    name: string;
    status: 'pending' | 'success' | 'failed';
}

interface UserCreatedModalProps {
    isOpen: boolean;
    onClose: () => void;
    onEdit: () => void;
    userData: {
        fullName: string;
        primaryEmail: string;
        password: string;
        phone: string;
        institution: string;
        jobTitle: string;
    };
    groups: GroupStatus[];
    groupsLoading: boolean;
    signatureStatus: 'pending' | 'success' | 'failed' | 'skipped';
}

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
    const [copied, setCopied] = useState(false);
    const { t } = useTranslation('newUser');

    const handleCopy = async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button
            type="button"
            onClick={handleCopy}
            className="p-1 text-on-surface-variant hover:text-on-surface-variant transition-colors rounded"
            title={t('createdModal.copy')}
        >
            {copied ? <Check className="w-4 h-4 text-eth-secondary" /> : <Copy className="w-4 h-4" />}
        </button>
    );
};

export const UserCreatedModal: React.FC<UserCreatedModalProps> = ({
    isOpen,
    onClose,
    onEdit,
    userData,
    groups,
    groupsLoading,
    signatureStatus,
}) => {
    const [showPassword, setShowPassword] = useState(false);
    const { t } = useTranslation('newUser');

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown);
            return () => document.removeEventListener('keydown', handleKeyDown);
        }
    }, [isOpen, onClose]);

    const infoRows = [
        { label: t('createdModal.fields.fullName'), value: userData.fullName },
        { label: t('createdModal.fields.email'), value: userData.primaryEmail, copyable: true },
        { label: t('createdModal.fields.phone'), value: userData.phone },
        { label: t('createdModal.fields.jobTitle'), value: userData.jobTitle },
        { label: t('createdModal.fields.institution'), value: userData.institution },
    ].filter(row => row.value);

    const visibleGroups = groups.length > 5 ? groups.slice(0, 5) : groups;
    const remainingCount = groups.length > 5 ? groups.length - 5 : 0;

    const groupBadgeClass = (status: GroupStatus['status']) => {
        switch (status) {
            case 'pending':
                return 'bg-surface-container-high text-on-surface-variant animate-pulse';
            case 'success':
                return 'bg-eth-primary-container/10 text-eth-primary border border-eth-primary-container/30';
            case 'failed':
                return 'bg-eth-danger/10 text-eth-danger border border-eth-danger/30';
        }
    };

    const groupIcon = (status: GroupStatus['status']) => {
        switch (status) {
            case 'pending':
                return <Loader2 className="w-3 h-3 animate-spin" />;
            case 'success':
                return <CheckCircle className="w-3 h-3" />;
            case 'failed':
                return <XCircle className="w-3 h-3" />;
        }
    };

    const signatureBadge = () => {
        switch (signatureStatus) {
            case 'pending':
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm animate-pulse bg-surface-container-highest text-on-surface-variant">
                        <Loader2 className="w-3 h-3 animate-spin" /> {t('createdModal.signatureStatus.pending')}
                    </span>
                );
            case 'success':
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm bg-eth-secondary/15 text-eth-secondary">
                        <CheckCircle className="w-3 h-3" /> {t('createdModal.signatureStatus.success')}
                    </span>
                );
            case 'failed':
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm bg-amber-500/100/15 text-amber-500">
                        <XCircle className="w-3 h-3" /> {t('createdModal.signatureStatus.failed')}
                    </span>
                );
            case 'skipped':
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm bg-surface-container-high text-on-surface-variant">
                        {t('createdModal.signatureStatus.skipped')}
                    </span>
                );
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className="fixed inset-0 z-50 flex items-center justify-center"
                    style={{ left: '16rem' }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                >
                    {/* Backdrop: purely visual overlay — hidden from screen readers;
                        keyboard dismissal is handled by the modal-level Escape handler. */}
                    <div
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                        onClick={onClose}
                        aria-hidden="true"
                        role="presentation"
                    />

                    <motion.div
                        className="relative bg-surface-container rounded-2xl shadow-2xl border border-outline-variant/30 p-8 max-w-lg w-full max-h-[85vh] overflow-y-auto mx-4"
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    >
                        <div className="flex items-center gap-3 mb-6">
                            <div className="flex-shrink-0 w-10 h-10 bg-eth-secondary/15 rounded-full flex items-center justify-center">
                                <CheckCircle className="w-6 h-6 text-eth-secondary" />
                            </div>
                            <h2 className="text-xl font-bold text-on-surface">
                                {t('createdModal.title')}
                            </h2>
                        </div>

                        <div className="space-y-3 mb-6">
                            {infoRows.map(row => (
                                <div key={row.label} className="flex items-center">
                                    <span className="text-sm text-on-surface-variant w-28 flex-shrink-0">{row.label}</span>
                                    <span className="text-on-surface font-medium text-sm">{row.value}</span>
                                    {row.copyable && <CopyButton text={row.value} />}
                                </div>
                            ))}

                            <div className="flex items-center">
                                <span className="text-sm text-on-surface-variant w-28 flex-shrink-0">{t('createdModal.fields.password')}</span>
                                <span className="text-on-surface font-medium text-sm font-mono">
                                    {showPassword ? userData.password : '•'.repeat(8)}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="p-1 text-on-surface-variant hover:text-on-surface-variant transition-colors rounded ml-1"
                                    title={showPassword ? t('createdModal.hidePassword') : t('createdModal.showPassword')}
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                                <CopyButton text={userData.password} />
                            </div>
                        </div>

                        {groups.length > 0 && (
                            <div className="mb-6">
                                <h3 className="text-sm font-semibold text-on-surface mb-2">{t('createdModal.groups')}</h3>
                                <div className="flex flex-wrap gap-2">
                                    <AnimatePresence mode="popLayout">
                                        {visibleGroups.map(g => (
                                            <motion.span
                                                key={g.name}
                                                layout
                                                initial={{ opacity: 0, scale: 0.8 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${groupBadgeClass(g.status)}`}
                                            >
                                                {groupIcon(g.status)}
                                                {g.name}
                                            </motion.span>
                                        ))}
                                    </AnimatePresence>
                                    {remainingCount > 0 && (
                                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-surface-container-high text-on-surface-variant">
                                            {t('createdModal.moreGroups', { count: remainingCount })}
                                        </span>
                                    )}
                                    {groupsLoading && groups.every(g => g.status === 'pending') && (
                                        <div className="flex gap-2">
                                            {[1, 2].map(i => (
                                                <div key={i} className="h-6 w-24 animate-pulse bg-surface-container-highest rounded-full" />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {signatureStatus !== 'skipped' && (
                            <div className="mb-6">
                                <h3 className="text-sm font-semibold text-on-surface mb-2">{t('createdModal.signature')}</h3>
                                {signatureBadge()}
                            </div>
                        )}

                        <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant/30">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-5 py-2 border border-outline-variant/30 text-on-surface rounded-lg hover:bg-surface-container-low transition-colors font-medium text-sm"
                            >
                                {t('createdModal.close')}
                            </button>
                            <button
                                type="button"
                                onClick={onEdit}
                                className="px-5 py-2 bg-eth-primary-container text-on-eth-primary-container rounded-lg hover:brightness-110 transition-colors font-medium text-sm"
                            >
                                {t('createdModal.edit')}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
