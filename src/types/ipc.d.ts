import type {
    AdminUser,
    AdminGroup,
    UserUpdatePayload,
    BulkActionPayload,
    CreateUserPayload,
    OrgUnit,
    Domain,
    GroupRole,
    StorageUsageData,
    UserCountData,
} from './admin';

export interface GetUsersParams {
    maxResults?: number;
    query?: string;
    pageToken?: string;
}

export interface IPCChannelMap {
    'admin:getUsers': {
        params: GetUsersParams;
        result: { users: AdminUser[]; nextPageToken?: string };
    };
    'admin:getUser': {
        params: string;
        result: { user: AdminUser };
    };
    'admin:suspendUser': {
        params: string;
        result: void;
    };
    'admin:deleteUser': {
        params: string;
        result: void;
    };
    'admin:updateUser': {
        params: { userKey: string; payload: UserUpdatePayload };
        result: void;
    };
    'admin:getUserGroups': {
        params: string;
        result: { groups: AdminGroup[] };
    };
    'admin:getAvailableGroups': {
        params: string;
        result: { groups: AdminGroup[] };
    };
    'admin:createUser': {
        params: CreateUserPayload;
        result: { user: AdminUser };
    };
    'admin:getOrgUnits': {
        params: string;
        result: { orgUnits: OrgUnit[] };
    };
    'admin:getDomains': {
        params: string;
        result: { domains: Domain[] };
    };
    'admin:addUserToGroup': {
        params: { userKey: string; groupKey: string; role?: GroupRole };
        result: void;
    };
    'admin:removeUserFromGroup': {
        params: { userKey: string; groupKey: string };
        result: void;
    };
    'admin:getLoginActivities': {
        params: { maxResults?: number };
        result: { activities: unknown[] };
    };
    'admin:bulkAction': {
        params: BulkActionPayload;
        result: void;
    };
    'admin:cancelBulkAction': {
        params: void;
        result: void;
    };
    'dashboard:getStorageUsage': {
        params: void;
        result: { data: StorageUsageData };
    };
    'dashboard:getUserCounts': {
        params: void;
        result: { data: UserCountData };
    };
    'dashboard:getRecentUsers': {
        params: void;
        result: { data: Array<{ email: string; fullName: string; createdAt: string; createdBy: string }> };
    };
}

export interface TypedIpcRenderer {
    invoke<K extends keyof IPCChannelMap>(
        channel: K,
        ...args: IPCChannelMap[K]['params'] extends void
            ? []
            : [IPCChannelMap[K]['params']]
    ): Promise<{ success: boolean; error?: string } & Partial<IPCChannelMap[K]['result']>>;
    on(channel: string, listener: (...args: unknown[]) => void): void;
    off(channel: string, listener: (...args: unknown[]) => void): void;
}
