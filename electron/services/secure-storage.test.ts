import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- In-memory fs + safeStorage mock ---

const files = vi.hoisted(() => new Map<string, Buffer>());

const fsMock = vi.hoisted(() => ({
    existsSync: vi.fn((p: string) => files.has(p)),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn((p: string) => {
        const v = files.get(p);
        if (!v) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        return v;
    }),
    writeFileSync: vi.fn((p: string, data: Buffer | string) => {
        files.set(p, Buffer.isBuffer(data) ? data : Buffer.from(String(data)));
    }),
    unlinkSync: vi.fn((p: string) => {
        files.delete(p);
    }),
}));

const encAvailable = vi.hoisted(() => ({ value: true }));

const safeStorageMock = vi.hoisted(() => ({
    isEncryptionAvailable: vi.fn(() => encAvailable.value),
    encryptString: vi.fn((s: string) => Buffer.from('enc:' + s)),
    decryptString: vi.fn((b: Buffer) => b.toString('utf-8').replace(/^enc:/, '')),
}));

vi.mock('electron', () => ({
    app: { getPath: vi.fn(() => '/tmp/test-userData') },
    safeStorage: safeStorageMock,
}));

vi.mock('node:fs', () => ({ default: fsMock, ...fsMock }));

import { secureStorage, serviceAccountStore, authTokenStore } from './secure-storage';

beforeEach(() => {
    files.clear();
    vi.clearAllMocks();
    encAvailable.value = true;
});

describe('secureStorage (OAuth client secret)', () => {
    it('set + get round-trip yapar', () => {
        secureStorage.setClientSecret('my-secret');
        expect(secureStorage.getClientSecret()).toBe('my-secret');
    });

    it('dosya yokken get null döner', () => {
        expect(secureStorage.getClientSecret()).toBeNull();
    });

    it('has dosya varlığını yansıtır, clear siler', () => {
        expect(secureStorage.hasClientSecret()).toBe(false);
        secureStorage.setClientSecret('x');
        expect(secureStorage.hasClientSecret()).toBe(true);
        secureStorage.clearClientSecret();
        expect(secureStorage.hasClientSecret()).toBe(false);
    });

    it('encryption yoksa set hata fırlatır', () => {
        encAvailable.value = false;
        expect(() => secureStorage.setClientSecret('x')).toThrow(/keychain/i);
    });

    it('boş secret reddedilir', () => {
        expect(() => secureStorage.setClientSecret('   ')).toThrow(/[Bb]oş/);
    });

    it('dosya var ama encryption yoksa get hata fırlatır', () => {
        secureStorage.setClientSecret('x');
        encAvailable.value = false;
        expect(() => secureStorage.getClientSecret()).toThrow(/keychain/i);
    });
});

describe.each([
    ['serviceAccountStore', serviceAccountStore],
    ['authTokenStore', authTokenStore],
] as const)('%s', (_name, store) => {
    it('set + get round-trip yapar', () => {
        store.set('{"a":1}');
        expect(store.get()).toBe('{"a":1}');
    });

    it('dosya yokken get null döner', () => {
        expect(store.get()).toBeNull();
    });

    it('has + clear doğru çalışır', () => {
        expect(store.has()).toBe(false);
        store.set('payload');
        expect(store.has()).toBe(true);
        store.clear();
        expect(store.has()).toBe(false);
    });

    it('encryption yoksa set hata fırlatır', () => {
        encAvailable.value = false;
        expect(() => store.set('payload')).toThrow(/keychain/i);
    });

    it('dosya var ama encryption yoksa get hata fırlatır', () => {
        store.set('payload');
        encAvailable.value = false;
        expect(() => store.get()).toThrow(/keychain/i);
    });

    it('iki depo birbirinden bağımsız dosyalara yazar', () => {
        store.set('payload');
        // The other two stores must not be affected by this write.
        expect(secureStorage.hasClientSecret()).toBe(false);
    });
});
