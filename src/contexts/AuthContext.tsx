import { createContext, useContext, useState, ReactNode, useEffect } from 'react';

interface AuthUser {
    email: string;
    name: string;
    picture: string;
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
                    const savedUser = localStorage.getItem('auth_user');
                    if (savedUser) setUser(JSON.parse(savedUser));
                } else {
                    setUser(null);
                    localStorage.removeItem('auth_user');
                }
            } catch (err) {
                console.error("Auth check failed:", err);
                setUser(null);
                localStorage.removeItem('auth_user');
            }
        };
        checkAuth();

        const handleAutoLogout = () => {
            setUser(null);
            localStorage.removeItem('auth_user');
        };

        if (window.ipcRenderer && window.ipcRenderer.on) {
            window.ipcRenderer.on('auth:logout-event', handleAutoLogout);
        }

        return () => {
            if (window.ipcRenderer && window.ipcRenderer.off) {
                window.ipcRenderer.off('auth:logout-event', handleAutoLogout);
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
