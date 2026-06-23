// All operations go through Electron IPC — there is no server anymore.
async function ipcInvoke<T = any>(channel: string, args?: unknown): Promise<T> {
  const ipc = (window as any).ipcRenderer;
  if (!ipc?.invoke) {
    throw new Error('Electron IPC bridge bulunamadı');
  }
  const result = await ipc.invoke(channel, args);
  if (result && typeof result === 'object' && 'success' in result) {
    if (!result.success) throw new Error(result.error || `IPC ${channel} hatası`);
    return result.data as T;
  }
  return result as T;
}

// Service Account / config (local JSON key instead of a server)
export interface ServiceAccountStatus {
  configured: boolean;
  email: string | null;
  clientId: string | null;
}

export const serverApi = {
  getServiceAccountStatus: () =>
    ipcInvoke<ServiceAccountStatus>('config:serviceAccountStatus'),

  uploadServiceAccount: (content: string) =>
    ipcInvoke<ServiceAccountStatus>('config:uploadServiceAccount', { content }),

  deleteServiceAccount: () => ipcInvoke('config:deleteServiceAccount'),
};

// App Config (company name, abbreviation, logo, email sender, allowed domain, UI language)
export type AppLanguage = 'tr' | 'en';

export type OnboardingStep =
  | 'welcome'
  | 'terms'
  | 'branding'
  | 'cloud'
  | 'master-password'
  | 'service-account'
  | 'dwd'
  | 'admin-login';

// --- Vault (master-password) ---
export type VaultStatus = 'NEEDS_ONBOARDING' | 'NEEDS_VAULT_SETUP' | 'LOCKED' | 'UNLOCKED';

export interface VaultState {
  status: VaultStatus;
  hardLockPending: boolean;
  googleReauthNeeded: boolean;
  pendingJobs: number;
  corrupt: boolean;
  /** Epoch ms until which unlock is blocked after too many wrong passwords (0 = not locked out). */
  lockedUntil: number;
}

export const vaultApi = {
  getState: () => ipcInvoke<VaultState>('vault:getState'),
  /** Create a new vault (onboarding / legacy upgrade / post-reset). */
  setup: (password: string) => ipcInvoke<VaultState>('vault:setup', { password }),
  unlock: (password: string) => ipcInvoke<VaultState>('vault:unlock', { password }),
  lock: () => ipcInvoke<VaultState>('vault:lock'),
  reset: () => ipcInvoke<VaultState>('vault:reset'),
  /** Re-key the vault to a new master password (Settings → Security). */
  changePassword: (current: string, next: string) =>
    ipcInvoke<void>('vault:changePassword', { current, next }),
};

export interface AppConfigDTO {
  companyName: string;
  sidebarAbbr: string | null;
  logoPath: string | null;
  emailSenderName: string;
  allowedDomain: string;
  language: AppLanguage;
  onboardingStep: OnboardingStep | null;
  onboardingCompletedAt: string | null;
  googleClientId: string;
  termsAcceptedAt: string | null;
  termsVersion: string | null;
  /** Idle auto-lock timeout in minutes as a string ('0' = disabled). */
  autoLockMinutes: string;
}

export interface DwdTestResult {
  ok: boolean;
  adminEmail: string;
  failedScopes: string[];
  errorMessage?: string;
}

export interface OAuthCredentialsStatus {
  clientId: string;
  hasSecret: boolean;
}

export const appConfigApi = {
  getAll: () => ipcInvoke<AppConfigDTO>('config:getAll'),
  set: (key: keyof AppConfigDTO, value: string | null) =>
    ipcInvoke<AppConfigDTO>('config:set', { key, value }),
  uploadLogo: (data: ArrayBuffer | Uint8Array, ext: string) =>
    ipcInvoke<{ logoPath: string; config: AppConfigDTO }>('config:uploadLogo', { data, ext }),
  deleteLogo: () => ipcInvoke<AppConfigDTO>('config:deleteLogo'),
  getLogoDataUrl: () => ipcInvoke<string | null>('config:getLogoDataUrl'),
  markOnboardingComplete: () =>
    ipcInvoke<AppConfigDTO>('config:markOnboardingComplete'),
  acceptTerms: (version: string) =>
    ipcInvoke<AppConfigDTO>('config:acceptTerms', version),
  resetOnboarding: () => ipcInvoke<AppConfigDTO>('config:resetOnboarding'),
  /** Factory reset: permanently wipes all local data and returns to a fresh install. */
  factoryReset: () => ipcInvoke<void>('config:factoryReset'),
  getDwdScopes: () => ipcInvoke<string[]>('config:getDwdScopes'),
  testDwdScopes: (adminEmail?: string) =>
    ipcInvoke<DwdTestResult>('config:testDwdScopes', { adminEmail }),

  // Google OAuth credentials (Phase 31)
  getOAuthCredentials: () =>
    ipcInvoke<OAuthCredentialsStatus>('config:getOAuthCredentials'),
  /**
   * If clientSecret is passed empty, the existing secret is kept (for Settings rotation).
   * Both are required during onboarding — the UI pre-validates this.
   */
  setOAuthCredentials: (clientId: string, clientSecret: string) =>
    ipcInvoke<OAuthCredentialsStatus>('config:setOAuthCredentials', { clientId, clientSecret }),
  clearOAuthCredentials: () => ipcInvoke('config:clearOAuthCredentials'),
  testOAuthCredentials: (clientId: string, clientSecret: string) =>
    ipcInvoke<{ ok: boolean }>('config:testOAuthCredentials', { clientId, clientSecret }),
};

// Titles CRUD — Electron IPC (local SQLite)
export const titlesApi = {
  getAll: () => ipcInvoke<any[]>('titles:getAll'),
  create: (name: string) => ipcInvoke('titles:create', { name }),
  update: (id: number, name: string) => ipcInvoke('titles:update', { id, name }),
  delete: (id: number) => ipcInvoke('titles:delete', { id }),
  importCsv: (csv: string) => ipcInvoke('titles:importCsv', { csv }),
};

// Institutions CRUD — Electron IPC (local SQLite)
export const institutionsApi = {
  getAll: () => ipcInvoke<any[]>('institutions:getAll'),
  create: (data: { name: string; address?: string; phone?: string }) =>
    ipcInvoke('institutions:create', data),
  update: (id: number, data: { name: string; address?: string; phone?: string }) =>
    ipcInvoke('institutions:update', { id, input: data }),
  delete: (id: number) => ipcInvoke('institutions:delete', { id }),
  importCsv: (csv: string) => ipcInvoke('institutions:importCsv', { csv }),
};

// Templates CRUD — Electron IPC (local SQLite + sanitize)
export const templatesApi = {
  getAll: () => ipcInvoke<any[]>('templates:getAll'),
  get: (id: number) => ipcInvoke('templates:get', { id }),
  create: (data: { name: string; htmlContent: string }) => ipcInvoke('templates:create', data),
  update: (id: number, data: { name: string; htmlContent: string }) =>
    ipcInvoke('templates:update', { id, ...data }),
  delete: (id: number) => ipcInvoke('templates:delete', { id }),
  preview: (id: number, variables: Record<string, string>) =>
    ipcInvoke('templates:preview', { id, variables }),
  setDefault: (id: number) => ipcInvoke('templates:setDefault', { id }),
};

// Media — Electron IPC (local SQLite + Drive upload/URL parsing)
export const mediaApi = {
  getAll: (templateId?: number) => ipcInvoke<any[]>('media:getAll', { templateId }),
  create: (data: { name: string; driveUrl: string; mimeType?: string; templateId: number }) =>
    ipcInvoke('media:create', data),
  upload: (data: { name: string; data: ArrayBuffer; mimeType: string; templateId: number }) =>
    ipcInvoke('media:upload', data),
  delete: (id: number) => ipcInvoke('media:delete', { id }),
};

// Signatures — Electron IPC (Service Account + DWD)
export const signaturesApi = {
  get: (email: string) => ipcInvoke<{ email: string; signature: string }>('signatures:get', { email }),
  push: (email: string, data: { templateId?: number; variables?: Record<string, string>; html?: string }) =>
    ipcInvoke('signatures:push', { email, ...data }),
};

// Bulk operations — Electron IPC
export const bulkApi = {
  analyze: (data: { actionType: string; rows: Record<string, string>[]; lang?: 'tr' | 'en' }) =>
    ipcInvoke('bulk:analyze', data),

  // Opens a file picker for the user to save the CSV template; does not return a URL.
  downloadTemplate: (actionType: string, lang?: 'tr' | 'en') =>
    ipcInvoke<{ canceled?: boolean; path?: string }>('bulk:downloadTemplate', { actionType, lang }),

  // Same approach for the job report: opens a file picker for the user.
  downloadReport: (jobId: string, format: 'csv' | 'json' = 'csv') =>
    ipcInvoke<{ canceled?: boolean; path?: string }>('jobs:downloadReport', { id: jobId, format }),
};

// Jobs
export interface ServerJob {
  id: string;
  type: 'BULK_SIGNATURE_PUSH' | 'BULK_SUSPEND' | 'BULK_DELETE' | 'SIGNATURE_AUDIT';
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  payload: any;
  result: {
    errors: Array<{ email: string; error: string }>;
    succeededEmails?: string[];
  } | null;
  executionReport?: {
    totalProcessed: number;
    successCount: number;
    failedCount: number;
    succeededItems: Array<{ email: string; rowNumber: number }>;
    failedItems: Array<{ email: string; rowNumber: number; step: string; error: string }>;
    executedAt: string;
  } | null;
  progress: number;
  total: number;
  succeeded: number;
  failed: number;
  createdBy: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
}

export interface PaginatedJobs {
  jobs: ServerJob[];
  total: number;
  page: number;
  pageSize: number;
}

// Jobs — Electron IPC (local SQLite-backed queue; 'jobs:progress' IPC event instead of SSE)
export const jobsApi = {
  create: (data: { type: string; payload: any }) => ipcInvoke<{ id: string }>('jobs:create', data),
  list: (params?: { status?: string; type?: string; createdBy?: string; limit?: number; page?: number; pageSize?: number }) =>
    ipcInvoke('jobs:list', params || {}),
  get: (id: string) => ipcInvoke<ServerJob>('jobs:get', { id }),
  cancel: (id: string) => ipcInvoke('jobs:cancel', { id }),
  // An IPC event listener is used instead of SSE:
  //   window.ipcRenderer.on('jobs:progress', (_, payload) => ...)
  //   window.ipcRenderer.on('jobs:done',     (_, { jobId, status }) => ...)
};

// Google Groups — CRUD via Directory + Groups Settings API
import type {
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
} from '../types/admin';

export const groupsApi = {
  list: (params?: { query?: string; pageToken?: string; maxResults?: number }) =>
    ipcInvoke<{ groups: AdminGroup[]; nextPageToken?: string }>('groups:list', params || {}),

  get: (groupKey: string) => ipcInvoke<AdminGroup>('groups:get', { groupKey }),

  create: (payload: CreateGroupPayload, members?: MemberInput[]) =>
    ipcInvoke<{ group: AdminGroup; memberResult?: MemberBatchResult }>('groups:create', { payload, members }),

  update: (groupKey: string, payload: UpdateGroupPayload) =>
    ipcInvoke<AdminGroup>('groups:update', { groupKey, payload }),

  delete: (groupKey: string) => ipcInvoke('groups:delete', { groupKey }),

  listMembers: (groupKey: string) =>
    ipcInvoke<GroupMember[]>('groups:listMembers', { groupKey }),

  addMembers: (groupKey: string, members: MemberInput[]) =>
    ipcInvoke<MemberBatchResult>('groups:addMembers', { groupKey, members }),

  removeMembers: (groupKey: string, emails: string[]) =>
    ipcInvoke<MemberBatchResult>('groups:removeMembers', { groupKey, emails }),

  updateMemberRole: (groupKey: string, email: string, role: GroupRole) =>
    ipcInvoke<GroupMember>('groups:updateMemberRole', { groupKey, email, role }),

  updateMemberDeliverySettings: (groupKey: string, email: string, deliverySettings: DeliverySetting) =>
    ipcInvoke<GroupMember>('groups:updateMemberDeliverySettings', { groupKey, email, deliverySettings }),

  listAliases: (groupKey: string) =>
    ipcInvoke<GroupAlias[]>('groups:listAliases', { groupKey }),

  addAlias: (groupKey: string, alias: string) =>
    ipcInvoke<GroupAlias>('groups:addAlias', { groupKey, alias }),

  removeAlias: (groupKey: string, alias: string) =>
    ipcInvoke('groups:removeAlias', { groupKey, alias }),

  getSettings: (groupKey: string) =>
    ipcInvoke<GroupSettings>('groups:getSettings', { groupKey }),

  updateSettings: (groupKey: string, settings: GroupSettings) =>
    ipcInvoke<GroupSettings>('groups:updateSettings', { groupKey, settings }),
};

// Signature Audit — Electron IPC (SIGNATURE_AUDIT scan job + BULK_SIGNATURE_PUSH apply)
export type AuditCategory = 'ok' | 'drift' | 'no_signature' | 'missing_data' | 'error';
export type AuditDepth = 'fast' | 'deep';

export interface AuditScope {
  type: 'all' | 'group' | 'orgUnit';
  value?: string;
}

export interface SignatureAuditItem {
  id: number;
  jobId: string;
  email: string;
  category: AuditCategory;
  reason: string | null;
  currentVariables: Record<string, string> | null;
  previousVariables: Record<string, string> | null;
  error: string | null;
  createdAt: string;
}

export const signatureAuditApi = {
  /** Enqueues the scan job; progress is tracked via 'jobs:progress' / 'jobs:done' IPC events. */
  startScan: (data: { scope: AuditScope; templateId: number; depth: AuditDepth }) =>
    ipcInvoke<{ jobId: string }>('signatureAudit:startScan', data),

  /** Fetches the per-person results of a scan job. */
  getItems: (jobId: string) =>
    ipcInvoke<SignatureAuditItem[]>('signatureAudit:getItems', { jobId }),

  /** Applies the signature to the selected people (uses the existing BULK_SIGNATURE_PUSH worker). */
  apply: (data: { emails: string[]; templateId: number }) =>
    ipcInvoke<{ jobId: string }>('signatureAudit:apply', data),
};
