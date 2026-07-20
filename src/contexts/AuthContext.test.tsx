import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';

/**
 * Regression cover for the vault lock/unlock identity round-trip.
 *
 * This bug has now shipped twice in opposite directions: v0.7.5 fixed a "zombie
 * authenticated" renderer (stale localStorage user over a dead session), and the
 * fix introduced the inverse — a lock deleted the cached identity, so unlocking
 * left the renderer signed out over a *live* main-process session. Neither
 * direction had a test, which is why the second one went unnoticed.
 */

const DEMO_USER = { email: 'admin@example.com', name: 'Admin', picture: 'https://example.test/a.png' };

/** Listeners AuthProvider registers via ipcRenderer.on, keyed by channel. */
let listeners: Record<string, Array<() => void>>;

function ipc() {
    return (window as any).ipcRenderer;
}

function Probe() {
    const { isAuthenticated, user } = useAuth();
    return (
        <div>
            <span data-testid="authed">{isAuthenticated ? 'yes' : 'no'}</span>
            <span data-testid="email">{user?.email ?? '-'}</span>
        </div>
    );
}

/** Fire a main-process event the way preload would. */
async function emit(channel: string) {
    await act(async () => {
        for (const fn of listeners[channel] ?? []) fn();
    });
}

beforeEach(() => {
    listeners = {};
    window.localStorage.clear();
    ipc().invoke = vi.fn().mockResolvedValue({ success: true, authenticated: false, user: null });
    ipc().on = vi.fn((channel: string, fn: () => void) => {
        (listeners[channel] ??= []).push(fn);
    });
    ipc().off = vi.fn();
});

describe('AuthContext — vault lock/unlock', () => {
    it('keeps the identity across a lock and restores it on unlock', async () => {
        // Signed in before the lock.
        window.localStorage.setItem('auth_user', JSON.stringify(DEMO_USER));
        ipc().invoke = vi.fn().mockResolvedValue({ success: true, authenticated: true, user: DEMO_USER });

        render(<AuthProvider><Probe /></AuthProvider>);
        await waitFor(() => expect(screen.getByTestId('authed')).toHaveTextContent('yes'));

        // Lock: the main process drops the in-memory credentials, so auth:check
        // reports false — but the Google grant survives in the vault.
        ipc().invoke = vi.fn().mockResolvedValue({ success: true, authenticated: false, user: null });
        await emit('vault:locked');

        await waitFor(() => expect(screen.getByTestId('authed')).toHaveTextContent('no'));
        // The cached identity MUST survive — this is the actual bug.
        expect(window.localStorage.getItem('auth_user')).not.toBeNull();

        // Unlock: restoreSession() succeeds and auth:check reports the identity.
        ipc().invoke = vi.fn().mockResolvedValue({ success: true, authenticated: true, user: DEMO_USER });
        await emit('vault:unlocked');

        await waitFor(() => expect(screen.getByTestId('authed')).toHaveTextContent('yes'));
        expect(screen.getByTestId('email')).toHaveTextContent(DEMO_USER.email);
    });

    it('falls back to the cached identity when an offline restore returns no profile', async () => {
        // restoreSession() fails open on 'authz-unverified': authenticated, but the
        // userinfo call could not run, so the main process has no profile to hand over.
        window.localStorage.setItem('auth_user', JSON.stringify(DEMO_USER));
        ipc().invoke = vi.fn().mockResolvedValue({ success: true, authenticated: true, user: null });

        render(<AuthProvider><Probe /></AuthProvider>);

        await waitFor(() => expect(screen.getByTestId('authed')).toHaveTextContent('yes'));
        expect(screen.getByTestId('email')).toHaveTextContent(DEMO_USER.email);
    });

    it('prefers the main-process identity over a stale cached one', async () => {
        window.localStorage.setItem('auth_user', JSON.stringify({ email: 'stale@example.com' }));
        ipc().invoke = vi.fn().mockResolvedValue({ success: true, authenticated: true, user: DEMO_USER });

        render(<AuthProvider><Probe /></AuthProvider>);

        await waitFor(() => expect(screen.getByTestId('email')).toHaveTextContent(DEMO_USER.email));
        expect(JSON.parse(window.localStorage.getItem('auth_user')!).email).toBe(DEMO_USER.email);
    });

    it('clears the cached identity on an explicit logout event', async () => {
        window.localStorage.setItem('auth_user', JSON.stringify(DEMO_USER));
        ipc().invoke = vi.fn().mockResolvedValue({ success: true, authenticated: true, user: DEMO_USER });

        render(<AuthProvider><Probe /></AuthProvider>);
        await waitFor(() => expect(screen.getByTestId('authed')).toHaveTextContent('yes'));

        // A real logout — unlike a lock — must wipe the cache.
        await emit('auth:logout-event');

        await waitFor(() => expect(screen.getByTestId('authed')).toHaveTextContent('no'));
        expect(window.localStorage.getItem('auth_user')).toBeNull();
    });
});
