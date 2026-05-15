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
 * Idempotent migration runner — `pragma user_version` ile sürüm takip eder.
 * Schema.exec()'ten ÖNCE çağrılır.
 *
 * v1 → v2: Onboarding state. Mevcut kurulumlarda companyName + allowedDomain
 *          dolu ise `onboardingCompletedAt` set edilerek wizard atlanır.
 */
export function runMigrations(db: Database.Database): void {
    const version = db.pragma('user_version', { simple: true }) as number;

    if (version < 2) {
        const tx = db.transaction(() => {
            // app_config tablosu mevcut kurulumlarda zaten var; ilk açılışta
            // schema.exec() henüz çağrılmadığı için tablo yoksa atla.
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

    // Migration ÖNCE: tabloları yeni isimleriyle bekleyen schema.exec()'ten önce
    // mevcut tabloları rename et; sonra schema.exec() yeni tabloları (varsa) oluşturur.
    runMigrations(db);

    const schema = readFileSync(getSchemaPath(), 'utf-8');
    db.exec(schema);

    dbInstance = db;
    console.log(`[db] SQLite ready at ${dbPath}`);
    return db;
}

export function closeDb(): void {
    if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
    }
}
