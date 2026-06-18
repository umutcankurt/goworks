import { ipcRenderer, contextBridge } from 'electron'

// Security: the renderer may only talk to IPC channels on these allowlists.
// If a malicious script ran in the renderer (e.g. via XSS), an unrestricted
// bridge would let it reach any main-process handler. The lists below mirror the
// channels actually registered in the main process — keep them in sync when you
// add a handler:
//   invokeChannels  → every ipcMain.handle(...) channel
//   sendChannels    → every ipcMain.on(...) channel the renderer sends to
//   receiveChannels → every webContents.send(...) channel the renderer listens to
const invokeChannels = [
  'admin:addAlias',
  'admin:addUserToGroup',
  'admin:bulkAction',
  'admin:cancelBulkAction',
  'admin:createUser',
  'admin:deleteUser',
  'admin:getAvailableGroups',
  'admin:getDomains',
  'admin:getLoginActivities',
  'admin:getOrgUnits',
  'admin:getUser',
  'admin:getUserGroups',
  'admin:getUsers',
  'admin:removeAlias',
  'admin:removeUserFromGroup',
  'admin:setEmailForwarding',
  'admin:suspendUser',
  'admin:updateUser',
  'app:getVersion',
  'app:setLocale',
  'auth:check',
  'auth:getAccessToken',
  'auth:login',
  'auth:logout',
  'bulk:analyze',
  'bulk:downloadTemplate',
  'config:acceptTerms',
  'config:clearOAuthCredentials',
  'config:deleteLogo',
  'config:deleteServiceAccount',
  'config:factoryReset',
  'config:getAll',
  'config:getBootStatus',
  'config:getDwdScopes',
  'config:getLogoDataUrl',
  'config:getOAuthCredentials',
  'config:markOnboardingComplete',
  'config:resetOnboarding',
  'config:serviceAccountStatus',
  'config:set',
  'config:setOAuthCredentials',
  'config:testDwdScopes',
  'config:testOAuthCredentials',
  'config:uploadLogo',
  'config:uploadServiceAccount',
  'dashboard:getRecentUsers',
  'dashboard:getStorageUsage',
  'dashboard:getUserCounts',
  'groups:addAlias',
  'groups:addMembers',
  'groups:create',
  'groups:delete',
  'groups:get',
  'groups:getSettings',
  'groups:list',
  'groups:listAliases',
  'groups:listMembers',
  'groups:removeAlias',
  'groups:removeMembers',
  'groups:update',
  'groups:updateMemberDeliverySettings',
  'groups:updateMemberRole',
  'groups:updateSettings',
  'institutions:create',
  'institutions:delete',
  'institutions:getAll',
  'institutions:importCsv',
  'institutions:update',
  'jobs:cancel',
  'jobs:create',
  'jobs:downloadReport',
  'jobs:get',
  'jobs:list',
  'log:getLogsDir',
  'media:create',
  'media:delete',
  'media:getAll',
  'media:upload',
  'signatureAudit:apply',
  'signatureAudit:getItems',
  'signatureAudit:startScan',
  'signatures:get',
  'signatures:push',
  'templates:create',
  'templates:delete',
  'templates:get',
  'templates:getAll',
  'templates:preview',
  'templates:setDefault',
  'templates:update',
  'titles:create',
  'titles:delete',
  'titles:getAll',
  'titles:importCsv',
  'titles:update',
  'window:maximize',
]

const sendChannels = [
  'log:write',
]

const receiveChannels = [
  'admin:bulkProgress',
  'auth:logout-event',
  'jobs:done',
  'jobs:progress',
  'main-process-message',
]

// --------- Expose a channel-restricted IPC bridge to the renderer ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    if (receiveChannels.includes(channel)) {
      return ipcRenderer.on(channel, listener)
    }
    console.warn(`[preload] Blocked ipcRenderer.on for unauthorized channel: ${channel}`)
    return undefined
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    if (receiveChannels.includes(channel)) {
      return ipcRenderer.off(channel, ...omit)
    }
    return undefined
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    if (sendChannels.includes(channel)) {
      return ipcRenderer.send(channel, ...omit)
    }
    console.warn(`[preload] Blocked ipcRenderer.send for unauthorized channel: ${channel}`)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    if (invokeChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...omit)
    }
    console.warn(`[preload] Blocked ipcRenderer.invoke for unauthorized channel: ${channel}`)
    return Promise.reject(new Error(`Unauthorized IPC invoke channel: ${channel}`))
  },
})
