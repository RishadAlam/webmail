-- Apply to an existing ingress database before deploying the directory endpoint.
-- This adds control metadata only; accepted spool and recipients are untouched.
CREATE TABLE IF NOT EXISTS recipient_directory_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    revision INTEGER NOT NULL DEFAULT 0,
    checksum TEXT NOT NULL DEFAULT '',
    count INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER
);
INSERT OR IGNORE INTO recipient_directory_state(id) VALUES (1);
