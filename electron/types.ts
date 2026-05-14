
export interface AdminUser {
    id: string;
    primaryEmail: string;
    name: {
        fullName: string;
        givenName: string;
        familyName: string;
    };
    suspended: boolean;
    isAdmin: boolean;
    lastLoginTime?: string;
    creationTime?: string;
    orgUnitPath?: string;
    phones?: Array<{ value: string; type: string }>;
    organizations?: Array<{ title?: string; primary?: boolean; customType?: string; department?: string }>;
    locations?: Array<{ type: string; buildingId?: string; area?: string }>;
    addresses?: Array<{ type: string; formatted?: string; country?: string }>;
    aliases?: string[];
}

export interface PaginatedUsers {
    users: AdminUser[];
    nextPageToken?: string;
}

export interface AdminGroup {
    id: string;
    email: string;
    name: string;
    description?: string;
}

export interface GroupMember {
    id: string;
    email: string;
    role: string;
    type: string;
    status: string;
}

export interface UserUpdatePayload {
    name?: {
        givenName?: string;
        familyName?: string;
    };
    primaryEmail?: string;
    phones?: Array<{ value: string; type: string }>;
    orgUnitPath?: string;
    organizations?: Array<{ title?: string; primary?: boolean; customType?: string; department?: string }>;
    addresses?: Array<{ type: string; formatted?: string }>;
    includeInGlobalAddressList?: boolean;
}

export interface OrgUnit {
    orgUnitId: string;
    name: string;
    orgUnitPath: string;
    parentOrgUnitPath: string;
    description?: string;
}

export interface Domain {
    domainName: string;
    isPrimary: boolean;
    verified: boolean;
}

export interface CreateUserPayload {
    primaryEmail: string;
    name: { givenName: string; familyName: string };
    password: string;
    changePasswordAtNextLogin?: boolean;
    orgUnitPath?: string;
    phones?: Array<{ value: string; type: string }>;
    organizations?: Array<{ title?: string; department?: string; primary?: boolean }>;
    addresses?: Array<{ type: string; formatted?: string }>;
}

export type GroupRole = 'OWNER' | 'MANAGER' | 'MEMBER';

export interface CreateGroupPayload {
    email: string;
    name: string;
    description?: string;
}

export interface UpdateGroupPayload {
    name?: string;
    description?: string;
    email?: string;
}

export interface GroupAlias {
    alias: string;
    primaryEmail?: string;
}

export interface GroupSettings {
    whoCanJoin?: 'ANYONE_CAN_JOIN' | 'ALL_IN_DOMAIN_CAN_JOIN' | 'INVITED_CAN_JOIN' | 'CAN_REQUEST_TO_JOIN';
    whoCanPostMessage?: 'NONE_CAN_POST' | 'ALL_MANAGERS_CAN_POST' | 'ALL_MEMBERS_CAN_POST' | 'ALL_OWNERS_CAN_POST' | 'ALL_IN_DOMAIN_CAN_POST' | 'ANYONE_CAN_POST';
    whoCanViewGroup?: 'ANYONE_CAN_VIEW' | 'ALL_IN_DOMAIN_CAN_VIEW' | 'ALL_MEMBERS_CAN_VIEW' | 'ALL_MANAGERS_CAN_VIEW' | 'ALL_OWNERS_CAN_VIEW';
    whoCanViewMembership?: 'ALL_IN_DOMAIN_CAN_VIEW' | 'ALL_MEMBERS_CAN_VIEW' | 'ALL_MANAGERS_CAN_VIEW' | 'ALL_OWNERS_CAN_VIEW';
    whoCanContactOwner?: 'ALL_IN_DOMAIN_CAN_CONTACT' | 'ALL_MEMBERS_CAN_CONTACT' | 'ALL_MANAGERS_CAN_CONTACT' | 'ANYONE_CAN_CONTACT';
    allowExternalMembers?: 'true' | 'false';
    allowWebPosting?: 'true' | 'false';
    isArchived?: 'true' | 'false';
    archiveOnly?: 'true' | 'false';
    messageModerationLevel?: 'MODERATE_ALL_MESSAGES' | 'MODERATE_NON_MEMBERS' | 'MODERATE_NEW_MEMBERS' | 'MODERATE_NONE';
    primaryLanguage?: string;
}

export interface MemberInput {
    email: string;
    role: GroupRole;
}

export interface MemberBatchResult {
    succeeded: string[];
    failed: Array<{ email: string; error: string }>;
}

export type BulkActionType = 'suspend' | 'delete' | 'signature_push';

export interface BulkActionPayload {
    action: BulkActionType;
    users: string[]; // email veya kimlik
}

export interface BulkProgressEvent {
    total: number;
    current: number;
    success: number;
    failed: number;
    currentUser: string;
    errors: Array<{ user: string; error: string }>;
    status: 'running' | 'completed' | 'cancelled';
}

export interface StorageUsageData {
    usedStorageMb: number;
    totalStorageMb: number;
}

export interface UserCountData {
    totalUsers: number;
    activeUsers: number;
    suspendedUsers: number;
}

