import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useVault } from './VaultContext';
import { useAppConfig } from './AppConfigContext';

const DEFAULT_SESSION_DURATION = 3600; // 60 minutes (seconds) — fallback only
const WARNING_THRESHOLD = 300; // 5 minutes (seconds), capped to duration/4

interface SessionContextType {
    remainingSeconds: number;
    showWarning: boolean;
    extendSession: () => void;
    dismissWarning: () => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
    const { isAuthenticated } = useAuth();
    const { lock } = useVault();
    const { config } = useAppConfig();
    const [lastActivityTime, setLastActivityTime] = useState(Date.now());
    const [remainingSeconds, setRemainingSeconds] = useState(DEFAULT_SESSION_DURATION);
    const [showWarning, setShowWarning] = useState(false);
    const [warningDismissed, setWarningDismissed] = useState(false);
    const lockCalledRef = useRef(false);

    // Auto-lock timeout is configurable from Settings → Security (autoLockMinutes,
    // '0' = disabled). Both this renderer timer and the main-process OS-idle timer
    // read the same value, so there is a single source of truth.
    const autoLockMinutes = Number.parseInt(config.autoLockMinutes ?? '60', 10);
    const autoLockEnabled = Number.isFinite(autoLockMinutes) && autoLockMinutes > 0;
    const sessionDuration = autoLockEnabled ? autoLockMinutes * 60 : DEFAULT_SESSION_DURATION;
    const warningThreshold = Math.min(WARNING_THRESHOLD, Math.max(1, Math.floor(sessionDuration / 4)));

    const resetActivity = useCallback(() => {
        setLastActivityTime(Date.now());
        setShowWarning(false);
        setWarningDismissed(false);
        lockCalledRef.current = false;
    }, []);

    const extendSession = useCallback(() => {
        resetActivity();
    }, [resetActivity]);

    const dismissWarning = useCallback(() => {
        resetActivity();
    }, [resetActivity]);

    // session-activity event listener
    useEffect(() => {
        const handleActivity = () => resetActivity();
        window.addEventListener('session-activity', handleActivity);
        return () => window.removeEventListener('session-activity', handleActivity);
    }, [resetActivity]);

    // Reset the counter on login
    useEffect(() => {
        if (isAuthenticated) {
            resetActivity();
        }
    }, [isAuthenticated, resetActivity]);

    // When auto-lock is disabled, never show the idle warning.
    useEffect(() => {
        if (!autoLockEnabled) setShowWarning(false);
    }, [autoLockEnabled]);

    // Compute the remaining time every second
    useEffect(() => {
        if (!isAuthenticated || !autoLockEnabled) return;

        const interval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - lastActivityTime) / 1000);
            const remaining = Math.max(0, sessionDuration - elapsed);
            setRemainingSeconds(remaining);

            // Show warning
            if (remaining <= warningThreshold && remaining > 0 && !warningDismissed) {
                setShowWarning(true);
            }

            // Time is up → LOCK the vault (not a full logout). The refresh token
            // stays in the vault; unlocking with the master password restores the
            // Google session silently — no browser OAuth. Running bulk jobs keep
            // going until they finish (Graceful Lock in the main process).
            //
            // Explicitly 'idle': the manual re-auth window must not apply here.
            // This timer's own default is 60 minutes, so a 59-minute window would
            // already be expired the instant it fired.
            if (remaining <= 0 && !lockCalledRef.current) {
                lockCalledRef.current = true;
                lock('idle').catch(() => { /* main process drives the lock; ignore */ });
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [isAuthenticated, autoLockEnabled, sessionDuration, warningThreshold, lastActivityTime, warningDismissed, lock]);

    return (
        <SessionContext.Provider value={{ remainingSeconds, showWarning, extendSession, dismissWarning }}>
            {children}
        </SessionContext.Provider>
    );
}

export function useSession() {
    const context = useContext(SessionContext);
    if (context === undefined) {
        throw new Error('useSession must be used within a SessionProvider');
    }
    return context;
}
