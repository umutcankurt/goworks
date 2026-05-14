export type SupportedLanguage = 'tr' | 'en';

export const LANGUAGES: { code: SupportedLanguage; label: string }[] = [
    { code: 'tr', label: 'TR' },
    { code: 'en', label: 'EN' },
];

export const DEFAULT_LANGUAGE: SupportedLanguage = 'tr';

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
    return value === 'tr' || value === 'en';
}
