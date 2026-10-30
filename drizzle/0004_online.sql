CREATE TABLE IF NOT EXISTS online_matches (id TEXT PRIMARY KEY NOT NULL, white_id TEXT NOT NULL, black_id TEXT NOT NULL, control TEXT NOT NULL CHECK(control IN ('5+3','10+5')), rated INTEGER NOT NULL CHECK(rated IN (0,1)), result TEXT, finished_at INTEGER);
CREATE INDEX IF NOT EXISTS online_matches_white ON online_matches(white_id);
CREATE INDEX IF NOT EXISTS online_matches_black ON online_matches(black_id);
CREATE TABLE IF NOT EXISTS online_results (match_id TEXT PRIMARY KEY NOT NULL, processed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS ratings (user_id TEXT NOT NULL, control TEXT NOT NULL CHECK(control IN ('5+3','10+5')), rating REAL NOT NULL DEFAULT 1500, deviation REAL NOT NULL DEFAULT 350, volatility REAL NOT NULL DEFAULT 0.06, games INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id,control));
CREATE TABLE IF NOT EXISTS match_reports (id TEXT PRIMARY KEY NOT NULL, match_id TEXT NOT NULL, reporter_id TEXT NOT NULL, opponent_id TEXT NOT NULL, category TEXT NOT NULL CHECK(category IN ('assistance','presetSpam','other')), status TEXT NOT NULL DEFAULT 'open', reviewed_by TEXT, reviewed_at INTEGER, created_at INTEGER NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS match_reports_once ON match_reports(match_id,reporter_id,category);
