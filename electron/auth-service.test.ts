import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Hoisted mocks ---

const fsMock = vi.hoisted(() => ({
    existsSync: vi.fn(() => false),
    unlinkSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
}));

const oauth2Instance = vi.hoisted(() => ({
    generateAuthUrl: vi.fn(),
    getToken: vi.fn(),
    setCredentials: vi.fn(),
    revokeToken: vi.fn(),
    getAccessToken: vi.fn(),
    credentials: {} as any,
}));

const OAuth2Constructor = vi.hoisted(() =>
    vi.fn(function (this: any) {
        Object.assign(this, oauth2Instance);
    })
);

// Keyed config getter: clientId + clientSecret now both live in app_config.
const appConfigMock = vi.hoisted(() => ({
    get: vi.fn((_key: string): string => ''),
}));

// The refresh token / Service Account now live in the master-password vault.
const vaultManagerMock = vi.hoisted(() => ({
    getRefreshToken: vi.fn((): string | null => null),
    setRefreshToken: vi.fn(),
    getServiceAccount: vi.fn((): string | null => null),
    setServiceAccount: vi.fn(),
    clearServiceAccount: vi.fn(),
}));

// --- Module mocks ---

vi.mock('electron', () => ({
    app: { getPath: vi.fn(() => '/tmp/test-userData') },
    shell: { openExternal: vi.fn() },
}));

vi.mock('fs', () => ({ default: fsMock, ...fsMock }));

const googleApiMock = vi.hoisted(() => ({
    userinfoGet: vi.fn(),
    adminUsersGet: vi.fn(),
}));

vi.mock('./google-lazy', () => ({
    getGoogle: vi.fn(() => ({
        auth: {
            OAuth2: OAuth2Constructor,
        },
        oauth2: () => ({ userinfo: { get: googleApiMock.userinfoGet } }),
        admin: () => ({ users: { get: googleApiMock.adminUsersGet } }),
    })),
}));

vi.mock('./services/app-config-service', () => ({
    appConfigService: appConfigMock,
}));

vi.mock('./services/vault-manager', () => ({
    vaultManager: vaultManagerMock,
}));

/** Make appConfig.get return values per key. */
function setConfig(values: Record<string, string>) {
    appConfigMock.get.mockImplementation((key: string) => values[key] ?? '');
}

describe('AuthService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fsMock.existsSync.mockReturnValue(false);
        appConfigMock.get.mockReturnValue('');
        vaultManagerMock.getRefreshToken.mockReturnValue(null);
        // Default: the identity re-check cannot reach Google. restoreSession
        // fails OPEN on that, which is what the pre-existing tests assume.
        googleApiMock.userinfoGet.mockRejectedValue(new Error('offline'));
        googleApiMock.adminUsersGet.mockRejectedValue(new Error('offline'));
    });

    describe('constructor', () => {
        it('vault modelinde token deposunu TEMİZLEMEZ (refresh token vault\'ta yaşar)', async () => {
            const { AuthService } = await import('./auth-service');
            new AuthService();
            // The constructor must not wipe the persisted refresh token any more.
            expect(vaultManagerMock.setRefreshToken).not.toHaveBeenCalled();
        });

        it('constructor eski düz google_auth_token.json artığını siler (varsa)', async () => {
            fsMock.existsSync.mockReturnValue(true);

            const { AuthService } = await import('./auth-service');
            new AuthService();

            expect(fsMock.unlinkSync).toHaveBeenCalledWith(
                expect.stringContaining('google_auth_token.json')
            );
        });

        it('eski düz dosya yoksa unlinkSync çağrılmaz', async () => {
            fsMock.existsSync.mockReturnValue(false);

            const { AuthService } = await import('./auth-service');
            new AuthService();

            expect(fsMock.unlinkSync).not.toHaveBeenCalled();
        });
    });

    describe('credential validation (lazy)', () => {
        it('constructor credential yokken throw etmez (Faz 31)', async () => {
            const { AuthService } = await import('./auth-service');
            expect(() => new AuthService()).not.toThrow();
        });

        it('clientId yokken getClient() MissingOAuthCredentialsError fırlatır', async () => {
            setConfig({ googleClientSecret: 'some-secret' });

            const { AuthService } = await import('./auth-service');
            const svc = new AuthService();
            expect(() => svc.getClient()).toThrow(/OAuth bilgileri eksik/i);
        });

        it('clientSecret yokken getClient() MissingOAuthCredentialsError fırlatır', async () => {
            setConfig({ googleClientId: 'some-client-id' });

            const { AuthService } = await import('./auth-service');
            const svc = new AuthService();
            expect(() => svc.getClient()).toThrow(/OAuth bilgileri eksik/i);
        });

        it('hem clientId hem secret varsa getClient() OAuth2Client kurar', async () => {
            setConfig({ googleClientId: 'test-client-id', googleClientSecret: 'test-secret' });

            const { AuthService } = await import('./auth-service');
            const svc = new AuthService();
            expect(() => svc.getClient()).not.toThrow();
            // No redirect URI is baked into the constructor: as a desktop ("installed")
            // public client the loopback redirect is bound to an ephemeral port per
            // login and supplied dynamically to generateAuthUrl/getToken.
            expect(OAuth2Constructor).toHaveBeenCalledWith(
                'test-client-id',
                'test-secret',
            );
        });

        it('hasCredentials() clientId + secret durumunu doğru raporlar', async () => {
            const { AuthService } = await import('./auth-service');
            const svc = new AuthService();

            setConfig({});
            expect(svc.hasCredentials()).toBe(false);

            setConfig({ googleClientId: 'id', googleClientSecret: 'secret' });
            expect(svc.hasCredentials()).toBe(true);
        });
    });

    describe('restoreSession (silent resume from vault)', () => {
        it('refresh token yoksa reauthNeeded döner', async () => {
            setConfig({ googleClientId: 'id', googleClientSecret: 'secret' });
            vaultManagerMock.getRefreshToken.mockReturnValue(null);

            const { AuthService } = await import('./auth-service');
            const svc = new AuthService();
            const res = await svc.restoreSession();
            expect(res).toEqual({ authenticated: false, reauthNeeded: true, reason: 'no-token' });
        });

        it('geçerli refresh token ile sessiz access token alır (re-login yok)', async () => {
            setConfig({ googleClientId: 'id', googleClientSecret: 'secret' });
            vaultManagerMock.getRefreshToken.mockReturnValue('rt-123');
            oauth2Instance.getAccessToken.mockResolvedValue({ token: 'access-xyz' });

            const { AuthService } = await import('./auth-service');
            const svc = new AuthService();
            const res = await svc.restoreSession();
            expect(oauth2Instance.setCredentials).toHaveBeenCalledWith({ refresh_token: 'rt-123' });
            expect(res.authenticated).toBe(true);
            expect(res.reauthNeeded).toBe(false);
        });

        it('refresh başarısızsa (invalid_grant) reauthNeeded döner', async () => {
            setConfig({ googleClientId: 'id', googleClientSecret: 'secret' });
            vaultManagerMock.getRefreshToken.mockReturnValue('rt-bad');
            oauth2Instance.getAccessToken.mockRejectedValue(new Error('invalid_grant'));

            const { AuthService } = await import('./auth-service');
            const svc = new AuthService();
            const res = await svc.restoreSession();
            expect(res).toEqual({ authenticated: false, reauthNeeded: true, reason: 'refresh-failed' });
        });
    });

    describe('restoreSession — kimlik yeniden doğrulaması', () => {
        function readyVault() {
            setConfig({ googleClientId: 'id', googleClientSecret: 'secret', allowedDomain: 'example.com' });
            vaultManagerMock.getRefreshToken.mockReturnValue('rt-123');
            oauth2Instance.getAccessToken.mockResolvedValue({ token: 'access-xyz' });
        }

        it('drops the session when the stored identity is no longer an admin', async () => {
            readyVault();
            googleApiMock.userinfoGet.mockResolvedValue({ data: { email: 'a@example.com' } });
            googleApiMock.adminUsersGet.mockResolvedValue({ data: { isAdmin: false } });

            const { AuthService } = await import('./auth-service');
            const res = await new AuthService().restoreSession();

            expect(res).toEqual({ authenticated: false, reauthNeeded: true, reason: 'not-admin' });
            // and the refresh token is cleared, so the next unlock cannot resurrect it
            expect(vaultManagerMock.setRefreshToken).toHaveBeenCalledWith(null);
        });

        it('drops the session when the stored identity left the allowed domain', async () => {
            readyVault();
            googleApiMock.userinfoGet.mockResolvedValue({ data: { email: 'a@other.tld' } });

            const { AuthService } = await import('./auth-service');
            const res = await new AuthService().restoreSession();

            expect(res).toEqual({ authenticated: false, reauthNeeded: true, reason: 'domain-mismatch' });
            expect(vaultManagerMock.setRefreshToken).toHaveBeenCalledWith(null);
        });

        it('keeps the session when the admin check is a real admin', async () => {
            readyVault();
            googleApiMock.userinfoGet.mockResolvedValue({ data: { email: 'a@example.com' } });
            googleApiMock.adminUsersGet.mockResolvedValue({ data: { isAdmin: true } });

            const { AuthService } = await import('./auth-service');
            const res = await new AuthService().restoreSession();

            expect(res).toEqual({ authenticated: true, reauthNeeded: false });
            expect(vaultManagerMock.setRefreshToken).not.toHaveBeenCalledWith(null);
        });

        it('fails OPEN when the admin check cannot reach Google (offline laptop)', async () => {
            readyVault();
            googleApiMock.userinfoGet.mockResolvedValue({ data: { email: 'a@example.com' } });
            // ETIMEDOUT rather than ENOTFOUND: retry.ts deliberately does NOT retry
            // ETIMEDOUT, so this reaches the classifier without a 14s backoff chain.
            googleApiMock.adminUsersGet.mockRejectedValue(Object.assign(new Error('ETIMEDOUT'), { code: 'ETIMEDOUT' }));

            const { AuthService } = await import('./auth-service');
            const res = await new AuthService().restoreSession();

            // A network blip must not lock a real admin out of a local-only app.
            expect(res).toEqual({ authenticated: true, reauthNeeded: false, reason: 'authz-unverified' });
            expect(vaultManagerMock.setRefreshToken).not.toHaveBeenCalledWith(null);
        });

        it('fails OPEN on a missing-scope 403 so a scope migration cannot log admins out', async () => {
            readyVault();
            googleApiMock.userinfoGet.mockResolvedValue({ data: { email: 'a@example.com' } });
            googleApiMock.adminUsersGet.mockRejectedValue(Object.assign(new Error('insufficient'), {
                code: 403,
                response: { data: { error: { status: 'PERMISSION_DENIED', message: 'insufficient scope' } } },
            }));

            const { AuthService } = await import('./auth-service');
            const res = await new AuthService().restoreSession();

            expect(res).toEqual({ authenticated: true, reauthNeeded: false, reason: 'authz-unverified' });
        });

        it('treats a 403 that is NOT about scope as a definitive not-admin', async () => {
            readyVault();
            googleApiMock.userinfoGet.mockResolvedValue({ data: { email: 'a@example.com' } });
            googleApiMock.adminUsersGet.mockRejectedValue(Object.assign(new Error('forbidden'), {
                code: 403,
                response: { data: { error: { status: 'PERMISSION_DENIED', message: 'Not Authorized' } } },
            }));

            const { AuthService } = await import('./auth-service');
            const res = await new AuthService().restoreSession();

            expect(res).toEqual({ authenticated: false, reauthNeeded: true, reason: 'not-admin' });
        });
    });

    describe('login — ön koşullar (F-2)', () => {
        it('refuses to open a browser when no allowed domain is configured', async () => {
            setConfig({ googleClientId: 'id', googleClientSecret: 'secret' });
            const { shell } = await import('electron');

            const { AuthService } = await import('./auth-service');
            await expect(new AuthService().login()).rejects.toThrow(/domain/i);

            // The old flow opened the browser, took a full consent, minted a refresh
            // token and persisted it, and only then discovered the domain was unset.
            expect(shell.openExternal).not.toHaveBeenCalled();
            expect(vaultManagerMock.setRefreshToken).not.toHaveBeenCalled();
        });
    });
});

