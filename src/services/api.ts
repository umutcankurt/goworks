import type { GetUsersParams } from '../types/ipc';
import type { UserUpdatePayload, BulkActionPayload, CreateUserPayload, GroupRole } from '../types/admin';

const ipc = window.ipcRenderer;

function trackActivity<T>(result: T): T {
    window.dispatchEvent(new Event('session-activity'));
    return result;
}

export const adminApi = {
    // Users
    getUsers: (params: GetUsersParams) =>
        ipc.invoke('admin:getUsers', params).then(trackActivity),

    getUser: (userKey: string) =>
        ipc.invoke('admin:getUser', userKey).then(trackActivity),

    updateUser: (userKey: string, payload: UserUpdatePayload) =>
        ipc.invoke('admin:updateUser', { userKey, payload }).then(trackActivity),

    suspendUser: (userKey: string) =>
        ipc.invoke('admin:suspendUser', userKey).then(trackActivity),

    deleteUser: (userKey: string) =>
        ipc.invoke('admin:deleteUser', userKey).then(trackActivity),

    setEmailForwarding: (userEmail: string, forwardingEmail: string) =>
        ipc.invoke('admin:setEmailForwarding', { userEmail, forwardingEmail }).then(trackActivity),

    // Groups
    getUserGroups: (userKey: string) =>
        ipc.invoke('admin:getUserGroups', userKey).then(trackActivity),

    getAvailableGroups: () =>
        ipc.invoke('admin:getAvailableGroups', 'my_customer').then(trackActivity),

    createUser: (payload: CreateUserPayload) =>
        ipc.invoke('admin:createUser', payload).then(trackActivity),

    getOrgUnits: () =>
        ipc.invoke('admin:getOrgUnits', 'my_customer').then(trackActivity),

    getDomains: () =>
        ipc.invoke('admin:getDomains', 'my_customer').then(trackActivity),

    addUserToGroup: (userKey: string, groupKey: string, role?: GroupRole) =>
        ipc.invoke('admin:addUserToGroup', { userKey, groupKey, role }).then(trackActivity),

    removeUserFromGroup: (userKey: string, groupKey: string) =>
        ipc.invoke('admin:removeUserFromGroup', { userKey, groupKey }).then(trackActivity),

    // Aliases
    addAlias: (userKey: string, alias: string) =>
        ipc.invoke('admin:addAlias', { userKey, alias }).then(trackActivity),

    removeAlias: (userKey: string, alias: string) =>
        ipc.invoke('admin:removeAlias', { userKey, alias }).then(trackActivity),

    // Bulk
    bulkAction: (payload: BulkActionPayload) =>
        ipc.invoke('admin:bulkAction', payload).then(trackActivity),

    cancelBulkAction: () =>
        ipc.invoke('admin:cancelBulkAction').then(trackActivity),

    // Reports
    getLoginActivities: (maxResults = 20) =>
        ipc.invoke('admin:getLoginActivities', { maxResults }).then(trackActivity),
};

export const dashboardApi = {
    getStorageUsage: () => ipc.invoke('dashboard:getStorageUsage').then(trackActivity),
    getUserCounts: () => ipc.invoke('dashboard:getUserCounts').then(trackActivity),
    getRecentUsers: () => ipc.invoke('dashboard:getRecentUsers').then(trackActivity),
};

export const authApi = {
    getAccessToken: () => ipc.invoke('auth:getAccessToken'),
};

export const ipcEvents = {
    on: (channel: string, listener: (...args: unknown[]) => void) =>
        ipc.on(channel, listener),
    off: (channel: string, listener: (...args: unknown[]) => void) =>
        ipc.off(channel, listener),
};
