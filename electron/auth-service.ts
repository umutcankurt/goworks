import { getGoogle } from './google-lazy';
import { shell, app } from 'electron';
import { OAuth2Client } from 'google-auth-library';
import http from 'http';
import url from 'url';
import path from 'path';
import fs from 'fs';
import { appConfigService } from './services/app-config-service';
import { vaultManager } from './services/vault-manager';
import { logger } from './services/logger';
import { withRetry } from './services/retry';

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
    // Signature media: upload images to Drive + authorize files picked via Google Picker.
    // Narrowest scope — only files the app creates or the user explicitly picks.
    'https://www.googleapis.com/auth/drive.file',
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
        // Tokens are NO LONGER cleared on startup. The refresh token now lives in
        // the master-password vault and must survive restarts so the Google
        // session can be silently restored after the vault is unlocked (no browser
        // OAuth dance). Only the leftover legacy plaintext file is purged.
        this.clearLegacyPlainTokenFile();
    }

    /**
     * Lazily create the OAuth2 client. Credentials are read at runtime from
     * app_config (clientId + clientSecret) — not from env.
     *
     * No redirect URI is baked in here: as a desktop ("installed") app this is a
     * public client and the loopback redirect is bound to an ephemeral port per
     * login (see `login()`), so the redirect URI is supplied dynamically to
     * `generateAuthUrl` / `getToken`. `restoreSession()` only refreshes via the
     * refresh token and never uses a redirect URI.
     *
     * When credentials are updated via the onboarding wizard or Settings,
     * `invalidateCredentials()` is called to invalidate the cache.
     */
    private ensureOAuth2Client(): OAuth2Client {
        if (this.oauth2Client) return this.oauth2Client;

        const clientId = appConfigService.get('googleClientId');
        const clientSecret = appConfigService.get('googleClientSecret');
        if (!clientId || !clientSecret) {
            throw new MissingOAuthCredentialsError();
        }

        const google = getGoogle();
        this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
        return this.oauth2Client;
    }

    /**
     * Called when credentials change (onboarding save, Settings update, reset).
     * Clears the current session's access tokens so the user has to log in again.
     */
    invalidateCredentials(): void {
        this.dropInMemoryCredentials();
    }

    /**
     * Drop the in-memory OAuth credentials WITHOUT revoking at Google and WITHOUT
     * touching the vault. This is the "lock" operation (idle / vault hard-lock):
     * the refresh token survives in the vault so the session can be silently
     * restored on the next unlock. Contrast with `logout()`, which revokes and
     * deletes the refresh token.
     */
    dropInMemoryCredentials(): void {
        if (this.oauth2Client) {
            try {
                this.oauth2Client.setCredentials({});
            } catch {
                // ignore
            }
        }
        this.oauth2Client = null;
        this.currentUserEmail = null;
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

    private saveTokens(tokens: { refresh_token?: string | null }) {
        // Persist ONLY the refresh token, encrypted in the vault. The access token
        // is short-lived and kept in the in-memory OAuth2 client. Google omits
        // refresh_token on refreshes after the first consent — don't overwrite a
        // good stored token with undefined.
        try {
            if (tokens?.refresh_token) {
                vaultManager.setRefreshToken(tokens.refresh_token);
            }
        } catch (e) {
            console.error('Failed to persist refresh token to vault:', e);
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

            // The loopback redirect URI is bound to an ephemeral port (see
            // server.listen(0) below) and filled in once the OS assigns the port.
            // A desktop OAuth client auto-allows any loopback port, so nothing has
            // to be registered in Cloud Console.
            let redirectUri = '';

            const server = http.createServer(async (req, res) => {
                try {
                    if (req.url!.indexOf('/callback') > -1) {
                        const qs = new url.URL(req.url!, 'http://localhost').searchParams;
                        const code = qs.get('code');

                        res.end('Authentication successful! You can close this window now.');

                        if (this.server) {
                            this.server.close();
                            this.server = null;
                        }

                        if (code) {
                            const { tokens } = await oauth2Client.getToken({ code, redirect_uri: redirectUri });
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
            });

            this.server = server;
            server.on('error', reject);

            // Bind to an ephemeral port (0 = OS-assigned) so login never fails
            // because a fixed port is already taken. Only once the port is known
            // can we build the redirect URI and the auth URL.
            server.listen(0, () => {
                const addr = server.address();
                const port = addr && typeof addr === 'object' ? addr.port : 0;
                redirectUri = `http://localhost:${port}/callback`;

                const authUrl = oauth2Client.generateAuthUrl({
                    access_type: 'offline',
                    scope: SCOPES,
                    prompt: 'select_account consent',
                    redirect_uri: redirectUri,
                    ...(allowedDomain ? { hd: allowedDomain } : {}),
                });

                shell.openExternal(authUrl);
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
        // Full logout: also drop the persisted refresh token (vs. a lock, which
        // keeps it for silent restore). Best-effort — the vault may be locked.
        try {
            vaultManager.setRefreshToken(null);
        } catch {
            // vault locked / no vault — nothing to clear
        }
        if (this.oauth2Client) {
            this.oauth2Client.setCredentials({});
        }
        this.currentUserEmail = null;
    }

    /**
     * Restore the Google session from the vault's refresh token after an unlock —
     * no browser OAuth. Sets credentials, forces a silent access-token refresh and
     * (best-effort) restores the current user email. Returns whether a full
     * re-login is required (refresh token missing/invalid/revoked).
     */
    async restoreSession(): Promise<{ authenticated: boolean; reauthNeeded: boolean }> {
        let client: OAuth2Client;
        try {
            client = this.ensureOAuth2Client();
        } catch {
            // No OAuth credentials configured yet (fresh onboarding).
            return { authenticated: false, reauthNeeded: true };
        }
        let refreshToken: string | null = null;
        try {
            refreshToken = vaultManager.getRefreshToken();
        } catch {
            refreshToken = null;
        }
        if (!refreshToken) {
            return { authenticated: false, reauthNeeded: true };
        }
        client.setCredentials({ refresh_token: refreshToken });
        try {
            // Retry transient failures (503/ECONNRESET) so a momentary network blip
            // during unlock doesn't drop the user into a full re-login.
            const { token } = await withRetry(
                () => client.getAccessToken(),
                logger,
                'restoreSession.getAccessToken',
            );
            if (!token) throw new Error('No access token from refresh');
            // Best-effort: restore the signed-in admin email.
            try {
                const google = getGoogle();
                const oauth2 = google.oauth2({ version: 'v2', auth: client });
                const { data } = await oauth2.userinfo.get();
                this.currentUserEmail = data.email ?? null;
            } catch {
                // email is best-effort; the session is still authenticated
            }
            return { authenticated: true, reauthNeeded: false };
        } catch (err: any) {
            // invalid_grant / revoked / expired / scope change → full re-login.
            // Log the real reason — this path used to be silent, which made
            // post-unlock "session expired" states impossible to diagnose from logs.
            const reason = err?.response?.data?.error ?? err?.message ?? String(err);
            logger.warn(`[restoreSession] silent refresh failed → re-login needed: ${reason}`);
            client.setCredentials({});
            this.oauth2Client = null;
            return { authenticated: false, reauthNeeded: true };
        }
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
            return !!appConfigService.get('googleClientId') && !!appConfigService.get('googleClientSecret');
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
