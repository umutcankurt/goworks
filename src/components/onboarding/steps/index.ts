export type OnboardingStep =
    | 'welcome'
    | 'terms'
    | 'branding'
    | 'cloud'
    | 'master-password'
    | 'service-account'
    | 'admin-login'
    | 'dwd'
    | 'completion';

export const ONBOARDING_STEP_ORDER: OnboardingStep[] = [
    'welcome',
    'terms',
    'branding',
    'cloud',
    // Master password must be set before the first vault write (Service Account).
    'master-password',
    'service-account',
    'admin-login',
    'dwd',
    'completion',
];

export { WelcomeStep } from './WelcomeStep';
export { TermsStep } from './TermsStep';
export { BrandingStep } from './BrandingStep';
export { CloudProjectStep } from './CloudProjectStep';
export { MasterPasswordStep } from './MasterPasswordStep';
export { ServiceAccountStep } from './ServiceAccountStep';
export { DwdStep } from './DwdStep';
export { AdminLoginStep } from './AdminLoginStep';
export { CompletionStep } from './CompletionStep';
