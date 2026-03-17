DROP TABLE IF EXISTS Images;

DROP INDEX IF EXISTS NameIndex;

CREATE TABLE
  IF NOT EXISTS Images (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL,
    content_type TEXT,
    size INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

CREATE INDEX IF NOT EXISTS NameIndex ON Images (name);

CREATE TABLE
  IF NOT EXISTS ImageStats (
    bucket TEXT PRIMARY KEY DEFAULT 'global',
    total_images INTEGER NOT NULL DEFAULT 0,
    total_size INTEGER NOT NULL DEFAULT 0
  );

INSERT INTO ImageStats (bucket, total_images, total_size)
  SELECT 'global', 0, 0
  WHERE NOT EXISTS (SELECT 1 FROM ImageStats WHERE bucket = 'global');
