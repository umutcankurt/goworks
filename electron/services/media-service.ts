import { getDb } from '../db';
import { extractDriveFileId, toCdnUrl } from './drive-media';
import { computeNextToken } from './media-token';
import type { MediaRow } from './template-service';

interface MediaDbRow {
    id: number;
    name: string;
    drive_file_id: string;
    public_url: string;
    mime_type: string;
    template_id: number;
    created_by: string | null;
    token: string | null;
    created_at: string;
}

function toApi(row: MediaDbRow): MediaRow {
    return {
        id: row.id,
        name: row.name,
        driveFileId: row.drive_file_id,
        publicUrl: row.public_url,
        mimeType: row.mime_type,
        templateId: row.template_id,
        createdBy: row.created_by,
        token: row.token,
        createdAt: row.created_at,
    };
}

/** Next stable token for a template (see computeNextToken for the gap-preserving rule). */
function nextToken(templateId: number): string {
    const rows = getDb()
        .prepare('SELECT token FROM media_assets WHERE template_id = ?')
        .all(templateId) as { token: string | null }[];
    return computeNextToken(rows.map(r => r.token));
}

export const mediaService = {
    list(templateId?: number): MediaRow[] {
        const rows = templateId
            ? (getDb()
                .prepare('SELECT * FROM media_assets WHERE template_id = ? ORDER BY created_at DESC')
                .all(templateId) as MediaDbRow[])
            : (getDb()
                .prepare('SELECT * FROM media_assets ORDER BY created_at DESC')
                .all() as MediaDbRow[]);
        return rows.map(toApi);
    },

    create(
        input: { name: string; fileId?: string; driveUrl?: string; mimeType?: string; templateId: number },
        createdBy: string | null
    ): MediaRow {
        if (!input.name?.trim()) {
            throw new Error('Medya adı gerekli');
        }
        if (!input.templateId) {
            throw new Error('templateId gerekli');
        }
        // Prefer an explicit fileId (native upload); fall back to parsing a Drive URL
        // (the legacy "advanced: add by URL" path).
        let fileId = input.fileId?.trim() || null;
        if (!fileId) {
            if (!input.driveUrl?.trim()) throw new Error('fileId veya Drive URL gerekli');
            fileId = extractDriveFileId(input.driveUrl);
            if (!fileId) throw new Error('Geçersiz Google Drive URL');
        }
        const publicUrl = toCdnUrl(fileId);
        const token = nextToken(input.templateId);
        const result = getDb()
            .prepare(
                'INSERT INTO media_assets (name, drive_file_id, public_url, mime_type, template_id, created_by, token) VALUES (?, ?, ?, ?, ?, ?, ?)'
            )
            .run(
                input.name.trim(),
                fileId,
                publicUrl,
                input.mimeType || 'image/png',
                input.templateId,
                createdBy,
                token
            );
        const row = getDb()
            .prepare('SELECT * FROM media_assets WHERE id = ?')
            .get(result.lastInsertRowid) as MediaDbRow;
        return toApi(row);
    },

    remove(id: number): void {
        const result = getDb().prepare('DELETE FROM media_assets WHERE id = ?').run(id);
        if (result.changes === 0) throw new Error('Medya bulunamadı');
    },
};
