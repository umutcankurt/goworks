export interface RequiredGoogleApi {
    name: string;
    serviceId: string;
}

// The Admin SDK API (admin.googleapis.com) covers both the Directory and Reports APIs;
// there is no separate "Reports API" entry to enable in the Cloud Console.
export const REQUIRED_GOOGLE_APIS: readonly RequiredGoogleApi[] = [
    { name: 'Admin SDK API', serviceId: 'admin.googleapis.com' },
    { name: 'Gmail API', serviceId: 'gmail.googleapis.com' },
    { name: 'Groups Settings API', serviceId: 'groupssettings.googleapis.com' },
    // Required for signature media: uploading images to Drive (drive.file scope).
    { name: 'Google Drive API', serviceId: 'drive.googleapis.com' },
] as const;

export function cloudLibraryUrl(serviceId: string): string {
    return `https://console.cloud.google.com/apis/library/${serviceId}`;
}
