ALTER TABLE player_profiles ADD COLUMN mutation_id TEXT NOT NULL DEFAULT 'initial';
CREATE TABLE invitation_batches (
  id TEXT PRIMARY KEY NOT NULL, fingerprint TEXT NOT NULL, operator_id TEXT NOT NULL,
  reissue INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
