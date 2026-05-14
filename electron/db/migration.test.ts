import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from './index';

/**
 * Faz 22.5a — DB migration için integration testleri.
 * Gerçek `better-sqlite3` (in-memory) ile çalışır; electron app/getDb() bağımlılığı yok.
 *
 * Not: better-sqlite3 Electron ABI'si ile derlendiyse Node'da yeni Database()
 * çağrısı NODE_MODULE_VERSION mismatch hatası verir. Bu durumda test SKIP edilir;
 * çalıştırmak için bir kerelik `npm rebuild better-sqlite3` (sonra
 * `npm run postinstall` ile Electron ABI'sine geri dön) gerekir.
 */
let nativeBindingsOk = true;
try {
    new Database(':memory:').close();
} catch {
    nativeBindingsOk = false;
}
const describeIfNative = nativeBindingsOk ? describe : describe.skip;

function createV0Db(): Database.Database {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    // Eski v0 şemasını manuel oluştur (campuses + signature_templates)
    db.exec(`
        CREATE TABLE campuses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          address TEXT,
          phone TEXT
        );
        CREATE TABLE signature_templates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          html_content TEXT NOT NULL
        );
    `);
    return db;
}

describeIfNative('runMigrations — v0 → v1', () => {
    it('campuses tablosunu institutions olarak yeniden adlandırır, kayıtlar korunur', () => {
        const db = createV0Db();
        db.prepare('INSERT INTO campuses (name, address, phone) VALUES (?, ?, ?)')
            .run('Merkez', 'İstanbul', '0212');
        db.prepare('INSERT INTO campuses (name, address, phone) VALUES (?, ?, ?)')
            .run('Kadıköy', 'Kadıköy/İstanbul', '0216');

        runMigrations(db);

        // Eski tablo gitmiş, yeni tablo var
        const oldExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='campuses'").get();
        const newExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='institutions'").get();
        expect(oldExists).toBeUndefined();
        expect(newExists).toBeDefined();

        // Kayıtlar korundu
        const rows = db.prepare('SELECT name, address, phone FROM institutions ORDER BY id').all();
        expect(rows).toEqual([
            { name: 'Merkez', address: 'İstanbul', phone: '0212' },
            { name: 'Kadıköy', address: 'Kadıköy/İstanbul', phone: '0216' },
        ]);

        expect(db.pragma('user_version', { simple: true })).toBe(1);
    });

    it('signature_templates HTML içindeki {{kampus_*}} token\'larını {{kurum_*}}\'a çevirir', () => {
        const db = createV0Db();
        db.prepare('INSERT INTO signature_templates (name, html_content) VALUES (?, ?)')
            .run('Template A', 'Merhaba {{kampus_adi}} ekibi, adres: {{kampus_adres}}, tel: {{kampus_telefon}}');
        db.prepare('INSERT INTO signature_templates (name, html_content) VALUES (?, ?)')
            .run('Template B (no campus)', '<p>{{ad_soyad}}</p>');

        runMigrations(db);

        const a = db.prepare('SELECT html_content FROM signature_templates WHERE name = ?').get('Template A') as { html_content: string };
        expect(a.html_content).toBe('Merhaba {{kurum_adi}} ekibi, adres: {{kurum_adres}}, tel: {{kurum_telefon}}');

        // Kampüs içermeyen template'e dokunulmadı
        const b = db.prepare('SELECT html_content FROM signature_templates WHERE name = ?').get('Template B (no campus)') as { html_content: string };
        expect(b.html_content).toBe('<p>{{ad_soyad}}</p>');
    });

    it('idempotent: ikinci çağrı no-op (user_version=1 ise migration tekrar çalışmaz)', () => {
        const db = createV0Db();
        db.prepare('INSERT INTO campuses (name) VALUES (?)').run('Merkez');

        runMigrations(db);
        const firstVersion = db.pragma('user_version', { simple: true });

        // İkinci çağrı: zaten v1, hiçbir şey değişmemeli, hata fırlatmamalı
        expect(() => runMigrations(db)).not.toThrow();

        const secondVersion = db.pragma('user_version', { simple: true });
        expect(secondVersion).toBe(firstVersion);
        expect(secondVersion).toBe(1);

        // Veri hâlâ tutulu
        const rows = db.prepare('SELECT name FROM institutions').all();
        expect(rows).toEqual([{ name: 'Merkez' }]);
    });

    it('fresh DB (henüz hiç tablo yok): rename adımı skip eder, user_version=1 set edilir', () => {
        const db = new Database(':memory:');
        db.pragma('foreign_keys = ON');
        // Hiç tablo yok

        expect(() => runMigrations(db)).not.toThrow();
        expect(db.pragma('user_version', { simple: true })).toBe(1);

        // institutions hâlâ yok (schema.sql sonra çalıştırılacak)
        const newExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='institutions'").get();
        expect(newExists).toBeUndefined();
    });

    it('institutions tablosu zaten varsa (manuel oluşturulduysa) rename yapmaz', () => {
        const db = createV0Db();
        // Manuel olarak hem campuses hem institutions ekle (tutarsız ama olası bir senaryo)
        db.exec('CREATE TABLE institutions (id INTEGER PRIMARY KEY)');
        db.prepare('INSERT INTO campuses (name) VALUES (?)').run('Eski');

        expect(() => runMigrations(db)).not.toThrow();

        // campuses hâlâ duruyor olmalı (rename yapılmadı çünkü institutions zaten vardı)
        const oldExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='campuses'").get();
        expect(oldExists).toBeDefined();
        expect(db.pragma('user_version', { simple: true })).toBe(1);
    });
});
