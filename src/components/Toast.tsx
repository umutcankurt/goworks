import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast, type Toast, type ToastType } from '../contexts/ToastContext';

const colorMap: Record<ToastType, string> = {
    success: 'bg-surface-container-highest border-l-4 border-eth-secondary text-on-surface',
    error: 'bg-surface-container-highest border-l-4 border-eth-danger text-on-surface',
    warning: 'bg-surface-container-highest border-l-4 border-yellow-500 text-on-surface',
    info: 'bg-surface-container-highest border-l-4 border-eth-primary text-on-surface',
};

const iconColorMap: Record<ToastType, string> = {
    success: 'text-eth-secondary',
    error: 'text-eth-danger',
    warning: 'text-yellow-600',
    info: 'text-eth-primary',
};

const iconMap: Record<ToastType, string> = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
};

function ToastItem({ toast }: { toast: Toast }) {
    const { dismissToast } = useToast();
    const { t } = useTranslation('common');
    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg text-sm font-medium min-w-[280px] max-w-sm ${colorMap[toast.type]}`}
        >
            <span className={`shrink-0 mt-0.5 font-bold ${iconColorMap[toast.type]}`}>{iconMap[toast.type]}</span>
            <span className="flex-1">{toast.message}</span>
            <button
                onClick={() => dismissToast(toast.id)}
                className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                aria-label={t('close')}
            >
                <X size={14} />
            </button>
        </motion.div>
    );
}

export function ToastContainer() {
    const { toasts } = useToast();
    return (
        <div className="fixed top-20 right-4 z-50 flex flex-col gap-2 pointer-events-none">
            <AnimatePresence mode="popLayout">
                {toasts.map((toast) => (
                    <div key={toast.id} className="pointer-events-auto">
                        <ToastItem toast={toast} />
                    </div>
                ))}
            </AnimatePresence>
        </div>
    );
}
