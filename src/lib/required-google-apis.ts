export interface RequiredGoogleApi {
    name: string;
    serviceId: string;
}

export const REQUIRED_GOOGLE_APIS: readonly RequiredGoogleApi[] = [
    { name: 'Admin SDK API', serviceId: 'admin.googleapis.com' },
    { name: 'Gmail API', serviceId: 'gmail.googleapis.com' },
    { name: 'Groups Settings API', serviceId: 'groupssettings.googleapis.com' },
    { name: 'Reports API', serviceId: 'admin.googleapis.com' },
] as const;

export function cloudLibraryUrl(serviceId: string): string {
    return `https://console.cloud.google.com/apis/library/${serviceId}`;
}
