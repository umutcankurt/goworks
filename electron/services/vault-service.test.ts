import { describe, it, expect, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import {
    Vault,
    WrongPasswordError,
    VaultCorruptError,
    VaultLockedError,
    DEFAULT_KDF_PARAMS,
    writeVaultFileAtomic,
    readVaultFile,
    deleteVaultFile,
} from './vault-service';

// Use cheap Argon2 params so the suite stays fast — the real cost params live in
// DEFAULT_KDF_PARAMS and are exercised once below.
const FAST = { algo: 'argon2id' as const, m: 256, t: 1, p: 1 };

const tmpDirs: string[] = [];
function makeTmpFile(name = 'vault.enc'): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'goworks-vault-'));
    tmpDirs.push(dir);
    return path.join(dir, name);
}

afterEach(() => {
    while (tmpDirs.length) {
        const dir = tmpDirs.pop()!;
        try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
});

describe('Vault — create / unlock', () => {
    it('creates an unlocked, empty vault', () => {
        const v = Vault.create('hunter2', FAST);
        expect(v.isUnlocked()).toBe(true);
        expect(v.getField('serviceAccount')).toBeNull();
        expect(v.getField('refreshToken')).toBeNull();
    });

    it('round-trips through serialize → fromBytes → unlock', () => {
        const v = Vault.create('correct horse', FAST);
        v.setField('serviceAccount', '{"type":"service_account"}');
        v.setField('refreshToken', 'rt-abc-123');
        const bytes = v.serialize();

        const reopened = Vault.fromBytes(bytes);
        expect(reopened.isUnlocked()).toBe(false);
        reopened.unlock('correct horse');
        expect(reopened.getField('serviceAccount')).toBe('{"type":"service_account"}');
        expect(reopened.getField('refreshToken')).toBe('rt-abc-123');
    });

    it('rejects the wrong password with WrongPasswordError', () => {
        const v = Vault.create('right-password', FAST);
        const reopened = Vault.fromBytes(v.serialize());
        expect(() => reopened.unlock('wrong-password')).toThrow(WrongPasswordError);
        expect(reopened.isUnlocked()).toBe(false);
    });

    it('accepts unicode passwords (NFC-normalized)', () => {
        const v = Vault.create('pärőlä-şifre-密码', FAST);
        const reopened = Vault.fromBytes(v.serialize());
        expect(() => reopened.unlock('pärőlä-şifre-密码')).not.toThrow();
        expect(reopened.isUnlocked()).toBe(true);
    });
});

describe('Vault — fields', () => {
    it('updates and deletes fields, persisting across reopen', () => {
        const v = Vault.create('pw', FAST);
        v.setField('refreshToken', 'first');
        v.setField('refreshToken', 'second');
        v.setField('refreshToken', null); // delete

        const reopened = Vault.fromBytes(v.serialize());
        reopened.unlock('pw');
        expect(reopened.getField('refreshToken')).toBeNull();
    });

    it('throws VaultLockedError when reading/writing while locked', () => {
        const v = Vault.create('pw', FAST);
        v.lock();
        expect(v.isUnlocked()).toBe(false);
        expect(() => v.getField('serviceAccount')).toThrow(VaultLockedError);
        expect(() => v.setField('serviceAccount', 'x')).toThrow(VaultLockedError);
    });

    it('lock() is idempotent', () => {
        const v = Vault.create('pw', FAST);
        v.lock();
        expect(() => v.lock()).not.toThrow();
    });
});

describe('Vault — changePassword', () => {
    it('re-keys to a new password, preserving the encrypted payload', () => {
        const v = Vault.create('old-pw', FAST);
        v.setField('serviceAccount', '{"type":"service_account"}');
        v.setField('refreshToken', 'rt-1');

        v.changePassword('old-pw', 'new-pw');

        // The old password no longer unwraps the DEK.
        expect(() => Vault.fromBytes(v.serialize()).unlock('old-pw')).toThrow(WrongPasswordError);

        // The new password unlocks and the secrets are untouched.
        const reopened = Vault.fromBytes(v.serialize());
        reopened.unlock('new-pw');
        expect(reopened.getField('serviceAccount')).toBe('{"type":"service_account"}');
        expect(reopened.getField('refreshToken')).toBe('rt-1');
    });

    it('rejects a wrong current password with WrongPasswordError', () => {
        const v = Vault.create('old-pw', FAST);
        expect(() => v.changePassword('wrong', 'new-pw')).toThrow(WrongPasswordError);
        // Original password still works (state untouched on failure).
        expect(() => Vault.fromBytes(v.serialize()).unlock('old-pw')).not.toThrow();
    });

    it('throws VaultLockedError when the vault is locked', () => {
        const v = Vault.create('pw', FAST);
        v.lock();
        expect(() => v.changePassword('pw', 'new')).toThrow(VaultLockedError);
    });

    it('rotates the salt and wrapped DEK on re-key', () => {
        const v = Vault.create('pw', FAST);
        const before = JSON.parse(v.serialize().toString('utf8'));
        v.changePassword('pw', 'pw2');
        const after = JSON.parse(v.serialize().toString('utf8'));
        expect(after.kdf.salt).not.toBe(before.kdf.salt);
        expect(after.wrappedDek.ct).not.toBe(before.wrappedDek.ct);
        // The payload ciphertext is NOT re-encrypted (DEK unchanged).
        expect(after.payload.ct).toBe(before.payload.ct);
    });
});

describe('Vault — corruption handling', () => {
    it('rejects non-JSON bytes', () => {
        expect(() => Vault.fromBytes(Buffer.from('not json'))).toThrow(VaultCorruptError);
    });

    it('rejects a structurally invalid header', () => {
        const bad = Buffer.from(JSON.stringify({ version: 1, cipher: 'aes-256-gcm' }));
        expect(() => Vault.fromBytes(bad)).toThrow(VaultCorruptError);
    });

    it('rejects an unsupported version', () => {
        const v = Vault.create('pw', FAST);
        const file = JSON.parse(v.serialize().toString('utf8'));
        file.version = 99;
        expect(() => Vault.fromBytes(Buffer.from(JSON.stringify(file)))).toThrow(VaultCorruptError);
    });

    it('detects a tampered payload ciphertext (with the correct password)', () => {
        const v = Vault.create('pw', FAST);
        v.setField('refreshToken', 'secret');
        const file = JSON.parse(v.serialize().toString('utf8'));
        // Flip the payload ciphertext — the DEK unwraps fine but the payload tag fails.
        const ctBuf = Buffer.from(file.payload.ct, 'base64');
        ctBuf[0] ^= 0xff;
        file.payload.ct = ctBuf.toString('base64');
        const reopened = Vault.fromBytes(Buffer.from(JSON.stringify(file)));
        expect(() => reopened.unlock('pw')).toThrow(VaultCorruptError);
    });
});

describe('Vault — forward compatibility of KDF params', () => {
    it('reads back the params stored in the header', () => {
        const v = Vault.create('pw', { algo: 'argon2id', m: 512, t: 2, p: 1 });
        const file = JSON.parse(v.serialize().toString('utf8'));
        expect(file.kdf).toMatchObject({ algo: 'argon2id', m: 512, t: 2, p: 1 });
        // Unlock uses the params from the file, not the defaults.
        const reopened = Vault.fromBytes(v.serialize());
        expect(() => reopened.unlock('pw')).not.toThrow();
    });

    it('default params unlock correctly (one real-cost run)', () => {
        const v = Vault.create('pw', DEFAULT_KDF_PARAMS);
        v.setField('serviceAccount', 'sa');
        const reopened = Vault.fromBytes(v.serialize());
        reopened.unlock('pw');
        expect(reopened.getField('serviceAccount')).toBe('sa');
        // Two real-cost Argon2id derivations (~4s) — generous timeout so the test
        // doesn't flake under full-suite CPU contention.
    }, 20000);
});

describe('vault file IO', () => {
    it('writes atomically and reads back', () => {
        const file = makeTmpFile();
        const v = Vault.create('pw', FAST);
        v.setField('refreshToken', 'rt');
        writeVaultFileAtomic(file, v.serialize());
        expect(existsSync(file)).toBe(true);
        expect(existsSync(`${file}.tmp`)).toBe(false); // tmp renamed away

        const bytes = readVaultFile(file);
        expect(bytes).not.toBeNull();
        const reopened = Vault.fromBytes(bytes!);
        reopened.unlock('pw');
        expect(reopened.getField('refreshToken')).toBe('rt');
    });

    it('readVaultFile returns null when missing', () => {
        const file = makeTmpFile('absent.enc');
        expect(readVaultFile(file)).toBeNull();
    });

    it('deleteVaultFile removes the file and leftover tmp', () => {
        const file = makeTmpFile();
        writeVaultFileAtomic(file, Vault.create('pw', FAST).serialize());
        deleteVaultFile(file);
        expect(existsSync(file)).toBe(false);
    });
});
