import Database from 'better-sqlite3';
import { app } from 'electron';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let dbInstance: Database.Database | null = null;

function getSchemaPath(): string {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'db', 'schema.sql');
    }
    const here = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
        path.join(here, 'schema.sql'),
        path.join(here, '..', 'electron', 'db', 'schema.sql'),
        path.join(process.cwd(), 'electron', 'db', 'schema.sql'),
    ];
    for (const c of candidates) {
        if (existsSync(c)) return c;
    }
    throw new Error('db/schema.sql not found. Tried: ' + candidates.join(', '));
}

/**
 * Idempotent migration runner — tracks the version via `pragma user_version`.
 * Called BEFORE Schema.exec().
 *
 * v1 → v2: Onboarding state. In existing installs, if companyName + allowedDomain
 *          are populated, `onboardingCompletedAt` is set so the wizard is skipped.
 * v2 → v3: media_assets.token — stable {{image_N}} token per media asset. Existing
 *          rows are backfilled image_1, image_2… per template (by created_at).
 */
export function runMigrations(db: Database.Database): void {
    const version = db.pragma('user_version', { simple: true }) as number;

    if (version < 2) {
        const tx = db.transaction(() => {
            // The app_config table already exists in existing installs; on first launch
            // schema.exec() hasn't run yet, so skip if the table is missing.
            const cfgExists = db
                .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_config'")
                .get();
            if (cfgExists) {
                const row = db
                    .prepare(
                        `SELECT
                            (SELECT value FROM app_config WHERE key = 'companyName') AS company,
                            (SELECT value FROM app_config WHERE key = 'allowedDomain') AS domain`,
                    )
                    .get() as { company: string | null; domain: string | null } | undefined;
                if (row?.company && row?.domain) {
                    db.prepare(
                        `INSERT OR REPLACE INTO app_config (key, value, updated_at)
                         VALUES ('onboardingCompletedAt', ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
                    ).run(new Date().toISOString());
                }
            }
            db.pragma('user_version = 2');
        });
        tx();
    }

    if (version < 3) {
        const tx = db.transaction(() => {
            // On first launch media_assets doesn't exist yet (schema.exec runs after);
            // it will be created with the token column, so this block is a no-op then.
            const tblExists = db
                .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='media_assets'")
                .get();
            if (tblExists) {
                const cols = db.prepare('PRAGMA table_info(media_assets)').all() as { name: string }[];
                if (!cols.some(c => c.name === 'token')) {
                    db.exec('ALTER TABLE media_assets ADD COLUMN token TEXT');
                }
                // Backfill existing rows: image_1, image_2… per template, ordered by creation.
                const rows = db
                    .prepare('SELECT id, template_id FROM media_assets WHERE token IS NULL ORDER BY template_id, created_at, id')
                    .all() as { id: number; template_id: number }[];
                const counter: Record<number, number> = {};
                const upd = db.prepare('UPDATE media_assets SET token = ? WHERE id = ?');
                for (const r of rows) {
                    counter[r.template_id] = (counter[r.template_id] ?? 0) + 1;
                    upd.run(`image_${counter[r.template_id]}`, r.id);
                }
            }
            db.pragma('user_version = 3');
        });
        tx();
    }
}

export function getDb(): Database.Database {
    if (dbInstance) return dbInstance;

    const userDataDir = app.getPath('userData');
    if (!existsSync(userDataDir)) {
        mkdirSync(userDataDir, { recursive: true });
    }
    const dbPath = path.join(userDataDir, 'goworks.db');

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');

    // Migration FIRST: rename existing tables before schema.exec(), which expects
    // tables under their new names; schema.exec() then creates any new tables.
    runMigrations(db);

    const schema = readFileSync(getSchemaPath(), 'utf-8');
    db.exec(schema);

    dbInstance = db;
    return db;
}

export function closeDb(): void {
    if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
    }
}
