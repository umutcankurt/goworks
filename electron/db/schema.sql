-- GoWorks local DB schema (SQLite)
-- Sunucu PostgreSQL şemasının (server/prisma/schema.prisma) lokal karşılığı.
-- Migrasyon runner: electron/db/index.ts. PRAGMA user_version ile sürüm takibi yapılır.

CREATE TABLE IF NOT EXISTS titles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS institutions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  address TEXT,
  phone TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS signature_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  html_content TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS media_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  drive_file_id TEXT NOT NULL,
  public_url TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  template_id INTEGER NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (template_id) REFERENCES signature_templates(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_media_assets_template_id ON media_assets(template_id);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  payload TEXT NOT NULL,
  result TEXT,
  execution_report TEXT,
  progress INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  succeeded INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  started_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_created_by_created_at ON jobs(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);

CREATE TABLE IF NOT EXISTS app_config (
  key   TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- İmza Denetimi: bir kişiye en son basılan imzanın durum kaydı.
-- pushSignature her başarılı push'ta buraya yazar; Hızlı tarama bununla karşılaştırır.
CREATE TABLE IF NOT EXISTS signature_state (
  email               TEXT PRIMARY KEY,
  template_id         INTEGER,
  desired_hash        TEXT NOT NULL,
  variables_snapshot  TEXT,
  last_pushed_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- İmza Denetimi: bir SIGNATURE_AUDIT tarama job'unun kişi başı sonuçları.
CREATE TABLE IF NOT EXISTS signature_audit_items (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id              TEXT NOT NULL,
  email               TEXT NOT NULL,
  category            TEXT NOT NULL,
  reason              TEXT,
  current_variables   TEXT,
  previous_variables  TEXT,
  error               TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_sig_audit_items_job ON signature_audit_items(job_id);
