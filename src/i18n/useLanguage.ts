import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppConfig } from '../contexts/AppConfigContext';
import { STORAGE_KEY_LANG } from './index';
import { DEFAULT_LANGUAGE, isSupportedLanguage, type SupportedLanguage } from './types';

interface ElectronLocaleAPI {
    invoke?: (channel: 'app:setLocale', locale: SupportedLanguage) => Promise<unknown>;
}

export function useLanguage() {
    const { i18n } = useTranslation();
    const { setConfig } = useAppConfig();

    const language: SupportedLanguage = isSupportedLanguage(i18n.language)
        ? i18n.language
        : DEFAULT_LANGUAGE;

    const setLanguage = useCallback(
        async (next: SupportedLanguage) => {
            if (next === language) return;

            await i18n.changeLanguage(next);

            try {
                localStorage.setItem(STORAGE_KEY_LANG, next);
            } catch {
                /* private browsing / quota */
            }

            try {
                await setConfig('language', next);
            } catch (err) {
                console.error('[i18n] failed to persist language to SQLite:', err);
            }

            try {
                const electronAPI = (window as unknown as { ipcRenderer?: ElectronLocaleAPI })
                    .ipcRenderer;
                await electronAPI?.invoke?.('app:setLocale', next);
            } catch {
                /* main process eski versiyonu — no-op */
            }
        },
        [i18n, language, setConfig],
    );

    return { language, setLanguage };
}
