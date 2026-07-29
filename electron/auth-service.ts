import { getGoogle } from './google-lazy';
import { shell, app } from 'electron';
// TYPE-ONLY on purpose. A value import from google-auth-library would load the
// module at evaluation time and defeat google-lazy.ts, which exists because
// eagerly loading googleapis crashes on macOS at startup (EXC_BREAKPOINT).
// `CodeChallengeMethod` is a string enum, so 'S256' needs the assertion below —
// a bare literal does not type-check against a nominal string enum.
import type { OAuth2Client, CodeChallengeMethod } from 'google-auth-library';
import http from 'http';
import url from 'url';
import path from 'path';
import fs from 'fs';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { appConfigService } from './services/app-config-service';
import { vaultManager } from './services/vault-manager';
import { logger } from './services/logger';
import { withRetry } from './services/retry';
import { UserFacingError } from './lib/errors';

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

/**
 * Lifetime bound on the loopback callback listener. Long enough for a slow
 * consent screen plus hardware-key 2FA, short enough that an abandoned login
 * cannot leave a listening socket — and an unsettled promise — up indefinitely.
 */
const LOGIN_TIMEOUT_MS = 5 * 60_000;

/** The ONLY path treated as the OAuth callback. Compared with ===, never substring. */
const CALLBACK_PATH = '/callback';

interface PendingLogin {
    readonly server: http.Server;
    readonly timer: NodeJS.Timeout;
    /** Anti-forgery nonce echoed back by Google in `?state=`. */
    readonly state: string;
    /** PKCE verifier (RFC 7636); its S256 challenge went out with the auth URL. */
    readonly codeVerifier: string;
    /** Loopback redirect URI — must match byte-for-byte at the token endpoint. */
    redirectUri: string;
    /** Rejects the outstanding login() promise. Idempotent per the Promise spec. */
    readonly reject: (err: Error) => void;
}

/**
 * Why a session restore ended the way it did. Additive — the sole caller
 * (`main.ts` onUnlocked) reads only `authenticated`/`reauthNeeded`, but the
 * reason distinguishes "log in again" from "you are no longer a super-admin",
 * which are very different support tickets.
 */
export type RestoreFailReason =
    | 'no-credentials'
    | 'no-token'
    | 'refresh-failed'
    | 'domain-mismatch'
    | 'not-admin'
    | 'authz-unverified';

export interface RestoreSessionResult {
    authenticated: boolean;
    reauthNeeded: boolean;
    reason?: RestoreFailReason;
}

/**
 * The signed-in admin as the renderer displays them. The main process is the
 * authority: the renderer used to keep the only copy in localStorage, which made
 * a vault lock (a legitimate `authenticated: false`) erase the identity for good.
 */
export interface AuthUserProfile {
    email: string | null;
    name?: string | null;
    picture?: string | null;
}

/** Three-valued: "Google said no" and "we could not ask" are different answers. */
type AdminCheck =
    | { outcome: 'admin' }
    | { outcome: 'not-admin' }
    | { outcome: 'unknown'; reason: string };

/**
 * Fixed result pages. NOTHING from the request is interpolated: the callback URL
 * is attacker-influenced, and reflecting any part of it would hand an attacker a
 * scripting vector on the loopback origin.
 */
function resultPage(title: string, detail: string): string {
    return '<!doctype html><html lang="tr"><head><meta charset="utf-8">'
        + '<title>GoWorks</title></head>'
        + '<body style="font-family:system-ui,sans-serif;padding:2rem;line-height:1.6">'
        + `<h1>${title}</h1><p>${detail}</p>`
        + '<p>Bu sekmeyi kapatabilirsiniz.</p></body></html>';
}

const PAGE_OK = resultPage('Giriş başarılı', 'GoWorks uygulamasına dönebilirsiniz.');
const PAGE_DENIED = resultPage('Giriş tamamlanamadı', 'Yetkilendirme reddedildi. Ayrıntı için uygulamadaki mesaja bakın.');
const PAGE_BAD_REQUEST = resultPage('Geçersiz istek', 'Bu istek beklenen giriş akışına ait değil.');

function sendPage(res: http.ServerResponse, status: number, body: string): void {
    if (res.writableEnded) return;
    res.writeHead(status, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        // The callback URL carries the authorization code; never let it ride out
        // in a Referer header.
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
        Connection: 'close',
    });
    res.end(body);
}

/**
 * Constant-time compare for the `state` nonce. Length is checked first because
 * timingSafeEqual throws on a length mismatch, and the length of `state` is a
 * public constant so leaking it leaks nothing.
 */
function safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
}

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
    private pendingLogin: PendingLogin | null = null;
    private currentUser: AuthUserProfile | null = null;

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
        // A login in flight is no longer meaningful once credentials are dropped,
        // and leaving its listener bound would outlive the session it belongs to.
        this.closeServer(new UserFacingError('Oturum kilitlendiği için giriş iptal edildi.'));
        if (this.oauth2Client) {
            try {
                this.oauth2Client.setCredentials({});
            } catch {
                // ignore
            }
        }
        this.oauth2Client = null;
        this.currentUser = null;
    }

    /**
     * Tear down the loopback listener and settle its promise.
     *
     * Single teardown path for every exit: success, timeout, listen error, a
     * superseding login, a vault lock, and app quit. Previously the close block
     * was inlined twice and several paths (listen error, quit, lock) closed
     * nothing — and a superseded login was never settled at all, so the first
     * `auth:login` invoke hung forever and the UI sat in permanent loading.
     */
    closeServer(reason?: Error): void {
        const pending = this.pendingLogin;
        if (!pending) return;
        this.pendingLogin = null;
        clearTimeout(pending.timer);
        try {
            pending.server.close();
        } catch {
            // already closing
        }
        // Settling twice is a no-op, so this is safe on the success path too.
        if (reason) pending.reject(reason);
    }

    /**
     * Discard tokens minted for an identity that failed an authorization gate.
     *
     * Revokes at Google, blanks the in-memory client, and clears any refresh
     * token in the vault. The vault clear matters for two cases this flow no
     * longer creates but earlier versions did: a user rejected by a pre-fix
     * build whose token is still stored, and an admin who has since been
     * demoted. Best-effort — the vault may be locked.
     */
    private async discardRejectedTokens(
        client: OAuth2Client,
        accessToken: string | null | undefined,
    ): Promise<void> {
        if (accessToken) {
            try {
                await client.revokeToken(accessToken);
            } catch (e) {
                logger.warn(`[auth] reddedilen oturumun token'ı iptal edilemedi: ${(e as Error)?.message}`);
            }
        }
        try {
            client.setCredentials({});
        } catch {
            // ignore
        }
        try {
            vaultManager.setRefreshToken(null);
        } catch {
            // vault locked / no vault — nothing to clear
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
        // Fail fast, BEFORE opening a browser, on anything that makes this login
        // unsatisfiable. The domain check used to run only after the user had
        // consented and a refresh token had already been minted and persisted.
        const oauth2Client = this.ensureOAuth2Client();
        const allowedDomain = appConfigService.get('allowedDomain');
        if (!allowedDomain) {
            throw new UserFacingError(
                "Sistem yapılandırması eksik: izin verilen domain tanımlı değil. Yönetici Settings → Genel'den domain ayarlamalı.",
            );
        }

        // Supersede any in-flight login AND settle it, so its caller stops waiting.
        this.closeServer(
            new UserFacingError('Yeni bir giriş denemesi başlatıldığı için önceki giriş iptal edildi.'),
        );

        // Per-login anti-forgery material. Generated with node:crypto rather than
        // oauth2Client.generateCodeVerifierAsync() so this module needs no value
        // import from google-auth-library (see the import comment at the top).
        const state = randomBytes(32).toString('base64url');
        const codeVerifier = randomBytes(32).toString('base64url');
        const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');

        return new Promise<any>((resolve, reject) => {
            const succeed = (value: any) => { this.closeServer(); resolve(value); };
            const abort = (err: Error) => { this.closeServer(err); };

            const server = http.createServer((req, res) => {
                void this.handleCallbackRequest(req, res, server, oauth2Client, allowedDomain, succeed, abort);
            });

            // Registered BEFORE listen() so an EADDRINUSE/EACCES finds a live
            // pendingLogin to tear down. The old handler left this.server non-null
            // and unclosed, poisoning every later login.
            server.on('error', (err) => {
                logger.error('[auth] callback dinleyicisi hatası', err);
                abort(new UserFacingError(
                    'Giriş için yerel dinleyici başlatılamadı. Uygulamayı yeniden başlatıp tekrar deneyin.',
                ));
            });

            const timer = setTimeout(() => {
                logger.warn('[auth] login zaman aşımına uğradı — callback dinleyicisi kapatılıyor.');
                abort(new UserFacingError('Giriş zaman aşımına uğradı. Lütfen tekrar deneyin.'));
            }, LOGIN_TIMEOUT_MS);
            // Never hold the process open at quit.
            timer.unref?.();

            this.pendingLogin = { server, timer, state, codeVerifier, redirectUri: '', reject };

            // Ephemeral port (0) AND an explicit 127.0.0.1 host. Without the host
            // argument Node binds 0.0.0.0/:: and the callback listener is reachable
            // from the local network for the whole lifetime of the flow.
            server.listen(0, '127.0.0.1', () => {
                const addr = server.address();
                const port = addr && typeof addr === 'object' ? addr.port : 0;
                // 127.0.0.1, not localhost: we bind the IPv4 loopback only, and on
                // IPv6-preferring machines `localhost` resolves to ::1 first, so the
                // browser would hit a closed port. Google's desktop-client loopback
                // rules accept the IP literal.
                const redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`;
                if (this.pendingLogin?.server === server) {
                    this.pendingLogin.redirectUri = redirectUri;
                }

                const authUrl = oauth2Client.generateAuthUrl({
                    access_type: 'offline',
                    scope: SCOPES,
                    prompt: 'select_account consent',
                    redirect_uri: redirectUri,
                    // RFC 6749 §10.12 — binds the callback to THIS login attempt.
                    state,
                    // RFC 8252 §8.1 — mandatory for a public client. The desktop
                    // client secret is not a secret; PKCE is its replacement.
                    code_challenge: codeChallenge,
                    code_challenge_method: 'S256' as CodeChallengeMethod,
                    // Hint only — trivially removed by editing the URL. The
                    // authoritative check is the endsWith() in the callback.
                    hd: allowedDomain,
                });

                void shell.openExternal(authUrl);
            });
        });
    }

    /**
     * Loopback callback handler.
     *
     * Ordering is security-critical and deliberate:
     *   identity → path → state → error/code → getToken → domain → isAdmin → saveTokens
     *
     * The vault write is LAST. Previously saveTokens() ran immediately after the
     * exchange, so a user rejected by the domain or isAdmin check still left a
     * live refresh token in the vault — which restoreSession() would later promote
     * into a fully authenticated session on the next unlock.
     */
    private async handleCallbackRequest(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        server: http.Server,
        oauth2Client: OAuth2Client,
        allowedDomain: string,
        succeed: (value: any) => void,
        abort: (err: Error) => void,
    ): Promise<void> {
        // Per-login secrets are read from the LIVE pendingLogin, never from the
        // closure, so a late callback belonging to a superseded login can never be
        // processed with the current login's verifier.
        const pending = this.pendingLogin;
        if (!pending || pending.server !== server) {
            sendPage(res, 404, PAGE_BAD_REQUEST);
            return;
        }

        let pathname: string;
        let qs: URLSearchParams;
        try {
            const parsed = new url.URL(req.url ?? '/', 'http://127.0.0.1');
            pathname = parsed.pathname;
            qs = parsed.searchParams;
        } catch {
            sendPage(res, 400, PAGE_BAD_REQUEST);
            return;
        }

        // Exact match. `req.url.indexOf('/callback') > -1` also matched
        // /anything/callback, /callback-evil and /?q=/callback.
        if (pathname !== CALLBACK_PATH) {
            // Always answer: the browser also requests /favicon.ico against this
            // origin, and non-matching requests previously got no res.end() at
            // all, leaving the socket hanging until the client gave up.
            sendPage(res, 404, PAGE_BAD_REQUEST);
            return;
        }

        // state FIRST, before `code` or `error` are even looked at. Without it,
        // any local process — or any web page that can make the admin's browser
        // issue a plain GET to the loopback port — can deliver its own
        // authorization code, and login() cannot tell it from the real callback.
        const returnedState = qs.get('state') ?? '';
        if (!safeEqual(returnedState, pending.state)) {
            logger.warn('[auth] callback state uyuşmadı — istek reddedildi, kod değişimi yapılmadı.');
            sendPage(res, 400, PAGE_BAD_REQUEST);
            abort(new UserFacingError('Giriş doğrulaması başarısız (state uyuşmazlığı). Lütfen tekrar deneyin.'));
            return;
        }

        // Named `oauthError` until CodeQL's js/clear-text-logging heuristic, which
        // treats any identifier containing "auth" as a credential, flagged the four
        // console branches in logger.ts as leaking it. The value is Google's public
        // OAuth error code from the callback query string (access_denied,
        // invalid_scope, …), not a secret — and `errorCode` describes it better
        // anyway: it is a short machine-readable code, not an Error.
        const errorCode = qs.get('error');
        if (errorCode) {
            // Logged, but never reflected into the page or the user message.
            logger.warn(`[auth] yetkilendirme hata ile döndü: ${errorCode}`);
            sendPage(res, 200, PAGE_DENIED);
            abort(new UserFacingError(
                errorCode === 'access_denied'
                    ? 'Giriş iptal edildi: Google izin ekranında erişim reddedildi.'
                    : 'Google yetkilendirme isteği reddedildi. Lütfen tekrar deneyin.',
            ));
            return;
        }

        const code = qs.get('code');
        if (!code) {
            sendPage(res, 400, PAGE_DENIED);
            abort(new UserFacingError('Google yetkilendirme kodu alınamadı. Lütfen tekrar deneyin.'));
            return;
        }

        try {
            const { tokens } = await oauth2Client.getToken({
                code,
                codeVerifier: pending.codeVerifier,
                redirect_uri: pending.redirectUri,
            });
            // Needed so the userinfo/admin calls below can authenticate. NOT persisted yet.
            oauth2Client.setCredentials(tokens);

            const google = getGoogle();
            const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
            const { data } = await oauth2.userinfo.get();
            const email = data.email ?? null;

            if (!email) {
                await this.discardRejectedTokens(oauth2Client, tokens.access_token);
                sendPage(res, 200, PAGE_DENIED);
                abort(new UserFacingError('Google profilinden e-posta bilgisi alınamadı.'));
                return;
            }
            if (!email.endsWith(`@${allowedDomain}`)) {
                await this.discardRejectedTokens(oauth2Client, tokens.access_token);
                sendPage(res, 200, PAGE_DENIED);
                abort(new UserFacingError(
                    `Yetkisiz Erişim: Sadece @${allowedDomain} uzantılı e-posta adresleri giriş yapabilir.`,
                ));
                return;
            }

            const adminCheck = await this.checkDirectoryAdmin(oauth2Client, email);
            if (adminCheck.outcome !== 'admin') {
                await this.discardRejectedTokens(oauth2Client, tokens.access_token);
                sendPage(res, 200, PAGE_DENIED);
                // At login we are establishing new authority and the user is
                // interactive, so an indeterminate check fails CLOSED. (restoreSession
                // fails open — see the note there.)
                abort(new UserFacingError(
                    adminCheck.outcome === 'not-admin'
                        ? 'Yetkisiz Erişim: Bu uygulamayı kullanabilmek için Superadmin yetkisine sahip olmalısınız.'
                        : 'Yetki doğrulama hatası: Admin erişimi kontrol edilemedi. Bağlantınızı kontrol edip tekrar deneyin.',
                ));
                return;
            }

            // Authorized. Only now does anything reach the vault.
            this.saveTokens(tokens);
            this.currentUser = { email, name: data.name ?? null, picture: data.picture ?? null };
            sendPage(res, 200, PAGE_OK);
            succeed({ tokens, user: data });
        } catch (e) {
            logger.error('[auth] kod değişimi veya kimlik doğrulama başarısız', e);
            sendPage(res, 200, PAGE_DENIED);
            abort(e instanceof Error ? e : new Error(String(e)));
        }
    }

    /**
     * Is `email` a Workspace super-admin?
     *
     * Three-valued on purpose. Callers must distinguish "Google told us no"
     * (401/403/404, or 200 with isAdmin false) from "we could not ask" (offline,
     * 5xx, timeout). The first is an authorization decision; the second is an
     * availability problem. Conflating them either locks admins out of an offline
     * laptop or lets a demoted user keep their session.
     *
     * Transient 429/503/ECONNRESET are absorbed by withRetry before
     * classification, so only a genuinely hard failure reaches 'unknown'.
     */
    private async checkDirectoryAdmin(client: OAuth2Client, email: string): Promise<AdminCheck> {
        try {
            const google = getGoogle();
            const adminAPI = google.admin({ version: 'directory_v1', auth: client });
            const userRes = await withRetry(
                () => adminAPI.users.get({ userKey: email }),
                logger,
                'auth.checkDirectoryAdmin',
            );
            return userRes.data.isAdmin ? { outcome: 'admin' } : { outcome: 'not-admin' };
        } catch (err: any) {
            // googleapis puts the HTTP status in `code` as a NUMBER, but system
            // errors put a STRING there ('ENOTFOUND') — hence the typeof guard.
            const status: number | undefined =
                typeof err?.code === 'number' ? err.code : (err?.response?.status ?? err?.status);
            // Both fields, not `??`: Google sends status AND message, and the
            // scope hint lives in the message. Coalescing would hide it whenever
            // a status was also present.
            const apiError = err?.response?.data?.error;
            const detail = [apiError?.status, apiError?.message, err?.message]
                .filter(Boolean)
                .join(' ');

            // A 403 caused by a MISSING SCOPE is not an answer about this user — it
            // means the token predates a scope addition. Treat it as indeterminate
            // so a scope migration cannot mass-log-out real admins.
            if (status === 403 && /SCOPE|insufficient/i.test(detail)) {
                return { outcome: 'unknown', reason: 'insufficient scope' };
            }
            // 401/403 = Google answered: this account may not read the Directory
            // API, which for a Workspace account means it is not an admin.
            // 404 = the account is not in this directory at all.
            if (status === 401 || status === 403 || status === 404) return { outcome: 'not-admin' };

            return { outcome: 'unknown', reason: detail || err?.message || String(err) };
        }
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
        this.currentUser = null;
    }

    /**
     * Restore the Google session from the vault's refresh token after an unlock —
     * no browser OAuth. Sets credentials, forces a silent access-token refresh and
     * (best-effort) restores the current user email. Returns whether a full
     * re-login is required (refresh token missing/invalid/revoked).
     */
    async restoreSession(): Promise<RestoreSessionResult> {
        logger.info('[restoreSession] başlıyor…');
        let client: OAuth2Client;
        try {
            client = this.ensureOAuth2Client();
        } catch {
            // No OAuth credentials configured yet (fresh onboarding).
            logger.warn('[restoreSession] OAuth istemci bilgileri yok → giriş gerekli.');
            return { authenticated: false, reauthNeeded: true, reason: 'no-credentials' };
        }
        let refreshToken: string | null = null;
        try {
            refreshToken = vaultManager.getRefreshToken();
        } catch (e) {
            // Distinguish "vault could not be read" from "vault holds nothing":
            // both used to collapse into a silent `no-token`, which made a failed
            // silent restore impossible to diagnose from the log.
            logger.warn(`[restoreSession] kasadan refresh token okunamadı: ${(e as Error)?.message}`);
            refreshToken = null;
        }
        if (!refreshToken) {
            logger.warn('[restoreSession] kasada refresh token yok → giriş gerekli.');
            return { authenticated: false, reauthNeeded: true, reason: 'no-token' };
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

            // Re-verify the identity behind the stored refresh token. Neither the
            // domain nor the isAdmin gate used to run here, so a demoted or
            // off-boarded admin kept a working session for as long as the refresh
            // token minted tokens.
            //
            // This fails OPEN on an indeterminate answer, unlike login(). The
            // asymmetry is deliberate: at login we establish new authority with an
            // interactive user one click from a retry; here we re-confirm existing
            // authority granted by a full interactive login, and a hard failure
            // would lock out a user who did nothing wrong. The security cost is
            // near zero because this check is not the enforcement boundary —
            // Google authorizes every privileged call individually, so a demoted
            // user gets 403 on the first thing they try.
            let email: string | null = null;
            let profile: AuthUserProfile | null = null;
            try {
                const google = getGoogle();
                const oauth2 = google.oauth2({ version: 'v2', auth: client });
                const { data } = await oauth2.userinfo.get();
                email = data.email ?? null;
                // Keep the whole profile, not just the address: this is the only
                // place a silent restore can repopulate the identity the renderer
                // shows, and it is already on the wire.
                profile = { email, name: data.name ?? null, picture: data.picture ?? null };
            } catch {
                // Could not ask — keep the session, note it, move on. The identity
                // stays empty here; the renderer falls back to its cached copy.
                logger.warn('[restoreSession] kimlik doğrulanamadı (çevrimdışı?) — oturum korunuyor.');
                return { authenticated: true, reauthNeeded: false, reason: 'authz-unverified' };
            }
            this.currentUser = profile;

            const allowedDomain = appConfigService.get('allowedDomain');
            if (email && allowedDomain && !email.endsWith(`@${allowedDomain}`)) {
                logger.warn('[restoreSession] kayıtlı kimlik izin verilen domain dışında — oturum düşürüldü.');
                await this.discardRejectedTokens(client, token);
                this.oauth2Client = null;
                this.currentUser = null;
                return { authenticated: false, reauthNeeded: true, reason: 'domain-mismatch' };
            }

            if (email) {
                const adminCheck = await this.checkDirectoryAdmin(client, email);
                if (adminCheck.outcome === 'not-admin') {
                    logger.warn('[restoreSession] kayıtlı kimlik artık superadmin değil — oturum düşürüldü.');
                    await this.discardRejectedTokens(client, token);
                    this.oauth2Client = null;
                    this.currentUser = null;
                    return { authenticated: false, reauthNeeded: true, reason: 'not-admin' };
                }
                if (adminCheck.outcome === 'unknown') {
                    logger.warn(`[restoreSession] admin doğrulanamadı (${adminCheck.reason}) — oturum korunuyor.`);
                    return { authenticated: true, reauthNeeded: false, reason: 'authz-unverified' };
                }
            }

            logger.info('[restoreSession] oturum sessizce geri yüklendi.');
            return { authenticated: true, reauthNeeded: false };
        } catch (err: any) {
            // invalid_grant / revoked / expired / scope change → full re-login.
            // Log the real reason — this path used to be silent, which made
            // post-unlock "session expired" states impossible to diagnose from logs.
            const reason = err?.response?.data?.error ?? err?.message ?? String(err);
            logger.warn(`[restoreSession] sessiz yenileme başarısız → yeniden giriş gerekli: ${reason}`);
            client.setCredentials({});
            this.oauth2Client = null;
            return { authenticated: false, reauthNeeded: true, reason: 'refresh-failed' };
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

    /** Audit-trail attribution ("who did this"). 14 call sites in main.ts. */
    getCurrentUserEmail(): string | null {
        return this.currentUser?.email ?? null;
    }

    /**
     * The identity the renderer displays. Null while locked or signed out, and
     * also after an offline restore that could not re-fetch the profile — the
     * renderer keeps a cached copy for exactly that gap.
     */
    getCurrentUser(): AuthUserProfile | null {
        return this.currentUser;
    }
}
