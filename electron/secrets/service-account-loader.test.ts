import { describe, it, expect, vi, beforeEach } from 'vitest';

const storeMock = vi.hoisted(() => ({
    set: vi.fn(),
    get: vi.fn((): string | null => null),
    has: vi.fn(() => false),
    clear: vi.fn(),
}));

vi.mock('../services/secure-storage', () => ({
    serviceAccountStore: storeMock,
}));

import {
    getServiceAccountCredentials,
    getStatus,
    uploadFromContent,
    clearKey,
} from './service-account-loader';

const VALID_SA = JSON.stringify({
    type: 'service_account',
    client_email: 'sa@project.iam.gserviceaccount.com',
    private_key: 'PRIVATE_KEY_CONTENT',
    client_id: '1234567890',
    project_id: 'project',
});

beforeEach(() => {
    vi.clearAllMocks();
    storeMock.get.mockReturnValue(null);
    storeMock.has.mockReturnValue(false);
});

describe('getServiceAccountCredentials', () => {
    it('depo boşsa null döner', () => {
        storeMock.get.mockReturnValue(null);
        expect(getServiceAccountCredentials()).toBeNull();
    });

    it('geçersiz JSON için null döner', () => {
        storeMock.get.mockReturnValue('{not json');
        expect(getServiceAccountCredentials()).toBeNull();
    });

    it('type service_account değilse null döner', () => {
        storeMock.get.mockReturnValue(
            JSON.stringify({ type: 'authorized_user', client_email: 'a', private_key: 'b' }),
        );
        expect(getServiceAccountCredentials()).toBeNull();
    });

    it('private_key eksikse null döner', () => {
        storeMock.get.mockReturnValue(
            JSON.stringify({ type: 'service_account', client_email: 'a' }),
        );
        expect(getServiceAccountCredentials()).toBeNull();
    });

    it('geçerli SA için credential objesi döner (project_id hariç)', () => {
        storeMock.get.mockReturnValue(VALID_SA);
        expect(getServiceAccountCredentials()).toEqual({
            client_email: 'sa@project.iam.gserviceaccount.com',
            private_key: 'PRIVATE_KEY_CONTENT',
            client_id: '1234567890',
        });
    });

    it('safeStorage hatası yukarı taşınır', () => {
        storeMock.get.mockImplementation(() => {
            throw new Error('OS keychain kullanılabilir değil');
        });
        expect(() => getServiceAccountCredentials()).toThrow(/keychain/i);
    });
});

describe('getStatus', () => {
    it('depo boşsa configured:false döner', () => {
        storeMock.get.mockReturnValue(null);
        expect(getStatus()).toEqual({ configured: false, email: null, clientId: null });
    });

    it('geçerli SA için configured:true + email/clientId döner', () => {
        storeMock.get.mockReturnValue(VALID_SA);
        expect(getStatus()).toEqual({
            configured: true,
            email: 'sa@project.iam.gserviceaccount.com',
            clientId: '1234567890',
        });
    });

    it('safeStorage hatası yutulur → configured:false', () => {
        storeMock.get.mockImplementation(() => {
            throw new Error('OS keychain kullanılabilir değil');
        });
        expect(getStatus()).toEqual({ configured: false, email: null, clientId: null });
    });
});

describe('uploadFromContent', () => {
    it('geçersiz JSON hata fırlatır', () => {
        expect(() => uploadFromContent('{bad')).toThrow(/geçersiz JSON/i);
    });

    it('type yanlışsa hata fırlatır', () => {
        expect(() => uploadFromContent(JSON.stringify({ type: 'authorized_user' }))).toThrow(
            /service_account/,
        );
    });

    it('eksik alan hata fırlatır', () => {
        expect(() =>
            uploadFromContent(JSON.stringify({ type: 'service_account', client_email: 'a' })),
        ).toThrow(/client_email, private_key/);
    });

    it('geçerli içerik şifreli depoya yazılır ve sonuç döner', () => {
        const result = uploadFromContent(VALID_SA);
        expect(storeMock.set).toHaveBeenCalledWith(VALID_SA);
        expect(result).toEqual({
            configured: true,
            email: 'sa@project.iam.gserviceaccount.com',
            clientId: '1234567890',
        });
    });
});

describe('clearKey', () => {
    it('şifreli depoyu temizler', () => {
        clearKey();
        expect(storeMock.clear).toHaveBeenCalled();
    });
});
