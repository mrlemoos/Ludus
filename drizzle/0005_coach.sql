CREATE TABLE coach_requests (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL,
 request_key TEXT NOT NULL, fingerprint TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('review','reply')),
 review_id TEXT, month TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('pending','complete','failed')),
 reserved_micros INTEGER NOT NULL CHECK(reserved_micros >= 0), spent_micros INTEGER NOT NULL DEFAULT 0 CHECK(spent_micros >= 0),
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX coach_active_key ON coach_requests(owner, request_key) WHERE state IN ('pending','complete');
CREATE INDEX coach_quota ON coach_requests(owner, month, kind, state);
CREATE INDEX coach_budget ON coach_requests(month, state);
CREATE TABLE coach_reviews (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, match_id TEXT NOT NULL,
 language TEXT NOT NULL CHECK(language IN ('en-GB','es-ES','fr-FR')), profile TEXT NOT NULL CHECK(profile IN ('beginner','developing','club','advanced')),
 document TEXT NOT NULL, analysis TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX coach_review_owner ON coach_reviews(owner, created_at);
CREATE TABLE coach_replies (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 review_id TEXT NOT NULL REFERENCES coach_reviews(id) ON DELETE CASCADE,
 language TEXT NOT NULL CHECK(language IN ('en-GB','es-ES','fr-FR')), question TEXT NOT NULL, document TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX coach_reply_owner ON coach_replies(owner, review_id, created_at);
