import { getGoogle } from './google-lazy';
import { shell, app } from 'electron';
import { OAuth2Client } from 'google-auth-library';
import http from 'http';
import url from 'url';
import path from 'path';
import fs from 'fs';

// Constants - In production these should come from separate config/env
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

export class AuthService {
    private oauth2Client: OAuth2Client;
    private server: http.Server | null = null;
    private readonly tokenPath: string;
    private currentUserEmail: string | null = null;

    constructor() {
        // Boot-check (electron/config/boot-check.ts) bu env'lerin tanımlı ve
        // placeholder olmadığını zaten doğruluyor — burada düşürürsek
        // misconfiguration sessiz değil, görünür olur.
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
            throw new Error(
                'AuthService: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET tanımlı değil (boot-check geçersiz).',
            );
        }

        this.tokenPath = path.join(app.getPath('userData'), 'google_auth_token.json');

        const google = getGoogle();
        this.oauth2Client = new google.auth.OAuth2(
            clientId,
            clientSecret,
            REDIRECT_URI
        );

        this.clearStoredTokens();
    }

    private clearStoredTokens() {
        try {
            if (fs.existsSync(this.tokenPath)) {
                fs.unlinkSync(this.tokenPath);
            }
        } catch (e) {
            console.error('Failed to delete stored token file:', e);
        }
    }

    private saveTokens(tokens: any) {
        try {
            fs.writeFileSync(this.tokenPath, JSON.stringify(tokens));
        } catch (e) {
            console.error('Failed to save tokens:', e);
        }
    }

    async login(): Promise<any> {
        // Önceki bir giriş denemesinden açık kalan bir sunucu varsa kapat (EADDRINUSE hatasını önlemek için)
        if (this.server) {
            this.server.close();
            this.server = null;
        }

        return new Promise((resolve, reject) => {
            const authUrl = this.oauth2Client.generateAuthUrl({
                access_type: 'offline',
                scope: SCOPES,
                prompt: 'consent',
            });

            // Open url in default browser
            shell.openExternal(authUrl);

            // Create a temporary server to handle the callback
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
                            const { tokens } = await this.oauth2Client.getToken(code);
                            this.oauth2Client.setCredentials(tokens);
                            this.saveTokens(tokens);

                            // Get user profile
                            const google = getGoogle();
                            const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
                            const { data } = await oauth2.userinfo.get();

                            // Domain Check — fail-closed.
                            // Onboarding sihirbazı sonrası allowedDomain her zaman dolu olmalı.
                            // Boşsa konfigürasyon bozulmuş demektir; login'i reddet ki kullanıcı
                            // Settings → Genel'den (veya gerekirse onboarding sıfırlamasıyla) düzeltsin.
                            const { appConfigService } = await import('./services/app-config-service');
                            const allowedDomain = appConfigService.get('allowedDomain');
                            if (!allowedDomain) {
                                if (tokens.access_token) await this.oauth2Client.revokeToken(tokens.access_token);
                                this.oauth2Client.setCredentials({});
                                return reject(new Error('Sistem yapılandırılması eksik: izin verilen domain tanımlı değil. Yönetici Settings → Genel\'den domain ayarlamalı.'));
                            }
                            if (!data.email?.endsWith(`@${allowedDomain}`)) {
                                if (tokens.access_token) await this.oauth2Client.revokeToken(tokens.access_token);
                                this.oauth2Client.setCredentials({});
                                return reject(new Error(`Yetkisiz Erişim: Sadece @${allowedDomain} uzantılı e-posta adresleri giriş yapabilir.`));
                            }
                            if (!data.email) {
                                if (tokens.access_token) await this.oauth2Client.revokeToken(tokens.access_token);
                                this.oauth2Client.setCredentials({});
                                return reject(new Error('Google profilinden e-posta bilgisi alınamadı.'));
                            }

                            // Admin Check
                            try {
                                const adminAPI = google.admin({ version: 'directory_v1', auth: this.oauth2Client });
                                const userRes = await adminAPI.users.get({ userKey: data.email });
                                if (!userRes.data.isAdmin) {
                                    if (tokens.access_token) await this.oauth2Client.revokeToken(tokens.access_token);
                                    this.oauth2Client.setCredentials({});
                                    return reject(new Error('Yetkisiz Erişim: Bu uygulamayı kullanabilmek için Superadmin yetkisine sahip olmalısınız.'));
                                }
                            } catch (adminErr: any) {
                                if (tokens.access_token) await this.oauth2Client.revokeToken(tokens.access_token);
                                this.oauth2Client.setCredentials({});
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
        // Revoke token if needed
        if (this.oauth2Client.credentials.access_token) {
            try {
                await this.oauth2Client.revokeToken(this.oauth2Client.credentials.access_token);
            } catch (error) {
                console.error('Failed to revoke token on logout:', error);
            }
        }
        if (fs.existsSync(this.tokenPath)) {
            fs.unlinkSync(this.tokenPath);
        }
        this.oauth2Client.setCredentials({});
        this.currentUserEmail = null;
    }

    isAuthenticated(): boolean {
        return !!this.oauth2Client.credentials.access_token;
    }

    getClient(): OAuth2Client {
        return this.oauth2Client;
    }

    getCurrentUserEmail(): string | null {
        return this.currentUserEmail;
    }
}
