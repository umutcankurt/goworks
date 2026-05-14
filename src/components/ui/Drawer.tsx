import { ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import clsx from 'clsx';

type DrawerSide = 'right' | 'left';
type DrawerSize = 'sm' | 'md' | 'lg' | 'xl';

interface DrawerProps {
    open: boolean;
    onClose: () => void;
    title?: ReactNode;
    description?: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
    side?: DrawerSide;
    size?: DrawerSize;
    closeOnOverlayClick?: boolean;
    showCloseButton?: boolean;
    className?: string;
}

const SIZE_CLASSES: Record<DrawerSize, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-xl',
    xl: 'max-w-2xl',
};

export function Drawer({
    open,
    onClose,
    title,
    description,
    children,
    footer,
    side = 'right',
    size = 'md',
    closeOnOverlayClick = true,
    showCloseButton = true,
    className,
}: DrawerProps) {
    useEffect(() => {
        if (!open) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', handleKey);
            document.body.style.overflow = prev;
        };
    }, [open, onClose]);

    if (typeof document === 'undefined') return null;

    const fromX = side === 'right' ? 32 : -32;
    const sidePos = side === 'right' ? 'right-0' : 'left-0';

    return createPortal(
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="fixed inset-0 z-50"
                    onClick={(e) => {
                        if (closeOnOverlayClick && e.target === e.currentTarget) onClose();
                    }}
                >
                    <div
                        className="absolute inset-0 bg-surface/60 backdrop-blur-sm"
                        aria-hidden
                    />
                    <motion.aside
                        role="dialog"
                        aria-modal="true"
                        initial={{ opacity: 0, x: fromX }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: fromX }}
                        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                        className={clsx(
                            'absolute top-0 h-full w-full eth-glass shadow-xl flex flex-col',
                            sidePos,
                            SIZE_CLASSES[size],
                            className,
                        )}
                    >
                        {(title || showCloseButton) && (
                            <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3 border-b border-outline-variant/30">
                                <div className="min-w-0">
                                    {title && (
                                        <h2 className="text-lg font-semibold tracking-tight text-on-surface">
                                            {title}
                                        </h2>
                                    )}
                                    {description && (
                                        <p className="mt-1 text-sm text-on-surface-variant">
                                            {description}
                                        </p>
                                    )}
                                </div>
                                {showCloseButton && (
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        aria-label="Close"
                                        className="rounded-md p-1 text-on-surface-variant hover:text-on-surface hover:bg-on-surface/5 transition-colors"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                        )}
                        <div className="flex-1 overflow-y-auto px-6 py-4 text-sm text-on-surface">
                            {children}
                        </div>
                        {footer && (
                            <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-outline-variant/30">
                                {footer}
                            </div>
                        )}
                    </motion.aside>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body,
    );
}
