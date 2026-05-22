
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
    locations?: Array<{ type: string; area?: string; buildingId?: string; customType?: string }>;
    addresses?: Array<{ type: string; formatted?: string; country?: string }>;
    aliases?: string[];
}

export interface CsvUser {
    email: string;
    action?: 'SUSPEND' | 'DELETE' | 'RESTORE';
    [key: string]: string | undefined; // Allow other columns
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

export type DeliverySetting = 'ALL_MAIL' | 'DAILY' | 'DIGEST' | 'NONE';

export interface GroupMember {
    id: string;
    email: string;
    role: string;
    type: string;
    status: string;
    deliverySettings: DeliverySetting;
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

export interface SelectedGroup {
    group: AdminGroup;
    role: GroupRole;
}

export interface SelectedMember {
    email: string;
    displayName?: string;
    role: GroupRole;
    deliverySettings: DeliverySetting;
}

export interface MemberInput {
    email: string;
    role: GroupRole;
    deliverySettings?: DeliverySetting;
}

export interface MemberBatchResult {
    succeeded: string[];
    failed: Array<{ email: string; error: string }>;
}

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

export type BulkActionType = 'suspend' | 'delete' | 'signature_push';

export interface BulkActionPayload {
    action: BulkActionType;
    users: string[];
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

// Bulk Analyze DTOs
export interface BulkAnalyzeRequestDto {
    actionType: 'suspend' | 'delete' | 'signature_push';
    rows: Record<string, string>[];
}

export interface BulkAnalyzeResponseDto {
    summary: {
        totalRows: number;
        validCount: number;
        invalidCount: number;
    };
    validRows: ValidatedRow[];
    invalidRows: InvalidRowDetail[];
}

export interface ValidatedRow {
    rowNumber: number;
    data: Record<string, string>;
    resolvedData?: {
        institutionAddress?: string;
        institutionPhone?: string;
    };
}

export interface InvalidRowDetail {
    rowNumber: number;
    rawData: Record<string, string>;
    errors: FieldError[];
}

export interface FieldError {
    field: string;
    errorType: 'MISSING_REQUIRED' | 'INVALID_FORMAT' | 'NOT_FOUND' | 'DUPLICATE_IN_CSV';
    message: string;
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

