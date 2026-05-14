import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast, type Toast, type ToastType } from '../contexts/ToastContext';

const colorMap: Record<ToastType, string> = {
    success: 'bg-eth-secondary/10 border-eth-secondary/30 text-eth-secondary',
    error: 'bg-eth-danger/10 border-eth-danger/30 text-eth-danger',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    info: 'bg-eth-primary-container/10 border-eth-primary-container/30 text-eth-primary',
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
            className={`flex items-start gap-3 px-4 py-3 rounded-lg border shadow-md text-sm font-medium min-w-[280px] max-w-sm ${colorMap[toast.type]}`}
        >
            <span className="shrink-0 mt-0.5 font-bold">{iconMap[toast.type]}</span>
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
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
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
