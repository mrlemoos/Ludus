ALTER TABLE invitations ADD COLUMN expires_at INTEGER;
ALTER TABLE invitations ADD COLUMN redeemed_by TEXT;
ALTER TABLE invitations ADD COLUMN redeemed_at INTEGER;
ALTER TABLE invitations ADD COLUMN delivery_id TEXT;
-- Existing invitations are deliberately not admitted indefinitely after migration.
UPDATE invitations SET expires_at = unixepoch() * 1000 + 604800000 WHERE expires_at IS NULL;
CREATE TABLE player_profiles (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id), username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  language TEXT NOT NULL CHECK(language IN ('en-GB','es-ES','fr-FR')), timezone TEXT NOT NULL,
  pending_timezone TEXT, timezone_effective_at INTEGER, chess_level TEXT NOT NULL,
  teaching_profile TEXT NOT NULL, activity_public INTEGER NOT NULL DEFAULT 1 CHECK(activity_public IN (0,1)),
  adult_attested_at INTEGER NOT NULL, policy_version TEXT NOT NULL, onboarded_at INTEGER NOT NULL, trial_expires_at INTEGER NOT NULL
);
CREATE TABLE timezone_history (user_id TEXT NOT NULL, effective_at INTEGER NOT NULL, timezone TEXT NOT NULL, PRIMARY KEY(user_id,effective_at));
CREATE TABLE activity_events (user_id TEXT NOT NULL, game_id TEXT NOT NULL, completed_at INTEGER NOT NULL, date TEXT NOT NULL, timezone TEXT NOT NULL, PRIMARY KEY(user_id,game_id));
CREATE INDEX activity_events_user_date ON activity_events(user_id,date);
CREATE TABLE invitation_deliveries (id TEXT PRIMARY KEY NOT NULL, batch_id TEXT NOT NULL, email TEXT NOT NULL, operator_id TEXT NOT NULL, language TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, sent_at INTEGER, status TEXT NOT NULL, UNIQUE(batch_id,email));
CREATE TABLE account_deletions (user_id TEXT PRIMARY KEY NOT NULL, requested_at INTEGER NOT NULL, completed_at INTEGER);
