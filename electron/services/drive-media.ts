const DRIVE_FILE_REGEX = /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/;
const DRIVE_OPEN_REGEX = /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/;

export function extractDriveFileId(url: string): string | null {
    const match = url.match(DRIVE_FILE_REGEX) || url.match(DRIVE_OPEN_REGEX);
    return match ? match[1] : null;
}

export function toDirectUrl(fileId: string): string {
    return `https://drive.google.com/uc?export=view&id=${fileId}`;
}

export function driveUrlToDirectUrl(driveUrl: string): string | null {
    const fileId = extractDriveFileId(driveUrl);
    if (!fileId) return null;
    return toDirectUrl(fileId);
}
