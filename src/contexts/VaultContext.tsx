import { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef } from 'react';
import { vaultApi, type VaultState } from '../services/server-api';

interface VaultContextType {
    state: VaultState | null;
    isLoading: boolean;
    refresh: () => Promise<void>;
    /** Create a new vault (onboarding / legacy upgrade / post-reset). */
    setup: (password: string) => Promise<VaultState>;
    unlock: (password: string) => Promise<VaultState>;
    lock: (reason?: 'manual' | 'idle') => Promise<void>;
    reset: () => Promise<VaultState>;
    /** Re-key the vault to a new master password (Settings → Security). */
    changePassword: (current: string, next: string) => Promise<void>;
}

const VaultContext = createContext<VaultContextType | undefined>(undefined);

export function VaultProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<VaultState | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const mounted = useRef(true);

    const refresh = useCallback(async () => {
        try {
            const next = await vaultApi.getState();
            if (mounted.current) setState(next);
        } catch (err) {
            console.error('[Vault] getState failed:', err);
        } finally {
            if (mounted.current) setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        mounted.current = true;
        refresh();
        return () => { mounted.current = false; };
    }, [refresh]);

    // Main process drives lock/unlock; mirror its state on every event.
    useEffect(() => {
        const ipc = (window as any).ipcRenderer;
        if (!ipc?.on) return;
        const onChange = () => { refresh(); };
        ipc.on('vault:locked', onChange);
        ipc.on('vault:unlocked', onChange);
        return () => {
            ipc.off?.('vault:locked', onChange);
            ipc.off?.('vault:unlocked', onChange);
        };
    }, [refresh]);

    const setup = useCallback(async (password: string) => {
        const next = await vaultApi.setup(password);
        setState(next);
        return next;
    }, []);

    const unlock = useCallback(async (password: string) => {
        const next = await vaultApi.unlock(password);
        setState(next);
        return next;
    }, []);

    const lock = useCallback(async (reason: 'manual' | 'idle' = 'idle') => {
        const next = await vaultApi.lock(reason);
        setState(next);
    }, []);

    const reset = useCallback(async () => {
        const next = await vaultApi.reset();
        setState(next);
        return next;
    }, []);

    // Changing the password keeps the vault UNLOCKED (DEK is only re-wrapped), so
    // there's no status change to mirror here.
    const changePassword = useCallback(async (current: string, next: string) => {
        await vaultApi.changePassword(current, next);
    }, []);

    return (
        <VaultContext.Provider value={{ state, isLoading, refresh, setup, unlock, lock, reset, changePassword }}>
            {children}
        </VaultContext.Provider>
    );
}

export function useVault(): VaultContextType {
    const ctx = useContext(VaultContext);
    if (!ctx) throw new Error('useVault must be used within a VaultProvider');
    return ctx;
}
