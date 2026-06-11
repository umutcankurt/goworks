import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useAuth } from './AuthContext';

const SESSION_DURATION = 3600; // 60 dakika (saniye)
const WARNING_THRESHOLD = 300; // 5 dakika (saniye)

interface SessionContextType {
    remainingSeconds: number;
    showWarning: boolean;
    extendSession: () => void;
    dismissWarning: () => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
    const { logout, isAuthenticated } = useAuth();
    const [lastActivityTime, setLastActivityTime] = useState(Date.now());
    const [remainingSeconds, setRemainingSeconds] = useState(SESSION_DURATION);
    const [showWarning, setShowWarning] = useState(false);
    const [warningDismissed, setWarningDismissed] = useState(false);
    const logoutCalledRef = useRef(false);

    const resetActivity = useCallback(() => {
        setLastActivityTime(Date.now());
        setShowWarning(false);
        setWarningDismissed(false);
        logoutCalledRef.current = false;
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

    // Compute the remaining time every second
    useEffect(() => {
        if (!isAuthenticated) return;

        const interval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - lastActivityTime) / 1000);
            const remaining = Math.max(0, SESSION_DURATION - elapsed);
            setRemainingSeconds(remaining);

            // Show warning
            if (remaining <= WARNING_THRESHOLD && remaining > 0 && !warningDismissed) {
                setShowWarning(true);
            }

            // Time is up → logout
            if (remaining <= 0 && !logoutCalledRef.current) {
                logoutCalledRef.current = true;
                logout();
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [isAuthenticated, lastActivityTime, warningDismissed, logout]);

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
