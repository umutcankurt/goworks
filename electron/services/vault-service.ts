/**
 * Master-password zero-trust vault — pure crypto + file layer (no Electron deps).
 *
 * Two-layer key model (KEK/DEK):
 *  - master password --Argon2id(salt)--> KEK
 *  - random DEK encrypts the actual secrets
 *  - DEK is wrapped (AES-256-GCM) with the KEK and stored on disk
 *  - changing the password only re-wraps the DEK, not the payload
 *
 * On disk (`vault.enc`) we persist ONLY: salt + wrapped-DEK + encrypted payload
 * (each with its own 96-bit GCM nonce + 128-bit auth tag). The password, the KEK
 * and the DEK are NEVER written to disk. A wrong password fails cleanly on the
 * GCM auth tag of the wrapped DEK.
 *
 * The vault payload holds the two most sensitive secrets only:
 *   - `serviceAccount` — raw Service Account JSON (DWD private key)
 *   - `refreshToken`   — OAuth refresh token
 * Everything else (clientId, client secret, branding, allowedDomain) stays in
 * plaintext app_config because it is needed BEFORE the vault is unlocked.
 *
 * This module is deliberately Electron-independent so it can be unit-tested with
 * plain Node (`node:crypto` + `@noble/hashes` are pure JS — no native build).
 */
import { argon2id } from '@noble/hashes/argon2.js';
import {
    createCipheriv,
    createDecipheriv,
    randomBytes,
} from 'node:crypto';
import {
    closeSync,
    existsSync,
    fsyncSync,
    openSync,
    readFileSync,
    renameSync,
    statSync,
    unlinkSync,
    writeSync,
} from 'node:fs';

const SALT_LEN = 16;
const DEK_LEN = 32; // AES-256
const KEK_LEN = 32; // AES-256
const NONCE_LEN = 12; // GCM standard 96-bit nonce
const VAULT_VERSION = 1;

/** Argon2id cost parameters. Persisted in the header so they can be raised later
 *  without breaking existing vaults. m is in KiB (65536 = 64 MiB). */
export interface KdfParams {
    algo: 'argon2id';
    m: number;
    t: number;
    p: number;
}

export const DEFAULT_KDF_PARAMS: KdfParams = {
    algo: 'argon2id',
    m: 65536, // 64 MiB
    t: 3,
    p: 1, // pure-JS Argon2 is single-threaded
};

/** Known payload fields. Both optional — a freshly created vault is empty. */
export interface VaultPayload {
    serviceAccount?: string;
    refreshToken?: string;
}

export type VaultFieldName = keyof VaultPayload;

/** A GCM-encrypted blob: ciphertext + nonce + auth tag (base64 on disk). */
interface GcmBlobB64 {
    ct: string;
    nonce: string;
    tag: string;
}

interface GcmBlob {
    ct: Buffer;
    nonce: Buffer;
    tag: Buffer;
}

interface VaultFileV1 {
    version: number;
    kdf: KdfParams & { salt: string };
    cipher: 'aes-256-gcm';
    wrappedDek: GcmBlobB64;
    payload: GcmBlobB64;
}

/** Thrown when the master password is wrong (wrapped-DEK GCM tag mismatch). */
export class WrongPasswordError extends Error {
    constructor() {
        super('Parola hatalı.');
        this.name = 'WrongPasswordError';
    }
}

/** Thrown when the vault file is malformed or the payload fails authentication. */
export class VaultCorruptError extends Error {
    constructor(message = 'Vault dosyası bozuk veya okunamıyor.') {
        super(message);
        this.name = 'VaultCorruptError';
    }
}

/** Thrown when an operation requires an unlocked vault but it is locked. */
export class VaultLockedError extends Error {
    constructor() {
        super('Vault kilitli — önce ana parola ile açılmalı.');
        this.name = 'VaultLockedError';
    }
}

/** Internal: raised by gcmDecrypt; callers translate to a domain error. */
class GcmAuthError extends Error {}

function gcmEncrypt(key: Buffer, plaintext: Buffer): GcmBlob {
    const nonce = randomBytes(NONCE_LEN);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { ct, nonce, tag };
}

function gcmDecrypt(key: Buffer, blob: GcmBlob): Buffer {
    const decipher = createDecipheriv('aes-256-gcm', key, blob.nonce);
    decipher.setAuthTag(blob.tag);
    try {
        return Buffer.concat([decipher.update(blob.ct), decipher.final()]);
    } catch {
        // GCM auth tag mismatch — wrong key or tampered ciphertext.
        throw new GcmAuthError();
    }
}

function deriveKek(password: string, salt: Buffer, params: KdfParams): Buffer {
    // NFC-normalize so the same password typed on different platforms/keyboards
    // derives the same key.
    const pw = new TextEncoder().encode(password.normalize('NFC'));
    // @noble/hashes only accepts a genuine Uint8Array (it rejects Node Buffers
    // whose constructor name isn't "Uint8Array", which also avoids cross-realm
    // mismatches under jsdom). `salt` is a Buffer, so copy it into a plain array.
    const saltBytes = Uint8Array.from(salt);
    const out = argon2id(pw, saltBytes, { t: params.t, m: params.m, p: params.p, dkLen: KEK_LEN });
    return Buffer.from(out);
}

function blobToB64(blob: GcmBlob): GcmBlobB64 {
    return {
        ct: blob.ct.toString('base64'),
        nonce: blob.nonce.toString('base64'),
        tag: blob.tag.toString('base64'),
    };
}

function b64ToBlob(b: unknown): GcmBlob {
    if (
        !b || typeof b !== 'object' ||
        typeof (b as GcmBlobB64).ct !== 'string' ||
        typeof (b as GcmBlobB64).nonce !== 'string' ||
        typeof (b as GcmBlobB64).tag !== 'string'
    ) {
        throw new VaultCorruptError();
    }
    const blob = b as GcmBlobB64;
    return {
        ct: Buffer.from(blob.ct, 'base64'),
        nonce: Buffer.from(blob.nonce, 'base64'),
        tag: Buffer.from(blob.tag, 'base64'),
    };
}

/**
 * In-memory vault. Holds the DEK and decrypted payload ONLY while unlocked.
 * `lock()` zeroes the DEK buffer. The header (salt + KDF params), wrapped DEK
 * and encrypted payload are kept so the file can be re-serialized while locked
 * (needed by migration / field updates).
 */
export class Vault {
    private params: KdfParams;
    private salt: Buffer;
    private wrappedDek: GcmBlob;
    private encPayload: GcmBlob;
    private dek: Buffer | null = null;
    private payload: VaultPayload | null = null;

    private constructor(
        params: KdfParams,
        salt: Buffer,
        wrappedDek: GcmBlob,
        encPayload: GcmBlob,
    ) {
        this.params = params;
        this.salt = salt;
        this.wrappedDek = wrappedDek;
        this.encPayload = encPayload;
    }

    /**
     * Create a brand-new vault with an empty payload. Returns an UNLOCKED vault
     * (DEK in memory) so the caller can immediately `setField()` during
     * onboarding. The caller persists it via `serialize()` / `writeVaultFileAtomic()`.
     */
    static create(password: string, params: KdfParams = DEFAULT_KDF_PARAMS): Vault {
        const salt = randomBytes(SALT_LEN);
        const dek = randomBytes(DEK_LEN);
        const kek = deriveKek(password, salt, params);
        try {
            const wrappedDek = gcmEncrypt(kek, dek);
            const payload: VaultPayload = {};
            const encPayload = gcmEncrypt(dek, Buffer.from(JSON.stringify(payload), 'utf8'));
            const vault = new Vault(params, salt, wrappedDek, encPayload);
            vault.dek = dek;
            vault.payload = payload;
            return vault;
        } finally {
            kek.fill(0);
        }
    }

    /**
     * Parse a `vault.enc` byte buffer into a LOCKED vault. Throws
     * `VaultCorruptError` if the structure is invalid. Call `unlock()` next.
     */
    static fromBytes(buf: Buffer): Vault {
        let file: VaultFileV1;
        try {
            file = JSON.parse(buf.toString('utf8')) as VaultFileV1;
        } catch {
            throw new VaultCorruptError('Vault dosyası geçerli JSON değil.');
        }
        if (
            !file || file.version !== VAULT_VERSION ||
            file.cipher !== 'aes-256-gcm' ||
            !file.kdf || file.kdf.algo !== 'argon2id' ||
            typeof file.kdf.salt !== 'string' ||
            typeof file.kdf.m !== 'number' || typeof file.kdf.t !== 'number' || typeof file.kdf.p !== 'number'
        ) {
            throw new VaultCorruptError();
        }
        const params: KdfParams = { algo: 'argon2id', m: file.kdf.m, t: file.kdf.t, p: file.kdf.p };
        const salt = Buffer.from(file.kdf.salt, 'base64');
        return new Vault(params, salt, b64ToBlob(file.wrappedDek), b64ToBlob(file.payload));
    }

    /**
     * Derive the KEK from the password, unwrap the DEK and decrypt the payload.
     * Throws `WrongPasswordError` on a bad password (wrapped-DEK tag mismatch),
     * `VaultCorruptError` if the payload itself fails to authenticate/parse.
     */
    unlock(password: string): void {
        const kek = deriveKek(password, this.salt, this.params);
        let dek: Buffer;
        try {
            dek = gcmDecrypt(kek, this.wrappedDek);
        } catch (e) {
            if (e instanceof GcmAuthError) throw new WrongPasswordError();
            throw e;
        } finally {
            kek.fill(0);
        }
        let payload: VaultPayload;
        try {
            const plain = gcmDecrypt(dek, this.encPayload);
            payload = JSON.parse(plain.toString('utf8')) as VaultPayload;
        } catch {
            dek.fill(0);
            throw new VaultCorruptError('Vault içeriği çözülemedi.');
        }
        this.dek = dek;
        this.payload = payload;
    }

    /** Wipe the DEK and decrypted payload from memory. Idempotent. */
    lock(): void {
        if (this.dek) this.dek.fill(0);
        this.dek = null;
        this.payload = null;
    }

    isUnlocked(): boolean {
        return this.dek !== null;
    }

    getField(name: VaultFieldName): string | null {
        if (!this.payload) throw new VaultLockedError();
        return this.payload[name] ?? null;
    }

    /** Set (or delete, when `value === null`) a field and re-encrypt the payload. */
    setField(name: VaultFieldName, value: string | null): void {
        if (!this.dek || !this.payload) throw new VaultLockedError();
        if (value === null) {
            delete this.payload[name];
        } else {
            this.payload[name] = value;
        }
        this.encPayload = gcmEncrypt(this.dek, Buffer.from(JSON.stringify(this.payload), 'utf8'));
    }

    /**
     * Re-key the vault to a new master password. Requires the vault to be UNLOCKED
     * (the DEK must be in memory). Verifies `current` against the existing wrapped
     * DEK, then derives a fresh KEK from `next` (+ a new salt) and re-wraps the SAME
     * DEK. The encrypted payload (Service Account + refresh token) is NOT touched —
     * no secret is decrypted or re-encrypted here. Throws `WrongPasswordError` if
     * `current` is wrong, `VaultLockedError` if the vault is locked.
     */
    changePassword(current: string, next: string): void {
        if (!this.dek) throw new VaultLockedError();
        // Verify the current password against the existing wrapped DEK.
        const oldKek = deriveKek(current, this.salt, this.params);
        try {
            gcmDecrypt(oldKek, this.wrappedDek);
        } catch (e) {
            if (e instanceof GcmAuthError) throw new WrongPasswordError();
            throw e;
        } finally {
            oldKek.fill(0);
        }
        // Re-wrap the live DEK under a fresh salt + KEK derived from the new password.
        const newSalt = randomBytes(SALT_LEN);
        const newKek = deriveKek(next, newSalt, this.params);
        try {
            this.wrappedDek = gcmEncrypt(newKek, this.dek);
            this.salt = newSalt;
        } finally {
            newKek.fill(0);
        }
    }

    /** Serialize the current state to `vault.enc` bytes. Works locked or unlocked. */
    serialize(): Buffer {
        const file: VaultFileV1 = {
            version: VAULT_VERSION,
            kdf: { ...this.params, salt: this.salt.toString('base64') },
            cipher: 'aes-256-gcm',
            wrappedDek: blobToB64(this.wrappedDek),
            payload: blobToB64(this.encPayload),
        };
        return Buffer.from(JSON.stringify(file), 'utf8');
    }
}

/**
 * Atomically write vault bytes: write to `<path>.tmp`, fsync, then rename over
 * the target. Prevents a half-written vault from corrupting an existing one.
 */
export function writeVaultFileAtomic(filePath: string, bytes: Buffer): void {
    const tmp = `${filePath}.tmp`;
    const fd = openSync(tmp, 'w', 0o600);
    try {
        writeSync(fd, bytes);
        fsyncSync(fd);
    } finally {
        closeSync(fd);
    }
    renameSync(tmp, filePath);
}

/** Read `vault.enc` bytes, or `null` if the file does not exist. */
export function readVaultFile(filePath: string): Buffer | null {
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath);
}

/** Delete the vault file (and any leftover temp). Used by factory reset / vault reset.
 * Best-effort secure delete: overwrite the bytes with random data before unlinking so
 * the encrypted Service Account key / refresh token don't linger in a recoverable form.
 * (On SSDs with wear-levelling this is not a guarantee, but it raises the bar over a
 * plain unlink — and the payload is already encrypted at rest.) */
export function deleteVaultFile(filePath: string): void {
    secureUnlink(filePath);
    secureUnlink(`${filePath}.tmp`);
}

function secureUnlink(filePath: string): void {
    if (!existsSync(filePath)) return;
    try {
        const size = statSync(filePath).size;
        if (size > 0) {
            const fd = openSync(filePath, 'r+');
            try {
                writeSync(fd, randomBytes(size), 0, size, 0);
                fsyncSync(fd);
            } finally {
                closeSync(fd);
            }
        }
    } catch {
        /* overwrite is best-effort; fall through to the unlink below */
    }
    unlinkSync(filePath);
}
