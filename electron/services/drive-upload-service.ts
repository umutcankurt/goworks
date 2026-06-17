import { Readable } from 'node:stream';
import type { OAuth2Client } from 'google-auth-library';
import { getGoogle } from '../google-lazy';
import { withRetry } from './retry';

/**
 * Uploads signature images to Drive and makes them public, using the logged-in
 * admin's OAuth client (NOT a service account) so the Drive audit log attributes
 * the file to the actual user — consistent with the Groups-write decision.
 *
 * The public URL is built with `toCdnUrl` (lh3 CDN) by the caller (media-service).
 */

const logger = { warn: (...args: unknown[]) => console.warn('[drive-upload]', ...args) };

/** Upload an image buffer to Drive; returns the new file id. */
export async function uploadImage(
    auth: OAuth2Client,
    buffer: Buffer,
    name: string,
    mimeType: string,
): Promise<string> {
    const drive = getGoogle().drive({ version: 'v3', auth });
    const res = await withRetry(
        () =>
            drive.files.create({
                requestBody: { name },
                media: { mimeType, body: Readable.from(buffer) },
                fields: 'id',
            }),
        logger,
        `drive.files.create(${name})`,
    );
    const fileId = res.data.id;
    if (!fileId) throw new Error('Drive dosya kimliği alınamadı');
    return fileId;
}

/** Grant "anyone with the link can view" so the image renders in email clients. */
export async function makePublic(auth: OAuth2Client, fileId: string): Promise<void> {
    const drive = getGoogle().drive({ version: 'v3', auth });
    await withRetry(
        () =>
            drive.permissions.create({
                fileId,
                requestBody: { role: 'reader', type: 'anyone' },
            }),
        logger,
        `drive.permissions.create(${fileId})`,
    );
}
