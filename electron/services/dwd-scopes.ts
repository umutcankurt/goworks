/**
 * GoWorks'in Service Account üzerinden talep ettiği OAuth scope'ları.
 * Bu liste hem DWD test akışının kullandığı scope kombinasyonu hem de
 * UI'da kullanıcıya "Admin Console → Domain-wide delegation"'a yapıştırması
 * için sunulan scope listesinin tek kaynağıdır.
 */
// Yalnızca Service Account'ın gerçekten kullandığı scope'lar.
// Groups/Reports/audit gibi özellikler OAuth (admin login) üzerinden çalışır, SA'ya gerek yok.
export const DWD_SCOPES: readonly string[] = [
    'https://www.googleapis.com/auth/admin.directory.user',          // google-admin-sa.ts
    'https://www.googleapis.com/auth/admin.directory.group.readonly', // google-admin-sa.ts
    'https://www.googleapis.com/auth/admin.directory.orgunit.readonly', // google-admin-sa.ts
    'https://www.googleapis.com/auth/gmail.settings.basic',           // gmail-signature-service.ts
    'https://www.googleapis.com/auth/gmail.send',                     // email-notification-service.ts
] as const;

/** Admin Console DWD ekranına virgüllü tek satır olarak yapıştırılan format. */
export const DWD_SCOPES_CSV = DWD_SCOPES.join(',');
