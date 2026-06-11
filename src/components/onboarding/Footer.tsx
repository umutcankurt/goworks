import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '../ui/Button';
import { type OnboardingStep, ONBOARDING_STEP_ORDER } from './steps';

interface FooterProps {
    current: OnboardingStep;
    canGoNext: boolean;
    onBack?: () => void;
    onNext?: () => void;
    /** The counter is not rendered on the Welcome step (intro). */
    showCounter?: boolean;
}

export function Footer({ current, canGoNext, onBack, onNext, showCounter = true }: FooterProps) {
    const { t } = useTranslation('onboarding');
    const idx = ONBOARDING_STEP_ORDER.indexOf(current);
    const isFirst = idx <= 0;

    return (
        <footer className="flex items-center justify-between border-t border-white/5 bg-surface-container-low/60 px-8 py-4 backdrop-blur-md">
            <Button
                variant="secondary"
                leftIcon={<ArrowLeft className="h-4 w-4" />}
                onClick={onBack}
                disabled={isFirst}
            >
                {t('footer.back')}
            </Button>

            {showCounter ? (
                <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-on-surface-variant">
                    {t('footer.stepCounter', {
                        current: idx + 1,
                        total: ONBOARDING_STEP_ORDER.length,
                    })}
                </span>
            ) : (
                <span />
            )}

            <Button
                variant="primary"
                rightIcon={<ArrowRight className="h-4 w-4" />}
                onClick={onNext}
                disabled={!canGoNext}
            >
                {t('footer.next')}
            </Button>
        </footer>
    );
}
