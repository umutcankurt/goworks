import { getGoogle } from '../google-lazy';
import { OAuth2Client } from 'google-auth-library';
import { AdminUser, PaginatedUsers, AdminGroup, GroupMember, UserUpdatePayload, CreateUserPayload, OrgUnit, Domain, GroupRole, StorageUsageData, UserCountData } from '../types';
import { UserFacingError } from '../lib/errors';

export class AdminService {
    private authClient: OAuth2Client;
    private directory;
    private reports;

    constructor(authClient: OAuth2Client) {
        this.authClient = authClient;
        const google = getGoogle();
        this.directory = google.admin({ version: 'directory_v1', auth: this.authClient });
        this.reports = google.admin({ version: 'reports_v1', auth: this.authClient });
    }


    async getUsers(customer = 'my_customer', maxResults = 10, pageToken?: string, query?: string): Promise<PaginatedUsers> {
        try {
            const res = await this.directory.users.list({
                customer,
                maxResults,
                pageToken,
                query,
                orderBy: 'email',
                projection: 'full',
            });

            const users = (res.data.users || []).map(this.mapToAdminUser);

            return {
                users,
                nextPageToken: res.data.nextPageToken || undefined,
            };
        } catch (error) {
            console.error('Error fetching users:', error);
            throw error;
        }
    }

    async getUser(userKey: string): Promise<AdminUser | null> {
        try {
            const res = await this.directory.users.get({
                userKey,
                projection: 'full',
            });

            return this.mapToAdminUser(res.data);
        } catch (error) {
            console.error(`Error fetching user ${userKey}:`, error);
            return null;
        }
    }

    async suspendUser(userKey: string): Promise<AdminUser> {
        try {
            const existing = await this.directory.users.get({ userKey, fields: 'suspended' });
            if (existing.data.suspended) {
                throw new UserFacingError('Kullanıcı zaten askıda');
            }

            const res = await this.directory.users.update({
                userKey,
                requestBody: {
                    suspended: true,
                },
            });

            return this.mapToAdminUser(res.data);
        } catch (error) {
            console.error(`Error suspending user ${userKey}:`, error);
            throw error;
        }
    }

    async deleteUser(userKey: string): Promise<void> {
        try {
            await this.directory.users.delete({
                userKey,
            });
        } catch (error) {
            console.error(`Error deleting user ${userKey}:`, error);
            throw error;
        }
    }

    async updateUser(userKey: string, payload: UserUpdatePayload): Promise<AdminUser> {
        try {
            const res = await this.directory.users.update({
                userKey,
                requestBody: payload as any,
            });
            return this.mapToAdminUser(res.data);
        } catch (error) {
            console.error(`Error updating user ${userKey}:`, error);
            throw error;
        }
    }

    async getUserGroups(userKey: string): Promise<AdminGroup[]> {
        try {
            const res = await this.directory.groups.list({
                userKey,
            });
            return (res.data.groups || []).map(this.mapToAdminGroup);
        } catch (error) {
            console.error(`Error fetching groups for user ${userKey}:`, error);
            throw error;
        }
    }

    async getAvailableGroups(customer = 'my_customer'): Promise<AdminGroup[]> {
        try {
            const allGroups: AdminGroup[] = [];
            let pageToken: string | undefined;
            do {
                const res = await this.directory.groups.list({
                    customer,
                    maxResults: 200,
                    pageToken,
                });
                const groups = (res.data.groups || []).map(this.mapToAdminGroup);
                allGroups.push(...groups);
                pageToken = res.data.nextPageToken || undefined;
            } while (pageToken);
            return allGroups;
        } catch (error) {
            console.error('Error fetching available groups:', error);
            throw error;
        }
    }

    async createUser(payload: CreateUserPayload): Promise<AdminUser> {
        try {
            const res = await this.directory.users.insert({
                requestBody: payload as any,
            });
            return this.mapToAdminUser(res.data);
        } catch (error) {
            console.error('Error creating user:', error);
            throw error;
        }
    }

    async getOrgUnits(customer = 'my_customer'): Promise<OrgUnit[]> {
        try {
            const res = await this.directory.orgunits.list({
                customerId: customer,
                type: 'all',
            });
            return (res.data.organizationUnits || []).map((ou: any) => ({
                orgUnitId: ou.orgUnitId || '',
                name: ou.name || '',
                orgUnitPath: ou.orgUnitPath || '',
                parentOrgUnitPath: ou.parentOrgUnitPath || '',
                description: ou.description || '',
            }));
        } catch (error) {
            console.error('Error fetching org units:', error);
            throw error;
        }
    }

    async getDomains(customer = 'my_customer'): Promise<Domain[]> {
        try {
            const res = await this.directory.domains.list({ customer });
            return (res.data.domains || []).map((d: any) => ({
                domainName: d.domainName || '',
                isPrimary: d.isPrimary || false,
                verified: d.verified || false,
            }));
        } catch (error) {
            console.error('Error fetching domains:', error);
            throw error;
        }
    }

    async addUserToGroup(userKey: string, groupKey: string, role: GroupRole = 'MEMBER'): Promise<GroupMember> {
        try {
            const res = await this.directory.members.insert({
                groupKey,
                requestBody: { email: userKey, role },
            });
            return res.data as GroupMember;
        } catch (error) {
            console.error(`Error adding user ${userKey} to group ${groupKey}:`, error);
            throw error;
        }
    }

    async removeUserFromGroup(userKey: string, groupKey: string): Promise<void> {
        try {
            await this.directory.members.delete({
                groupKey,
                memberKey: userKey,
            });
        } catch (error) {
            console.error(`Error removing user ${userKey} from group ${groupKey}:`, error);
            throw error;
        }
    }

    async getLoginActivities(userKey: string = 'all', maxResults: number = 50) {
        try {
            const res = await this.reports.activities.list({
                userKey,
                applicationName: 'login',
                maxResults,
            });
            return res.data.items || [];
        } catch (error) {
            console.error(`Error fetching login activities for ${userKey}:`, error);
            throw error;
        }
    }

    private getReportDate(daysBack: number): string {
        const d = new Date();
        d.setDate(d.getDate() - daysBack);
        return d.toISOString().split('T')[0];
    }

    async getCustomerStorageUsage(daysBack = 2): Promise<StorageUsageData> {
        if (daysBack > 6) throw new UserFacingError('Son 6 güne ait depolama raporu bulunamadı.');
        const date = this.getReportDate(daysBack);
        try {
            const res = await this.reports.customerUsageReports.get({
                date,
                parameters: 'accounts:used_quota_in_mb,accounts:total_quota_in_mb',
            });
            if (!res.data.usageReports || res.data.usageReports.length === 0) {
                return this.getCustomerStorageUsage(daysBack + 1);
            }
            let usedStorageMb = 0, totalStorageMb = 0;
            for (const report of res.data.usageReports) {
                for (const param of (report as any).parameters || []) {
                    if (param.name === 'accounts:used_quota_in_mb')
                        usedStorageMb = parseInt(param.intValue || '0', 10);
                    if (param.name === 'accounts:total_quota_in_mb')
                        totalStorageMb = parseInt(param.intValue || '0', 10);
                }
            }
            return { usedStorageMb, totalStorageMb };
        } catch (error: any) {
            if (error.code === 404 || error.code === 400) return this.getCustomerStorageUsage(daysBack + 1);
            throw error;
        }
    }

    async getCustomerUserCounts(daysBack = 2): Promise<UserCountData> {
        if (daysBack > 6) throw new UserFacingError('Son 6 güne ait kullanıcı raporu bulunamadı.');
        const date = this.getReportDate(daysBack);
        try {
            const res = await this.reports.customerUsageReports.get({
                date,
                parameters: 'accounts:num_users,accounts:num_suspended_users',
            });
            if (!res.data.usageReports || res.data.usageReports.length === 0) {
                return this.getCustomerUserCounts(daysBack + 1);
            }
            let totalUsers = 0, suspendedUsers = 0;
            for (const report of res.data.usageReports) {
                for (const param of (report as any).parameters || []) {
                    if (param.name === 'accounts:num_users')
                        totalUsers = parseInt(param.intValue || '0', 10);
                    if (param.name === 'accounts:num_suspended_users')
                        suspendedUsers = parseInt(param.intValue || '0', 10);
                }
            }
            return { totalUsers, activeUsers: totalUsers - suspendedUsers, suspendedUsers };
        } catch (error: any) {
            if (error.code === 404 || error.code === 400) return this.getCustomerUserCounts(daysBack + 1);
            throw error;
        }
    }

    async getRecentlyCreatedUsers(count = 5): Promise<{ email: string; fullName: string; createdAt: string; createdBy: string }[]> {
        try {
            const res = await this.reports.activities.list({
                userKey: 'all',
                applicationName: 'admin',
                eventName: 'CREATE_USER',
                maxResults: count,
            });

            const items = res.data.items || [];
            return items.map((item: any) => {
                const events = item.events || [];
                const createEvent = events.find((e: any) => e.name === 'CREATE_USER') || events[0] || {};
                const params = createEvent.parameters || [];
                const emailParam = params.find((p: any) => p.name === 'USER_EMAIL');

                return {
                    email: emailParam?.value || '',
                    fullName: emailParam?.value?.split('@')[0]?.replace(/\./g, ' ') || '',
                    createdAt: item.id?.time || '',
                    createdBy: item.actor?.email || '',
                };
            }).filter((u: any) => u.email);
        } catch (error: any) {
            console.error('Error fetching recently created users:', error);
            throw error;
        }
    }

    private mapToAdminUser(user: any): AdminUser {
        return {
            id: user.id || '',
            primaryEmail: user.primaryEmail || '',
            name: {
                fullName: user.name?.fullName || [user.name?.givenName, user.name?.familyName].filter(Boolean).join(' '),
                givenName: user.name?.givenName || '',
                familyName: user.name?.familyName || '',
            },
            suspended: user.suspended || false,
            isAdmin: user.isAdmin || false,
            lastLoginTime: user.lastLoginTime,
            creationTime: user.creationTime,
            orgUnitPath: user.orgUnitPath,
            phones: user.phones || [],
            organizations: user.organizations || [],
            locations: user.locations || [],
            addresses: user.addresses || [],
            aliases: user.aliases || [],
        };
    }

    async addAlias(userKey: string, alias: string): Promise<void> {
        await this.directory.users.aliases.insert({
            userKey,
            requestBody: { alias },
        });
    }

    async removeAlias(userKey: string, alias: string): Promise<void> {
        await this.directory.users.aliases.delete({
            userKey,
            alias,
        });
    }

    async setEmailForwarding(userEmail: string, forwardingEmail: string): Promise<void> {
        try {
            const google = getGoogle();
            const gmail = google.gmail({ version: 'v1', auth: this.authClient });

            // 1. Add the forwarding address
            await gmail.users.settings.forwardingAddresses.create({
                userId: userEmail,
                requestBody: { forwardingEmail },
            });

            // 2. Enable forwarding (no verification needed — with admin privileges)
            await gmail.users.settings.updateAutoForwarding({
                userId: userEmail,
                requestBody: {
                    enabled: true,
                    emailAddress: forwardingEmail,
                    disposition: 'leaveInInbox',
                },
            });
        } catch (error) {
            console.error(`Error setting email forwarding for ${userEmail}:`, error);
            throw error;
        }
    }

    private mapToAdminGroup(group: any): AdminGroup {
        return {
            id: group.id || '',
            email: group.email || '',
            name: group.name || '',
            description: group.description || '',
        };
    }
}
