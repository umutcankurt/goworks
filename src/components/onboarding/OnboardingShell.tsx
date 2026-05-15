import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { Footer } from './Footer';
import { type OnboardingStep } from './steps';

interface OnboardingShellProps {
    step: OnboardingStep;
    canGoNext: boolean;
    onBack?: () => void;
    onNext?: () => void;
    /** Welcome step'inde footer ve sayaç gizlenir (intro). */
    showFooter?: boolean;
    children: ReactNode;
}

export function OnboardingShell({
    step,
    canGoNext,
    onBack,
    onNext,
    showFooter = true,
    children,
}: OnboardingShellProps) {
    return (
        <div className="eth-app h-screen overflow-hidden">
            <Sidebar current={step} />

            <div className="flex h-screen flex-col overflow-hidden md:ml-[280px]">
                <Header />

                <main className="flex-1 min-h-0 overflow-hidden px-8 py-4">{children}</main>

                {showFooter && (
                    <Footer
                        current={step}
                        canGoNext={canGoNext}
                        onBack={onBack}
                        onNext={onNext}
                        showCounter={step !== 'welcome'}
                    />
                )}
            </div>
        </div>
    );
}
