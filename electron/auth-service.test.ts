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

// vi.fn with regular function so it can be used as constructor
const OAuth2Constructor = vi.hoisted(() =>
    vi.fn(function (this: any) {
        Object.assign(this, oauth2Instance);
    })
);

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

describe('AuthService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fsMock.existsSync.mockReturnValue(false);
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
});
