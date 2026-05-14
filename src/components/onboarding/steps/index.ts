export type OnboardingStep =
    | 'welcome'
    | 'branding'
    | 'cloud'
    | 'service-account'
    | 'admin-login'
    | 'dwd'
    | 'completion';

export const ONBOARDING_STEP_ORDER: OnboardingStep[] = [
    'welcome',
    'branding',
    'cloud',
    'service-account',
    'admin-login',
    'dwd',
    'completion',
];

export { WelcomeStep } from './WelcomeStep';
export { BrandingStep } from './BrandingStep';
export { CloudProjectStep } from './CloudProjectStep';
export { ServiceAccountStep } from './ServiceAccountStep';
export { DwdStep } from './DwdStep';
export { AdminLoginStep } from './AdminLoginStep';
export { CompletionStep } from './CompletionStep';
