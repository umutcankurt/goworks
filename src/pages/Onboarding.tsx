import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppConfig } from '../contexts/AppConfigContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { OnboardingShell } from '../components/onboarding/OnboardingShell';
import {
    ONBOARDING_STEP_ORDER,
    type OnboardingStep,
    WelcomeStep,
    BrandingStep,
    CloudProjectStep,
    ServiceAccountStep,
    DwdStep,
    AdminLoginStep,
    CompletionStep,
} from '../components/onboarding/steps';
import type { ServiceAccountStatus } from '../services/server-api';

export function Onboarding() {
    const { config, isLoading, setConfig } = useAppConfig();
    const { isAuthenticated } = useAuth();
    const { addToast } = useToast();
    const { t } = useTranslation('onboarding');

    // Resume-from-where-left-off: if the step in the DB is not null, start from there.
    // Only used on the first mount; subsequent updates go through local state.
    const initialStep = useMemo<OnboardingStep>(
        () => (config.onboardingStep ?? 'welcome'),
        [],
    );
    const [step, setStep] = useState<OnboardingStep>(initialStep);

    // Per-step "enable the next button" signals
    const [brandingValid, setBrandingValid] = useState(false);
    const [cloudCredentialsValid, setCloudCredentialsValid] = useState(false);
    const [serviceAccountStatus, setServiceAccountStatus] = useState<ServiceAccountStatus | null>(null);
    const [dwdVerified, setDwdVerified] = useState(false);

    useEffect(() => {
        // As the step changes, write it to the DB for resume-from-where-left-off.
        // Except welcome (default start) and completion (final step, completion handled here).
        if (step === 'welcome' || step === 'completion') return;
        setConfig('onboardingStep', step).catch(() => {
            // Silent: even if persisting fails, let the flow continue.
        });
    }, [step, setConfig]);

    // While on the admin-login step, automatically advance to the DWD step once the user logs in.
    useEffect(() => {
        if (step === 'admin-login' && isAuthenticated) {
            setStep('dwd');
        }
    }, [step, isAuthenticated]);

    const idx = ONBOARDING_STEP_ORDER.indexOf(step);
    const goBack = () => {
        if (idx > 0) setStep(ONBOARDING_STEP_ORDER[idx - 1]);
    };
    const goNext = () => {
        if (idx < ONBOARDING_STEP_ORDER.length - 1) {
            setStep(ONBOARDING_STEP_ORDER[idx + 1]);
        }
    };

    if (isLoading) {
        return (
            <div className="eth-app flex min-h-screen items-center justify-center">
                <div className="text-on-surface-variant text-sm">{t('serviceAccount.checking')}</div>
            </div>
        );
    }

    let canGoNext = false;
    let stepNode: React.ReactNode = null;

    switch (step) {
        case 'welcome':
            canGoNext = true;
            stepNode = <WelcomeStep onStart={goNext} />;
            break;
        case 'branding':
            canGoNext = brandingValid;
            stepNode = <BrandingStep onValidChange={setBrandingValid} />;
            break;
        case 'cloud':
            canGoNext = cloudCredentialsValid;
            stepNode = <CloudProjectStep onValidChange={setCloudCredentialsValid} />;
            break;
        case 'service-account':
            canGoNext = !!serviceAccountStatus?.configured;
            stepNode = <ServiceAccountStep onStatusChange={setServiceAccountStatus} />;
            break;
        case 'dwd':
            canGoNext = dwdVerified;
            stepNode = (
                <DwdStep
                    onTestSuccess={() => setDwdVerified(true)}
                    onSkip={goNext}
                />
            );
            break;
        case 'admin-login':
            canGoNext = false;
            stepNode = <AdminLoginStep />;
            break;
        case 'completion':
            canGoNext = false;
            stepNode = <CompletionStep dwdVerified={dwdVerified} />;
            break;
    }

    const handleNext = () => {
        if (step === 'branding' && !brandingValid) {
            addToast(t('errors.needBranding'), 'error');
            return;
        }
        if (step === 'cloud' && !cloudCredentialsValid) {
            addToast(t('errors.needCredentials'), 'error');
            return;
        }
        if (step === 'service-account' && !serviceAccountStatus?.configured) {
            addToast(t('errors.needServiceAccount'), 'error');
            return;
        }
        if (step === 'dwd' && !dwdVerified) {
            addToast(t('errors.needDwdTest'), 'error');
            return;
        }
        goNext();
    };

    return (
        <OnboardingShell
            step={step}
            canGoNext={canGoNext}
            onBack={goBack}
            onNext={handleNext}
            showFooter={step !== 'welcome' && step !== 'completion'}
        >
            {stepNode}
        </OnboardingShell>
    );
}
