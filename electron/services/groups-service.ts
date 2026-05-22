import { OAuth2Client } from 'google-auth-library';
import { getGoogle } from '../google-lazy';
import {
    AdminGroup,
    GroupMember,
    GroupRole,
    DeliverySetting,
    CreateGroupPayload,
    UpdateGroupPayload,
    GroupAlias,
    GroupSettings,
    MemberInput,
    MemberBatchResult,
} from '../types';
import { adminLimiter } from './rate-limiters';
import { withRetry } from './retry';
import { getLogger } from './logger';

function directory(auth: OAuth2Client) {
    return getGoogle().admin({ version: 'directory_v1', auth });
}

function settings(auth: OAuth2Client) {
    return getGoogle().groupssettings({ version: 'v1', auth });
}

function mapGroup(g: any): AdminGroup {
    return {
        id: g.id || '',
        email: g.email || '',
        name: g.name || '',
        description: g.description || '',
    };
}

function mapMember(m: any): GroupMember {
    const raw = m.delivery_settings || m.deliverySettings;
    const delivery: DeliverySetting =
        raw === 'DAILY' || raw === 'DIGEST' || raw === 'NONE' || raw === 'ALL_MAIL'
            ? raw
            : 'ALL_MAIL';
    return {
        id: m.id || '',
        email: m.email || '',
        role: m.role || 'MEMBER',
        type: m.type || 'USER',
        status: m.status || '',
        deliverySettings: delivery,
    };
}

function mapAlias(a: any): GroupAlias {
    return {
        alias: a.alias || a.email || '',
        primaryEmail: a.primaryEmail,
    };
}

export async function listGroups(
    auth: OAuth2Client,
    params: { query?: string; pageToken?: string; maxResults?: number } = {},
): Promise<{ groups: AdminGroup[]; nextPageToken?: string }> {
    const dir = directory(auth);
    const res = await adminLimiter.schedule(() =>
        withRetry(
            () => dir.groups.list({
                customer: 'my_customer',
                maxResults: params.maxResults ?? 50,
                pageToken: params.pageToken,
                query: params.query,
            }),
            getLogger(),
            'groups.list',
        ),
    );
    return {
        groups: (res.data.groups || []).map(mapGroup),
        nextPageToken: res.data.nextPageToken || undefined,
    };
}

export async function getGroup(auth: OAuth2Client, groupKey: string): Promise<AdminGroup> {
    const dir = directory(auth);
    const res = await adminLimiter.schedule(() =>
        withRetry(() => dir.groups.get({ groupKey }), getLogger(), `groups.get(${groupKey})`),
    );
    return mapGroup(res.data);
}

export async function createGroup(
    auth: OAuth2Client,
    payload: CreateGroupPayload,
): Promise<AdminGroup> {
    const dir = directory(auth);
    const res = await adminLimiter.schedule(() =>
        withRetry(
            () => dir.groups.insert({
                requestBody: {
                    email: payload.email,
                    name: payload.name,
                    description: payload.description,
                },
            }),
            getLogger(),
            `groups.insert(${payload.email})`,
        ),
    );
    return mapGroup(res.data);
}

export async function updateGroup(
    auth: OAuth2Client,
    groupKey: string,
    payload: UpdateGroupPayload,
): Promise<AdminGroup> {
    const dir = directory(auth);
    const res = await adminLimiter.schedule(() =>
        withRetry(
            () => dir.groups.patch({ groupKey, requestBody: payload as any }),
            getLogger(),
            `groups.patch(${groupKey})`,
        ),
    );
    return mapGroup(res.data);
}

export async function deleteGroup(auth: OAuth2Client, groupKey: string): Promise<void> {
    const dir = directory(auth);
    await adminLimiter.schedule(() =>
        withRetry(() => dir.groups.delete({ groupKey }), getLogger(), `groups.delete(${groupKey})`),
    );
}

export async function listMembers(auth: OAuth2Client, groupKey: string): Promise<GroupMember[]> {
    const dir = directory(auth);
    const all: GroupMember[] = [];
    let pageToken: string | undefined;
    do {
        const res = await adminLimiter.schedule(() =>
            withRetry(
                () => dir.members.list({ groupKey, maxResults: 200, pageToken }),
                getLogger(),
                `members.list(${groupKey})`,
            ),
        );
        const items = (res.data.members || []).map(mapMember);
        all.push(...items);
        pageToken = res.data.nextPageToken || undefined;
    } while (pageToken);
    return all;
}

export async function addMembers(
    auth: OAuth2Client,
    groupKey: string,
    members: MemberInput[],
): Promise<MemberBatchResult> {
    const dir = directory(auth);
    const result: MemberBatchResult = { succeeded: [], failed: [] };
    for (const m of members) {
        try {
            await adminLimiter.schedule(() =>
                withRetry(
                    () => dir.members.insert({
                        groupKey,
                        requestBody: {
                            email: m.email,
                            role: m.role,
                            ...(m.deliverySettings ? { delivery_settings: m.deliverySettings } : {}),
                        },
                    }),
                    getLogger(),
                    `members.insert(${groupKey},${m.email})`,
                ),
            );
            result.succeeded.push(m.email);
        } catch (err: any) {
            result.failed.push({ email: m.email, error: err?.message || 'Bilinmeyen hata' });
        }
    }
    return result;
}

export async function removeMembers(
    auth: OAuth2Client,
    groupKey: string,
    emails: string[],
): Promise<MemberBatchResult> {
    const dir = directory(auth);
    const result: MemberBatchResult = { succeeded: [], failed: [] };
    for (const email of emails) {
        try {
            await adminLimiter.schedule(() =>
                withRetry(
                    () => dir.members.delete({ groupKey, memberKey: email }),
                    getLogger(),
                    `members.delete(${groupKey},${email})`,
                ),
            );
            result.succeeded.push(email);
        } catch (err: any) {
            result.failed.push({ email, error: err?.message || 'Bilinmeyen hata' });
        }
    }
    return result;
}

export async function updateMemberRole(
    auth: OAuth2Client,
    groupKey: string,
    email: string,
    role: GroupRole,
): Promise<GroupMember> {
    const dir = directory(auth);
    const res = await adminLimiter.schedule(() =>
        withRetry(
            () => dir.members.patch({
                groupKey,
                memberKey: email,
                requestBody: { role },
            }),
            getLogger(),
            `members.patch(${groupKey},${email})`,
        ),
    );
    return mapMember(res.data);
}

export async function updateMemberDeliverySettings(
    auth: OAuth2Client,
    groupKey: string,
    email: string,
    deliverySettings: DeliverySetting,
): Promise<GroupMember> {
    const dir = directory(auth);
    const res = await adminLimiter.schedule(() =>
        withRetry(
            () => dir.members.patch({
                groupKey,
                memberKey: email,
                requestBody: { delivery_settings: deliverySettings },
            }),
            getLogger(),
            `members.patch.delivery(${groupKey},${email})`,
        ),
    );
    return mapMember(res.data);
}

export async function listAliases(auth: OAuth2Client, groupKey: string): Promise<GroupAlias[]> {
    const dir = directory(auth);
    const res = await adminLimiter.schedule(() =>
        withRetry(
            () => dir.groups.aliases.list({ groupKey }),
            getLogger(),
            `aliases.list(${groupKey})`,
        ),
    );
    return ((res.data as any).aliases || []).map(mapAlias);
}

export async function addAlias(
    auth: OAuth2Client,
    groupKey: string,
    alias: string,
): Promise<GroupAlias> {
    const dir = directory(auth);
    const res = await adminLimiter.schedule(() =>
        withRetry(
            () => dir.groups.aliases.insert({ groupKey, requestBody: { alias } }),
            getLogger(),
            `aliases.insert(${groupKey},${alias})`,
        ),
    );
    return mapAlias(res.data);
}

export async function removeAlias(
    auth: OAuth2Client,
    groupKey: string,
    alias: string,
): Promise<void> {
    const dir = directory(auth);
    await adminLimiter.schedule(() =>
        withRetry(
            () => dir.groups.aliases.delete({ groupKey, alias }),
            getLogger(),
            `aliases.delete(${groupKey},${alias})`,
        ),
    );
}

export async function getSettings(auth: OAuth2Client, groupKey: string): Promise<GroupSettings> {
    const svc = settings(auth);
    const res = await adminLimiter.schedule(() =>
        withRetry(
            () => svc.groups.get({ groupUniqueId: groupKey, alt: 'json' as any }),
            getLogger(),
            `settings.get(${groupKey})`,
        ),
    );
    return res.data as GroupSettings;
}

export async function updateSettings(
    auth: OAuth2Client,
    groupKey: string,
    payload: GroupSettings,
): Promise<GroupSettings> {
    const svc = settings(auth);
    const res = await adminLimiter.schedule(() =>
        withRetry(
            () => svc.groups.patch({ groupUniqueId: groupKey, requestBody: payload as any }),
            getLogger(),
            `settings.patch(${groupKey})`,
        ),
    );
    return res.data as GroupSettings;
}
