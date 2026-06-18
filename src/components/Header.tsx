import React from 'react';
import { User, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { useAuth } from '../contexts/AuthContext';
import { useSession } from '../contexts/SessionContext';
import { useAppConfig } from '../contexts/AppConfigContext';
import { LanguageSwitch } from './LanguageSwitch';
import { ThemeToggle } from './ThemeToggle';

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Wrapped in React.memo to avoid re-rendering on every route change triggered by
// AppLayout's useLocation; the session timer still updates via its own context.
export const Header = React.memo(function Header() {
    const { user } = useAuth();
    const { remainingSeconds } = useSession();
    const { config } = useAppConfig();
    const { t } = useTranslation('header');

    const isWarning = remainingSeconds <= 300; // 5 minutes

    return (
        <header className="h-16 flex items-center justify-between px-8 bg-surface-container-low/60 backdrop-blur-md border-b border-outline-variant/30 z-10">
            <h2 className="text-xl font-bold tracking-tight text-on-surface">
                {config.companyName ? `${config.companyName} ${t('titleSuffix')}` : t('fallbackTitle')}
            </h2>

            <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-3 cursor-pointer hover:bg-surface-container-high p-1.5 pr-3 rounded-full transition-colors">
                    <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center bg-eth-primary-container/15 text-eth-primary border border-eth-primary-container/30">
                        {user?.picture ? (
                            <img src={user.picture} alt={user.name} className="w-full h-full object-cover" />
                        ) : (
                            <User size={16} strokeWidth={2.5} />
                        )}
                    </div>
                    <span className="text-sm font-semibold text-on-surface">
                        {user?.name || t('userPlaceholder')}
                    </span>
                </div>

                <div
                    className={clsx(
                        'flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium border transition-colors',
                        isWarning
                            ? 'bg-eth-danger/10 text-eth-danger border-eth-danger/30 animate-pulse'
                            : 'bg-surface-container-high text-on-surface-variant eth-border-ghost-soft',
                    )}
                >
                    <Clock size={13} strokeWidth={2} />
                    <span>{formatTime(remainingSeconds)}</span>
                </div>

                <ThemeToggle variant="ethereal" />
                <LanguageSwitch variant="ethereal" />
            </div>
        </header>
    );
});
