import { getDb } from '../db';
import { sanitizeTemplateHtml } from './template-renderer';

export interface TemplateRow {
    id: number;
    name: string;
    htmlContent: string;
    isDefault: boolean;
    createdBy: string | null;
    updatedBy: string | null;
    createdAt: string;
    updatedAt: string;
    media?: MediaRow[];
}

export interface MediaRow {
    id: number;
    name: string;
    driveFileId: string;
    publicUrl: string;
    mimeType: string;
    templateId: number;
    createdBy: string | null;
    token: string | null;
    createdAt: string;
}

interface TemplateDbRow {
    id: number;
    name: string;
    html_content: string;
    is_default: number;
    created_by: string | null;
    updated_by: string | null;
    created_at: string;
    updated_at: string;
}

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

function toApi(row: TemplateDbRow): TemplateRow {
    return {
        id: row.id,
        name: row.name,
        htmlContent: row.html_content,
        isDefault: row.is_default === 1,
        createdBy: row.created_by,
        updatedBy: row.updated_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function mediaToApi(row: MediaDbRow): MediaRow {
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

function nowIso(): string {
    return new Date().toISOString();
}

export const templateService = {
    list(): TemplateRow[] {
        const rows = getDb()
            .prepare('SELECT * FROM signature_templates ORDER BY updated_at DESC')
            .all() as TemplateDbRow[];
        return rows.map(toApi);
    },

    get(id: number): TemplateRow | null {
        const row = getDb()
            .prepare('SELECT * FROM signature_templates WHERE id = ?')
            .get(id) as TemplateDbRow | undefined;
        if (!row) return null;
        const tpl = toApi(row);
        const mediaRows = getDb()
            .prepare('SELECT * FROM media_assets WHERE template_id = ? ORDER BY created_at DESC')
            .all(id) as MediaDbRow[];
        tpl.media = mediaRows.map(mediaToApi);
        return tpl;
    },

    create(name: string, htmlContent: string, createdBy: string | null): TemplateRow {
        const trimmedName = name?.trim();
        if (!trimmedName || !htmlContent?.trim()) {
            throw new Error('Şablon adı ve HTML içeriği gerekli');
        }
        const sanitized = sanitizeTemplateHtml(htmlContent);
        try {
            const result = getDb()
                .prepare(
                    'INSERT INTO signature_templates (name, html_content, created_by) VALUES (?, ?, ?)'
                )
                .run(trimmedName, sanitized, createdBy);
            const row = getDb()
                .prepare('SELECT * FROM signature_templates WHERE id = ?')
                .get(result.lastInsertRowid) as TemplateDbRow;
            return toApi(row);
        } catch (err: any) {
            if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                throw new Error('Bu şablon adı zaten mevcut');
            }
            throw err;
        }
    },

    update(id: number, name: string, htmlContent: string, updatedBy: string | null): TemplateRow {
        const trimmedName = name?.trim();
        if (!trimmedName || !htmlContent?.trim()) {
            throw new Error('Şablon adı ve HTML içeriği gerekli');
        }
        const sanitized = sanitizeTemplateHtml(htmlContent);
        const result = getDb()
            .prepare(
                'UPDATE signature_templates SET name = ?, html_content = ?, updated_by = ?, updated_at = ? WHERE id = ?'
            )
            .run(trimmedName, sanitized, updatedBy, nowIso(), id);
        if (result.changes === 0) throw new Error('Şablon bulunamadı');
        const row = getDb()
            .prepare('SELECT * FROM signature_templates WHERE id = ?')
            .get(id) as TemplateDbRow;
        return toApi(row);
    },

    remove(id: number): void {
        const result = getDb().prepare('DELETE FROM signature_templates WHERE id = ?').run(id);
        if (result.changes === 0) throw new Error('Şablon bulunamadı');
    },

    setDefault(id: number, updatedBy: string | null): TemplateRow {
        const tx = getDb().transaction((targetId: number) => {
            getDb().prepare('UPDATE signature_templates SET is_default = 0 WHERE is_default = 1').run();
            const result = getDb()
                .prepare('UPDATE signature_templates SET is_default = 1, updated_by = ?, updated_at = ? WHERE id = ?')
                .run(updatedBy, nowIso(), targetId);
            if (result.changes === 0) throw new Error('Şablon bulunamadı');
        });
        tx(id);
        const row = getDb()
            .prepare('SELECT * FROM signature_templates WHERE id = ?')
            .get(id) as TemplateDbRow;
        return toApi(row);
    },

    getDefault(): TemplateRow | null {
        const row = getDb()
            .prepare('SELECT * FROM signature_templates WHERE is_default = 1 LIMIT 1')
            .get() as TemplateDbRow | undefined;
        return row ? toApi(row) : null;
    },
};
