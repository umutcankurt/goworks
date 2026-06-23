import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LANGUAGE, isSupportedLanguage, type SupportedLanguage } from './types';

import trCommon from './locales/tr/common.json';
import trHeader from './locales/tr/header.json';
import trSidebar from './locales/tr/sidebar.json';
import trLogin from './locales/tr/login.json';
import trDashboard from './locales/tr/dashboard.json';
import trUsers from './locales/tr/users.json';
import trUserDetail from './locales/tr/userDetail.json';
import trNewUser from './locales/tr/newUser.json';
import trGroups from './locales/tr/groups.json';
import trGroupForm from './locales/tr/groupForm.json';
import trBulk from './locales/tr/bulk.json';
import trOffboard from './locales/tr/offboard.json';
import trJobs from './locales/tr/jobs.json';
import trSignatures from './locales/tr/signatures.json';
import trSignatureAudit from './locales/tr/signatureAudit.json';
import trSettings from './locales/tr/settings.json';
import trValidation from './locales/tr/validation.json';
import trToast from './locales/tr/toast.json';
import trReports from './locales/tr/reports.json';
import trOnboarding from './locales/tr/onboarding.json';
import trLegal from './locales/tr/legal.json';
import trVault from './locales/tr/vault.json';

import enCommon from './locales/en/common.json';
import enHeader from './locales/en/header.json';
import enSidebar from './locales/en/sidebar.json';
import enLogin from './locales/en/login.json';
import enDashboard from './locales/en/dashboard.json';
import enUsers from './locales/en/users.json';
import enUserDetail from './locales/en/userDetail.json';
import enNewUser from './locales/en/newUser.json';
import enGroups from './locales/en/groups.json';
import enGroupForm from './locales/en/groupForm.json';
import enBulk from './locales/en/bulk.json';
import enOffboard from './locales/en/offboard.json';
import enJobs from './locales/en/jobs.json';
import enSignatures from './locales/en/signatures.json';
import enSignatureAudit from './locales/en/signatureAudit.json';
import enSettings from './locales/en/settings.json';
import enValidation from './locales/en/validation.json';
import enToast from './locales/en/toast.json';
import enReports from './locales/en/reports.json';
import enOnboarding from './locales/en/onboarding.json';
import enLegal from './locales/en/legal.json';
import enVault from './locales/en/vault.json';

export const STORAGE_KEY_LANG = 'goworks.lang';

export const NAMESPACES = [
    'common',
    'header',
    'sidebar',
    'login',
    'dashboard',
    'users',
    'userDetail',
    'newUser',
    'groups',
    'groupForm',
    'bulk',
    'offboard',
    'jobs',
    'signatures',
    'signatureAudit',
    'settings',
    'validation',
    'toast',
    'reports',
    'onboarding',
    'legal',
    'vault',
] as const;

const resources = {
    tr: {
        common: trCommon,
        header: trHeader,
        sidebar: trSidebar,
        login: trLogin,
        dashboard: trDashboard,
        users: trUsers,
        userDetail: trUserDetail,
        newUser: trNewUser,
        groups: trGroups,
        groupForm: trGroupForm,
        bulk: trBulk,
        offboard: trOffboard,
        jobs: trJobs,
        signatures: trSignatures,
        signatureAudit: trSignatureAudit,
        settings: trSettings,
        validation: trValidation,
        toast: trToast,
        reports: trReports,
        onboarding: trOnboarding,
        legal: trLegal,
        vault: trVault,
    },
    en: {
        common: enCommon,
        header: enHeader,
        sidebar: enSidebar,
        login: enLogin,
        dashboard: enDashboard,
        users: enUsers,
        userDetail: enUserDetail,
        newUser: enNewUser,
        groups: enGroups,
        groupForm: enGroupForm,
        bulk: enBulk,
        offboard: enOffboard,
        jobs: enJobs,
        signatures: enSignatures,
        signatureAudit: enSignatureAudit,
        settings: enSettings,
        validation: enValidation,
        toast: enToast,
        reports: enReports,
        onboarding: enOnboarding,
        legal: enLegal,
        vault: enVault,
    },
} as const;

function getInitialLanguage(): SupportedLanguage {
    try {
        const stored = localStorage.getItem(STORAGE_KEY_LANG);
        if (isSupportedLanguage(stored)) return stored;
    } catch {
        /* test/SSR guard */
    }
    return DEFAULT_LANGUAGE;
}

i18n.use(initReactI18next).init({
    resources,
    lng: getInitialLanguage(),
    fallbackLng: DEFAULT_LANGUAGE,
    defaultNS: 'common',
    ns: NAMESPACES as unknown as string[],
    interpolation: { escapeValue: false },
    returnNull: false,
});

/**
 * Keep the document's `lang` attribute in sync with the active language. The
 * browser uses it to apply locale-aware CSS `text-transform` — under `lang="tr"`
 * an uppercased "i" becomes the dotted "İ" (not the dotless "I"), so headings
 * like "Hoş geldiniz" render correctly as "HOŞ GELDİNİZ".
 */
function syncHtmlLang(lng: string): void {
    try {
        document.documentElement.lang = lng;
    } catch {
        /* test/SSR guard */
    }
}
syncHtmlLang(i18n.language);
i18n.on('languageChanged', syncHtmlLang);

export default i18n;
