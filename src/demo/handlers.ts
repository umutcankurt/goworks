// Demo-mode IPC handlers.
//
// One entry per channel in `electron/preload.ts`'s invokeChannels allowlist —
// `npm run demo:check` fails the build if any channel is missing here.
//
// Return shapes are NOT uniform, because the renderer has two API layers:
//   * src/services/api.ts       — reads the raw envelope: { success, users }, { success, user }...
//   * src/services/server-api.ts — ipcInvoke() unwraps: { success, data } → data
//   * a few channels (config:getBootStatus, app:*) return a bare value.
// Getting this wrong shows up as a blank screen, so each group is marked below.

import type { DemoStore } from './store';
import type { AdminUser, GroupMember, GroupSettings } from '../types/admin';
import type { ServerJob } from '../services/server-api';
import { CURRENT_TERMS_VERSION } from '../lib/legal';

type Handler = (args: any, store: DemoStore) => any;

/** server-api.ts envelope — ipcInvoke() unwraps `data`. */
const ok = (data?: any) => ({ success: true, data });

const nowIso = () => new Date().toISOString();

function arrayBufferToDataUri(data: ArrayBuffer | Uint8Array, mimeType: string): string {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return `data:${mimeType};base64,${btoa(binary)}`;
}

function renderTemplate(html: string, variables: Record<string, string>): string {
    return html.replace(/\{\{\s*([a-zA-Z0-9_]+)[^}]*\}\}/g, (_match, key: string) => variables[key] ?? '');
}

/**
 * The real handlers open an OS save dialog from the main process. The prototype
 * has no main process, so it hands the file to the browser instead — the button
 * still does something real.
 */
function downloadFile(filename: string, content: string, mimeType = 'text/csv'): string {
    const url = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return filename;
}

function csvEscape(value: unknown): string {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
    return [headers.join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n');
}

/** Canonical CSV columns per bulk action — mirrors src/utils/bulkColumns.ts. */
const BULK_COLUMNS: Record<string, string[]> = {
    suspend: ['email'],
    delete: ['email'],
    signature_push: ['email', 'ad', 'soyad', 'unvan', 'kurum_adi', 'telefon'],
    add_to_group: ['grup_email', 'email', 'rol'],
};

const BULK_COLUMNS_EN: Record<string, string> = {
    ad: 'first_name',
    soyad: 'last_name',
    unvan: 'title',
    kurum_adi: 'institution_name',
    telefon: 'phone',
    grup_email: 'group_email',
    rol: 'role',
};

/** Turns a user record into the variable bag the signature templates expect. */
function variablesFor(user: AdminUser, store: DemoStore): Record<string, string> {
    const institution = store.data.institutions.find(
        (i) => i.name === user.organizations?.[0]?.department,
    );
    return {
        ad_soyad: user.name.fullName,
        unvan: user.organizations?.[0]?.title ?? '',
        kurum_adi: institution?.name ?? user.organizations?.[0]?.department ?? '',
        kurum_adres: institution?.address ?? '',
        kurum_telefon: institution?.phone ?? '',
        telefon: user.phones?.[0]?.value ?? '',
        eposta: user.primaryEmail,
    };
}

function mediaVariables(store: DemoStore, templateId: number): Record<string, string> {
    const vars: Record<string, string> = {};
    for (const m of store.data.media) {
        if (m.templateId === templateId && m.token) vars[m.token] = m.publicUrl;
    }
    return vars;
}

function emailsFromJobPayload(payload: any): string[] {
    if (Array.isArray(payload?.emails)) return payload.emails;
    if (Array.isArray(payload?.rows)) {
        return payload.rows
            .map((r: any) => r?.data?.email ?? r?.email ?? r?.rawData?.email)
            .filter(Boolean);
    }
    return [];
}

function newJob(store: DemoStore, type: ServerJob['type'], payload: any, emails: string[]): ServerJob {
    const job: ServerJob = {
        id: store.nextJobId(),
        type,
        status: 'RUNNING',
        payload,
        result: { errors: [], succeededEmails: [] },
        executionReport: null,
        progress: 0,
        total: emails.length,
        succeeded: 0,
        failed: 0,
        createdBy: store.data.authUser.email,
        createdAt: nowIso(),
        startedAt: nowIso(),
        completedAt: null,
        cancelledAt: null,
    };
    store.data.jobs.unshift(job);
    return job;
}

export const handlers: Record<string, Handler> = {
    // ---------------------------------------------------------------- auth
    // Raw envelope (AuthContext reads result.authenticated / result.user).

    'auth:check': () => ({
        success: true,
        authenticated: !!window.localStorage.getItem('auth_user'),
    }),

    // The "Sign in with Google" button is cosmetic in the prototype: no browser
    // window, no OAuth — it resolves straight into the demo admin session.
    'auth:login': (_args, store) => ({ success: true, user: store.data.authUser }),

    'auth:logout': () => ({ success: true }),

    'auth:getAccessToken': () => ({ success: true, accessToken: 'demo-access-token' }),

    'window:maximize': () => undefined,

    // ---------------------------------------------------------------- admin
    // Raw envelope (src/services/api.ts does not unwrap).

    'admin:getUsers': ({ maxResults = 50, query = '', pageToken }: any, store) => {
        const q = String(query ?? '').trim().toLowerCase();
        let list = store.data.users;

        if (q.includes('issuspended=true')) {
            list = list.filter((u) => u.suspended);
        } else if (q.includes('issuspended=false')) {
            list = list.filter((u) => !u.suspended);
        } else if (q) {
            list = list.filter(
                (u) =>
                    u.name.fullName.toLowerCase().includes(q) ||
                    u.primaryEmail.toLowerCase().includes(q) ||
                    (u.orgUnitPath ?? '').toLowerCase().includes(q),
            );
        }

        const offset = pageToken ? Number(String(pageToken).replace('offset-', '')) || 0 : 0;
        const page = list.slice(offset, offset + maxResults);
        const nextOffset = offset + page.length;

        return {
            success: true,
            users: page,
            nextPageToken: nextOffset < list.length ? `offset-${nextOffset}` : undefined,
        };
    },

    'admin:getUser': (userKey: string, store) => ({ success: true, user: store.findUser(userKey) }),

    'admin:updateUser': ({ userKey, payload }: any, store) => {
        const user = store.findUser(userKey);
        if (!user) return { success: false, error: 'User not found' };

        if (payload.name) user.name = { ...user.name, ...payload.name };
        user.name.fullName = `${user.name.givenName} ${user.name.familyName}`;
        if (payload.primaryEmail) user.primaryEmail = payload.primaryEmail;
        if (payload.phones) user.phones = payload.phones;
        if (payload.orgUnitPath) user.orgUnitPath = payload.orgUnitPath;
        if (payload.organizations) user.organizations = payload.organizations;
        if (typeof payload.suspended === 'boolean') user.suspended = payload.suspended;

        return { success: true, user };
    },

    'admin:suspendUser': (userKey: string, store) => {
        const user = store.findUser(userKey);
        if (!user) return { success: false, error: 'User not found' };
        user.suspended = true;
        return { success: true, user };
    },

    'admin:deleteUser': (userKey: string, store) => {
        const user = store.findUser(userKey);
        if (user) {
            store.data.users = store.data.users.filter((u) => u.id !== user.id);
            delete store.data.userGroups[user.primaryEmail];
        }
        return { success: true };
    },

    'admin:createUser': (payload: any, store) => {
        const user: AdminUser = {
            id: `demo-${Date.now()}`,
            primaryEmail: payload.primaryEmail,
            name: {
                givenName: payload.name.givenName,
                familyName: payload.name.familyName,
                fullName: `${payload.name.givenName} ${payload.name.familyName}`,
            },
            suspended: false,
            isAdmin: false,
            creationTime: nowIso(),
            orgUnitPath: payload.orgUnitPath ?? '/',
            phones: payload.phones ?? [],
            organizations: payload.organizations ?? [],
            aliases: [],
        };
        store.data.users.unshift(user);
        store.data.userGroups[user.primaryEmail] = [];
        return { success: true, user };
    },

    'admin:getUserGroups': (userKey: string, store) => {
        const user = store.findUser(userKey);
        const emails = user ? store.data.userGroups[user.primaryEmail] ?? [] : [];
        return {
            success: true,
            groups: store.data.groups.filter((g) => emails.includes(g.email)),
        };
    },

    'admin:getAvailableGroups': (_args, store) => ({ success: true, groups: store.data.groups }),

    'admin:getOrgUnits': (_args, store) => ({ success: true, orgUnits: store.data.orgUnits }),

    'admin:getDomains': (_args, store) => ({ success: true, domains: store.data.domains }),

    'admin:addUserToGroup': ({ userKey, groupKey, role }: any, store) => {
        const user = store.findUser(userKey);
        const group = store.findGroup(groupKey);
        if (!user || !group) return { success: false, error: 'Not found' };

        const members = store.data.groupMembers[group.email] ?? [];
        if (!members.some((m) => m.email === user.primaryEmail)) {
            members.push({
                id: `demo-${Date.now()}`,
                email: user.primaryEmail,
                role: role ?? 'MEMBER',
                type: 'USER',
                status: 'ACTIVE',
                deliverySettings: 'ALL_MAIL',
            });
            store.data.groupMembers[group.email] = members;
        }
        const userGroups = store.data.userGroups[user.primaryEmail] ?? [];
        if (!userGroups.includes(group.email)) userGroups.push(group.email);
        store.data.userGroups[user.primaryEmail] = userGroups;

        return { success: true, member: members[members.length - 1] };
    },

    'admin:removeUserFromGroup': ({ userKey, groupKey }: any, store) => {
        const user = store.findUser(userKey);
        const group = store.findGroup(groupKey);
        if (!user || !group) return { success: false, error: 'Not found' };

        store.data.groupMembers[group.email] = (store.data.groupMembers[group.email] ?? []).filter(
            (m) => m.email !== user.primaryEmail,
        );
        store.data.userGroups[user.primaryEmail] = (store.data.userGroups[user.primaryEmail] ?? []).filter(
            (e) => e !== group.email,
        );
        return { success: true };
    },

    'admin:addAlias': ({ userKey, alias }: any, store) => {
        const user = store.findUser(userKey);
        if (!user) return { success: false, error: 'User not found' };
        user.aliases = [...(user.aliases ?? []), alias];
        return { success: true };
    },

    'admin:removeAlias': ({ userKey, alias }: any, store) => {
        const user = store.findUser(userKey);
        if (!user) return { success: false, error: 'User not found' };
        user.aliases = (user.aliases ?? []).filter((a) => a !== alias);
        return { success: true };
    },

    'admin:setEmailForwarding': () => ({ success: true }),

    'admin:getLoginActivities': (_args, store) => ({
        success: true,
        activities: store.data.loginActivities,
    }),

    // Legacy path — the bulk screens go through the job queue now.
    'admin:bulkAction': () => ({ success: true }),
    'admin:cancelBulkAction': () => ({ success: true }),

    // ------------------------------------------------------------ dashboard
    // Raw envelope + an `updatedAt` the widgets show as "last refreshed".

    'dashboard:getStorageUsage': (_args, store) => ({
        success: true,
        data: store.data.storage,
        updatedAt: Date.now(),
    }),

    'dashboard:getUserCounts': (_args, store) => {
        const total = store.data.users.length;
        const suspended = store.data.users.filter((u) => u.suspended).length;
        return {
            success: true,
            data: { totalUsers: total, activeUsers: total - suspended, suspendedUsers: suspended },
            updatedAt: Date.now(),
        };
    },

    'dashboard:getRecentUsers': (_args, store) => ({
        success: true,
        data: [...store.data.users]
            .sort((a, b) => (b.creationTime ?? '').localeCompare(a.creationTime ?? ''))
            .slice(0, 5)
            .map((u) => ({
                email: u.primaryEmail,
                fullName: u.name.fullName,
                createdAt: u.creationTime,
                createdBy: store.data.authUser.email,
            })),
        updatedAt: Date.now(),
    }),

    // ---------------------------------------------------------------- vault
    // server-api envelope.

    'vault:getState': (_args, store) => ok(store.vault),

    'vault:setup': (_args, store) => {
        store.vault = { ...store.vault, status: 'UNLOCKED' };
        store.emit('vault:unlocked');
        return ok(store.vault);
    },

    // Any password unlocks the prototype — there is no vault behind it.
    'vault:unlock': (_args, store) => {
        store.vault = { ...store.vault, status: 'UNLOCKED', lockedUntil: 0 };
        store.emit('vault:unlocked');
        return ok(store.vault);
    },

    'vault:lock': (_args, store) => {
        store.vault = { ...store.vault, status: 'LOCKED' };
        store.emit('vault:locked');
        return ok(store.vault);
    },

    'vault:reset': (_args, store) => {
        store.vault = { ...store.vault, status: 'NEEDS_VAULT_SETUP', corrupt: false };
        return ok(store.vault);
    },

    'vault:changePassword': () => ok(undefined),

    // --------------------------------------------------------------- config
    // server-api envelope, except config:getBootStatus (bare object).

    'config:getAll': (_args, store) => ok(store.data.config),

    'config:set': ({ key, value }: any, store) => {
        // Mirrors RENDERER_WRITABLE_KEYS in electron/services/app-config-service.ts.
        // Kept in sync by hand: the demo store has no main process to enforce it.
        const writable = [
            'companyName', 'sidebarAbbr', 'emailSenderName',
            'language', 'onboardingStep', 'allowedDomain', 'autoLockMinutes',
        ];
        if (!writable.includes(key)) {
            return { success: false, error: `Bu ayar bu kanaldan değiştirilemez: ${key}` };
        }
        const config = store.data.config as any;
        const normalized = typeof value === 'string' ? value.trim() : value;
        config[key] = normalized === '' ? null : normalized;
        // companyName and allowedDomain are non-nullable in the DTO.
        if (key === 'companyName' && config.companyName == null) config.companyName = '';
        if (key === 'allowedDomain' && config.allowedDomain == null) config.allowedDomain = '';
        if (key === 'emailSenderName' && config.emailSenderName == null) config.emailSenderName = '';
        return ok(store.data.config);
    },

    'config:getLogoDataUrl': (_args, store) => ok(store.data.config.logoPath ? store.data.logoDataUrl : null),

    'config:uploadLogo': ({ data, ext }: any, store) => {
        const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
        store.data.logoDataUrl = arrayBufferToDataUri(data, mime);
        store.data.config.logoPath = `demo://logo.${ext}`;
        return ok({ logoPath: store.data.config.logoPath, config: store.data.config });
    },

    'config:deleteLogo': (_args, store) => {
        store.data.config.logoPath = null;
        return ok(store.data.config);
    },

    'config:markOnboardingComplete': (_args, store) => {
        store.data.config.onboardingCompletedAt = nowIso();
        store.data.config.onboardingStep = null;
        return ok(store.data.config);
    },

    'config:acceptTerms': (version: any, store) => {
        store.data.config.termsAcceptedAt = nowIso();
        store.data.config.termsVersion = typeof version === 'string' ? version : CURRENT_TERMS_VERSION;
        return ok(store.data.config);
    },

    // In the real app this keeps the vault; in the prototype "restart the wizard"
    // means "show me a fresh install", so the vault is reset too — otherwise the
    // master-password step just reports "already created" and cannot be demoed.
    'config:resetOnboarding': (_args, store) => {
        store.data.config.onboardingCompletedAt = null;
        store.data.config.onboardingStep = 'welcome';
        store.vault = { ...store.vault, status: 'NEEDS_ONBOARDING' };
        // VaultContext only re-reads getState() when a vault event fires.
        store.emit('vault:unlocked');
        return ok(store.data.config);
    },

    // Nothing to wipe — a reload rebuilds the fixture from scratch anyway.
    'config:factoryReset': () => {
        window.setTimeout(() => window.location.reload(), 200);
        return ok(undefined);
    },

    'config:serviceAccountStatus': (_args, store) => ok(store.data.serviceAccount),

    // The uploaded JSON is not parsed — the fixture's identity is restored, which
    // is what the DWD step needs to show a Client ID.
    'config:uploadServiceAccount': (_args, store) => {
        store.data.serviceAccount = {
            configured: true,
            email: 'goworks-signature@demo-prototype.iam.gserviceaccount.com',
            clientId: '109876543210987654321',
        };
        return ok(store.data.serviceAccount);
    },

    'config:deleteServiceAccount': (_args, store) => {
        store.data.serviceAccount = { configured: false, email: null, clientId: null };
        return ok(undefined);
    },

    'config:getDwdScopes': (_args, store) => ok(store.data.dwdScopes),

    'config:testDwdScopes': ({ adminEmail }: any, store) =>
        ok({
            ok: true,
            adminEmail: adminEmail || store.data.authUser.email,
            failedScopes: [],
        }),

    'config:getOAuthCredentials': (_args, store) => ok(store.data.oauth),

    'config:setOAuthCredentials': ({ clientId }: any, store) => {
        store.data.oauth = { clientId, hasSecret: true };
        store.data.config.googleClientId = clientId;
        return ok(store.data.oauth);
    },

    'config:clearOAuthCredentials': (_args, store) => {
        store.data.oauth = { clientId: '', hasSecret: false };
        return ok(undefined);
    },

    'config:testOAuthCredentials': () => ok({ ok: true }),

    // Bare object — ConfigWarningBanner reads status.soft directly.
    'config:getBootStatus': () => ({
        soft: { serviceAccountMissing: false, oauthCredentialsMissing: false },
    }),

    // ----------------------------------------------------------------- app
    // Bare values.

    'app:getVersion': () => '0.7.7-demo',
    'app:setLocale': (lang: any, store) => {
        // The fixture is language-specific, so a language switch has to rebuild
        // it. Reloading is the cheapest way; install.ts reads the new language
        // back out of localStorage. The auth session is preserved across it.
        if (lang && lang !== store.data.profile.lang) {
            window.sessionStorage.setItem('goworks.demo.keepAuth', '1');
            window.setTimeout(() => window.location.reload(), 120);
        }
        return undefined;
    },
    'log:getLogsDir': () => '/demo/logs',

    // -------------------------------------------------------------- titles
    // server-api envelope.

    'titles:getAll': (_args, store) => ok(store.data.titles),

    'titles:create': ({ name }: any, store) => {
        const row = {
            id: Math.max(0, ...store.data.titles.map((t) => t.id)) + 1,
            name,
            createdBy: store.data.authUser.email,
            updatedBy: store.data.authUser.email,
            createdAt: nowIso(),
            updatedAt: nowIso(),
        };
        store.data.titles.push(row);
        return ok(row);
    },

    'titles:update': ({ id, name }: any, store) => {
        const row = store.data.titles.find((t) => t.id === id);
        if (row) {
            row.name = name;
            row.updatedAt = nowIso();
        }
        return ok(row);
    },

    'titles:delete': ({ id }: any, store) => {
        store.data.titles = store.data.titles.filter((t) => t.id !== id);
        return ok(undefined);
    },

    'titles:importCsv': ({ csv }: any, store) => {
        const names = String(csv ?? '')
            .split(/\r?\n/)
            .map((line) => line.split(',')[0]?.trim())
            .filter((n): n is string => !!n && n.toLowerCase() !== 'name' && n.toLowerCase() !== 'unvan');

        let created = 0;
        let skipped = 0;
        for (const name of names) {
            if (store.data.titles.some((t) => t.name === name)) {
                skipped++;
                continue;
            }
            store.data.titles.push({
                id: Math.max(0, ...store.data.titles.map((t) => t.id)) + 1,
                name,
                createdBy: store.data.authUser.email,
                updatedBy: store.data.authUser.email,
                createdAt: nowIso(),
                updatedAt: nowIso(),
            });
            created++;
        }
        return ok({ created, skipped });
    },

    // -------------------------------------------------------- institutions

    'institutions:getAll': (_args, store) => ok(store.data.institutions),

    'institutions:create': ({ name, address, phone }: any, store) => {
        const row = {
            id: Math.max(0, ...store.data.institutions.map((i) => i.id)) + 1,
            name,
            address: address ?? null,
            phone: phone ?? null,
            createdBy: store.data.authUser.email,
            updatedBy: store.data.authUser.email,
            createdAt: nowIso(),
            updatedAt: nowIso(),
        };
        store.data.institutions.push(row);
        return ok(row);
    },

    'institutions:update': ({ id, input }: any, store) => {
        const row = store.data.institutions.find((i) => i.id === id);
        if (row) {
            row.name = input.name;
            row.address = input.address ?? null;
            row.phone = input.phone ?? null;
            row.updatedAt = nowIso();
        }
        return ok(row);
    },

    'institutions:delete': ({ id }: any, store) => {
        store.data.institutions = store.data.institutions.filter((i) => i.id !== id);
        return ok(undefined);
    },

    'institutions:importCsv': ({ csv }: any, store) => {
        const rows = String(csv ?? '')
            .split(/\r?\n/)
            .map((line) => line.split(',').map((c) => c.trim()))
            .filter((cols) => cols[0] && !['kurum_adi', 'institution_name', 'name'].includes(cols[0].toLowerCase()));

        let created = 0;
        let skipped = 0;
        for (const [name, address, phone] of rows) {
            if (store.data.institutions.some((i) => i.name === name)) {
                skipped++;
                continue;
            }
            store.data.institutions.push({
                id: Math.max(0, ...store.data.institutions.map((i) => i.id)) + 1,
                name,
                address: address ?? null,
                phone: phone ?? null,
                createdBy: store.data.authUser.email,
                updatedBy: store.data.authUser.email,
                createdAt: nowIso(),
                updatedAt: nowIso(),
            });
            created++;
        }
        return ok({ created, skipped });
    },

    // ----------------------------------------------------------- templates

    'templates:getAll': (_args, store) => ok(store.data.templates),

    'templates:get': ({ id }: any, store) => {
        const template = store.data.templates.find((t) => t.id === id);
        if (!template) return { success: false, error: 'Template not found' };
        return ok({ ...template, media: store.data.media.filter((m) => m.templateId === id) });
    },

    'templates:create': ({ name, htmlContent }: any, store) => {
        const template = {
            id: Math.max(0, ...store.data.templates.map((t) => t.id)) + 1,
            name,
            htmlContent,
            isDefault: store.data.templates.length === 0,
            createdBy: store.data.authUser.email,
            updatedBy: store.data.authUser.email,
            createdAt: nowIso(),
            updatedAt: nowIso(),
        };
        store.data.templates.push(template);
        return ok(template);
    },

    'templates:update': ({ id, name, htmlContent }: any, store) => {
        const template = store.data.templates.find((t) => t.id === id);
        if (!template) return { success: false, error: 'Template not found' };
        template.name = name;
        template.htmlContent = htmlContent;
        template.updatedAt = nowIso();
        return ok(template);
    },

    'templates:delete': ({ id }: any, store) => {
        store.data.templates = store.data.templates.filter((t) => t.id !== id);
        store.data.media = store.data.media.filter((m) => m.templateId !== id);
        return ok(undefined);
    },

    'templates:preview': ({ id, variables }: any, store) => {
        const template = store.data.templates.find((t) => t.id === id);
        if (!template) return { success: false, error: 'Template not found' };
        // Media tokens spread LAST, mirroring the main process: template assets
        // win over caller-supplied variables.
        const vars = { ...(variables ?? {}), ...mediaVariables(store, id) };
        return ok({ html: renderTemplate(template.htmlContent, vars), tags: Object.keys(vars) });
    },

    'templates:setDefault': ({ id }: any, store) => {
        store.data.templates.forEach((t) => { t.isDefault = t.id === id; });
        return ok(store.data.templates.find((t) => t.id === id));
    },

    // --------------------------------------------------------------- media

    'media:getAll': ({ templateId }: any, store) =>
        ok(templateId ? store.data.media.filter((m) => m.templateId === templateId) : store.data.media),

    'media:create': ({ name, driveUrl, mimeType, templateId }: any, store) => {
        const row = {
            id: Math.max(0, ...store.data.media.map((m) => m.id)) + 1,
            name,
            driveFileId: `demo-${Date.now()}`,
            publicUrl: driveUrl,
            mimeType: mimeType ?? 'image/png',
            templateId,
            createdBy: store.data.authUser.email,
            token: `image_${store.data.media.filter((m) => m.templateId === templateId).length + 1}`,
            createdAt: nowIso(),
        };
        store.data.media.push(row);
        return ok(row);
    },

    // Uploads stay local: the bytes become a data: URI instead of going to Drive.
    'media:upload': ({ name, data, mimeType, templateId }: any, store) => {
        const row = {
            id: Math.max(0, ...store.data.media.map((m) => m.id)) + 1,
            name,
            driveFileId: `demo-${Date.now()}`,
            publicUrl: arrayBufferToDataUri(data, mimeType ?? 'image/png'),
            mimeType: mimeType ?? 'image/png',
            templateId,
            createdBy: store.data.authUser.email,
            token: `image_${store.data.media.filter((m) => m.templateId === templateId).length + 1}`,
            createdAt: nowIso(),
        };
        store.data.media.push(row);
        return ok(row);
    },

    'media:delete': ({ id }: any, store) => {
        store.data.media = store.data.media.filter((m) => m.id !== id);
        return ok(undefined);
    },

    // ---------------------------------------------------------- signatures

    'signatures:get': ({ email }: any, store) =>
        ok({ email, signature: store.data.signatures[email] ?? '' }),

    'signatures:push': ({ email, templateId, variables, html }: any, store) => {
        const template = store.data.templates.find((t) => t.id === templateId) ?? store.data.templates[0];
        const user = store.findUser(email);
        const vars = {
            ...(user ? variablesFor(user, store) : {}),
            ...(variables ?? {}),
            ...mediaVariables(store, template?.id ?? 1),
        };
        store.data.signatures[email] = html ?? renderTemplate(template?.htmlContent ?? '', vars);
        return ok({ email });
    },

    // --------------------------------------------------------------- bulk

    'bulk:analyze': ({ actionType, rows = [] }: any, store) => {
        const validRows: any[] = [];
        const invalidRows: any[] = [];
        const seenEmails = new Set<string>();

        // Mirrors CANONICAL_COLUMNS in src/utils/bulkColumns.ts.
        const required: Record<string, string[]> = {
            suspend: ['email'],
            delete: ['email'],
            signature_push: ['email', 'ad', 'soyad', 'unvan', 'kurum_adi', 'telefon'],
            add_to_group: ['grup_email', 'email'],
        };
        const fields = required[actionType] ?? ['email'];

        rows.forEach((raw: Record<string, string>, index: number) => {
            const rowNumber = index + 1;
            const errors: any[] = [];
            const value = (key: string) => (raw[key] ?? '').trim();

            for (const field of fields) {
                if (!value(field)) {
                    errors.push({
                        field,
                        errorType: 'MISSING_REQUIRED',
                        message: `"${field}" zorunlu`,
                    });
                }
            }

            const email = value('email');
            if (email) {
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    errors.push({ field: 'email', errorType: 'INVALID_FORMAT', message: 'Geçersiz e-posta formatı' });
                } else if (seenEmails.has(email.toLowerCase())) {
                    errors.push({ field: 'email', errorType: 'DUPLICATE_IN_CSV', message: 'CSV içinde tekrar eden e-posta' });
                } else if (!store.findUser(email)) {
                    errors.push({ field: 'email', errorType: 'NOT_FOUND', message: 'Kullanıcı dizinde bulunamadı' });
                }
                seenEmails.add(email.toLowerCase());
            }

            const institutionName = value('kurum_adi');
            const institution = store.data.institutions.find((i) => i.name === institutionName);
            if (institutionName && !institution) {
                errors.push({ field: 'kurum_adi', errorType: 'NOT_FOUND', message: 'Kurum tanımlı değil' });
            }

            if (actionType === 'add_to_group') {
                const groupEmail = value('grup_email');
                if (groupEmail && !store.findGroup(groupEmail)) {
                    errors.push({ field: 'grup_email', errorType: 'NOT_FOUND', message: 'Grup bulunamadı' });
                }
            }

            if (errors.length) {
                invalidRows.push({ rowNumber, rawData: raw, errors });
                return;
            }

            validRows.push({
                rowNumber,
                data: raw,
                resolvedData: institution
                    ? { institutionAddress: institution.address ?? '', institutionPhone: institution.phone ?? '' }
                    : undefined,
            });
        });

        return ok({
            summary: {
                totalRows: rows.length,
                validCount: validRows.length,
                invalidCount: invalidRows.length,
            },
            validRows,
            invalidRows,
        });
    },

    // Hands a real, pre-filled CSV to the browser: the sample rows are drawn from
    // the fixture, so the file can be dropped straight back onto the upload step.
    'bulk:downloadTemplate': ({ actionType, lang }: any, store) => {
        const canonical = BULK_COLUMNS[actionType] ?? ['email'];
        const headers = canonical.map((c) => (lang === 'en' ? BULK_COLUMNS_EN[c] ?? c : c));

        const sample = store.data.users.filter((u) => !u.suspended).slice(0, 10);
        const rows = sample.map((u) =>
            canonical.map((column) => {
                switch (column) {
                    case 'email': return u.primaryEmail;
                    case 'ad': return u.name.givenName;
                    case 'soyad': return u.name.familyName;
                    case 'unvan': return u.organizations?.[0]?.title ?? '';
                    case 'kurum_adi': return u.organizations?.[0]?.department ?? '';
                    case 'telefon': return u.phones?.[0]?.value ?? '';
                    case 'grup_email': return store.data.groups[0]?.email ?? '';
                    case 'rol': return 'MEMBER';
                    default: return '';
                }
            }),
        );

        return ok({ path: downloadFile(`goworks-${actionType}-template.csv`, toCsv(headers, rows)) });
    },

    // --------------------------------------------------------------- jobs

    'jobs:create': ({ type, payload }: any, store) => {
        const emails = emailsFromJobPayload(payload);
        const job = newJob(store, type, payload, emails);
        store.runJob(job, emails);
        return ok({ id: job.id });
    },

    'jobs:list': (params: any, store) => {
        const { status, type, limit, page, pageSize } = params ?? {};
        let list = [...store.data.jobs];

        if (status) {
            const wanted = String(status).split(',').map((s) => s.trim());
            list = list.filter((j) => wanted.includes(j.status));
        }
        if (type) list = list.filter((j) => j.type === type);

        // Two shapes on one channel: paginated when the caller asks for a page
        // (JobHistory), a plain array otherwise (Dashboard's active-jobs card).
        if (page !== undefined && pageSize !== undefined) {
            const start = (page - 1) * pageSize;
            return ok({
                jobs: list.slice(start, start + pageSize),
                total: list.length,
                page,
                pageSize,
            });
        }
        return ok(limit ? list.slice(0, limit) : list);
    },

    'jobs:get': ({ id }: any, store) => ok(store.data.jobs.find((j) => j.id === id)),

    'jobs:cancel': ({ id }: any, store) => {
        store.cancelJob(id);
        return ok(undefined);
    },

    'jobs:downloadReport': ({ id, format = 'csv' }: any, store) => {
        const job = store.data.jobs.find((j) => j.id === id);
        if (!job) return { success: false, error: 'Job not found' };

        if (format === 'json') {
            return ok({ path: downloadFile(`${job.id}-report.json`, JSON.stringify(job, null, 2), 'application/json') });
        }

        const report = job.executionReport;
        const rows: Array<Array<unknown>> = [
            ...(report?.succeededItems ?? []).map((i) => [i.rowNumber, i.email, 'SUCCESS', '', '']),
            ...(report?.failedItems ?? []).map((i) => [i.rowNumber, i.email, 'FAILED', i.step, i.error]),
        ];
        const csv = toCsv(['row', 'email', 'status', 'step', 'error'], rows);
        return ok({ path: downloadFile(`${job.id}-report.csv`, csv) });
    },

    // -------------------------------------------------------------- groups

    'groups:list': ({ query, pageToken, maxResults = 50 }: any, store) => {
        const q = String(query ?? '').trim().toLowerCase();
        let list = store.data.groups;
        if (q) {
            list = list.filter(
                (g) => g.name.toLowerCase().includes(q) || g.email.toLowerCase().includes(q),
            );
        }
        const offset = pageToken ? Number(String(pageToken).replace('offset-', '')) || 0 : 0;
        const page = list.slice(offset, offset + maxResults);
        const nextOffset = offset + page.length;
        return ok({
            groups: page,
            nextPageToken: nextOffset < list.length ? `offset-${nextOffset}` : undefined,
        });
    },

    'groups:get': ({ groupKey }: any, store) => ok(store.findGroup(groupKey)),

    'groups:create': ({ payload, members = [] }: any, store) => {
        const group = {
            id: `demo-${Date.now()}`,
            email: payload.email,
            name: payload.name,
            description: payload.description ?? '',
        };
        store.data.groups.push(group);
        store.data.groupMembers[group.email] = (members ?? []).map((m: any, i: number) => ({
            id: `demo-${Date.now()}-${i}`,
            email: m.email,
            role: m.role ?? 'MEMBER',
            type: 'USER',
            status: 'ACTIVE',
            deliverySettings: m.deliverySettings ?? 'ALL_MAIL',
        }));
        store.data.groupAliases[group.email] = [];
        store.data.groupSettings[group.email] = {
            whoCanJoin: 'ALL_IN_DOMAIN_CAN_JOIN',
            whoCanPostMessage: 'ALL_MEMBERS_CAN_POST',
            whoCanViewGroup: 'ALL_IN_DOMAIN_CAN_VIEW',
            whoCanViewMembership: 'ALL_MEMBERS_CAN_VIEW',
            whoCanContactOwner: 'ALL_IN_DOMAIN_CAN_CONTACT',
            allowExternalMembers: 'false',
            allowWebPosting: 'true',
            isArchived: 'true',
            archiveOnly: 'false',
            messageModerationLevel: 'MODERATE_NONE',
            primaryLanguage: 'en-US',
        };

        for (const m of members ?? []) {
            const list = store.data.userGroups[m.email] ?? [];
            list.push(group.email);
            store.data.userGroups[m.email] = list;
        }

        return ok({
            group,
            memberResult: { succeeded: (members ?? []).map((m: any) => m.email), failed: [] },
        });
    },

    'groups:update': ({ groupKey, payload }: any, store) => {
        const group = store.findGroup(groupKey);
        if (!group) return { success: false, error: 'Group not found' };
        if (payload.name) group.name = payload.name;
        if (payload.description !== undefined) group.description = payload.description;
        if (payload.email) group.email = payload.email;
        return ok(group);
    },

    'groups:delete': ({ groupKey }: any, store) => {
        const group = store.findGroup(groupKey);
        if (group) {
            store.data.groups = store.data.groups.filter((g) => g.id !== group.id);
            delete store.data.groupMembers[group.email];
        }
        return ok(undefined);
    },

    'groups:listMembers': ({ groupKey }: any, store) => {
        const group = store.findGroup(groupKey);
        return ok(group ? store.data.groupMembers[group.email] ?? [] : []);
    },

    'groups:addMembers': ({ groupKey, members }: any, store) => {
        const group = store.findGroup(groupKey);
        if (!group) return { success: false, error: 'Group not found' };
        const list = store.data.groupMembers[group.email] ?? [];
        const succeeded: string[] = [];

        for (const m of members ?? []) {
            if (list.some((existing) => existing.email === m.email)) continue;
            list.push({
                id: `demo-${Date.now()}-${succeeded.length}`,
                email: m.email,
                role: m.role ?? 'MEMBER',
                type: 'USER',
                status: 'ACTIVE',
                deliverySettings: m.deliverySettings ?? 'ALL_MAIL',
            });
            succeeded.push(m.email);
            const userGroups = store.data.userGroups[m.email] ?? [];
            userGroups.push(group.email);
            store.data.userGroups[m.email] = userGroups;
        }
        store.data.groupMembers[group.email] = list;
        return ok({ succeeded, failed: [] });
    },

    'groups:removeMembers': ({ groupKey, emails }: any, store) => {
        const group = store.findGroup(groupKey);
        if (!group) return { success: false, error: 'Group not found' };
        store.data.groupMembers[group.email] = (store.data.groupMembers[group.email] ?? []).filter(
            (m) => !emails.includes(m.email),
        );
        for (const email of emails ?? []) {
            store.data.userGroups[email] = (store.data.userGroups[email] ?? []).filter(
                (e) => e !== group.email,
            );
        }
        return ok({ succeeded: emails ?? [], failed: [] });
    },

    'groups:updateMemberRole': ({ groupKey, email, role }: any, store) => {
        const group = store.findGroup(groupKey);
        const member = group
            ? (store.data.groupMembers[group.email] ?? []).find((m: GroupMember) => m.email === email)
            : undefined;
        if (member) member.role = role;
        return ok(member);
    },

    'groups:updateMemberDeliverySettings': ({ groupKey, email, deliverySettings }: any, store) => {
        const group = store.findGroup(groupKey);
        const member = group
            ? (store.data.groupMembers[group.email] ?? []).find((m: GroupMember) => m.email === email)
            : undefined;
        if (member) member.deliverySettings = deliverySettings;
        return ok(member);
    },

    'groups:listAliases': ({ groupKey }: any, store) => {
        const group = store.findGroup(groupKey);
        return ok(group ? store.data.groupAliases[group.email] ?? [] : []);
    },

    'groups:addAlias': ({ groupKey, alias }: any, store) => {
        const group = store.findGroup(groupKey);
        if (!group) return { success: false, error: 'Group not found' };
        const entry = { alias, primaryEmail: group.email };
        store.data.groupAliases[group.email] = [...(store.data.groupAliases[group.email] ?? []), entry];
        return ok(entry);
    },

    'groups:removeAlias': ({ groupKey, alias }: any, store) => {
        const group = store.findGroup(groupKey);
        if (group) {
            store.data.groupAliases[group.email] = (store.data.groupAliases[group.email] ?? []).filter(
                (a) => a.alias !== alias,
            );
        }
        return ok(undefined);
    },

    'groups:getSettings': ({ groupKey }: any, store) => {
        const group = store.findGroup(groupKey);
        return ok(group ? store.data.groupSettings[group.email] ?? {} : {});
    },

    'groups:updateSettings': ({ groupKey, settings }: any, store) => {
        const group = store.findGroup(groupKey);
        if (!group) return { success: false, error: 'Group not found' };
        store.data.groupSettings[group.email] = {
            ...(store.data.groupSettings[group.email] ?? {}),
            ...(settings as GroupSettings),
        };
        return ok(store.data.groupSettings[group.email]);
    },

    // ------------------------------------------------------ signature audit

    'signatureAudit:startScan': ({ scope, templateId }: any, store) => {
        let targets = store.data.users.filter((u) => !u.suspended);
        if (scope?.type === 'group' && scope.value) {
            const members = store.data.groupMembers[scope.value] ?? [];
            const emails = new Set(members.map((m) => m.email));
            targets = targets.filter((u) => emails.has(u.primaryEmail));
        } else if (scope?.type === 'orgUnit' && scope.value) {
            targets = targets.filter((u) => u.orgUnitPath === scope.value);
        }

        const emails = targets.map((u) => u.primaryEmail);
        const job = newJob(store, 'SIGNATURE_AUDIT', { scope, templateId }, emails);
        store.runJob(job, emails);

        // Results are generated up front so getItems() can answer as soon as
        // the 'jobs:done' event lands.
        const reasons = store.data.profile.auditReasons;
        const items = targets.map((u, i) => {
            const bucket = i % 5;
            const category =
                bucket === 0 || bucket === 1 || bucket === 2
                    ? 'ok'
                    : bucket === 3
                        ? 'drift'
                        : i % 10 === 4
                            ? 'no_signature'
                            : i % 15 === 9
                                ? 'missing_data'
                                : 'error';
            return {
                id: i + 1,
                jobId: job.id,
                email: u.primaryEmail,
                category: category as any,
                reason:
                    category === 'drift'
                        ? reasons.drift
                        : category === 'no_signature'
                            ? reasons.noSignature
                            : category === 'missing_data'
                                ? reasons.missingData
                                : null,
                currentVariables: variablesFor(u, store),
                previousVariables: null,
                error: category === 'error' ? reasons.error : null,
                createdAt: nowIso(),
            };
        });
        store.auditItems.set(job.id, items);

        return ok({ jobId: job.id });
    },

    'signatureAudit:getItems': ({ jobId }: any, store) => ok(store.auditItems.get(jobId) ?? []),

    'signatureAudit:apply': ({ emails, templateId }: any, store) => {
        const job = newJob(store, 'BULK_SIGNATURE_PUSH', { emails, templateId }, emails ?? []);
        store.runJob(job, emails ?? []);
        return ok({ jobId: job.id });
    },
};
