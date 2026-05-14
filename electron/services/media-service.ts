import { getDb } from '../db';
import { extractDriveFileId, toDirectUrl } from './drive-media';
import type { MediaRow } from './template-service';

interface MediaDbRow {
    id: number;
    name: string;
    drive_file_id: string;
    public_url: string;
    mime_type: string;
    template_id: number;
    created_by: string | null;
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
        createdAt: row.created_at,
    };
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
        input: { name: string; driveUrl: string; mimeType?: string; templateId: number },
        createdBy: string | null
    ): MediaRow {
        if (!input.name?.trim() || !input.driveUrl?.trim()) {
            throw new Error('Medya adı ve Drive URL gerekli');
        }
        if (!input.templateId) {
            throw new Error('templateId gerekli');
        }
        const fileId = extractDriveFileId(input.driveUrl);
        if (!fileId) throw new Error('Geçersiz Google Drive URL');
        const publicUrl = toDirectUrl(fileId);
        const result = getDb()
            .prepare(
                'INSERT INTO media_assets (name, drive_file_id, public_url, mime_type, template_id, created_by) VALUES (?, ?, ?, ?, ?, ?)'
            )
            .run(
                input.name.trim(),
                fileId,
                publicUrl,
                input.mimeType || 'image/png',
                input.templateId,
                createdBy
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
