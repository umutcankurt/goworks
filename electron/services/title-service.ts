import Papa from 'papaparse';
import { getDb } from '../db';

export interface TitleRow {
    id: number;
    name: string;
    createdBy: string | null;
    updatedBy: string | null;
    createdAt: string;
    updatedAt: string;
}

interface TitleDbRow {
    id: number;
    name: string;
    created_by: string | null;
    updated_by: string | null;
    created_at: string;
    updated_at: string;
}

function toApi(row: TitleDbRow): TitleRow {
    return {
        id: row.id,
        name: row.name,
        createdBy: row.created_by,
        updatedBy: row.updated_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function nowIso(): string {
    return new Date().toISOString();
}

export const titleService = {
    list(): TitleRow[] {
        const rows = getDb()
            .prepare('SELECT * FROM titles ORDER BY name COLLATE NOCASE ASC')
            .all() as TitleDbRow[];
        return rows.map(toApi);
    },

    create(name: string, createdBy: string | null): TitleRow {
        const trimmed = name.trim();
        if (!trimmed) throw new Error('Ünvan adı gerekli');
        const stmt = getDb().prepare(
            'INSERT INTO titles (name, created_by) VALUES (?, ?)'
        );
        try {
            const result = stmt.run(trimmed, createdBy);
            const row = getDb()
                .prepare('SELECT * FROM titles WHERE id = ?')
                .get(result.lastInsertRowid) as TitleDbRow;
            return toApi(row);
        } catch (err: any) {
            if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                throw new Error('Bu ünvan zaten mevcut');
            }
            throw err;
        }
    },

    update(id: number, name: string, updatedBy: string | null): TitleRow {
        const trimmed = name.trim();
        if (!trimmed) throw new Error('Ünvan adı gerekli');
        const result = getDb()
            .prepare('UPDATE titles SET name = ?, updated_by = ?, updated_at = ? WHERE id = ?')
            .run(trimmed, updatedBy, nowIso(), id);
        if (result.changes === 0) throw new Error('Ünvan bulunamadı');
        const row = getDb()
            .prepare('SELECT * FROM titles WHERE id = ?')
            .get(id) as TitleDbRow;
        return toApi(row);
    },

    remove(id: number): void {
        const result = getDb().prepare('DELETE FROM titles WHERE id = ?').run(id);
        if (result.changes === 0) throw new Error('Ünvan bulunamadı');
    },

    importCsv(csv: string, createdBy: string | null): { created: number; skipped: number; total: number } {
        if (!csv) throw new Error('CSV verisi gerekli');
        const parsed = Papa.parse<{ name?: string; unvan?: string }>(csv, {
            header: true,
            skipEmptyLines: true,
        });
        const names = parsed.data
            .map((row) => (row.name || row.unvan || '').trim())
            .filter(Boolean);
        if (names.length === 0) {
            throw new Error('Geçerli ünvan bulunamadı. CSV "name" veya "unvan" sütunu içermeli.');
        }
        const insert = getDb().prepare(
            'INSERT OR IGNORE INTO titles (name, created_by) VALUES (?, ?)'
        );
        const tx = getDb().transaction((items: string[]) => {
            let created = 0;
            for (const n of items) {
                const r = insert.run(n, createdBy);
                if (r.changes > 0) created++;
            }
            return created;
        });
        const created = tx(names);
        return { created, skipped: names.length - created, total: names.length };
    },
};
