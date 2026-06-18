import { createContext, useContext, useState, ReactNode, useEffect, useCallback, useMemo, useRef } from 'react';
import { appConfigApi, type AppConfigDTO } from '../services/server-api';
import { initialsFrom } from '../utils/initials';
import i18n, { STORAGE_KEY_LANG } from '../i18n';
import { isSupportedLanguage } from '../i18n/types';

const DEBOUNCE_MS = 350;
const SAVED_BADGE_MS = 1500;
const ERROR_BADGE_MS = 3000;

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Neutral fallback for the first render, before IPC has responded.
 * companyName and allowedDomain are empty — this triggers initial setup / onboarding.
 */
const FALLBACK_CONFIG: AppConfigDTO = {
    companyName: '',
    sidebarAbbr: null,
    logoPath: null,
    emailSenderName: 'GoWorks',
    allowedDomain: '',
    language: 'tr',
    onboardingStep: null,
    onboardingCompletedAt: null,
    googleClientId: '',
    termsAcceptedAt: null,
    termsVersion: null,
};

interface AppConfigContextType {
    config: AppConfigDTO;
    effectiveSidebarAbbr: string;
    logoDataUrl: string | null;
    saveStatus: SaveStatus;
    isLoading: boolean;
    refresh: () => Promise<void>;
    /** Optimistic, debounced persistent save — called from UI inputs. */
    setConfig: (key: keyof AppConfigDTO, value: string | null) => Promise<void>;
    /** Updates only the local context state, does not write to IPC (for live preview). */
    setConfigLocal: (key: keyof AppConfigDTO, value: string | null) => void;
    /** Writes to IPC immediately and applies the returned config to state (for one-shot operations like logo). */
    commitConfig: (key: keyof AppConfigDTO, value: string | null) => Promise<void>;
    uploadLogo: (data: ArrayBuffer, ext: string) => Promise<void>;
    deleteLogo: () => Promise<void>;
    /** Called when onboarding completes — sets completedAt. */
    markOnboardingComplete: () => Promise<void>;
    /** Records acceptance of the legal terms for the given version. */
    acceptTerms: (version: string) => Promise<void>;
    /** Called by Settings → General → "Restart wizard". */
    resetOnboarding: () => Promise<void>;
}

const AppConfigContext = createContext<AppConfigContextType | undefined>(undefined);

export function AppConfigProvider({ children }: { children: ReactNode }) {
    const [config, setConfigState] = useState<AppConfigDTO>(FALLBACK_CONFIG);
    const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
    const [isLoading, setIsLoading] = useState(true);

    // Per-key debounce timers — coalesce successive onChange writes from an input
    // into a single IPC call.
    const debounceTimers = useRef<Partial<Record<keyof AppConfigDTO, ReturnType<typeof setTimeout>>>>({});
    const statusBadgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const flashStatus = useCallback((next: 'saved' | 'error') => {
        setSaveStatus(next);
        if (statusBadgeTimer.current) clearTimeout(statusBadgeTimer.current);
        statusBadgeTimer.current = setTimeout(() => {
            setSaveStatus('idle');
            statusBadgeTimer.current = null;
        }, next === 'saved' ? SAVED_BADGE_MS : ERROR_BADGE_MS);
    }, []);

    const refresh = useCallback(async () => {
        try {
            const next = await appConfigApi.getAll();
            setConfigState(next);
            const dataUrl = await appConfigApi.getLogoDataUrl();
            setLogoDataUrl(typeof dataUrl === 'string' && dataUrl.startsWith('data:') ? dataUrl : null);
        } catch (err) {
            console.error('[AppConfig] failed to load:', err);
            // Keep the fallback; let the app keep running.
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    // Sync if the language returned from SQLite differs from i18n.language.
    // After initializing from the localStorage fallback before login,
    // if SQLite holds a different preference it is aligned here.
    useEffect(() => {
        if (isLoading) return;
        const target = config.language;
        if (!isSupportedLanguage(target)) return;
        if (target !== i18n.language) {
            i18n.changeLanguage(target);
        }
        try { localStorage.setItem(STORAGE_KEY_LANG, target); } catch { /* ignore */ }
    }, [isLoading, config.language]);

    /** Local state only — does not write to IPC; for live preview. */
    const setConfigLocal = useCallback((key: keyof AppConfigDTO, value: string | null) => {
        setConfigState((prev) => ({ ...prev, [key]: value as any }));
    }, []);

    /** Writes to IPC immediately and applies the returned config to state. */
    const commitConfig = useCallback(async (key: keyof AppConfigDTO, value: string | null) => {
        setSaveStatus('saving');
        try {
            const updated = await appConfigApi.set(key, value);
            setConfigState(updated);
            flashStatus('saved');
        } catch (err) {
            // Error: re-fetch the real state from the server (revert)
            await refresh();
            flashStatus('error');
            throw err;
        }
    }, [refresh, flashStatus]);

    /**
     * Optimistic + debounced. On every onChange call from an input:
     * 1. Updates local state immediately (instant UI feedback)
     * 2. Writes to IPC after DEBOUNCE_MS (coalesces typing bursts)
     */
    const setConfig = useCallback((key: keyof AppConfigDTO, value: string | null): Promise<void> => {
        // 1. Optimistic local update — Sidebar/Header refresh instantly
        setConfigState((prev) => ({ ...prev, [key]: value as any }));
        setSaveStatus('saving');

        // 2. Debounced IPC commit
        const existing = debounceTimers.current[key];
        if (existing) clearTimeout(existing);

        return new Promise<void>((resolve, reject) => {
            debounceTimers.current[key] = setTimeout(async () => {
                debounceTimers.current[key] = undefined;
                try {
                    const updated = await appConfigApi.set(key, value);
                    // Sync with the normalized value returned from IPC
                    // (e.g. allowedDomain trim+lowercase). If the user pressed
                    // another key meanwhile, don't clobber state — skip if a pending timer exists.
                    if (!debounceTimers.current[key]) {
                        setConfigState(updated);
                    }
                    flashStatus('saved');
                    resolve();
                } catch (err) {
                    await refresh();
                    flashStatus('error');
                    reject(err);
                }
            }, DEBOUNCE_MS);
        });
    }, [refresh, flashStatus]);

    const uploadLogo = useCallback(async (data: ArrayBuffer, ext: string) => {
        setSaveStatus('saving');
        try {
            const result = await appConfigApi.uploadLogo(data, ext);
            setConfigState(result.config);
            const dataUrl = await appConfigApi.getLogoDataUrl();
            setLogoDataUrl(typeof dataUrl === 'string' && dataUrl.startsWith('data:') ? dataUrl : null);
            flashStatus('saved');
        } catch (err) {
            flashStatus('error');
            throw err;
        }
    }, [flashStatus]);

    const deleteLogo = useCallback(async () => {
        setSaveStatus('saving');
        try {
            const updated = await appConfigApi.deleteLogo();
            setConfigState(updated);
            setLogoDataUrl(null);
            flashStatus('saved');
        } catch (err) {
            flashStatus('error');
            throw err;
        }
    }, [flashStatus]);

    const markOnboardingComplete = useCallback(async () => {
        setSaveStatus('saving');
        try {
            const updated = await appConfigApi.markOnboardingComplete();
            setConfigState(updated);
            flashStatus('saved');
        } catch (err) {
            flashStatus('error');
            throw err;
        }
    }, [flashStatus]);

    const acceptTerms = useCallback(async (version: string) => {
        setSaveStatus('saving');
        try {
            const updated = await appConfigApi.acceptTerms(version);
            setConfigState(updated);
            flashStatus('saved');
        } catch (err) {
            flashStatus('error');
            throw err;
        }
    }, [flashStatus]);

    const resetOnboarding = useCallback(async () => {
        setSaveStatus('saving');
        try {
            const updated = await appConfigApi.resetOnboarding();
            setConfigState(updated);
            flashStatus('saved');
        } catch (err) {
            flashStatus('error');
            throw err;
        }
    }, [flashStatus]);

    // Unmount: clear any pending timers
    useEffect(() => {
        return () => {
            for (const t of Object.values(debounceTimers.current)) {
                if (t) clearTimeout(t);
            }
            if (statusBadgeTimer.current) clearTimeout(statusBadgeTimer.current);
        };
    }, []);

    const effectiveSidebarAbbr = useMemo(() => {
        if (config.sidebarAbbr && config.sidebarAbbr.trim()) {
            return config.sidebarAbbr.trim();
        }
        return initialsFrom(config.companyName) || 'GW';
    }, [config.sidebarAbbr, config.companyName]);

    return (
        <AppConfigContext.Provider
            value={{
                config,
                effectiveSidebarAbbr,
                logoDataUrl,
                saveStatus,
                isLoading,
                refresh,
                setConfig,
                setConfigLocal,
                commitConfig,
                uploadLogo,
                deleteLogo,
                markOnboardingComplete,
                acceptTerms,
                resetOnboarding,
            }}
        >
            {children}
        </AppConfigContext.Provider>
    );
}

export function useAppConfig(): AppConfigContextType {
    const ctx = useContext(AppConfigContext);
    if (ctx === undefined) {
        throw new Error('useAppConfig must be used within an AppConfigProvider');
    }
    return ctx;
}
