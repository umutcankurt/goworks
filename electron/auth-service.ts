import { getGoogle } from './google-lazy';
import { shell, app } from 'electron';
import { OAuth2Client } from 'google-auth-library';
import http from 'http';
import url from 'url';
import path from 'path';
import fs from 'fs';
import { appConfigService } from './services/app-config-service';
import { secureStorage, authTokenStore } from './services/secure-storage';

const REDIRECT_URI = 'http://localhost:3000/callback';
const SCOPES = [
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/admin.directory.user',
    'https://www.googleapis.com/auth/admin.directory.group',
    'https://www.googleapis.com/auth/admin.reports.audit.readonly',
    'https://www.googleapis.com/auth/admin.directory.orgunit.readonly',
    'https://www.googleapis.com/auth/admin.directory.domain.readonly',
    'https://www.googleapis.com/auth/admin.reports.usage.readonly',
    'https://www.googleapis.com/auth/apps.groups.settings',
];

export class MissingOAuthCredentialsError extends Error {
    constructor() {
        super(
            'Google OAuth bilgileri eksik. Onboarding sihirbazından (veya Settings → Genel → Google Cloud) Client ID ve Secret girilmelidir.',
        );
        this.name = 'MissingOAuthCredentialsError';
    }
}

export class AuthService {
    private oauth2Client: OAuth2Client | null = null;
    private server: http.Server | null = null;
    private currentUserEmail: string | null = null;

    constructor() {
        this.clearStoredTokens();
        this.clearLegacyPlainTokenFile();
    }

    /**
     * Lazily create the OAuth2 client. Credentials are read at runtime from
     * app_config (clientId) + safeStorage (clientSecret) — not from env.
     *
     * When credentials are updated via the onboarding wizard or Settings,
     * `invalidateCredentials()` is called to invalidate the cache.
     */
    private ensureOAuth2Client(): OAuth2Client {
        if (this.oauth2Client) return this.oauth2Client;

        const clientId = appConfigService.get('googleClientId');
        const clientSecret = secureStorage.getClientSecret();
        if (!clientId || !clientSecret) {
            throw new MissingOAuthCredentialsError();
        }

        const google = getGoogle();
        this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
        return this.oauth2Client;
    }

    /**
     * Called when credentials change (onboarding save, Settings update, reset).
     * Clears the current session's access tokens so the user has to log in again.
     */
    invalidateCredentials(): void {
        if (this.oauth2Client) {
            try {
                this.oauth2Client.setCredentials({});
            } catch {
                // ignore
            }
        }
        this.oauth2Client = null;
        this.currentUserEmail = null;
        this.clearStoredTokens();
    }

    private clearStoredTokens() {
        try {
            authTokenStore.clear();
        } catch (e) {
            console.error('Failed to delete stored token file:', e);
        }
    }

    /**
     * Removes the leftover plaintext `google_auth_token.json` written before the
     * migration to safeStorage. In the new version the token is kept only in the
     * encrypted `auth-token.enc`; a plaintext file left over from a previous
     * version must not remain on disk.
     */
    private clearLegacyPlainTokenFile() {
        try {
            const legacy = path.join(app.getPath('userData'), 'google_auth_token.json');
            if (fs.existsSync(legacy)) {
                fs.unlinkSync(legacy);
            }
        } catch (e) {
            console.error('Failed to delete legacy plaintext token file:', e);
        }
    }

    private saveTokens(tokens: any) {
        try {
            // Written encrypted via safeStorage; if safeStorage is unavailable the
            // error is swallowed (token persistence is best-effort anyway — it's
            // cleared on every startup).
            authTokenStore.set(JSON.stringify(tokens));
        } catch (e) {
            console.error('Failed to save tokens:', e);
        }
    }

    async login(): Promise<any> {
        const oauth2Client = this.ensureOAuth2Client();

        if (this.server) {
            this.server.close();
            this.server = null;
        }

        return new Promise((resolve, reject) => {
            const allowedDomain = appConfigService.get('allowedDomain');

            const authUrl = oauth2Client.generateAuthUrl({
                access_type: 'offline',
                scope: SCOPES,
                prompt: 'select_account consent',
                ...(allowedDomain ? { hd: allowedDomain } : {}),
            });

            shell.openExternal(authUrl);

            this.server = http.createServer(async (req, res) => {
                try {
                    if (req.url!.indexOf('/callback') > -1) {
                        const qs = new url.URL(req.url!, 'http://localhost:3000').searchParams;
                        const code = qs.get('code');

                        res.end('Authentication successful! You can close this window now.');

                        if (this.server) {
                            this.server.close();
                            this.server = null;
                        }

                        if (code) {
                            const { tokens } = await oauth2Client.getToken(code);
                            oauth2Client.setCredentials(tokens);
                            this.saveTokens(tokens);

                            const google = getGoogle();
                            const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
                            const { data } = await oauth2.userinfo.get();

                            const allowedDomain = appConfigService.get('allowedDomain');
                            if (!allowedDomain) {
                                if (tokens.access_token) await oauth2Client.revokeToken(tokens.access_token);
                                oauth2Client.setCredentials({});
                                return reject(new Error('Sistem yapılandırılması eksik: izin verilen domain tanımlı değil. Yönetici Settings → Genel\'den domain ayarlamalı.'));
                            }
                            if (!data.email?.endsWith(`@${allowedDomain}`)) {
                                if (tokens.access_token) await oauth2Client.revokeToken(tokens.access_token);
                                oauth2Client.setCredentials({});
                                return reject(new Error(`Yetkisiz Erişim: Sadece @${allowedDomain} uzantılı e-posta adresleri giriş yapabilir.`));
                            }
                            if (!data.email) {
                                if (tokens.access_token) await oauth2Client.revokeToken(tokens.access_token);
                                oauth2Client.setCredentials({});
                                return reject(new Error('Google profilinden e-posta bilgisi alınamadı.'));
                            }

                            try {
                                const adminAPI = google.admin({ version: 'directory_v1', auth: oauth2Client });
                                const userRes = await adminAPI.users.get({ userKey: data.email });
                                if (!userRes.data.isAdmin) {
                                    if (tokens.access_token) await oauth2Client.revokeToken(tokens.access_token);
                                    oauth2Client.setCredentials({});
                                    return reject(new Error('Yetkisiz Erişim: Bu uygulamayı kullanabilmek için Superadmin yetkisine sahip olmalısınız.'));
                                }
                            } catch (adminErr: any) {
                                if (tokens.access_token) await oauth2Client.revokeToken(tokens.access_token);
                                oauth2Client.setCredentials({});
                                return reject(new Error('Yetki doğrulama hatası: Admin erişimi kontrol edilemedi.'));
                            }

                            this.currentUserEmail = data.email ?? null;
                            resolve({
                                tokens,
                                user: data
                            });
                        } else {
                            reject(new Error('No code received'));
                        }
                    }
                } catch (e) {
                    reject(e);
                }
            }).listen(3000, () => {
                console.log('Auth server listening on port 3000');
            });
        });
    }

    async logout() {
        if (this.oauth2Client?.credentials.access_token) {
            try {
                await this.oauth2Client.revokeToken(this.oauth2Client.credentials.access_token);
            } catch (error) {
                console.error('Failed to revoke token on logout:', error);
            }
        }
        this.clearStoredTokens();
        if (this.oauth2Client) {
            this.oauth2Client.setCredentials({});
        }
        this.currentUserEmail = null;
    }

    isAuthenticated(): boolean {
        return !!this.oauth2Client?.credentials.access_token;
    }

    /**
     * Do credentials still exist? Used by the renderer to decide whether to
     * show/hide the "login button". Independent of the current authenticated state.
     */
    hasCredentials(): boolean {
        try {
            return !!appConfigService.get('googleClientId') && secureStorage.hasClientSecret();
        } catch {
            return false;
        }
    }

    /**
     * Access to the OAuth2Client — should only be called after login.
     * Throws MissingOAuthCredentialsError when there are no credentials.
     */
    getClient(): OAuth2Client {
        return this.ensureOAuth2Client();
    }

    getCurrentUserEmail(): string | null {
        return this.currentUserEmail;
    }
}
