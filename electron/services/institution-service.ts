import Papa from 'papaparse';
import { getDb } from '../db';

export interface InstitutionRow {
    id: number;
    name: string;
    address: string | null;
    phone: string | null;
    createdBy: string | null;
    updatedBy: string | null;
    createdAt: string;
    updatedAt: string;
}

interface InstitutionDbRow {
    id: number;
    name: string;
    address: string | null;
    phone: string | null;
    created_by: string | null;
    updated_by: string | null;
    created_at: string;
    updated_at: string;
}

function toApi(row: InstitutionDbRow): InstitutionRow {
    return {
        id: row.id,
        name: row.name,
        address: row.address,
        phone: row.phone,
        createdBy: row.created_by,
        updatedBy: row.updated_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function nowIso(): string {
    return new Date().toISOString();
}

export interface InstitutionInput {
    name: string;
    address?: string;
    phone?: string;
}

export const institutionService = {
    list(): InstitutionRow[] {
        const rows = getDb()
            .prepare('SELECT * FROM institutions ORDER BY name COLLATE NOCASE ASC')
            .all() as InstitutionDbRow[];
        return rows.map(toApi);
    },

    create(input: InstitutionInput, createdBy: string | null): InstitutionRow {
        const name = input.name?.trim();
        if (!name) throw new Error('Kurum adı gerekli');
        const address = input.address?.trim() || null;
        const phone = input.phone?.trim() || null;
        try {
            const result = getDb()
                .prepare(
                    'INSERT INTO institutions (name, address, phone, created_by) VALUES (?, ?, ?, ?)'
                )
                .run(name, address, phone, createdBy);
            const row = getDb()
                .prepare('SELECT * FROM institutions WHERE id = ?')
                .get(result.lastInsertRowid) as InstitutionDbRow;
            return toApi(row);
        } catch (err: any) {
            if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                throw new Error('Bu kurum adı zaten mevcut');
            }
            throw err;
        }
    },

    update(id: number, input: InstitutionInput, updatedBy: string | null): InstitutionRow {
        const name = input.name?.trim();
        if (!name) throw new Error('Kurum adı gerekli');
        const address = input.address?.trim() || null;
        const phone = input.phone?.trim() || null;
        const result = getDb()
            .prepare(
                'UPDATE institutions SET name = ?, address = ?, phone = ?, updated_by = ?, updated_at = ? WHERE id = ?'
            )
            .run(name, address, phone, updatedBy, nowIso(), id);
        if (result.changes === 0) throw new Error('Kurum bulunamadı');
        const row = getDb()
            .prepare('SELECT * FROM institutions WHERE id = ?')
            .get(id) as InstitutionDbRow;
        return toApi(row);
    },

    remove(id: number): void {
        const result = getDb().prepare('DELETE FROM institutions WHERE id = ?').run(id);
        if (result.changes === 0) throw new Error('Kurum bulunamadı');
    },

    findByName(name: string): InstitutionRow | null {
        const row = getDb()
            .prepare('SELECT * FROM institutions WHERE name = ? COLLATE NOCASE')
            .get(name) as InstitutionDbRow | undefined;
        return row ? toApi(row) : null;
    },

    importCsv(
        csv: string,
        createdBy: string | null
    ): { created: number; skipped: number; total: number } {
        if (!csv) throw new Error('CSV verisi gerekli');
        const parsed = Papa.parse<{
            name?: string;
            kurum?: string;
            kampus?: string;
            address?: string;
            adres?: string;
            phone?: string;
            telefon?: string;
        }>(csv, {
            header: true,
            skipEmptyLines: true,
        });
        const rows = parsed.data
            .map((r) => ({
                name: (r.name || r.kurum || r.kampus || '').trim(),
                address: (r.address || r.adres || '').trim() || null,
                phone: (r.phone || r.telefon || '').trim() || null,
            }))
            .filter((r) => r.name);
        if (rows.length === 0) {
            throw new Error('Geçerli kurum bulunamadı. CSV "name", "kurum" veya "kampus" sütunu içermeli.');
        }
        const insert = getDb().prepare(
            'INSERT OR IGNORE INTO institutions (name, address, phone, created_by) VALUES (?, ?, ?, ?)'
        );
        const tx = getDb().transaction((items: typeof rows) => {
            let created = 0;
            for (const r of items) {
                const res = insert.run(r.name, r.address, r.phone, createdBy);
                if (res.changes > 0) created++;
            }
            return created;
        });
        const created = tx(rows);
        return { created, skipped: rows.length - created, total: rows.length };
    },
};
