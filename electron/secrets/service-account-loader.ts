import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';

interface ServiceAccountKey {
    type?: string;
    client_email?: string;
    private_key?: string;
    project_id?: string;
    /**
     * Numeric Client ID (Service Account'ın "Unique ID" alanı). DWD scope
     * yetkilendirmesi için Admin Console'a yapıştırılır.
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

let cachedKeyPath: string | null = null;

export function getServiceAccountKeyPath(): string {
    if (cachedKeyPath) return cachedKeyPath;
    const dir = path.join(app.getPath('userData'), 'secrets');
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    cachedKeyPath = path.join(dir, 'service-account.json');
    return cachedKeyPath;
}

export function getStatus(): ServiceAccountStatus {
    try {
        const p = getServiceAccountKeyPath();
        if (!existsSync(p)) return { configured: false, email: null, clientId: null };
        const raw = readFileSync(p, 'utf-8');
        const json = JSON.parse(raw) as ServiceAccountKey;
        if (json.type !== 'service_account' || !json.client_email || !json.private_key) {
            return { configured: false, email: null, clientId: null };
        }
        return {
            configured: true,
            email: json.client_email,
            clientId: json.client_id ?? null,
        };
    } catch {
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
    const p = getServiceAccountKeyPath();
    writeFileSync(p, content, { encoding: 'utf-8', mode: 0o600 });
    return {
        configured: true,
        email: parsed.client_email,
        clientId: parsed.client_id ?? null,
    };
}

export function clearKey(): void {
    const p = getServiceAccountKeyPath();
    if (existsSync(p)) {
        unlinkSync(p);
    }
}
