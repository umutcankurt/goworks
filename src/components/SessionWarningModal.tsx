import { motion, AnimatePresence } from 'framer-motion';
import { Clock, LogOut } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { useSession } from '../contexts/SessionContext';
import { useAuth } from '../contexts/AuthContext';

export function SessionWarningModal() {
    const { showWarning, remainingSeconds, dismissWarning } = useSession();
    const { logout } = useAuth();
    const { t } = useTranslation('common');

    const formatTime = (seconds: number): string => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return t('session.minutesSeconds', { m, s: s.toString().padStart(2, '0') });
    };

    return (
        <AnimatePresence>
            {showWarning && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center"
                >
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        className="relative bg-surface-container rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4"
                    >
                        <div className="flex flex-col items-center text-center">
                            <div className="w-16 h-16 rounded-full bg-amber-500/15 flex items-center justify-center mb-4">
                                <Clock className="w-8 h-8 text-amber-500" />
                            </div>

                            <h3 className="text-lg font-bold text-on-surface mb-2">
                                {t('session.expiringTitle')}
                            </h3>

                            <p className="text-sm text-on-surface-variant mb-6">
                                <Trans
                                    i18nKey="session.expiringInTemplate"
                                    t={t}
                                    values={{ value: formatTime(remainingSeconds) }}
                                    components={{ b: <span className="font-semibold text-eth-danger" /> }}
                                />
                            </p>

                            <div className="flex gap-3 w-full">
                                <button
                                    onClick={dismissWarning}
                                    className="flex-1 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-xl transition-colors"
                                >
                                    {t('session.extend')}
                                </button>
                                <button
                                    onClick={logout}
                                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-sm font-semibold rounded-xl transition-colors"
                                >
                                    <LogOut size={14} />
                                    {t('session.logout')}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
