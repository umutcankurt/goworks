import { describe, it, expect, vi, beforeEach } from 'vitest';

// The loader now reads/writes the Service Account through the master-password
// vault (vaultManager), not the legacy safeStorage store.
const vaultMock = vi.hoisted(() => ({
    getServiceAccount: vi.fn((): string | null => null),
    setServiceAccount: vi.fn(),
    clearServiceAccount: vi.fn(),
}));

vi.mock('../services/vault-manager', () => ({
    vaultManager: vaultMock,
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
    vaultMock.getServiceAccount.mockReturnValue(null);
});

describe('getServiceAccountCredentials', () => {
    it('vault boşsa null döner', () => {
        vaultMock.getServiceAccount.mockReturnValue(null);
        expect(getServiceAccountCredentials()).toBeNull();
    });

    it('geçersiz JSON için null döner', () => {
        vaultMock.getServiceAccount.mockReturnValue('{not json');
        expect(getServiceAccountCredentials()).toBeNull();
    });

    it('type service_account değilse null döner', () => {
        vaultMock.getServiceAccount.mockReturnValue(
            JSON.stringify({ type: 'authorized_user', client_email: 'a', private_key: 'b' }),
        );
        expect(getServiceAccountCredentials()).toBeNull();
    });

    it('private_key eksikse null döner', () => {
        vaultMock.getServiceAccount.mockReturnValue(
            JSON.stringify({ type: 'service_account', client_email: 'a' }),
        );
        expect(getServiceAccountCredentials()).toBeNull();
    });

    it('geçerli SA için credential objesi döner (project_id hariç)', () => {
        vaultMock.getServiceAccount.mockReturnValue(VALID_SA);
        expect(getServiceAccountCredentials()).toEqual({
            client_email: 'sa@project.iam.gserviceaccount.com',
            private_key: 'PRIVATE_KEY_CONTENT',
            client_id: '1234567890',
        });
    });

    it('vault kilitli hatası yukarı taşınır', () => {
        vaultMock.getServiceAccount.mockImplementation(() => {
            throw new Error('Vault kilitli');
        });
        expect(() => getServiceAccountCredentials()).toThrow(/kilitli/i);
    });
});

describe('getStatus', () => {
    it('vault boşsa configured:false döner', () => {
        vaultMock.getServiceAccount.mockReturnValue(null);
        expect(getStatus()).toEqual({ configured: false, email: null, clientId: null });
    });

    it('geçerli SA için configured:true + email/clientId döner', () => {
        vaultMock.getServiceAccount.mockReturnValue(VALID_SA);
        expect(getStatus()).toEqual({
            configured: true,
            email: 'sa@project.iam.gserviceaccount.com',
            clientId: '1234567890',
        });
    });

    it('vault kilitli hatası yutulur → configured:false', () => {
        vaultMock.getServiceAccount.mockImplementation(() => {
            throw new Error('Vault kilitli');
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

    it('geçerli içerik vault\'a yazılır ve sonuç döner', () => {
        const result = uploadFromContent(VALID_SA);
        expect(vaultMock.setServiceAccount).toHaveBeenCalledWith(VALID_SA);
        expect(result).toEqual({
            configured: true,
            email: 'sa@project.iam.gserviceaccount.com',
            clientId: '1234567890',
        });
    });
});

describe('clearKey', () => {
    it('vault\'taki Service Account alanını temizler', () => {
        clearKey();
        expect(vaultMock.clearServiceAccount).toHaveBeenCalled();
    });
});
