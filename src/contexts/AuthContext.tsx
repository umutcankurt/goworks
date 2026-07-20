import { createContext, useContext, useState, ReactNode, useEffect } from 'react';

/**
 * Mirrors AuthUserProfile in electron/auth-service.ts. Google does not guarantee
 * `name`/`picture` — Header.tsx already falls back on both.
 */
interface AuthUser {
    email: string;
    name?: string | null;
    picture?: string | null;
}

interface AuthContextType {
    user: AuthUser | null;
    isAuthenticated: boolean;
    login: () => Promise<void>;
    logout: () => Promise<void>;
    isLoading: boolean;
    error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Initial check could read from localStorage if you persist user, 
    // but typically Electron apps rely on IPC calls to main process to get state
    useEffect(() => {
        const checkAuth = async () => {
            try {
                const result = await window.ipcRenderer.invoke('auth:check');
                if (result.success && result.authenticated) {
                    if (result.user?.email) {
                        // Main process is the authority; refresh the cache from it.
                        setUser(result.user);
                        localStorage.setItem('auth_user', JSON.stringify(result.user));
                    } else {
                        // Authenticated but no profile: restoreSession() fails open
                        // when userinfo is unreachable (offline) and cannot repopulate
                        // the identity. Without this fallback an offline unlock would
                        // bounce a perfectly valid session to /login.
                        const savedUser = localStorage.getItem('auth_user');
                        if (savedUser) setUser(JSON.parse(savedUser));
                    }
                } else {
                    // NOT a logout. A vault lock drops the in-memory credentials and
                    // legitimately reports authenticated:false while the Google grant
                    // is still intact in the vault. Clearing the cached identity here
                    // is what left the renderer signed out over a live session after
                    // an unlock. The cache is only cleared on a real logout —
                    // handleAutoLogout below and logout() further down.
                    setUser(null);
                }
            } catch (err) {
                console.error("Auth check failed:", err);
                setUser(null);
            }
        };
        checkAuth();

        const handleAutoLogout = () => {
            setUser(null);
            localStorage.removeItem('auth_user');
        };

        // The vault lock/unlock drives the real Google session: locking drops the
        // in-memory OAuth credentials, unlocking restores them (or flags re-auth).
        // Re-run auth:check on both so isAuthenticated reflects reality instead of a
        // stale localStorage user.
        const recheckAuth = () => { checkAuth(); };

        if (window.ipcRenderer && window.ipcRenderer.on) {
            window.ipcRenderer.on('auth:logout-event', handleAutoLogout);
            window.ipcRenderer.on('vault:locked', recheckAuth);
            window.ipcRenderer.on('vault:unlocked', recheckAuth);
        }

        return () => {
            if (window.ipcRenderer && window.ipcRenderer.off) {
                window.ipcRenderer.off('auth:logout-event', handleAutoLogout);
                window.ipcRenderer.off('vault:locked', recheckAuth);
                window.ipcRenderer.off('vault:unlocked', recheckAuth);
            }
        };
    }, []);

    const login = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const result = await window.ipcRenderer.invoke('auth:login');
            if (result.success && result.user) {
                const userData = {
                    email: result.user.email,
                    name: result.user.name,
                    picture: result.user.picture
                };
                setUser(userData);
                localStorage.setItem('auth_user', JSON.stringify(userData));
                window.ipcRenderer.invoke('window:maximize');
            } else {
                setError(result.error || 'Giriş başarısız oldu.');
                throw new Error(result.error);
            }
        } catch (err: any) {
            setError(err.message || 'Bir hata oluştu.');
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    const logout = async () => {
        setIsLoading(true);
        try {
            await window.ipcRenderer.invoke('auth:logout');
            setUser(null);
            localStorage.removeItem('auth_user');
        } catch (err) {
            console.error('Logout error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout, isLoading, error }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
