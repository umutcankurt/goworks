import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { SupportedLanguage } from './types';

const INTL_LOCALE: Record<SupportedLanguage, string> = {
    tr: 'tr-TR',
    en: 'en-US',
};

function resolveLocale(lng: string): string {
    if (lng === 'en') return INTL_LOCALE.en;
    return INTL_LOCALE.tr;
}

function toDate(value: Date | string | number | null | undefined): Date | null {
    if (value === null || value === undefined) return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

export function useLocaleFormat() {
    const { i18n } = useTranslation();
    const locale = resolveLocale(i18n.language);

    return useMemo(
        () => ({
            locale,

            formatDate(value: Date | string | number | null | undefined): string {
                const d = toDate(value);
                if (!d) return '';
                return new Intl.DateTimeFormat(locale, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                }).format(d);
            },

            formatDateTime(value: Date | string | number | null | undefined): string {
                const d = toDate(value);
                if (!d) return '';
                return new Intl.DateTimeFormat(locale, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                }).format(d);
            },

            formatNumber(value: number | null | undefined): string {
                if (value === null || value === undefined || Number.isNaN(value)) return '';
                return new Intl.NumberFormat(locale).format(value);
            },
        }),
        [locale],
    );
}
