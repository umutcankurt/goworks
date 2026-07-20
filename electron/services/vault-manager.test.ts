import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Covers the manual-lock re-auth window: how `requestLock(reason)` arms it and
 * how `consumeManualLockExpiry()` reports it.
 *
 * The window only ever produces a user-visible effect an hour later, so it is
 * effectively untestable by hand without editing the constant. These assertions
 * are the only practical guard on the idle/manual split — get that wrong and
 * either every idle lock forces a browser round-trip, or the window never fires.
 */

vi.mock('electron', () => ({
    app: { getPath: vi.fn(() => '/tmp/test-userData') },
}));

// node:fs is left real on purpose: the only call is an existsSync() probe for the
// vault file, and these tests set the status directly rather than booting into it.

vi.mock('./logger', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('./app-config-service', () => ({
    appConfigService: { get: vi.fn(() => ''), getAutoLockMinutes: vi.fn(() => 60) },
}));

vi.mock('./secure-storage', () => ({
    secureStorage: { isAvailable: vi.fn(() => false) },
    serviceAccountStore: { load: vi.fn(), save: vi.fn(), clear: vi.fn() },
    authTokenStore: { load: vi.fn(), save: vi.fn(), clear: vi.fn() },
}));

vi.mock('./vault-service', () => ({
    Vault: { fromBytes: vi.fn(), create: vi.fn() },
    WrongPasswordError: class extends Error { },
    VaultCorruptError: class extends Error { },
}));

const WINDOW_MS = 59 * 60_000;

/** Fresh module instance per test — the manager is a singleton holding lock state. */
async function freshManager() {
    vi.resetModules();
    const mod = await import('./vault-manager');
    const mgr = mod.vaultManager as any;
    // Drive the state machine directly: unlocking for real needs a password + KDF.
    mgr.status = 'UNLOCKED';
    mgr.hooks = {};
    return mgr;
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('vault-manager — manual lock re-auth window', () => {
    it('does not require re-auth when a manual lock is opened inside the window', async () => {
        const mgr = await freshManager();
        mgr.requestLock('manual');

        vi.advanceTimersByTime(WINDOW_MS - 1000);

        expect(mgr.consumeManualLockExpiry()).toBe(false);
    });

    it('requires re-auth when a manual lock outlives the window', async () => {
        const mgr = await freshManager();
        mgr.requestLock('manual');

        vi.advanceTimersByTime(WINDOW_MS + 1000);

        expect(mgr.consumeManualLockExpiry()).toBe(true);
    });

    it('never requires re-auth after an idle lock, however long it sits', async () => {
        const mgr = await freshManager();
        mgr.requestLock('idle');

        // Far past the window: the idle auto-lock is deliberately exempt, since its
        // own default (60 min) is longer than the window would be.
        vi.advanceTimersByTime(WINDOW_MS * 10);

        expect(mgr.consumeManualLockExpiry()).toBe(false);
    });

    it('defaults to idle when no reason is given', async () => {
        const mgr = await freshManager();
        mgr.requestLock();

        vi.advanceTimersByTime(WINDOW_MS + 1000);

        // An unclassified caller must not surprise the user with a forced sign-in.
        expect(mgr.consumeManualLockExpiry()).toBe(false);
    });

    it('consumes the mark, so a second unlock is not penalised again', async () => {
        const mgr = await freshManager();
        mgr.requestLock('manual');
        vi.advanceTimersByTime(WINDOW_MS + 1000);

        expect(mgr.consumeManualLockExpiry()).toBe(true);
        expect(mgr.consumeManualLockExpiry()).toBe(false);
    });

    it('clears a stale manual mark when the next lock is an idle one', async () => {
        const mgr = await freshManager();
        mgr.requestLock('manual');
        vi.advanceTimersByTime(WINDOW_MS + 1000);

        // Unlock without consuming (e.g. the hook threw), then let the idle timer lock.
        mgr.status = 'UNLOCKED';
        mgr.requestLock('idle');

        expect(mgr.consumeManualLockExpiry()).toBe(false);
    });

    it('ignores a lock request when the vault is not unlocked', async () => {
        const mgr = await freshManager();
        mgr.status = 'LOCKED';
        mgr.requestLock('manual');

        vi.advanceTimersByTime(WINDOW_MS + 1000);

        expect(mgr.consumeManualLockExpiry()).toBe(false);
    });
});
