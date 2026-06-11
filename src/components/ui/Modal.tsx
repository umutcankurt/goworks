import { ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import clsx from 'clsx';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

interface ModalProps {
    open: boolean;
    onClose: () => void;
    title?: ReactNode;
    description?: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
    size?: ModalSize;
    closeOnOverlayClick?: boolean;
    showCloseButton?: boolean;
    className?: string;
}

const SIZE_CLASSES: Record<ModalSize, string> = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
};

export function Modal({
    open,
    onClose,
    title,
    description,
    children,
    footer,
    size = 'md',
    closeOnOverlayClick = true,
    showCloseButton = true,
    className,
}: ModalProps) {
    const dialogRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKey);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', handleKey);
            document.body.style.overflow = previousOverflow;
        };
    }, [open, onClose]);

    useEffect(() => {
        if (!open) return;
        // Focus the dialog on open — simple focus handling (not a full trap)
        const t = window.setTimeout(() => dialogRef.current?.focus(), 30);
        return () => window.clearTimeout(t);
    }, [open]);

    if (typeof document === 'undefined') return null;

    return createPortal(
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    onClick={(e) => {
                        if (closeOnOverlayClick && e.target === e.currentTarget) onClose();
                    }}
                >
                    <div
                        className="absolute inset-0 bg-surface/70 backdrop-blur-sm"
                        aria-hidden
                    />
                    <motion.div
                        ref={dialogRef}
                        role="dialog"
                        aria-modal="true"
                        tabIndex={-1}
                        initial={{ opacity: 0, scale: 0.96, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 8 }}
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                        className={clsx(
                            'relative w-full eth-glass eth-glow-cyan-panel rounded-xl outline-none',
                            SIZE_CLASSES[size],
                            className,
                        )}
                    >
                        {(title || showCloseButton) && (
                            <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
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
                        <div className="px-6 py-4 text-sm text-on-surface">{children}</div>
                        {footer && (
                            <div className="flex items-center justify-end gap-2 px-6 pb-5 pt-3">
                                {footer}
                            </div>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body,
    );
}
