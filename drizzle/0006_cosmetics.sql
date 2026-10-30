CREATE TABLE player_cosmetics (
  owner TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  board TEXT NOT NULL DEFAULT 'wood' CHECK(board IN ('wood','walnut','marble')),
  pieces TEXT NOT NULL DEFAULT 'wood' CHECK(pieces IN ('wood','ebony'))
);
