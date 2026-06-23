import { vaultManager } from '../services/vault-manager';

interface ServiceAccountKey {
    type?: string;
    client_email?: string;
    private_key?: string;
    project_id?: string;
    /**
     * Numeric Client ID (the Service Account's "Unique ID" field). Pasted into the
     * Admin Console for DWD scope authorization.
     */
    client_id?: string;
}

export interface ServiceAccountStatus {
    configured: boolean;
    email: string | null;
    clientId: string | null;
}

export interface ServiceAccountUploadResult {
    configured: true;
    email: string;
    clientId: string | null;
}

/**
 * Parsed Service Account credentials that can be passed directly to
 * `GoogleAuth({ credentials })`. The decrypted private key lives only in this
 * object's memory — it is never written to disk as plain text.
 */
export interface ServiceAccountCredentials {
    client_email: string;
    private_key: string;
    /** Compatible with GoogleAuth `JWTInput` — if absent, the field is omitted entirely (never assigned undefined). */
    client_id?: string;
}

/**
 * Reads the Service Account key from the unlocked master-password vault and
 * returns the parsed credential object. Returns `null` if the vault has no
 * Service Account stored, or the content is invalid.
 *
 * If the vault is LOCKED, `vaultManager.getServiceAccount()` throws
 * `VaultLockedError` — propagated upward so the caller (worker / IPC handler)
 * surfaces a clear "vault locked" error. In practice SA-backed jobs only run
 * while unlocked (dispatch-gate) or during a pending hard-lock where the DEK is
 * still alive.
 *
 * NO cache: decrypt+parse is cheap, and `GoogleAuth` instances are already cached in
 * the consuming services — which also eliminates the stale-credential class of errors.
 */
export function getServiceAccountCredentials(): ServiceAccountCredentials | null {
    const raw = vaultManager.getServiceAccount();
    if (!raw) return null;
    let json: ServiceAccountKey;
    try {
        json = JSON.parse(raw) as ServiceAccountKey;
    } catch {
        return null;
    }
    if (json.type !== 'service_account' || !json.client_email || !json.private_key) {
        return null;
    }
    const creds: ServiceAccountCredentials = {
        client_email: json.client_email,
        private_key: json.private_key,
    };
    if (json.client_id) creds.client_id = json.client_id;
    return creds;
}

export function getStatus(): ServiceAccountStatus {
    try {
        const creds = getServiceAccountCredentials();
        if (!creds) return { configured: false, email: null, clientId: null };
        return { configured: true, email: creds.client_email, clientId: creds.client_id ?? null };
    } catch {
        // safeStorage unavailable — the status query silently returns "not configured".
        return { configured: false, email: null, clientId: null };
    }
}

export function uploadFromContent(content: string): ServiceAccountUploadResult {
    let parsed: ServiceAccountKey;
    try {
        parsed = JSON.parse(content) as ServiceAccountKey;
    } catch {
        throw new Error('Service Account JSON dosyası geçersiz JSON formatında');
    }
    if (parsed.type !== 'service_account') {
        throw new Error('Bu dosya bir Service Account anahtarı gibi görünmüyor (type !== "service_account")');
    }
    if (!parsed.client_email || !parsed.private_key) {
        throw new Error('Service Account JSON gerekli alanları içermiyor (client_email, private_key)');
    }
    // Writes into the unlocked vault (re-encrypts + persists vault.enc). Throws
    // VaultLockedError if the vault is locked — the IPC handler surfaces it.
    vaultManager.setServiceAccount(content);
    return {
        configured: true,
        email: parsed.client_email,
        clientId: parsed.client_id ?? null,
    };
}

export function clearKey(): void {
    vaultManager.clearServiceAccount();
}
