CREATE TABLE recipients (address TEXT PRIMARY KEY, active INTEGER NOT NULL, version INTEGER NOT NULL);
-- statement
CREATE TABLE recipient_directory_state (id INTEGER PRIMARY KEY CHECK (id = 1), revision INTEGER NOT NULL DEFAULT 0, checksum TEXT NOT NULL DEFAULT '', count INTEGER NOT NULL DEFAULT 0, updated_at INTEGER);
-- statement
INSERT INTO recipient_directory_state(id) VALUES (1);
-- statement
CREATE TABLE counters (id INTEGER PRIMARY KEY, used INTEGER NOT NULL DEFAULT 0, budget INTEGER NOT NULL DEFAULT 52428800);
-- statement
INSERT INTO counters(id) VALUES (1);
-- statement
CREATE TABLE spool (id TEXT PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'mail', recipient TEXT NOT NULL DEFAULT '', sender TEXT NOT NULL DEFAULT '', raw TEXT, checksum TEXT NOT NULL, bytes INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'pending', lease_until INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
-- statement
CREATE INDEX pending_spool ON spool(state, lease_until, created_at);
-- statement
CREATE TRIGGER capacity_before_insert BEFORE INSERT ON spool BEGIN SELECT CASE WHEN (SELECT used + NEW.bytes > budget FROM counters WHERE id = 1) THEN RAISE(ABORT, 'spool full') END; END;
-- statement
CREATE TRIGGER capacity_after_insert AFTER INSERT ON spool BEGIN UPDATE counters SET used = used + NEW.bytes WHERE id = 1; END;
-- statement
CREATE TRIGGER capacity_after_update AFTER UPDATE OF bytes ON spool BEGIN UPDATE counters SET used = used + NEW.bytes - OLD.bytes WHERE id = 1; END;
-- statement
CREATE TABLE request_nonces (nonce TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
-- statement
CREATE TABLE wake_state (id INTEGER PRIMARY KEY, next_at INTEGER NOT NULL DEFAULT 0, failures INTEGER NOT NULL DEFAULT 0);
-- statement
INSERT INTO wake_state(id) VALUES (1);
