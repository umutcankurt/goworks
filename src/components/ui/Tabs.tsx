import { ReactNode, createContext, useContext, useId } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';

interface TabsContextValue {
    value: string;
    onChange: (value: string) => void;
    layoutId: string;
}

const TabsContext = createContext<TabsContextValue | undefined>(undefined);

interface TabsProps {
    value: string;
    onChange: (value: string) => void;
    children: ReactNode;
    className?: string;
}

export function Tabs({ value, onChange, children, className }: TabsProps) {
    const layoutId = useId();
    return (
        <TabsContext.Provider value={{ value, onChange, layoutId }}>
            <div className={className}>{children}</div>
        </TabsContext.Provider>
    );
}

interface TabListProps {
    children: ReactNode;
    className?: string;
    'aria-label'?: string;
}

export function TabList({ children, className, ...rest }: TabListProps) {
    return (
        <div
            role="tablist"
            aria-label={rest['aria-label']}
            className={clsx(
                'inline-flex items-center gap-1 rounded-full bg-surface-container-high eth-border-ghost p-1',
                className,
            )}
        >
            {children}
        </div>
    );
}

interface TabProps {
    value: string;
    children: ReactNode;
    disabled?: boolean;
    className?: string;
    icon?: ReactNode;
}

export function Tab({ value, children, disabled, className, icon }: TabProps) {
    const ctx = useContext(TabsContext);
    if (!ctx) throw new Error('Tab must be used within Tabs');
    const isActive = ctx.value === value;

    return (
        <button
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${value}`}
            id={`tab-${value}`}
            disabled={disabled}
            onClick={() => ctx.onChange(value)}
            className={clsx(
                'relative inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-eth-primary-container/60',
                isActive
                    ? 'text-on-eth-primary-container'
                    : 'text-on-surface-variant hover:text-on-surface',
                disabled && 'opacity-50 cursor-not-allowed',
                className,
            )}
        >
            {isActive && (
                <motion.span
                    layoutId={`tabs-pill-${ctx.layoutId}`}
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    className="absolute inset-0 rounded-full bg-eth-primary-container shadow-sm"
                    aria-hidden
                />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">
                {icon}
                {children}
            </span>
        </button>
    );
}

interface TabPanelProps {
    value: string;
    children: ReactNode;
    className?: string;
}

export function TabPanel({ value, children, className }: TabPanelProps) {
    const ctx = useContext(TabsContext);
    if (!ctx) throw new Error('TabPanel must be used within Tabs');
    if (ctx.value !== value) return null;
    return (
        <div
            role="tabpanel"
            id={`tabpanel-${value}`}
            aria-labelledby={`tab-${value}`}
            className={className}
        >
            {children}
        </div>
    );
}
