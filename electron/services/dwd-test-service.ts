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
    // The renderer normally passes the active user's email (Settings/Onboarding).
    // If the admin email is unknown, fall back to the `admin@domain` guess.
    const domain = appConfigService.get('allowedDomain');
    if (!domain) {
        throw new Error(
            'Admin email belirsiz; önce firma bilgileri adımında allowedDomain doldurulmalı.',
        );
    }
    return `admin@${domain}`;
}

/**
 * Verifies that the Service Account, via admin impersonation, can obtain a token
 * from the core admin/gmail/audit scopes and make a real API call.
 *
 * Instead of a granular per-scope test, it tries each scope with a single combined
 * auth instance — since DWD is usually configured "all or nothing", this gives a
 * single success/failure signal in most cases.
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
        // The token request returns a JWT signed with the DWD scope list.
        // An error here is usually "unauthorized_client" — meaning the admin has
        // not yet added the Client ID to the Admin Console DWD list.
        await auth.getAccessToken();
    } catch (err: any) {
        return {
            ok: false,
            adminEmail,
            failedScopes: [...DWD_SCOPES],
            errorMessage: err?.message || 'Token alınamadı',
        };
    }

    // Actual scope confirmation: a minimal read via admin.directory.user.
    // If this call succeeds, admin impersonation and user read access are present.
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
