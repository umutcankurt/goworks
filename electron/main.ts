import { app, BrowserWindow, powerMonitor, ipcMain, crashReporter, session, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

import { AuthService } from './auth-service';
import { AdminService } from './services/admin-service';
import { secureStorage } from './services/secure-storage';
import { CacheService } from './services/cache-service';
import { getDb, closeDb } from './db';
import { jobRunner } from './jobs/runner';
import { logger, getLogsDir, clearAllLogs } from './services/logger';
import { runBootCheck, type BootCheckResult } from './config/boot-check';
import { toUserMessage } from './lib/error-utils';
import { UserFacingError } from './lib/errors';
import { throttle } from './lib/throttle';
import { isAllowedExternalUrl } from './lib/external-url';
import { requireOneOf, requireString, requireArray, requireEmailList, requireImageBytes } from './lib/validate';
import { JOB_TYPES, type JobType } from './jobs/types';
import { jobQueue } from './jobs/queue';
import { registerSignaturePushWorker } from './jobs/signature-push-worker';
import { registerBulkActionWorker } from './jobs/bulk-action-worker';
import { registerSignatureAuditWorker } from './jobs/signature-audit-worker';
import { registerBulkGroupAddWorker } from './jobs/bulk-group-add-worker';
import { setAuthClientProvider } from './services/auth-context';
import { vaultManager, TooManyAttemptsError } from './services/vault-manager';
import { WrongPasswordError, VaultCorruptError } from './services/vault-service';
import type { OAuth2Client } from 'google-auth-library';

let win: BrowserWindow | null
let authService: AuthService
let adminService: AdminService | null = null
// The OAuth client instance adminService froze at construction time. Tracked so
// ensureAdminService() can rebuild when the live client is swapped out from under
// it (e.g. a fresh login after a failed silent restoreSession mints a NEW client).
let adminServiceClient: OAuth2Client | null = null
let cache: CacheService
let cancelBulkOperation = false

// Idle threshold after which the vault auto-locks (1 hour). Single source of
// truth for the timeout — the renderer SessionContext only reflects/warns.

/**
 * Guard for IPC handlers that hit Google APIs. When the vault is unlocked but the
 * silent session restore failed (refresh token revoked/expired/invalid_grant —
 * e.g. after switching the OAuth client type), the in-memory OAuth client has no
 * credentials. Without this, calls fail deep inside google-auth-library with the
 * cryptic "No access, refresh token, API key or refresh handler callback is set."
 * Throwing a UserFacingError here surfaces a clear "log in again" message instead.
 */
function requireGoogleAuth(): void {
  if (!authService?.isAuthenticated() || vaultManager.getGoogleReauthNeeded()) {
    throw new UserFacingError('Google oturumunuz sona erdi. Lütfen tekrar giriş yapın.');
  }
}

/**
 * adminService accessor — throws MissingOAuthCredentialsError when there are no
 * credentials (via authService.getClient()), or UserFacingError when the Google
 * session needs a re-login. The IPC handler's try/catch turns either into a
 * user-friendly message for the renderer. After a credential reset
 * (invalidateCredentials) OR a vault lock (dropAuthCredentials hook), adminService
 * is set to null so the next call recreates it with the LIVE OAuth client — never
 * a stale reference to a client whose credentials were blanked on lock.
 */
function ensureAdminService(): AdminService {
  requireGoogleAuth();
  // Rebuild when missing OR when the cached AdminService froze a stale OAuth client.
  // AdminService binds its directory/reports clients to the exact OAuth2Client object
  // passed in; if that instance was replaced (a fresh login after a failed silent
  // restore mints a brand-new client) reusing the old AdminService would call the
  // blanked client and throw "No access, refresh token...". Comparing instances here
  // closes that class of bug regardless of which mutating path forgot to reset it.
  const liveClient = authService.getClient();
  if (!adminService || adminServiceClient !== liveClient) {
    adminService = new AdminService(liveClient);
    adminServiceClient = liveClient;
  }
  return adminService;
}

const FOUR_HOURS = 4 * 60 * 60 * 1000;
const THREE_HOURS = 3 * 60 * 60 * 1000;
const THIRTY_MINUTES = 30 * 60 * 1000;

const WINDOW_TITLES: Record<'tr' | 'en', string> = {
  tr: 'GoWorks - Workspace Yönetim Aracı',
  en: 'GoWorks - Workspace Management Tool',
};

function applyWindowTitle(locale: string | null | undefined) {
  if (!win || win.isDestroyed()) return;
  const key = locale === 'en' ? 'en' : 'tr';
  win.setTitle(WINDOW_TITLES[key]);
}

function createWindow() {
  win = new BrowserWindow({
    show: false,
    title: 'GoWorks',
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      // Phase E security hardening — we set these explicitly (most of Electron 40's
      // defaults are already safe, but being explicit signals intent and guards
      // against future default changes).
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })

  win.once('ready-to-show', () => {
    win?.maximize()
    win?.show()
  })

  // Redirect every external URL opened via window.open(url, '_blank') to the OS
  // default browser instead of an in-app BrowserWindow — the user's Google
  // session etc. is already open there.
  win.webContents.setWindowOpenHandler(({ url }) => {
    // Parse and allowlist the host. A protocol-prefix check alone would hand a
    // compromised renderer the ability to open any http(s) URL in the user's real
    // browser, where their live Google session already is. Every legitimate call
    // site passes a hardcoded Google URL, so nothing needs the permissiveness.
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url)
    } else {
      logger.warn(`[main] engellenen dış bağlantı: ${url.slice(0, 120)}`)
    }
    return { action: 'deny' }
  })

  ipcMain.handle('window:maximize', () => {
    win?.maximize()
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  closeDb();
  if (process.platform === 'darwin') {
    authService?.logout();
  } else {
    app.quit()
    win = null
  }
})

app.on('before-quit', async (event) => {
  // A login in flight leaves a bound loopback listener and an unsettled promise;
  // neither should outlive the app.
  authService?.closeServer(new Error('Uygulama kapatıldığı için giriş iptal edildi.'));
  if (authService?.isAuthenticated()) {
    event.preventDefault();
    await authService.logout();
    app.quit();
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})


// ─── Crash Logger ────────────────────────────────────────────────────────────
// Start the crash reporter (file-based, no server required)
crashReporter.start({
  productName: 'GoWorks',
  submitURL: '',
  uploadToServer: false,
});

const getCrashLogPath = () => {
  try { return path.join(app.getPath('userData'), 'crash.log'); } catch { return '/tmp/goworks-crash.log'; }
};

const writeLog = (prefix: string, detail: unknown) => {
  // First write through the logger to the daily log file + console (file rotation included).
  logger.error(`${prefix}:`, detail);
  // Keep writing the legacy crash.log file for backward compatibility —
  // existing installations still rely on crash.log for support.
  try {
    const stamp = new Date().toISOString();
    const msg = `[${stamp}] ${prefix}:\n${detail instanceof Error ? detail.stack : String(detail)}\n${'─'.repeat(80)}\n`;
    fs.appendFileSync(getCrashLogPath(), msg, 'utf-8');
  } catch {/* ignore */ }
};

process.on('uncaughtException', (err) => writeLog('UNCAUGHT EXCEPTION', err));
process.on('unhandledRejection', (reason) => writeLog('UNHANDLED REJECTION', reason));

// Forward log:write requests coming from the renderer to the logger.
// Converts SerializedError objects back into Error instances so the stack is preserved.
interface SerializedError { __error: true; name: string; message: string; stack?: string }
function deserializeArg(a: unknown): unknown {
  if (a && typeof a === 'object' && (a as SerializedError).__error) {
    const se = a as SerializedError;
    const err = new Error(se.message);
    err.name = se.name;
    if (se.stack) err.stack = se.stack;
    return err;
  }
  return a;
}
ipcMain.on('log:write', (_event, payload: { level: 'debug' | 'info' | 'warn' | 'error'; args: unknown[] }) => {
  try {
    const args = payload.args.map(deserializeArg);
    logger[payload.level]('[renderer]', ...args);
  } catch {/* logger never throws */}
});

ipcMain.handle('log:getLogsDir', () => getLogsDir());
// ─────────────────────────────────────────────────────────────────────────────

/** Upper bound on a single media upload. Mirrors MAX_LOGO_BYTES in spirit. */
const MAX_MEDIA_BYTES = 5 * 1024 * 1024;

/** Upper bound on rows accepted in one bulk request. */
const MAX_BULK_ROWS = 5000;

/** Upper bound on a pasted/imported CSV. Well past any real roster. */
const MAX_CSV_BYTES = 5 * 1024 * 1024;

/** A real GCP service-account key is ~2.3 KB. */
const MAX_SA_JSON_BYTES = 64 * 1024;

/**
 * Shape-check a job payload against its type.
 *
 * Workers coerce with `(job.payload || {}) as XPayload` and only discover a bad
 * shape deep inside the run, after the row is already persisted and counted.
 * Checking here means a malformed job is refused instead of enqueued.
 */
function requireCsvSize(csv: unknown): void {
  if (typeof csv !== 'string') throw new UserFacingError('CSV içeriği okunamadı.');
  if (Buffer.byteLength(csv, 'utf8') > MAX_CSV_BYTES) {
    // better-sqlite3 is synchronous and the import runs in one transaction, so
    // an oversized file is a hard main-process hang, not a slow request.
    throw new UserFacingError('CSV dosyası çok büyük (en fazla 5 MB).');
  }
}

function validateJobPayload(type: JobType, payload: any): any {
  const p = payload ?? {};
  switch (type) {
    case 'BULK_SUSPEND':
    case 'BULK_DELETE':
      return { ...p, emails: requireEmailList(p.emails, 'E-posta listesi', MAX_BULK_ROWS) };
    case 'BULK_SIGNATURE_PUSH':
      if (p.emails !== undefined) {
        return { ...p, emails: requireEmailList(p.emails, 'E-posta listesi', MAX_BULK_ROWS) };
      }
      return { ...p, rows: requireArray(p.rows, 'Satırlar', MAX_BULK_ROWS) };
    case 'BULK_GROUP_ADD':
      return { ...p, rows: requireArray(p.rows, 'Satırlar', MAX_BULK_ROWS) };
    case 'SIGNATURE_AUDIT':
      requireOneOf(p?.scope?.type, ['all', 'group', 'orgUnit'] as const, 'denetim kapsamı');
      requireOneOf(p?.depth, ['fast', 'deep'] as const, 'denetim derinliği');
      if (!Number.isInteger(Number(p?.templateId))) {
        throw new UserFacingError('Denetim için geçerli bir şablon seçilmeli.');
      }
      return p;
  }
}

function computeJobTotal(_type: import('./jobs/types').JobType, payload: any): number {
  if (!payload) return 0;
  if (Array.isArray(payload?.rows)) return payload.rows.length;
  if (Array.isArray(payload?.emails)) return payload.emails.length;
  return 0;
}

// Boot-check result — we expose the soft-warn flags to the renderer via the
// `config:getBootStatus` IPC handler.
let bootStatus: BootCheckResult = {
  soft: { serviceAccountMissing: false, oauthCredentialsMissing: false },
};

ipcMain.handle('config:getBootStatus', () => bootStatus);

/**
 * Content Security Policy — dev/prod split.
 *
 * Vite HMR needs `ws://`, hot reload needs `eval`, and inline style is required.
 * Production must do the opposite and reject these. A static `<meta http-equiv>`
 * tag cannot make this distinction → we emit the response header at runtime.
 *
 * Blocked in production: `eval`, inline `<script>`, third-party origins
 * (except googleapis).
 */
function applyContentSecurityPolicy() {
  const isDev = !!VITE_DEV_SERVER_URL;
  const csp = isDev
    ? [
        "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        "connect-src 'self' ws: http://localhost:* http://127.0.0.1:* https: https://www.googleapis.com https://accounts.google.com",
      ].join('; ')
    : [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "script-src 'self'",
        // The signature editor's WYSIWYG produces inline styles — 'unsafe-inline'
        // style is required even in production. Eval and inline script stay disabled.
        "style-src 'self' 'unsafe-inline'",
        // lh3.googleusercontent.com serves signature images uploaded to Drive.
        "img-src 'self' data: blob: https://*.googleusercontent.com",
        "font-src 'self' data:",
        "connect-src 'self' https://www.googleapis.com https://accounts.google.com https://*.googleusercontent.com",
      ].join('; ');

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
}

app.whenReady().then(async () => {
  // Phase E security: attach the CSP BEFORE the window is created.
  applyContentSecurityPolicy();

  // Dev-only: show the app icon in the macOS dock during `npm run dev`.
  // Packaged builds get the dock/app icon from electron-builder (build/icon.png).
  if (VITE_DEV_SERVER_URL && process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(path.join(process.env.APP_ROOT!, 'build', 'icon.png'));
  }

  // Boot-time validation (env, userData writable, service account). On a hard-fail,
  // runBootCheck shows a dialog and calls app.exit(1).
  try {
    bootStatus = runBootCheck();
  } catch (err) {
    // app.exit() is async — reaching this line is not abnormal, we're just
    // waiting for the exit to complete.
    writeLog('BOOT CHECK FAILED', err);
    return;
  }

  // Initialize the SQLite DB at startup (Title/Institution/Template/Media/Job tables)
  try {
    getDb();
  } catch (err) {
    writeLog('DB INIT FAILED', err);
  }

  // Initialize the vault manager: detect vault.enc + onboarding state. The vault
  // stays LOCKED until the renderer sends vault:unlock with the master password —
  // the DEK is never derived here.
  try {
    vaultManager.init();
  } catch (err) {
    writeLog('VAULT INIT FAILED', err);
  }

  createWindow();
  if (win) jobRunner.setWindow(win);

  // Set the window title according to the user's language preference
  try {
    const { appConfigService } = await import('./services/app-config-service');
    applyWindowTitle(appConfigService.get('language'));
  } catch (err) {
    writeLog('LOCALE TITLE INIT FAILED', err);
  }

  // Wire the worker handlers into the runner — these functions process resumed
  // or newly arriving jobs.
  registerSignaturePushWorker();
  registerBulkActionWorker();
  registerSignatureAuditWorker();
  registerBulkGroupAddWorker();
  jobRunner.resumeOnStartup();

  authService = new AuthService();
  // Bridge the admin OAuth client to background workers (e.g. BULK_GROUP_ADD),
  // which run group operations with the admin's token for correct audit actor.
  setAuthClientProvider(() => authService.getClient());
  // adminService is lazy: stays null when there are no credentials; it is created
  // by ensureAdminService() after a successful auth:login or after a
  // config:setOAuthCredentials call.
  if (authService.hasCredentials()) {
    try {
      const client = authService.getClient();
      adminService = new AdminService(client);
      adminServiceClient = client;
    } catch (err) {
      writeLog('ADMIN SERVICE INIT FAILED', err);
      adminService = null;
      adminServiceClient = null;
    }
  }
  cache = new CacheService();
  cancelBulkOperation = false;

  // Bridge the vault manager to the runner + auth service + window. The DEK lives
  // ONLY in main-process memory; these injected hooks avoid import cycles.
  vaultManager.setHooks({
    getRunningCount: () => jobRunner.getRunningCount(),
    getPendingCount: () => {
      try { return jobQueue.listByStatus(['PENDING']).length; } catch { return 0; }
    },
    // Lock (not logout): drop in-memory OAuth creds WITHOUT revoking; the vault
    // keeps the refresh token for a silent restore on the next unlock. Also drop
    // the cached adminService — it froze a reference to the OAuth client that
    // dropInMemoryCredentials() just blanked, so reusing it after unlock would fail
    // with "No access, refresh token...". Nulling it forces a rebuild with the LIVE
    // client (the one restoreSession refreshes) on the next ensureAdminService().
    dropAuthCredentials: () => { authService?.dropInMemoryCredentials(); adminService = null; adminServiceClient = null; },
    // Clear cached GoogleAuth clients that may hold the Service Account key.
    clearSecretCaches: () => {
      void (async () => {
        try {
          (await import('./services/google-admin-sa')).clearAuthCache();
          (await import('./services/gmail-signature-service')).clearGmailAuthCache();
          (await import('./services/email-notification-service')).clearEmailNotificationCache();
        } catch (e) {
          logger.warn('[vault] secret cache temizliği başarısız:', e);
        }
      })();
    },
    onUnlocked: async () => {
      // Silently restore the Google session from the vault's refresh token.
      try {
        const res = await authService?.restoreSession();
        vaultManager.setGoogleReauthNeeded(!!res && res.reauthNeeded);
        if (res?.authenticated) ensureAdminService();
      } catch (e) {
        logger.warn('[vault] restoreSession başarısız:', e);
      }
      // Recompute the SA soft-warn now that the vault is readable.
      try {
        const { getStatus } = await import('./secrets/service-account-loader');
        bootStatus.soft.serviceAccountMissing = !getStatus().configured;
      } catch { /* ignore */ }
      // Resume the dispatcher: crash-resumed + queued jobs were gated while locked.
      jobRunner.resumeDispatch();
      if (win && !win.isDestroyed()) win.webContents.send('vault:unlocked');
    },
    notify: (channel: string) => {
      if (win && !win.isDestroyed()) win.webContents.send(channel);
    },
  });

  // Idle auto-lock: LOCK the vault (NOT a logout). The OS-level idle timer is the
  // authority; the timeout is configurable from Settings → Security
  // (`autoLockMinutes`, 0 = disabled) and read fresh each tick so changes apply
  // without a restart. Locking drops the in-memory DEK + OAuth credentials but
  // KEEPS the refresh token in the vault, so unlocking with the master password
  // restores the Google session silently — no browser OAuth. Running bulk jobs are
  // not interrupted: Graceful Lock keeps the DEK alive until they drain
  // (vaultManager.requestLock → finalizeLock on the last job settling).
  const { appConfigService: autoLockConfig } = await import('./services/app-config-service');
  setInterval(() => {
    if (!vaultManager.isUnlocked()) return;
    const minutes = autoLockConfig.getAutoLockMinutes();
    if (minutes <= 0) return; // auto-lock disabled
    const idleTime = powerMonitor.getSystemIdleTime();
    if (idleTime >= minutes * 60) {
      vaultManager.requestLock();
    }
  }, 60000); // Check every minute

  // Auth Handlers
  ipcMain.handle('auth:login', async () => {
    if (!win) return null;
    try {
      const result = await authService.login();
      // A fresh login produces a valid refresh token bound to the current OAuth
      // client, so any prior "needs re-auth" state from a failed silent restore is
      // now resolved. Clear it BEFORE ensureAdminService() so the auth guard passes.
      vaultManager.setGoogleReauthNeeded(false);
      // Login succeeded; if adminService doesn't exist yet (first setup, credentials
      // just entered), lazily init it so it's ready for subsequent admin calls.
      ensureAdminService();
      return { success: true, ...result };
    } catch (error: any) {
      console.error('Login failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('auth:logout', async () => {
    try {
      await authService.logout();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('auth:check', async () => {
    try {
      return { success: true, authenticated: authService.isAuthenticated() };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // ---- Vault (master-password) handlers ----
  // The DEK / decrypted secrets NEVER cross IPC — the renderer only sends the
  // password and receives a status snapshot.
  ipcMain.handle('vault:getState', async () => {
    try {
      return { success: true, data: vaultManager.getState() };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Create a new vault (onboarding master-password step, legacy upgrade, or
  // post-reset). Absorbs any legacy safeStorage secrets and leaves it unlocked.
  ipcMain.handle('vault:setup', async (_, { password }: { password: string }) => {
    try {
      const data = await vaultManager.create(password);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('vault:unlock', async (_, { password }: { password: string }) => {
    try {
      const data = await vaultManager.unlock(password);
      return { success: true, data };
    } catch (error: any) {
      const code = error instanceof WrongPasswordError
        ? 'WRONG_PASSWORD'
        : error instanceof VaultCorruptError
          ? 'CORRUPT'
          : error instanceof TooManyAttemptsError
            ? 'LOCKED_OUT'
            : 'ERROR';
      // Audit failed unlocks (never log the password). The renderer reads the
      // back-off window from getState().lockedUntil for a live countdown.
      if (code === 'WRONG_PASSWORD' || code === 'LOCKED_OUT') {
        writeLog('VAULT UNLOCK FAILED', `code=${code}; ${error.message}`);
      }
      return { success: false, error: error.message, code };
    }
  });

  // Manual lock (e.g. a "Lock now" button). Graceful: running jobs finish first.
  ipcMain.handle('vault:lock', async () => {
    try {
      vaultManager.requestLock();
      return { success: true, data: vaultManager.getState() };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // "Forgot password": delete the vault and restart the wizard (re-set password,
  // re-upload Service Account, re-login). No recovery key by design (MVP).
  ipcMain.handle('vault:reset', async () => {
    try {
      return { success: true, data: vaultManager.resetVault() };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Change the master password (Settings → Security). Re-wraps the DEK under the
  // new password; the encrypted payload (Service Account + refresh token) survives.
  ipcMain.handle('vault:changePassword', async (_, { current, next }: { current: string; next: string }) => {
    try {
      vaultManager.changePassword(current, next);
      return { success: true };
    } catch (error: any) {
      const code = error instanceof WrongPasswordError ? 'WRONG_PASSWORD' : 'ERROR';
      return { success: false, error: error.message, code };
    }
  });

  // Admin Handlers
  ipcMain.handle('admin:getUsers', async (_, { customer, maxResults, pageToken, query }) => {
    try {
      const result = await ensureAdminService().getUsers(customer, maxResults, pageToken, query);
      return { success: true, ...result };
    } catch (error) {
      // The stack trace stays in the log file; only the user message goes to the renderer
      logger.error('[admin:getUsers] failed', error);
      return { success: false, error: toUserMessage(error) };
    }
  });

  ipcMain.handle('admin:getUser', async (_, userKey) => {
    try {
      const user = await ensureAdminService().getUser(userKey);
      return { success: true, user };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('admin:suspendUser', async (_, userKey) => {
    try {
      const user = await ensureAdminService().suspendUser(userKey);
      return { success: true, user };
    } catch (error) {
      logger.error('[admin:suspendUser] failed', error);
      return { success: false, error: toUserMessage(error) };
    }
  });

  ipcMain.handle('admin:deleteUser', async (_, userKey) => {
    try {
      await ensureAdminService().deleteUser(userKey);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('admin:setEmailForwarding', async (_, { userEmail, forwardingEmail }) => {
    try {
      await ensureAdminService().setEmailForwarding(userEmail, forwardingEmail);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('admin:updateUser', async (_, { userKey, payload }) => {
    try {
      const user = await ensureAdminService().updateUser(userKey, payload);
      return { success: true, user };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('admin:getUserGroups', async (_, userKey) => {
    try {
      const groups = await ensureAdminService().getUserGroups(userKey);
      return { success: true, groups };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('admin:getAvailableGroups', async (_, customer) => {
    try {
      const cacheKey = `availableGroups:${customer || 'my_customer'}`;
      const cached = cache.get<any[]>(cacheKey);
      if (cached) return { success: true, groups: cached };
      const groups = await ensureAdminService().getAvailableGroups(customer);
      cache.set(cacheKey, groups, THIRTY_MINUTES);
      return { success: true, groups };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('admin:createUser', async (_, payload) => {
    try {
      const user = await ensureAdminService().createUser(payload);
      return { success: true, user };
    } catch (error: any) {
      console.error('admin:createUser failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('admin:getOrgUnits', async (_, customer) => {
    try {
      const cacheKey = `orgUnits:${customer || 'my_customer'}`;
      const cached = cache.get<any[]>(cacheKey);
      if (cached) return { success: true, orgUnits: cached };
      const orgUnits = await ensureAdminService().getOrgUnits(customer);
      cache.set(cacheKey, orgUnits, THIRTY_MINUTES);
      return { success: true, orgUnits };
    } catch (error: any) {
      console.error('admin:getOrgUnits failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('admin:getDomains', async (_, customer) => {
    try {
      const cacheKey = `domains:${customer || 'my_customer'}`;
      const cached = cache.get<any[]>(cacheKey);
      if (cached) return { success: true, domains: cached };
      const domains = await ensureAdminService().getDomains(customer);
      cache.set(cacheKey, domains, THIRTY_MINUTES);
      return { success: true, domains };
    } catch (error: any) {
      console.error('admin:getDomains failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('admin:addUserToGroup', async (_, { userKey, groupKey, role }) => {
    try {
      const member = await ensureAdminService().addUserToGroup(userKey, groupKey, role);
      return { success: true, member };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('admin:removeUserFromGroup', async (_, { userKey, groupKey }) => {
    try {
      await ensureAdminService().removeUserFromGroup(userKey, groupKey);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('admin:addAlias', async (_, { userKey, alias }) => {
    try {
      await ensureAdminService().addAlias(userKey, alias);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('admin:removeAlias', async (_, { userKey, alias }) => {
    try {
      await ensureAdminService().removeAlias(userKey, alias);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('admin:getLoginActivities', async (_, { userKey, maxResults }) => {
    try {
      const activities = await ensureAdminService().getLoginActivities(userKey, maxResults);
      return { success: true, activities };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Bulk Handlers
  ipcMain.handle('admin:bulkAction', async (_, payload: import('./types').BulkActionPayload) => {
    cancelBulkOperation = false;
    const { action, users } = payload;
    let successCount = 0;
    let failedCount = 0;
    const errors: Array<{ user: string, error: string }> = [];

    // Send progress events throttled to 100ms. Reduces React re-render pressure
    // in the renderer; 1 emit per item (previously 2: the redundant "before action"
    // was removed). A flush guarantees the final state is sent.
    const sendProgress = throttle(
      (event: import('./types').BulkProgressEvent) => {
        win?.webContents.send('admin:bulkProgress', event);
      },
      100,
    );

    for (let i = 0; i < users.length; i++) {
      const userKey = users[i];

      if (cancelBulkOperation) {
        sendProgress.cancel();
        win?.webContents.send('admin:bulkProgress', {
          total: users.length,
          current: i,
          success: successCount,
          failed: failedCount,
          currentUser: userKey,
          errors,
          status: 'cancelled',
        } as import('./types').BulkProgressEvent);
        return { success: false, cancelled: true, message: 'Bulk operation cancelled by user.' };
      }

      try {
        if (action === 'suspend') {
          await ensureAdminService().suspendUser(userKey);
        } else if (action === 'delete') {
          await ensureAdminService().deleteUser(userKey);
        }
        successCount++;
      } catch (error) {
        failedCount++;
        errors.push({ user: userKey, error: toUserMessage(error) });
      }

      sendProgress({
        total: users.length,
        current: i + 1,
        success: successCount,
        failed: failedCount,
        currentUser: userKey,
        errors,
        status: 'running',
      } as import('./types').BulkProgressEvent);

      // Add a small delay for rate limiting (500ms)
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Final progress: cancel the pending throttled emit and send the completed event directly
    sendProgress.cancel();
    win?.webContents.send('admin:bulkProgress', {
      total: users.length,
      current: users.length,
      success: successCount,
      failed: failedCount,
      currentUser: '',
      errors,
      status: 'completed',
    } as import('./types').BulkProgressEvent);

    return { success: true, successCount, failedCount, errors };
  });

  ipcMain.handle('admin:cancelBulkAction', async () => {
    cancelBulkOperation = true;
    return { success: true };
  });

  // Dashboard Handlers
  ipcMain.handle('dashboard:getStorageUsage', async () => {
    try {
      const cached = cache.getWithMeta('storageUsage');
      if (cached) return { success: true, data: cached.data, updatedAt: cached.createdAt };
      const data = await ensureAdminService().getCustomerStorageUsage();
      const now = Date.now();
      cache.set('storageUsage', data, FOUR_HOURS);
      return { success: true, data, updatedAt: now };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('dashboard:getUserCounts', async () => {
    try {
      const cached = cache.getWithMeta('userCounts');
      if (cached) return { success: true, data: cached.data, updatedAt: cached.createdAt };
      const data = await ensureAdminService().getCustomerUserCounts();
      const now = Date.now();
      cache.set('userCounts', data, FOUR_HOURS);
      return { success: true, data, updatedAt: now };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('dashboard:getRecentUsers', async () => {
    try {
      const cached = cache.getWithMeta('recentUsers');
      if (cached) return { success: true, data: cached.data, updatedAt: cached.createdAt };
      const data = await ensureAdminService().getRecentlyCreatedUsers(5);
      const now = Date.now();
      cache.set('recentUsers', data, FOUR_HOURS);
      return { success: true, data, updatedAt: now };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Auto-update removed — manual distribution. The version can still be queried:
  ipcMain.handle('app:getVersion', () => {
    return { version: app.getVersion() };
  });

  // Updates the window title to match the locale when the renderer changes language
  ipcMain.handle('app:setLocale', async (_, locale: 'tr' | 'en') => {
    try {
      applyWindowTitle(locale);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Google Groups — Directory + Groups Settings API
  // Uses the OAuth token; in the audit log, actor.email = the logged-in admin.
  ipcMain.handle('groups:list', async (_, params: { query?: string; pageToken?: string; maxResults?: number } = {}) => {
    try {
      const { listGroups } = await import('./services/groups-service');
      const data = await listGroups(authService.getClient(), params);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('groups:get', async (_, { groupKey }: { groupKey: string }) => {
    try {
      const { getGroup } = await import('./services/groups-service');
      const data = await getGroup(authService.getClient(), groupKey);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('groups:create', async (_, { payload, members }: { payload: import('./types').CreateGroupPayload; members?: import('./types').MemberInput[] }) => {
    try {
      const { createGroup, addMembers } = await import('./services/groups-service');
      const auth = authService.getClient();
      const group = await createGroup(auth, payload);
      let memberResult: import('./types').MemberBatchResult | undefined;
      if (members && members.length > 0) {
        memberResult = await addMembers(auth, group.email, members);
      }
      return { success: true, data: { group, memberResult } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('groups:update', async (_, { groupKey, payload }: { groupKey: string; payload: import('./types').UpdateGroupPayload }) => {
    try {
      const { updateGroup } = await import('./services/groups-service');
      const data = await updateGroup(authService.getClient(), groupKey, payload);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('groups:delete', async (_, { groupKey }: { groupKey: string }) => {
    try {
      const { deleteGroup } = await import('./services/groups-service');
      await deleteGroup(authService.getClient(), groupKey);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('groups:listMembers', async (_, { groupKey }: { groupKey: string }) => {
    try {
      const { listMembers } = await import('./services/groups-service');
      const data = await listMembers(authService.getClient(), groupKey);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('groups:addMembers', async (_, { groupKey, members }: { groupKey: string; members: import('./types').MemberInput[] }) => {
    try {
      const { addMembers } = await import('./services/groups-service');
      const data = await addMembers(authService.getClient(), groupKey, members);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('groups:removeMembers', async (_, { groupKey, emails }: { groupKey: string; emails: string[] }) => {
    try {
      const { removeMembers } = await import('./services/groups-service');
      const data = await removeMembers(authService.getClient(), groupKey, emails);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('groups:updateMemberRole', async (_, { groupKey, email, role }: { groupKey: string; email: string; role: import('./types').GroupRole }) => {
    try {
      const { updateMemberRole } = await import('./services/groups-service');
      const data = await updateMemberRole(authService.getClient(), groupKey, email, role);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('groups:updateMemberDeliverySettings', async (_, { groupKey, email, deliverySettings }: { groupKey: string; email: string; deliverySettings: import('./types').DeliverySetting }) => {
    try {
      const { updateMemberDeliverySettings } = await import('./services/groups-service');
      const data = await updateMemberDeliverySettings(authService.getClient(), groupKey, email, deliverySettings);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('groups:listAliases', async (_, { groupKey }: { groupKey: string }) => {
    try {
      const { listAliases } = await import('./services/groups-service');
      const data = await listAliases(authService.getClient(), groupKey);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('groups:addAlias', async (_, { groupKey, alias }: { groupKey: string; alias: string }) => {
    try {
      const { addAlias } = await import('./services/groups-service');
      const data = await addAlias(authService.getClient(), groupKey, alias);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('groups:removeAlias', async (_, { groupKey, alias }: { groupKey: string; alias: string }) => {
    try {
      const { removeAlias } = await import('./services/groups-service');
      await removeAlias(authService.getClient(), groupKey, alias);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('groups:getSettings', async (_, { groupKey }: { groupKey: string }) => {
    try {
      const { getSettings } = await import('./services/groups-service');
      const data = await getSettings(authService.getClient(), groupKey);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('groups:updateSettings', async (_, { groupKey, settings }: { groupKey: string; settings: import('./types').GroupSettings }) => {
    try {
      const { updateSettings } = await import('./services/groups-service');
      const data = await updateSettings(authService.getClient(), groupKey, settings);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Titles — CRUD via local SQLite
  ipcMain.handle('titles:getAll', async () => {
    try {
      const { titleService } = await import('./services/title-service');
      return { success: true, data: titleService.list() };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('titles:create', async (_, { name }: { name: string }) => {
    try {
      const { titleService } = await import('./services/title-service');
      const data = titleService.create(name, authService?.getCurrentUserEmail() ?? null);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('titles:update', async (_, { id, name }: { id: number; name: string }) => {
    try {
      const { titleService } = await import('./services/title-service');
      const data = titleService.update(id, name, authService?.getCurrentUserEmail() ?? null);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('titles:delete', async (_, { id }: { id: number }) => {
    try {
      const { titleService } = await import('./services/title-service');
      titleService.remove(id);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('titles:importCsv', async (_, { csv }: { csv: string }) => {
    try {
      requireCsvSize(csv);
      const { titleService } = await import('./services/title-service');
      const data = titleService.importCsv(csv, authService?.getCurrentUserEmail() ?? null);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Institutions — local SQLite
  ipcMain.handle('institutions:getAll', async () => {
    try {
      const { institutionService } = await import('./services/institution-service');
      return { success: true, data: institutionService.list() };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('institutions:create', async (_, input: { name: string; address?: string; phone?: string }) => {
    try {
      const { institutionService } = await import('./services/institution-service');
      const data = institutionService.create(input, authService?.getCurrentUserEmail() ?? null);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('institutions:update', async (_, { id, input }: { id: number; input: { name: string; address?: string; phone?: string } }) => {
    try {
      const { institutionService } = await import('./services/institution-service');
      const data = institutionService.update(id, input, authService?.getCurrentUserEmail() ?? null);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('institutions:delete', async (_, { id }: { id: number }) => {
    try {
      const { institutionService } = await import('./services/institution-service');
      institutionService.remove(id);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('institutions:importCsv', async (_, { csv }: { csv: string }) => {
    try {
      requireCsvSize(csv);
      const { institutionService } = await import('./services/institution-service');
      const data = institutionService.importCsv(csv, authService?.getCurrentUserEmail() ?? null);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Signature Templates — local SQLite (HTML sanitize + render happen here)
  ipcMain.handle('templates:getAll', async () => {
    try {
      const { templateService } = await import('./services/template-service');
      return { success: true, data: templateService.list() };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('templates:get', async (_, { id }: { id: number }) => {
    try {
      const { templateService } = await import('./services/template-service');
      const data = templateService.get(id);
      if (!data) return { success: false, error: 'Şablon bulunamadı' };
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('templates:create', async (_, { name, htmlContent }: { name: string; htmlContent: string }) => {
    try {
      const { templateService } = await import('./services/template-service');
      const data = templateService.create(name, htmlContent, authService?.getCurrentUserEmail() ?? null);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('templates:update', async (_, { id, name, htmlContent }: { id: number; name: string; htmlContent: string }) => {
    try {
      const { templateService } = await import('./services/template-service');
      const data = templateService.update(id, name, htmlContent, authService?.getCurrentUserEmail() ?? null);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('templates:delete', async (_, { id }: { id: number }) => {
    try {
      const { templateService } = await import('./services/template-service');
      templateService.remove(id);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('templates:preview', async (_, { id, variables }: { id: number; variables: Record<string, string> }) => {
    try {
      const { templateService } = await import('./services/template-service');
      const { renderSignatureHtml, AVAILABLE_TAGS } = await import('./services/template-renderer');
      const { buildMediaTokenVars } = await import('./services/media-token');
      const tpl = templateService.get(id);
      if (!tpl) return { success: false, error: 'Şablon bulunamadı' };
      // Media tokens spread LAST, same rule as the push path: the template's own
      // assets win over anything the renderer sends. Preview must agree with push.
      const html = renderSignatureHtml(tpl.htmlContent, { ...(variables || {}), ...buildMediaTokenVars(tpl.media) });
      return { success: true, data: { html, tags: AVAILABLE_TAGS } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('templates:setDefault', async (_, { id }: { id: number }) => {
    try {
      const { templateService } = await import('./services/template-service');
      const data = templateService.setDefault(id, authService?.getCurrentUserEmail() ?? null);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Media (Drive image links)
  ipcMain.handle('media:getAll', async (_, payload: { templateId?: number } = {}) => {
    try {
      const { mediaService } = await import('./services/media-service');
      return { success: true, data: mediaService.list(payload?.templateId) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('media:create', async (_, input: { name: string; driveUrl: string; mimeType?: string; templateId: number }) => {
    try {
      const { mediaService } = await import('./services/media-service');
      // Destructure explicitly. The service signature is WIDER than this
      // handler's — it also accepts `fileId`, and prefers it when present,
      // skipping the strict Drive-URL parser entirely. Forwarding `input`
      // wholesale let the renderer pass a field this handler never mentions
      // straight into an <img src> in a pushed signature.
      const data = mediaService.create(
        {
          name: requireString(input?.name, 'Medya adı', 200),
          driveUrl: requireString(input?.driveUrl, 'Drive URL', 2048),
          mimeType: typeof input?.mimeType === 'string' ? input.mimeType : undefined,
          templateId: Number(input?.templateId),
        },
        authService?.getCurrentUserEmail() ?? null,
      );
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Native upload: image buffer → Drive (logged-in admin's OAuth client) → public → media row.
  ipcMain.handle('media:upload', async (_, input: { name: string; data: ArrayBuffer | Uint8Array; mimeType: string; templateId: number }) => {
    try {
      const { uploadImage, makePublic } = await import('./services/drive-upload-service');
      const { mediaService } = await import('./services/media-service');
      requireGoogleAuth();
      const auth = authService.getClient();
      const name = requireString(input?.name, 'Dosya adı', 200);
      // The mimeType comes from the BYTES, never from input.mimeType. What the
      // renderer sends is the browser's guess from the file extension, and the
      // label we pass to Drive becomes the Content-Type the public CDN serves
      // the file with — so it has to be derived from content.
      const { buffer, mimeType } = requireImageBytes(input?.data, 'Görsel', MAX_MEDIA_BYTES);
      const fileId = await uploadImage(auth, buffer, name, mimeType);
      await makePublic(auth, fileId);
      const data = mediaService.create(
        { name, fileId, mimeType, templateId: Number(input?.templateId) },
        authService?.getCurrentUserEmail() ?? null,
      );
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('media:delete', async (_, { id }: { id: number }) => {
    try {
      const { mediaService } = await import('./services/media-service');
      const { revokePublicAccess } = await import('./services/drive-upload-service');
      const { driveFileId } = mediaService.remove(id);
      // Revoke AFTER the row is gone, and never let a Drive failure resurrect
      // the row: the local record is the source of truth for the UI, while the
      // public grant is best-effort cleanup that the user can also do in Drive.
      if (driveFileId && authService?.isAuthenticated()) {
        try {
          await revokePublicAccess(authService.getClient(), driveFileId);
        } catch (err) {
          logger.warn(`[media:delete] Drive genel erişimi kaldırılamadı (${driveFileId})`, err);
        }
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Service Account & Signature
  ipcMain.handle('config:serviceAccountStatus', async () => {
    try {
      const { getStatus } = await import('./secrets/service-account-loader');
      return { success: true, data: getStatus() };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('config:uploadServiceAccount', async (_, { content }: { content: string }) => {
    try {
      if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > MAX_SA_JSON_BYTES) {
        throw new UserFacingError('Service Account JSON dosyası beklenenden büyük.');
      }
      const { uploadFromContent } = await import('./secrets/service-account-loader');
      const { clearAuthCache } = await import('./services/google-admin-sa');
      const { clearGmailAuthCache } = await import('./services/gmail-signature-service');
      const { clearEmailNotificationCache } = await import('./services/email-notification-service');
      const result = uploadFromContent(content);
      clearAuthCache();
      clearGmailAuthCache();
      clearEmailNotificationCache();
      // Keep the boot-time soft-warn flag in sync so the renderer's
      // ConfigWarningBanner clears immediately, without an app restart.
      bootStatus.soft.serviceAccountMissing = false;
      return { success: true, data: result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('config:deleteServiceAccount', async () => {
    try {
      const { clearKey } = await import('./secrets/service-account-loader');
      const { clearAuthCache } = await import('./services/google-admin-sa');
      const { clearGmailAuthCache } = await import('./services/gmail-signature-service');
      const { clearEmailNotificationCache } = await import('./services/email-notification-service');
      clearKey();
      clearAuthCache();
      clearGmailAuthCache();
      clearEmailNotificationCache();
      // The Service Account is gone — re-raise the boot-time soft-warn flag so the
      // ConfigWarningBanner reappears without an app restart.
      bootStatus.soft.serviceAccountMissing = true;
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // App Config (company name, abbreviation, logo, email sender, allowed domain)
  ipcMain.handle('config:getAll', async () => {
    try {
      const { appConfigService } = await import('./services/app-config-service');
      return { success: true, data: appConfigService.getAll() };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('config:set', async (_, { key, value }: { key: string; value: string | null }) => {
    try {
      const { appConfigService } = await import('./services/app-config-service');
      // setFromRenderer(), not set(): the key arrives over IPC and must be
      // checked against an allowlist at runtime. See RENDERER_WRITABLE_KEYS.
      appConfigService.setFromRenderer(key, value, { vaultUnlocked: vaultManager.isUnlocked() });
      return { success: true, data: appConfigService.getAll() };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('config:uploadLogo', async (_, { data, ext }: { data: ArrayBuffer | Uint8Array; ext: string }) => {
    try {
      const { appConfigService } = await import('./services/app-config-service');
      const buf = Buffer.from(data instanceof Uint8Array ? data : new Uint8Array(data));
      const stored = appConfigService.uploadLogo(buf, ext);
      return { success: true, data: { logoPath: stored, config: appConfigService.getAll() } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('config:deleteLogo', async () => {
    try {
      const { appConfigService } = await import('./services/app-config-service');
      appConfigService.deleteLogo();
      return { success: true, data: appConfigService.getAll() };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('config:getLogoDataUrl', async () => {
    try {
      const { appConfigService } = await import('./services/app-config-service');
      const p = appConfigService.get('logoPath');
      if (!p || !appConfigService.logoExists()) return { success: true, data: null };
      const { readFile } = await import('node:fs/promises');
      const buf = await readFile(p);
      const ext = (p.split('.').pop() || 'png').toLowerCase();
      const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      return { success: true, data: `data:${mime};base64,${buf.toString('base64')}` };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('config:markOnboardingComplete', async () => {
    try {
      const { appConfigService } = await import('./services/app-config-service');
      // The vault must exist and be unlocked before onboarding can complete —
      // otherwise the Service Account / refresh token had nowhere to be stored.
      if (!vaultManager.isUnlocked() || !vaultManager.fileExists()) {
        return { success: false, error: 'Ana parola belirlenmeden onboarding tamamlanamaz.' };
      }
      return { success: true, data: appConfigService.markOnboardingComplete() };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('config:acceptTerms', async (_, version: string) => {
    try {
      const { appConfigService } = await import('./services/app-config-service');
      return { success: true, data: appConfigService.acceptTerms(version) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('config:resetOnboarding', async () => {
    try {
      const { appConfigService } = await import('./services/app-config-service');
      // Non-destructive restart: only the wizard progress is reset. OAuth
      // credentials and the admin session are preserved so an admin who only
      // wants to tweak settings (e.g. company branding) can walk through without
      // re-entering credentials or signing in again. To remove credentials use
      // Settings → Google Workspace → "Clear"; to switch admin use Logout.
      return { success: true, data: appConfigService.resetOnboarding() };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Factory reset: permanently wipe ALL local data and return to a fresh install
  // (e.g. handing the same machine to a different company / admin). Destructive
  // and irreversible — guarded by a type-to-confirm modal in the renderer.
  ipcMain.handle('config:factoryReset', async () => {
    try {
      const { appConfigService } = await import('./services/app-config-service');
      const { getDb } = await import('./db');
      const { clearAuthCache } = await import('./services/google-admin-sa');
      const { clearGmailAuthCache } = await import('./services/gmail-signature-service');
      const { clearEmailNotificationCache } = await import('./services/email-notification-service');

      // 1. Sign out (revoke + drop the vault refresh token) and clear all
      //    credentials/caches. Then delete the vault entirely.
      try { await authService?.logout(); } catch { /* offline revoke can fail; continue */ }
      authService?.invalidateCredentials();
      adminService = null;
      adminServiceClient = null;
      vaultManager.wipe();               // zeroize + delete vault.enc (SA + refresh token)
      secureStorage.clearClientSecret(); // defensive: clear any legacy oauth-secret.enc
      clearAuthCache();
      clearGmailAuthCache();
      clearEmailNotificationCache();
      bootStatus.soft.serviceAccountMissing = true;

      // 2. Delete the logo file (before config rows are wiped, so logoPath resolves).
      try { appConfigService.deleteLogo(); } catch { /* ignore */ }

      // 3. Wipe every SQLite table (schema + pragma user_version preserved).
      const db = getDb();
      const wipe = db.transaction(() => {
        for (const tbl of [
          'signature_audit_items', 'signature_state', 'jobs', 'media_assets',
          'signature_templates', 'institutions', 'titles', 'app_config',
        ]) {
          db.prepare(`DELETE FROM ${tbl}`).run();
        }
      });
      wipe();

      // 3b. Purge residue: DELETE only frees pages, leaving the old plaintext (e.g.
      //     the OAuth client secret, institution data) recoverable in free pages /
      //     the WAL. Truncate the WAL and VACUUM to rebuild the file so nothing
      //     sensitive lingers on disk after a disposal wipe.
      try {
        db.pragma('wal_checkpoint(TRUNCATE)');
        db.exec('VACUUM');
      } catch (e) {
        logger.warn('[factoryReset] VACUUM failed (best-effort residue purge):', e);
      }

      // 4. Drop the dashboard cache.
      cache.clear();

      // 5. Delete all logs + the legacy crash.log — operation history (admin/user
      //    emails, errors) must not survive a disposal wipe.
      try { clearAllLogs(); } catch { /* ignore */ }
      try {
        const crashPath = getCrashLogPath();
        if (fs.existsSync(crashPath)) fs.unlinkSync(crashPath);
      } catch { /* ignore */ }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('config:getOAuthCredentials', async () => {
    try {
      const { appConfigService } = await import('./services/app-config-service');
      return {
        success: true,
        data: {
          clientId: appConfigService.get('googleClientId') ?? '',
          hasSecret: !!appConfigService.get('googleClientSecret'),
        },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Write point for the Onboarding and Settings card.
   * - clientId: leaving it empty means "don't change" (partial update from Settings).
   * - clientSecret: leaving it empty means "don't change" — the existing secret is kept.
   * - If both are filled: both are saved with their new values.
   * - If clientId is provided but the secret has never been set, an error is returned
   *   (onboarding requires both for the initial creation; the UI already validates this
   *   before calling).
   */
  ipcMain.handle('config:setOAuthCredentials', async (
    _,
    payload: { clientId?: string; clientSecret?: string },
  ) => {
    try {
      const { appConfigService } = await import('./services/app-config-service');
      const trimmedId = (payload?.clientId ?? '').trim();
      const trimmedSecret = (payload?.clientSecret ?? '').trim();

      if (trimmedId) {
        appConfigService.set('googleClientId', trimmedId);
      }
      if (trimmedSecret) {
        // Plaintext app_config (vault model): a desktop OAuth app is a public
        // client (RFC 8252) and the secret is needed before the vault unlocks.
        appConfigService.set('googleClientSecret', trimmedSecret);
      }

      const currentId = appConfigService.get('googleClientId');
      const hasSecret = !!appConfigService.get('googleClientSecret');
      if (!currentId || !hasSecret) {
        return {
          success: false,
          error: 'Hem Client ID hem de Client Secret eksiksiz girilmeli.',
        };
      }

      // Credentials changed — invalidate the auth client and set adminService to
      // null too. The next use recreates it with a fresh client.
      authService?.invalidateCredentials();
      adminService = null;
      adminServiceClient = null;

      return {
        success: true,
        data: { clientId: currentId, hasSecret },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('config:clearOAuthCredentials', async () => {
    try {
      const { appConfigService } = await import('./services/app-config-service');
      appConfigService.set('googleClientId', null);
      appConfigService.set('googleClientSecret', null);
      secureStorage.clearClientSecret(); // defensive: clear any legacy .enc too
      authService?.invalidateCredentials();
      adminService = null;
      adminServiceClient = null;
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Validation before saving credentials: create an in-memory OAuth2Client and
   * check that it can produce a valid authorization URL via generateAuthUrl().
   * Not a real OAuth flow — just a format + library init test (a malformed clientId
   * throws inside generateAuthUrl).
   */
  ipcMain.handle('config:testOAuthCredentials', async (
    _,
    payload: { clientId: string; clientSecret: string },
  ) => {
    try {
      const trimmedId = (payload?.clientId ?? '').trim();
      const trimmedSecret = (payload?.clientSecret ?? '').trim();
      if (!trimmedId || !trimmedSecret) {
        return { success: false, error: 'Client ID ve Secret boş olamaz.' };
      }
      const { OAuth2Client } = await import('google-auth-library');
      // No redirect URI: the real flow binds an ephemeral loopback port per login
      // (see auth-service.ts). This is only a format/init check.
      const client = new OAuth2Client(trimmedId, trimmedSecret);
      // generateAuthUrl throws on bad parameters; a successful return = init OK.
      const url = client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/userinfo.email'],
      });
      return { success: true, data: { ok: !!url } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('config:getDwdScopes', async () => {
    const { DWD_SCOPES } = await import('./services/dwd-scopes');
    return { success: true, data: [...DWD_SCOPES] };
  });

  ipcMain.handle('config:testDwdScopes', async (_, payload: { adminEmail?: string } | undefined) => {
    try {
      const { testDwdScopes } = await import('./services/dwd-test-service');
      const result = await testDwdScopes(payload?.adminEmail);
      return { success: true, data: result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('signatures:get', async (_, { email }: { email: string }) => {
    try {
      const { getSignature } = await import('./services/gmail-signature-service');
      const signature = await getSignature(email);
      return { success: true, data: { email, signature } };
    } catch (error: any) {
      return { success: false, error: `İmza alınamadı: ${error.message}` };
    }
  });

  ipcMain.handle('signatures:push', async (_, payload: { email: string; templateId?: number; variables?: Record<string, string>; html?: string }) => {
    try {
      const { pushSignature } = await import('./services/gmail-signature-service');
      const adminEmail = authService?.getCurrentUserEmail();
      if (!adminEmail) return { success: false, error: 'Admin oturumu bulunamadı' };
      const data = await pushSignature(payload.email, {
        templateId: payload.templateId,
        variables: payload.variables,
        html: payload.html,
      }, adminEmail);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: `İmza gönderilemedi: ${error.message}` };
    }
  });

  // Bulk CSV analysis (local SQLite + lookup)
  ipcMain.handle('bulk:analyze', async (_, payload: { actionType: string; rows: Record<string, string>[]; lang?: 'tr' | 'en' }) => {
    try {
      const { analyzeBulkCsv } = await import('./services/csv-analysis');
      return { success: true, data: analyzeBulkCsv(payload.actionType, payload.rows, payload.lang ?? 'tr') };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('bulk:downloadTemplate', async (_, { actionType, lang }: { actionType: string; lang?: 'tr' | 'en' }) => {
    try {
      const { dialog } = await import('electron');
      const { writeFile } = await import('node:fs/promises');
      const { appConfigService } = await import('./services/app-config-service');
      const { localeColumnsForAction } = await import('./services/csv-analysis');
      const resolvedLang: 'tr' | 'en' = lang === 'en' ? 'en' : 'tr';
      const domain = appConfigService.get('allowedDomain') || 'example.com';
      const sampleEmail = resolvedLang === 'en' ? `sample@${domain}` : `ornek@${domain}`;
      // Headers localized by language (TR: kurum_adi / EN: institution_name).
      const headers = localeColumnsForAction(actionType, resolvedLang);
      const sampleGroup = resolvedLang === 'en' ? `group@${domain}` : `grup@${domain}`;
      const exampleByAction: Record<'tr' | 'en', Record<string, string[]>> = {
        tr: {
          suspend: [sampleEmail],
          delete: [sampleEmail],
          signature_push: [sampleEmail, 'Ali', 'Yılmaz', 'Öğretmen', 'Merkez', '05551234567'],
          add_to_group: [sampleGroup, sampleEmail, 'MEMBER'],
        },
        en: {
          suspend: [sampleEmail],
          delete: [sampleEmail],
          signature_push: [sampleEmail, 'John', 'Doe', 'Manager', 'Head Office', '5551234567'],
          add_to_group: [sampleGroup, sampleEmail, 'MEMBER'],
        },
      };
      const example = exampleByAction[resolvedLang][actionType] || [sampleEmail];
      const csv = '﻿' + headers.join(',') + '\n' + example.join(',') + '\n';
      const result = await dialog.showSaveDialog(win!, {
        title: 'CSV şablonunu kaydet',
        defaultPath: `${actionType}-template.csv`,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      });
      if (result.canceled || !result.filePath) return { success: true, data: { canceled: true } };
      await writeFile(result.filePath, csv, 'utf-8');
      return { success: true, data: { path: result.filePath } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Jobs
  ipcMain.handle('jobs:create', async (_, payload: { type: string; payload: any }) => {
    try {
      // requireGoogleAuth() rather than a bare "is an email set" check: this
      // channel can enqueue BULK_DELETE against the whole tenant, and the job
      // survives restarts via resumeOnStartup(), so an expired session must not
      // be able to schedule tenant-destructive work.
      requireGoogleAuth();
      const adminEmail = authService?.getCurrentUserEmail();
      if (!adminEmail) return { success: false, error: 'Admin oturumu bulunamadı' };
      const type = requireOneOf(payload?.type, JOB_TYPES, 'iş tipi');
      const jobPayload = validateJobPayload(type, payload?.payload);
      const total = computeJobTotal(type, jobPayload);
      const job = jobQueue.enqueue({ type, payload: jobPayload, total, createdBy: adminEmail });
      jobRunner.enqueueAndStart(job);
      return { success: true, data: { id: job.id } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('jobs:list', async (_, filters: any = {}) => {
    try {
      return { success: true, data: jobQueue.list(filters) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Signature Audit
  ipcMain.handle('signatureAudit:startScan', async (_, payload: { scope: { type: 'all' | 'group' | 'orgUnit'; value?: string }; templateId: number; depth: 'fast' | 'deep' }) => {
    try {
      const adminEmail = authService?.getCurrentUserEmail();
      if (!adminEmail) return { success: false, error: 'Admin oturumu bulunamadı' };
      if (!payload?.templateId) return { success: false, error: 'Şablon seçilmedi' };
      if (!payload?.scope?.type) return { success: false, error: 'Kapsam seçilmedi' };
      const job = jobQueue.enqueue({ type: 'SIGNATURE_AUDIT', payload, total: 0, createdBy: adminEmail });
      jobRunner.enqueueAndStart(job);
      return { success: true, data: { jobId: job.id } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('signatureAudit:getItems', async (_, { jobId }: { jobId: string }) => {
    try {
      const { getAuditItems } = await import('./services/signature-audit-service');
      return { success: true, data: getAuditItems(jobId) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('signatureAudit:apply', async (_, payload: { emails: string[]; templateId: number }) => {
    try {
      const adminEmail = authService?.getCurrentUserEmail();
      if (!adminEmail) return { success: false, error: 'Admin oturumu bulunamadı' };
      if (!payload?.templateId) return { success: false, error: 'Şablon seçilmedi' };
      if (!Array.isArray(payload.emails) || payload.emails.length === 0) {
        return { success: false, error: 'Güncellenecek kişi seçilmedi' };
      }
      const job = jobQueue.enqueue({
        type: 'BULK_SIGNATURE_PUSH',
        payload: { emails: payload.emails, templateId: payload.templateId },
        total: payload.emails.length,
        createdBy: adminEmail,
      });
      jobRunner.enqueueAndStart(job);
      return { success: true, data: { jobId: job.id } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('jobs:get', async (_, { id }: { id: string }) => {
    try {
      const job = jobQueue.get(id);
      if (!job) return { success: false, error: 'Job bulunamadı' };
      return { success: true, data: job };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('jobs:cancel', async (_, { id }: { id: string }) => {
    try {
      const ok = jobRunner.cancel(id);
      return { success: ok };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('jobs:downloadReport', async (_, { id, format }: { id: string; format: 'csv' | 'json' }) => {
    try {
      const { dialog } = await import('electron');
      const { writeFile } = await import('node:fs/promises');
      const job = jobQueue.get(id);
      if (!job) return { success: false, error: 'Job bulunamadı' };
      const ext = format === 'json' ? 'json' : 'csv';
      const result = await dialog.showSaveDialog(win!, {
        title: 'Job raporunu kaydet',
        defaultPath: `job-${job.id}.${ext}`,
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
      });
      if (result.canceled || !result.filePath) return { success: true, data: { canceled: true } };

      let content: string;
      if (format === 'json') {
        content = JSON.stringify(job.executionReport ?? job, null, 2);
      } else {
        const report = job.executionReport;
        const lines: string[] = ['﻿email,status,row_number,step,error'];
        if (report) {
          for (const ok of report.succeededItems || []) {
            lines.push(`${ok.email},success,${ok.rowNumber},,`);
          }
          for (const fail of report.failedItems || []) {
            lines.push(`${fail.email},failed,${fail.rowNumber},${fail.step},"${(fail.error || '').replace(/"/g, '""')}"`);
          }
        }
        content = lines.join('\n') + '\n';
      }
      await writeFile(result.filePath, content, 'utf-8');
      return { success: true, data: { path: result.filePath } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Proactive background polling
  const refreshDashboardCache = async () => {
    if (!authService?.isAuthenticated()) return;
    try {
      const [storage, users, recent] = await Promise.all([
        ensureAdminService().getCustomerStorageUsage(),
        ensureAdminService().getCustomerUserCounts(),
        ensureAdminService().getRecentlyCreatedUsers(5),
      ]);
      cache.set('storageUsage', storage, FOUR_HOURS);
      cache.set('userCounts', users, FOUR_HOURS);
      cache.set('recentUsers', recent, FOUR_HOURS);
    } catch (err) {
      console.error('Proaktif cache güncelleme hatası:', err);
    }
  };

  refreshDashboardCache();
  setInterval(refreshDashboardCache, THREE_HOURS);
});
