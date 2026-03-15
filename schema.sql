DROP TABLE IF EXISTS Images;

CREATE TABLE
  IF NOT EXISTS Images (
    name TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    content_type TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  );