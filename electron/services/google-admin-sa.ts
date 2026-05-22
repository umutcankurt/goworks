import { GoogleAuth } from 'google-auth-library';
import https from 'node:https';
import { getGoogle } from '../google-lazy';
import { getServiceAccountCredentials } from '../secrets/service-account-loader';

// keepAlive: false — her request yeni TCP bağlantısı kurar.
// Bulk işlemlerde keep-alive havuzunda zombie socket birikip job'ı kilitliyordu.
const customHttpsAgent = new https.Agent({
    keepAlive: false,
    maxSockets: 10,
    timeout: 30_000,
});

let googleOptionsApplied = false;
function ensureGoogleOptions() {
    if (googleOptionsApplied) return;
    const google = getGoogle();
    (google.options as any)({
        agent: customHttpsAgent,
        timeout: 30_000,
        retry: false,
    });
    googleOptionsApplied = true;
}

const authClients = new Map<string, GoogleAuth>();

const ADMIN_SCOPES = [
    'https://www.googleapis.com/auth/admin.directory.user',
    'https://www.googleapis.com/auth/admin.directory.group.readonly',
    'https://www.googleapis.com/auth/admin.directory.orgunit.readonly',
];

function buildAuth(adminEmail: string, scopes: string[]): GoogleAuth {
    const credentials = getServiceAccountCredentials();
    if (!credentials) {
        throw new Error('Service Account yapılandırılmamış. Ayarlar → Service Account sekmesinden JSON yükleyin.');
    }
    return new GoogleAuth({
        credentials,
        scopes,
        clientOptions: { subject: adminEmail },
    });
}

function getAuth(adminEmail: string): GoogleAuth {
    const existing = authClients.get(adminEmail);
    if (existing) return existing;
    const client = buildAuth(adminEmail, ADMIN_SCOPES);
    authClients.set(adminEmail, client);
    return client;
}

export function clearAuthCache(): void {
    authClients.clear();
}

const API_TIMEOUT_MS = 30_000;

export async function withTimeout<T>(
    apiCallFunction: (signal: AbortSignal) => Promise<T>,
    ms: number,
    context: string,
): Promise<T> {
    const controller = new AbortController();
    let timeoutId: NodeJS.Timeout | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
            controller.abort();
            reject(Object.assign(new Error(`ETIMEDOUT: ${context} exceeded ${ms}ms`), { code: 'ETIMEDOUT' }));
        }, ms);
    });

    try {
        return await Promise.race([apiCallFunction(controller.signal), timeoutPromise]);
    } catch (error: any) {
        if (controller.signal.aborted || error?.name === 'AbortError') {
            throw Object.assign(new Error(`ETIMEDOUT: ${context} exceeded ${ms}ms`), { code: 'ETIMEDOUT' });
        }
        throw error;
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
}

export async function getUserInfo(email: string, adminEmail: string): Promise<any> {
    ensureGoogleOptions();
    const auth = getAuth(adminEmail);
    const admin = getGoogle().admin({ version: 'directory_v1', auth });
    const res = await admin.users.get({
        userKey: email,
        fields: 'primaryEmail,name,organizations,phones,addresses,suspended',
    });
    return res.data;
}

export async function suspendUser(email: string, adminEmail: string): Promise<void> {
    ensureGoogleOptions();
    const auth = getAuth(adminEmail);
    const admin = getGoogle().admin({ version: 'directory_v1', auth });
    const { data: user } = await withTimeout(
        async (signal) => admin.users.get({ userKey: email, fields: 'suspended' }, { signal }),
        API_TIMEOUT_MS,
        `suspendUser.get(${email})`,
    );
    if (user.suspended) throw new Error('Kullanıcı zaten askıda');
    await withTimeout(
        async (signal) => admin.users.update({ userKey: email, requestBody: { suspended: true } }, { signal }),
        API_TIMEOUT_MS,
        `suspendUser.update(${email})`,
    );
}

export async function deleteUser(email: string, adminEmail: string): Promise<void> {
    ensureGoogleOptions();
    const auth = getAuth(adminEmail);
    const admin = getGoogle().admin({ version: 'directory_v1', auth });
    await withTimeout(
        async (signal) => admin.users.delete({ userKey: email }, { signal }),
        API_TIMEOUT_MS,
        `deleteUser(${email})`,
    );
}

export async function updateUser(
    email: string,
    updateData: Record<string, any>,
    adminEmail: string,
): Promise<any> {
    ensureGoogleOptions();
    const auth = getAuth(adminEmail);
    const admin = getGoogle().admin({ version: 'directory_v1', auth });
    const res = await withTimeout(
        async (signal) => admin.users.update({ userKey: email, requestBody: updateData }, { signal }),
        API_TIMEOUT_MS,
        `updateUser(${email})`,
    );
    return res.data;
}

/**
 * Tüm kullanıcıları (veya `query` ile filtrelenmiş alt kümeyi) sayfalı olarak listeler.
 * `projection: 'full'` → name/organizations/phones/orgUnitPath profili dolu döner.
 * İmza Denetimi tarama worker'ı kullanır. `query` örn. `"orgUnitPath='/Öğretmenler'"`.
 */
export async function listUsers(adminEmail: string, query?: string): Promise<any[]> {
    ensureGoogleOptions();
    const auth = getAuth(adminEmail);
    const admin = getGoogle().admin({ version: 'directory_v1', auth });
    const all: any[] = [];
    let pageToken: string | undefined;
    do {
        const res = await withTimeout(
            async (signal) => admin.users.list({
                customer: 'my_customer',
                maxResults: 500,
                pageToken,
                projection: 'full',
                orderBy: 'email',
                query,
            }, { signal }),
            API_TIMEOUT_MS,
            'listUsers',
        );
        all.push(...(res.data.users || []));
        pageToken = res.data.nextPageToken || undefined;
    } while (pageToken);
    return all;
}

/**
 * Bir grubun üyelerini sayfalı olarak listeler ({ email, role, type, status }).
 * Tam profil için her e-posta `getUserInfo` ile ayrıca çekilmelidir.
 */
export async function listGroupMembers(adminEmail: string, groupKey: string): Promise<any[]> {
    ensureGoogleOptions();
    const auth = getAuth(adminEmail);
    const admin = getGoogle().admin({ version: 'directory_v1', auth });
    const all: any[] = [];
    let pageToken: string | undefined;
    do {
        const res = await withTimeout(
            async (signal) => admin.members.list({ groupKey, maxResults: 200, pageToken }, { signal }),
            API_TIMEOUT_MS,
            `listGroupMembers(${groupKey})`,
        );
        all.push(...(res.data.members || []));
        pageToken = res.data.nextPageToken || undefined;
    } while (pageToken);
    return all;
}
