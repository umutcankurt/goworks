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
    credentials: {} as any,
}));

const OAuth2Constructor = vi.hoisted(() =>
    vi.fn(function (this: any) {
        Object.assign(this, oauth2Instance);
    })
);

const appConfigMock = vi.hoisted(() => ({
    get: vi.fn((_key: string): string => ''),
}));

const secureStorageMock = vi.hoisted(() => ({
    getClientSecret: vi.fn((): string | null => null),
    hasClientSecret: vi.fn(() => false),
}));

// --- Module mocks ---

vi.mock('electron', () => ({
    app: { getPath: vi.fn(() => '/tmp/test-userData') },
    shell: { openExternal: vi.fn() },
}));

vi.mock('fs', () => ({ default: fsMock, ...fsMock }));

vi.mock('./google-lazy', () => ({
    getGoogle: vi.fn(() => ({
        auth: {
            OAuth2: OAuth2Constructor,
        },
    })),
}));

vi.mock('./services/app-config-service', () => ({
    appConfigService: appConfigMock,
}));

vi.mock('./services/secure-storage', () => ({
    secureStorage: secureStorageMock,
}));

describe('AuthService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fsMock.existsSync.mockReturnValue(false);
        // Faz 31 default: credential yok. Lazy init için.
        appConfigMock.get.mockReturnValue('');
        secureStorageMock.getClientSecret.mockReturnValue(null);
        secureStorageMock.hasClientSecret.mockReturnValue(false);
    });

    describe('clearStoredTokens', () => {
        it('constructor token dosyasını siler (dosya varsa)', async () => {
            fsMock.existsSync.mockReturnValue(true);

            const { AuthService } = await import('./auth-service');
            new AuthService();

            expect(fsMock.unlinkSync).toHaveBeenCalledWith(
                expect.stringContaining('google_auth_token.json')
            );
        });

        it('dosya yoksa unlinkSync çağrılmaz', async () => {
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
            appConfigMock.get.mockReturnValue('');
            secureStorageMock.getClientSecret.mockReturnValue('some-secret');

            const { AuthService } = await import('./auth-service');
            const svc = new AuthService();
            expect(() => svc.getClient()).toThrow(/OAuth bilgileri eksik/i);
        });

        it('clientSecret yokken getClient() MissingOAuthCredentialsError fırlatır', async () => {
            appConfigMock.get.mockReturnValue('some-client-id');
            secureStorageMock.getClientSecret.mockReturnValue(null);

            const { AuthService } = await import('./auth-service');
            const svc = new AuthService();
            expect(() => svc.getClient()).toThrow(/OAuth bilgileri eksik/i);
        });

        it('hem clientId hem secret varsa getClient() OAuth2Client kurar', async () => {
            appConfigMock.get.mockReturnValue('test-client-id');
            secureStorageMock.getClientSecret.mockReturnValue('test-secret');

            const { AuthService } = await import('./auth-service');
            const svc = new AuthService();
            expect(() => svc.getClient()).not.toThrow();
            expect(OAuth2Constructor).toHaveBeenCalledWith(
                'test-client-id',
                'test-secret',
                expect.stringContaining('/callback'),
            );
        });

        it('hasCredentials() clientId + secret durumunu doğru raporlar', async () => {
            const { AuthService } = await import('./auth-service');
            const svc = new AuthService();

            appConfigMock.get.mockReturnValue('');
            secureStorageMock.hasClientSecret.mockReturnValue(false);
            expect(svc.hasCredentials()).toBe(false);

            appConfigMock.get.mockReturnValue('id');
            secureStorageMock.hasClientSecret.mockReturnValue(true);
            expect(svc.hasCredentials()).toBe(true);
        });
    });
});
