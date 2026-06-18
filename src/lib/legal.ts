// Legal terms / disclaimer constants.
//
// CURRENT_TERMS_VERSION is compared against the persisted `termsVersion`
// (app_config). Bumping it re-prompts users who already accepted an older
// version via the one-time acceptance modal. Use a simple incrementing string.
export const CURRENT_TERMS_VERSION = '1';

function googleLocale(lang: string): 'tr' | 'en' {
    return lang?.startsWith('tr') ? 'tr' : 'en';
}

// GoWorks is multi-tenant: the exact Google Workspace agreement (Business,
// Enterprise, Education, or a reseller contract) depends on each customer's
// subscription and is not exposed via any API. So we never pin a plan-specific
// page — we link general, stable, locale-aware entry points instead, and the
// acceptance copy frames the binding agreement as plan-dependent.
export function googleWorkspaceTermsUrl(lang: string): string {
    return `https://workspace.google.com/intl/${googleLocale(lang)}/terms/standard_terms/`;
}

export function googleTermsOfServiceUrl(lang: string): string {
    return `https://policies.google.com/terms?hl=${googleLocale(lang)}`;
}

export function googleWorkspaceUserFeaturesUrl(lang: string): string {
    return `https://workspace.google.com/intl/${googleLocale(lang)}/terms/user_features/`;
}
