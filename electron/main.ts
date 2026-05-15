import { app, BrowserWindow, powerMonitor, ipcMain, crashReporter } from 'electron'
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
import { CacheService } from './services/cache-service';
import { getDb, closeDb } from './db';
import { jobRunner } from './jobs/runner';
import { jobQueue } from './jobs/queue';
import { registerSignaturePushWorker } from './jobs/signature-push-worker';
import { registerBulkActionWorker } from './jobs/bulk-action-worker';
import { registerSignatureAuditWorker } from './jobs/signature-audit-worker';

let win: BrowserWindow | null
let authService: AuthService
let adminService: AdminService
let cache: CacheService
let cancelBulkOperation = false

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
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  win.once('ready-to-show', () => {
    win?.show()
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
// Crash raporlayıcıyı başlat (dosya tabanlı, sunucu gerekmez)
crashReporter.start({
  productName: 'GoWorks',
  submitURL: '',
  uploadToServer: false,
});

const getCrashLogPath = () => {
  try { return path.join(app.getPath('userData'), 'crash.log'); } catch { return '/tmp/goworks-crash.log'; }
};

const writeLog = (prefix: string, detail: unknown) => {
  const stamp = new Date().toISOString();
  const msg = `[${stamp}] ${prefix}:\n${detail instanceof Error ? detail.stack : String(detail)}\n${'─'.repeat(80)}\n`;
  console.error(msg);
  try { fs.appendFileSync(getCrashLogPath(), msg, 'utf-8'); } catch {/* ignore */ }
};

process.on('uncaughtException', (err) => writeLog('UNCAUGHT EXCEPTION', err));
process.on('unhandledRejection', (reason) => writeLog('UNHANDLED REJECTION', reason));
// ─────────────────────────────────────────────────────────────────────────────

function computeJobTotal(_type: import('./jobs/types').JobType, payload: any): number {
  if (!payload) return 0;
  if (Array.isArray(payload?.rows)) return payload.rows.length;
  if (Array.isArray(payload?.emails)) return payload.emails.length;
  return 0;
}

app.whenReady().then(async () => {
  // SQLite DB'yi açılışta başlat (Title/Institution/Template/Media/Job tabloları)
  try {
    getDb();
  } catch (err) {
    writeLog('DB INIT FAILED', err);
  }

  createWindow();
  if (win) jobRunner.setWindow(win);

  // Window title'ı kullanıcının dil tercihine göre ayarla
  try {
    const { appConfigService } = await import('./services/app-config-service');
    applyWindowTitle(appConfigService.get('language'));
  } catch (err) {
    writeLog('LOCALE TITLE INIT FAILED', err);
  }

  // Worker handler'larını runner'a bağla — resume edilen veya yeni gelen jobları
  // bu fonksiyonlar işler.
  registerSignaturePushWorker();
  registerBulkActionWorker();
  registerSignatureAuditWorker();
  jobRunner.resumeOnStartup();

  authService = new AuthService();
  adminService = new AdminService(authService.getClient());
  cache = new CacheService();
  cancelBulkOperation = false;

  // Handle 1-hour idle timeout (system-level safety net)
  setInterval(async () => {
    if (!authService?.isAuthenticated()) return;
    const idleTime = powerMonitor.getSystemIdleTime();
    if (idleTime >= 3600) { // 1 hour
      await authService.logout();
      if (win && !win.isDestroyed()) {
        win.webContents.send('auth:logout-event');
      }
    }
  }, 60000); // Check every minute

  // Auth Handlers
  ipcMain.handle('auth:login', async () => {
    if (!win) return null;
    try {
      const result = await authService.login();
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

  ipcMain.handle('auth:getAccessToken', async () => {
    try {
      const client = authService.getClient();
      // getAccessToken() otomatik olarak expire olmuş token'ı refresh eder
      const { token } = await client.getAccessToken();
      if (!token) return { success: false, error: 'Token bulunamadı' };
      return { success: true, token };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Admin Handlers
  ipcMain.handle('admin:getUsers', async (_, { customer, maxResults, pageToken, query }) => {
    try {
      const result = await adminService.getUsers(customer, maxResults, pageToken, query);
      return { success: true, ...result };
    } catch (error: any) {
      console.error('admin:getUsers failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('admin:getUser', async (_, userKey) => {
    try {
      const user = await adminService.getUser(userKey);
      return { success: true, user };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('admin:suspendUser', async (_, userKey) => {
    try {
      const user = await adminService.suspendUser(userKey);
      return { success: true, user };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('admin:deleteUser', async (_, userKey) => {
    try {
      await adminService.deleteUser(userKey);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('admin:setEmailForwarding', async (_, { userEmail, forwardingEmail }) => {
    try {
      await adminService.setEmailForwarding(userEmail, forwardingEmail);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('admin:updateUser', async (_, { userKey, payload }) => {
    try {
      const user = await adminService.updateUser(userKey, payload);
      return { success: true, user };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('admin:getUserGroups', async (_, userKey) => {
    try {
      const groups = await adminService.getUserGroups(userKey);
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
      const groups = await adminService.getAvailableGroups(customer);
      cache.set(cacheKey, groups, THIRTY_MINUTES);
      return { success: true, groups };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('admin:createUser', async (_, payload) => {
    try {
      const user = await adminService.createUser(payload);
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
      const orgUnits = await adminService.getOrgUnits(customer);
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
      const domains = await adminService.getDomains(customer);
      cache.set(cacheKey, domains, THIRTY_MINUTES);
      return { success: true, domains };
    } catch (error: any) {
      console.error('admin:getDomains failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('admin:addUserToGroup', async (_, { userKey, groupKey, role }) => {
    try {
      const member = await adminService.addUserToGroup(userKey, groupKey, role);
      return { success: true, member };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('admin:removeUserFromGroup', async (_, { userKey, groupKey }) => {
    try {
      await adminService.removeUserFromGroup(userKey, groupKey);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('admin:addAlias', async (_, { userKey, alias }) => {
    try {
      await adminService.addAlias(userKey, alias);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('admin:removeAlias', async (_, { userKey, alias }) => {
    try {
      await adminService.removeAlias(userKey, alias);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('admin:getLoginActivities', async (_, { userKey, maxResults }) => {
    try {
      const activities = await adminService.getLoginActivities(userKey, maxResults);
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

    for (let i = 0; i < users.length; i++) {
      if (cancelBulkOperation) {
        win?.webContents.send('admin:bulkProgress', {
          total: users.length,
          current: i,
          success: successCount,
          failed: failedCount,
          currentUser: users[i],
          errors,
          status: 'cancelled'
        } as import('./types').BulkProgressEvent);
        return { success: false, cancelled: true, message: 'Bulk operation cancelled by user.' };
      }

      const userKey = users[i];

      // Progress update before action
      win?.webContents.send('admin:bulkProgress', {
        total: users.length,
        current: i,
        success: successCount,
        failed: failedCount,
        currentUser: userKey,
        errors,
        status: 'running'
      } as import('./types').BulkProgressEvent);

      try {
        if (action === 'suspend') {
          await adminService.suspendUser(userKey);
        } else if (action === 'delete') {
          await adminService.deleteUser(userKey);
        }
        successCount++;
      } catch (error: any) {
        failedCount++;
        errors.push({ user: userKey, error: error.message });
      }

      // Add a small delay for rate limiting (500ms)
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Final progress update
    win?.webContents.send('admin:bulkProgress', {
      total: users.length,
      current: users.length,
      success: successCount,
      failed: failedCount,
      currentUser: '',
      errors,
      status: 'completed'
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
      const data = await adminService.getCustomerStorageUsage();
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
      const data = await adminService.getCustomerUserCounts();
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
      const data = await adminService.getRecentlyCreatedUsers(5);
      const now = Date.now();
      cache.set('recentUsers', data, FOUR_HOURS);
      return { success: true, data, updatedAt: now };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Auto-update kaldırıldı — manuel dağıtım. Sürüm bilgisi yine sorulabiliyor:
  ipcMain.handle('app:getVersion', () => {
    return { version: app.getVersion() };
  });

  // Renderer dil değişiminde window title'ı locale'e göre günceller
  ipcMain.handle('app:setLocale', async (_, locale: 'tr' | 'en') => {
    try {
      applyWindowTitle(locale);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Google Groups — Directory + Groups Settings API
  // OAuth tokenı kullanılır; audit log'unda actor.email = giriş yapan admin.
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

  // Titles (Ünvanlar) — yerel SQLite üzerinden CRUD
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
      const { titleService } = await import('./services/title-service');
      const data = titleService.importCsv(csv, authService?.getCurrentUserEmail() ?? null);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Institutions (Kurumlar) — yerel SQLite
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
      const { institutionService } = await import('./services/institution-service');
      const data = institutionService.importCsv(csv, authService?.getCurrentUserEmail() ?? null);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Signature Templates — yerel SQLite (HTML sanitize + render burada)
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
      const { renderTemplate, AVAILABLE_TAGS } = await import('./services/template-renderer');
      const tpl = templateService.get(id);
      if (!tpl) return { success: false, error: 'Şablon bulunamadı' };
      const html = renderTemplate(tpl.htmlContent, variables || {});
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

  // Media (Drive resim linkleri)
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
      const data = mediaService.create(input, authService?.getCurrentUserEmail() ?? null);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('media:delete', async (_, { id }: { id: number }) => {
    try {
      const { mediaService } = await import('./services/media-service');
      mediaService.remove(id);
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
      const { uploadFromContent } = await import('./secrets/service-account-loader');
      const { clearAuthCache } = await import('./services/google-admin-sa');
      const { clearGmailAuthCache } = await import('./services/gmail-signature-service');
      const { clearEmailNotificationCache } = await import('./services/email-notification-service');
      const result = uploadFromContent(content);
      clearAuthCache();
      clearGmailAuthCache();
      clearEmailNotificationCache();
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
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // App Config (firma adı, kısaltma, logo, mail gönderici, izin verilen domain)
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
      appConfigService.set(key as any, value);
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
      return { success: true, data: appConfigService.markOnboardingComplete() };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('config:resetOnboarding', async () => {
    try {
      const { appConfigService } = await import('./services/app-config-service');
      return { success: true, data: appConfigService.resetOnboarding() };
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

  // Bulk CSV analysis (yerel SQLite + lookup)
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
      // Başlıklar dile göre lokalize (TR: kurum_adi / EN: institution_name).
      const headers = localeColumnsForAction(actionType, resolvedLang);
      const exampleByAction: Record<'tr' | 'en', Record<string, string[]>> = {
        tr: {
          suspend: [sampleEmail],
          delete: [sampleEmail],
          signature_push: [sampleEmail, 'Ali', 'Yılmaz', 'Öğretmen', 'Merkez', '05551234567'],
        },
        en: {
          suspend: [sampleEmail],
          delete: [sampleEmail],
          signature_push: [sampleEmail, 'John', 'Doe', 'Manager', 'Head Office', '5551234567'],
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
  ipcMain.handle('jobs:create', async (_, payload: { type: import('./jobs/types').JobType; payload: any }) => {
    try {
      const adminEmail = authService?.getCurrentUserEmail();
      if (!adminEmail) return { success: false, error: 'Admin oturumu bulunamadı' };
      const total = computeJobTotal(payload.type, payload.payload);
      const job = jobQueue.enqueue({ type: payload.type, payload: payload.payload, total, createdBy: adminEmail });
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

  // İmza Denetimi
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
      console.log('Arka planda dashboard cache güncelleniyor...');
      const [storage, users, recent] = await Promise.all([
        adminService.getCustomerStorageUsage(),
        adminService.getCustomerUserCounts(),
        adminService.getRecentlyCreatedUsers(5),
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
