import { serviceAccountStore } from '../services/secure-storage';

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

/**
 * `GoogleAuth({ credentials })`'a doğrudan verilebilen, parse edilmiş Service
 * Account kimlik bilgileri. Decrypt edilmiş private key yalnızca bu objenin
 * belleğinde yaşar — hiçbir zaman diske düz metin olarak yazılmaz.
 */
export interface ServiceAccountCredentials {
    client_email: string;
    private_key: string;
    /** GoogleAuth `JWTInput` uyumlu — yoksa alan hiç eklenmez (undefined atanmaz). */
    client_id?: string;
}

/**
 * Şifreli depodan Service Account anahtarını okuyup parse edilmiş credential
 * objesini döndürür. Depo boşsa veya içerik geçersizse `null` döner.
 *
 * `safeStorage` kullanılamıyorsa (depo dosyası var ama açılamıyor)
 * `serviceAccountStore.get()` hata fırlatır — bu hata bilinçli olarak yukarı
 * taşınır; çağıran (tüketici servis / IPC handler) net hata gösterir.
 *
 * Cache YOK: decrypt+parse ucuz, `GoogleAuth` instance'ları zaten tüketici
 * servislerde cache'leniyor — bu da stale-credential hata sınıfını eler.
 */
export function getServiceAccountCredentials(): ServiceAccountCredentials | null {
    const raw = serviceAccountStore.get();
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
        // safeStorage kullanılamıyor — durum sorgusu sessizce "yapılandırılmamış".
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
    // safeStorage kullanılamıyorsa burada hata fırlar — IPC handler'ın
    // try/catch'i UI'a taşır (bkz. boot-check hard-fail politikası).
    serviceAccountStore.set(content);
    return {
        configured: true,
        email: parsed.client_email,
        clientId: parsed.client_id ?? null,
    };
}

export function clearKey(): void {
    serviceAccountStore.clear();
}
