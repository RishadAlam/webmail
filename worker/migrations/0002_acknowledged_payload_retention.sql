-- Apply once to an existing database before deploying the retention-aware Worker.
-- Fresh databases use schema.sql, which already includes these columns and index.
ALTER TABLE spool ADD COLUMN acknowledged_at INTEGER;
ALTER TABLE spool ADD COLUMN retained_until INTEGER;
CREATE INDEX retained_spool ON spool(state, retained_until) WHERE raw IS NOT NULL;
-- Previously discarded payloads cannot be reconstructed by this migration.
-- Preserve any acknowledged payload that still exists for one full recovery day.
UPDATE spool SET acknowledged_at = unixepoch(), retained_until = unixepoch() + 86400 WHERE state = 'acknowledged' AND raw IS NOT NULL;
