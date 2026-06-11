import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// The `electron` import isn't available in the test environment — `app.getPath` is
// only used at runtime (inside getDb). runMigrations works standalone, but the import
// must still resolve when the module loads.
vi.mock('electron', () => ({
    app: { getPath: () => '/tmp/goworks-test', isPackaged: false },
}));

import { runMigrations } from './index';

const SCHEMA_PATH = path.join(process.cwd(), 'electron', 'db', 'schema.sql');

function freshDb(): Database.Database {
    const db = new Database(':memory:');
    const schemaSql = readFileSync(SCHEMA_PATH, 'utf-8');
    db.exec(schemaSql);
    return db;
}

describe('runMigrations', () => {
    let db: Database.Database;

    beforeEach(() => {
        db = freshDb();
    });

    it('v0 → v2: user_version pragma\'yı 2\'ye yükseltir', () => {
        expect(db.pragma('user_version', { simple: true })).toBe(0);
        runMigrations(db);
        expect(db.pragma('user_version', { simple: true })).toBe(2);
    });

    it('idempotent: aynı DB üzerinde 2. çağrı yan etki yapmaz', () => {
        runMigrations(db);
        const versionAfterFirst = db.pragma('user_version', { simple: true });
        runMigrations(db);
        const versionAfterSecond = db.pragma('user_version', { simple: true });
        expect(versionAfterFirst).toBe(versionAfterSecond);
        expect(versionAfterSecond).toBe(2);
    });

    it('companyName + allowedDomain dolu ise onboardingCompletedAt set edilir', () => {
        db.prepare("INSERT INTO app_config (key, value) VALUES ('companyName', 'Acme Co')").run();
        db.prepare("INSERT INTO app_config (key, value) VALUES ('allowedDomain', 'acme.com')").run();

        runMigrations(db);

        const completed = db
            .prepare("SELECT value FROM app_config WHERE key = 'onboardingCompletedAt'")
            .get() as { value: string } | undefined;
        expect(completed).toBeDefined();
        expect(completed!.value).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('companyName boş ise onboardingCompletedAt set edilmez (taze kurulum)', () => {
        // app_config table exists but has no config rows → fresh install
        runMigrations(db);

        const completed = db
            .prepare("SELECT value FROM app_config WHERE key = 'onboardingCompletedAt'")
            .get();
        expect(completed).toBeUndefined();
    });

    it('sadece companyName dolu (allowedDomain boş) ise onboardingCompletedAt set edilmez', () => {
        db.prepare("INSERT INTO app_config (key, value) VALUES ('companyName', 'Acme Co')").run();

        runMigrations(db);

        const completed = db
            .prepare("SELECT value FROM app_config WHERE key = 'onboardingCompletedAt'")
            .get();
        expect(completed).toBeUndefined();
    });

    it('zaten v2\'deki bir DB için migration\'ı atlar (no-op)', () => {
        db.pragma('user_version = 2');
        db.prepare("INSERT INTO app_config (key, value) VALUES ('companyName', 'Test')").run();
        db.prepare("INSERT INTO app_config (key, value) VALUES ('allowedDomain', 'test.com')").run();

        runMigrations(db);

        // Since it's already v2, onboardingCompletedAt isn't set even when companyName is populated
        const completed = db
            .prepare("SELECT value FROM app_config WHERE key = 'onboardingCompletedAt'")
            .get();
        expect(completed).toBeUndefined();
    });

    it('app_config tablosu yoksa hata atmaz (cfgExists check)', () => {
        // Set up a fresh db, drop the app_config table
        const bareDb = new Database(':memory:');
        // Only the pragma exists, no tables
        expect(() => runMigrations(bareDb)).not.toThrow();
        expect(bareDb.pragma('user_version', { simple: true })).toBe(2);
    });
});
