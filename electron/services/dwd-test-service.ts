import { GoogleAuth } from 'google-auth-library';
import { getGoogle } from '../google-lazy';
import { getServiceAccountCredentials } from '../secrets/service-account-loader';
import { appConfigService } from './app-config-service';
import { DWD_SCOPES } from './dwd-scopes';

export interface DwdTestResult {
    ok: boolean;
    adminEmail: string;
    failedScopes: string[];
    errorMessage?: string;
}

function deriveAdminEmail(explicit?: string): string {
    if (explicit && explicit.includes('@')) return explicit.trim();
    // Renderer normalde aktif kullanıcının email'ini geçirir (Settings/Onboarding).
    // Admin email belirsizse `admin@domain` tahmini fallback'e düş.
    const domain = appConfigService.get('allowedDomain');
    if (!domain) {
        throw new Error(
            'Admin email belirsiz; önce firma bilgileri adımında allowedDomain doldurulmalı.',
        );
    }
    return `admin@${domain}`;
}

/**
 * Service Account'ın admin impersonation ile temel admin/gmail/audit
 * scope'larından bir token alıp gerçek bir API çağrısı yapabildiğini doğrular.
 *
 * Granular per-scope test yerine kombine bir auth instance ile her scope'u
 * tek tek dener — DWD genelde "ya hepsi ya hiçbiri" şekilde konfigüre olduğu
 * için bu çoğu durumda tek bir başarı/başarısızlık sinyali verir.
 */
export async function testDwdScopes(adminEmailOverride?: string): Promise<DwdTestResult> {
    const credentials = getServiceAccountCredentials();
    if (!credentials) {
        throw new Error(
            'Service Account yapılandırılmamış. Önce JSON anahtarı yüklenmeli.',
        );
    }

    const adminEmail = deriveAdminEmail(adminEmailOverride);

    const auth = new GoogleAuth({
        credentials,
        scopes: [...DWD_SCOPES],
        clientOptions: { subject: adminEmail },
    });

    try {
        // Token isteği DWD scope listesi ile imzalanmış JWT döndürür.
        // Burada hata genelde "unauthorized_client" — admin Client ID'yi
        // henüz Admin Console DWD listesine eklememiş demektir.
        await auth.getAccessToken();
    } catch (err: any) {
        return {
            ok: false,
            adminEmail,
            failedScopes: [...DWD_SCOPES],
            errorMessage: err?.message || 'Token alınamadı',
        };
    }

    // Asıl scope onayı: admin.directory.user üzerinden minimum bir okuma.
    // Bu çağrı başarılı olursa admin impersonation ve user okuma yetkisi vardır.
    try {
        const admin = getGoogle().admin({ version: 'directory_v1', auth });
        await admin.users.list({ customer: 'my_customer', maxResults: 1 });
    } catch (err: any) {
        return {
            ok: false,
            adminEmail,
            failedScopes: [...DWD_SCOPES],
            errorMessage:
                err?.errors?.[0]?.message ||
                err?.message ||
                'admin.directory.user scope doğrulanamadı',
        };
    }

    return { ok: true, adminEmail, failedScopes: [] };
}
