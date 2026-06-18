export type OnboardingStep =
    | 'welcome'
    | 'terms'
    | 'branding'
    | 'cloud'
    | 'service-account'
    | 'admin-login'
    | 'dwd'
    | 'completion';

export const ONBOARDING_STEP_ORDER: OnboardingStep[] = [
    'welcome',
    'terms',
    'branding',
    'cloud',
    'service-account',
    'admin-login',
    'dwd',
    'completion',
];

export { WelcomeStep } from './WelcomeStep';
export { TermsStep } from './TermsStep';
export { BrandingStep } from './BrandingStep';
export { CloudProjectStep } from './CloudProjectStep';
export { ServiceAccountStep } from './ServiceAccountStep';
export { DwdStep } from './DwdStep';
export { AdminLoginStep } from './AdminLoginStep';
export { CompletionStep } from './CompletionStep';
