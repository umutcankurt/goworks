import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// `electron` import'u test ortamında yok — sadece `app.getPath` runtime'da
// kullanılıyor (getDb içinde). runMigrations bağımsız çalışır ama modül
// yüklenirken import resolve edilmeli.
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
        // app_config tablosu var ama config satırı yok → taze kurulum
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

        // v2 olduğu için companyName dolu olsa bile onboardingCompletedAt set edilmez
        const completed = db
            .prepare("SELECT value FROM app_config WHERE key = 'onboardingCompletedAt'")
            .get();
        expect(completed).toBeUndefined();
    });

    it('app_config tablosu yoksa hata atmaz (cfgExists check)', () => {
        // Taze bir db kur, app_config tablosunu drop et
        const bareDb = new Database(':memory:');
        // Sadece pragma var, tablolar yok
        expect(() => runMigrations(bareDb)).not.toThrow();
        expect(bareDb.pragma('user_version', { simple: true })).toBe(2);
    });
});
