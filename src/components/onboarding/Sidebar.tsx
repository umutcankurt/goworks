import { useTranslation } from 'react-i18next';
import { type OnboardingStep, ONBOARDING_STEP_ORDER } from './steps';
import { StepCircle } from '../ui/StepCircle';

interface SidebarProps {
    current: OnboardingStep;
}

const STEP_LABEL_KEYS: Record<OnboardingStep, string> = {
    welcome: 'stepNav.welcome',
    terms: 'stepNav.terms',
    branding: 'stepNav.branding',
    cloud: 'stepNav.cloud',
    'master-password': 'stepNav.masterPassword',
    'service-account': 'stepNav.serviceAccount',
    'admin-login': 'stepNav.adminLogin',
    dwd: 'stepNav.dwd',
    completion: 'stepNav.completion',
};

export function Sidebar({ current }: SidebarProps) {
    const { t } = useTranslation('onboarding');
    const currentIndex = ONBOARDING_STEP_ORDER.indexOf(current);

    return (
        <aside className="hidden md:flex md:flex-col fixed left-0 top-0 h-screen w-[280px] bg-surface-container-low eth-glow-cyan-ambient border-r border-white/5 p-6">
            <div className="mb-8">
                <div className="text-2xl font-bold text-eth-primary tracking-tight">
                    {t('header.appTitle')}
                </div>
                <div className="mt-1 text-xs text-on-surface-variant">
                    {t('header.appSubtitle')}
                </div>
            </div>

            <nav className="flex-1 space-y-1.5">
                {ONBOARDING_STEP_ORDER.map((step, idx) => {
                    const state =
                        idx < currentIndex
                            ? 'completed'
                            : idx === currentIndex
                            ? 'active'
                            : 'inactive';
                    return (
                        <StepCircle
                            key={step}
                            state={state}
                            index={idx + 1}
                            label={t(STEP_LABEL_KEYS[step])}
                        />
                    );
                })}
            </nav>

            <div className="mt-6 pt-4 border-t border-white/5 text-[10px] text-on-surface-variant opacity-60">
                GoWorks · v0.7
            </div>
        </aside>
    );
}
