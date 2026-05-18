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
 * IPC henüz yanıt vermeden önceki ilk render için neutral fallback.
 * companyName ve allowedDomain boş — ilk kurulum / onboarding'i tetikler.
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
};

interface AppConfigContextType {
    config: AppConfigDTO;
    effectiveSidebarAbbr: string;
    logoDataUrl: string | null;
    saveStatus: SaveStatus;
    isLoading: boolean;
    refresh: () => Promise<void>;
    /** Optimistic, debounced kalıcı kaydetme — UI input'larından çağrılır. */
    setConfig: (key: keyof AppConfigDTO, value: string | null) => Promise<void>;
    /** Sadece local context state'ini günceller, IPC'ye yazmaz (canlı preview için). */
    setConfigLocal: (key: keyof AppConfigDTO, value: string | null) => void;
    /** Anında IPC'ye yazıp dönen config'i state'e işler (logo gibi tek atımlı işlemlerde). */
    commitConfig: (key: keyof AppConfigDTO, value: string | null) => Promise<void>;
    uploadLogo: (data: ArrayBuffer, ext: string) => Promise<void>;
    deleteLogo: () => Promise<void>;
    /** Onboarding tamamlandığında çağrılır — completedAt'i set eder. */
    markOnboardingComplete: () => Promise<void>;
    /** Settings → Genel → "Sihirbazı tekrar başlat" tarafından çağrılır. */
    resetOnboarding: () => Promise<void>;
}

const AppConfigContext = createContext<AppConfigContextType | undefined>(undefined);

export function AppConfigProvider({ children }: { children: ReactNode }) {
    const [config, setConfigState] = useState<AppConfigDTO>(FALLBACK_CONFIG);
    const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
    const [isLoading, setIsLoading] = useState(true);

    // Per-key debounce timer'ları — input'tan onChange ile gelen art arda yazımları
    // birleştirip tek IPC'ye düşürür.
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
            // Fallback'i koruyoruz; uygulama çalışmaya devam etsin.
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    // SQLite'tan dönen dil ile i18n.language farklıysa eşitle.
    // Login öncesi localStorage fallback ile init olduktan sonra,
    // SQLite'ta farklı bir tercih varsa burada hizalanır.
    useEffect(() => {
        if (isLoading) return;
        const target = config.language;
        if (!isSupportedLanguage(target)) return;
        if (target !== i18n.language) {
            i18n.changeLanguage(target);
        }
        try { localStorage.setItem(STORAGE_KEY_LANG, target); } catch { /* ignore */ }
    }, [isLoading, config.language]);

    /** Sadece local state — IPC'ye yazmaz; canlı preview için. */
    const setConfigLocal = useCallback((key: keyof AppConfigDTO, value: string | null) => {
        setConfigState((prev) => ({ ...prev, [key]: value as any }));
    }, []);

    /** Anında IPC'ye yazıp dönen config'i state'e işler. */
    const commitConfig = useCallback(async (key: keyof AppConfigDTO, value: string | null) => {
        setSaveStatus('saving');
        try {
            const updated = await appConfigApi.set(key, value);
            setConfigState(updated);
            flashStatus('saved');
        } catch (err) {
            // Hata: server'dan gerçek state'i tekrar çek (revert)
            await refresh();
            flashStatus('error');
            throw err;
        }
    }, [refresh, flashStatus]);

    /**
     * Optimistic + debounced. Input'tan her onChange çağrısında:
     * 1. Local state'i hemen günceller (UI anlık tepki)
     * 2. DEBOUNCE_MS sonra IPC'ye yazar (yazım fırtınalarını birleştirir)
     */
    const setConfig = useCallback((key: keyof AppConfigDTO, value: string | null): Promise<void> => {
        // 1. Optimistic local update — Sidebar/Header anında yenilenir
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
                    // IPC'den dönen normalize edilmiş değerle senkronla
                    // (örn. allowedDomain trim+lowercase). Eğer kullanıcı bu sırada
                    // yeni bir tuşa basmışsa state'i ezmeyelim — pending timer varsa skip.
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

    // Unmount: bekleyen timer'ları temizle
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
