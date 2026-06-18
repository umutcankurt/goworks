import React from 'react';
import { LayoutDashboard, Users, UsersRound, UserPlus, UserMinus, Settings, LogOut, BarChart2, FileSpreadsheet, PenTool, ClipboardList, ShieldCheck } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useAppConfig } from '../contexts/AppConfigContext';

const NAV_ITEMS = [
    { to: '/', icon: LayoutDashboard, key: 'dashboard' as const },
    { to: '/users', icon: Users, key: 'users' as const },
    { to: '/new-user', icon: UserPlus, key: 'newUser' as const },
    { to: '/groups', icon: UsersRound, key: 'groups' as const },
    { to: '/bulk-operations', icon: FileSpreadsheet, key: 'bulkOperations' as const },
    { to: '/job-history', icon: ClipboardList, key: 'jobHistory' as const },
    { to: '/offboard', icon: UserMinus, key: 'offboard' as const },
    { to: '/reports', icon: BarChart2, key: 'reports' as const },
    { to: '/signature-templates', icon: PenTool, key: 'signatures' as const },
    { to: '/signature-audit', icon: ShieldCheck, key: 'signatureAudit' as const },
    { to: '/settings', icon: Settings, key: 'settings' as const },
];

// Wrapped in React.memo to eliminate the navigation subtree re-render on every
// route change (AppLayout re-renders via useLocation). Active NavLink states
// still update independently.
export const Sidebar = React.memo(function Sidebar() {
    const { logout } = useAuth();
    const { effectiveSidebarAbbr, logoDataUrl } = useAppConfig();
    const navigate = useNavigate();
    const { t } = useTranslation('sidebar');

    return (
        <aside className="w-64 bg-surface-container-lowest text-on-surface-variant flex flex-col h-screen eth-glow-cyan-ambient z-20">
            {logoDataUrl?.startsWith('data:') ? (
                /* Logo present: consistent centered tile — abbreviation hidden */
                <div className="px-4 pt-4 pb-3">
                    <div className="h-24 flex items-center justify-center">
                        <img
                            src={logoDataUrl}
                            alt={t('logoAlt')}
                            className="max-h-full max-w-full object-contain rounded-[5px]"
                        />
                    </div>
                    <h1 className="mt-2 text-xl font-bold text-on-surface tracking-tight text-center">GoWorks</h1>
                </div>
            ) : (
                /* No logo: centered abbreviation badge + title */
                <div className="p-6 flex flex-col items-center gap-2">
                    <div className="w-10 h-10 bg-eth-primary-container rounded-lg flex items-center justify-center text-on-eth-primary-container font-bold eth-glow-cyan">
                        {effectiveSidebarAbbr}
                    </div>
                    <h1 className="text-xl font-bold text-on-surface tracking-tight">GoWorks</h1>
                </div>
            )}

            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                {NAV_ITEMS.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                            clsx(
                                'flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium',
                                isActive
                                    ? 'bg-eth-primary-container/15 text-eth-primary eth-glow-cyan-led border border-eth-primary-container/30'
                                    : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                            )
                        }
                    >
                        <item.icon size={20} className="shrink-0" />
                        <span>{t(`nav.${item.key}`)}</span>
                    </NavLink>
                ))}
            </nav>

            <div className="p-4 border-t border-outline-variant/30">
                <button
                    onClick={() => { logout(); navigate('/login'); }}
                    className="flex items-center space-x-3 text-on-surface-variant hover:text-eth-danger w-full px-4 py-3 rounded-xl hover:bg-surface-container-high transition-colors font-medium"
                >
                    <LogOut size={20} className="shrink-0" />
                    <span>{t('logout')}</span>
                </button>
            </div>
        </aside>
    );
});
