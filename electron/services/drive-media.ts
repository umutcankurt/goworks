const DRIVE_FILE_REGEX = /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/;
const DRIVE_OPEN_REGEX = /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/;

export function extractDriveFileId(url: string): string | null {
    const match = url.match(DRIVE_FILE_REGEX) || url.match(DRIVE_OPEN_REGEX);
    return match ? match[1] : null;
}

/**
 * @deprecated New media uses `toCdnUrl`. Kept so existing `uc?export=view` rows
 * keep rendering.
 */
export function toDirectUrl(fileId: string): string {
    return `https://drive.google.com/uc?export=view&id=${fileId}`;
}

/**
 * Google's image CDN — the same infrastructure Gmail uses. Far more stable for
 * `<img src>` in pushed signatures than `uc?export=view`, and contains no query
 * string so it survives HTML-attribute sanitization without `&`→`&amp;` issues.
 */
export function toCdnUrl(fileId: string): string {
    return `https://lh3.googleusercontent.com/d/${fileId}`;
}

export function driveUrlToDirectUrl(driveUrl: string): string | null {
    const fileId = extractDriveFileId(driveUrl);
    if (!fileId) return null;
    return toDirectUrl(fileId);
}
