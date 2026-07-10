-- Cloudflare D1 스키마 (server/db.js의 로컬 SQLite 스키마를 D1로 이식).
-- 적용: npx wrangler d1 execute lol-teamtool --remote --file=./schema.sql
-- D1도 SQLite 엔진이라 스키마는 로컬과 동일하다.

CREATE TABLE IF NOT EXISTS groups (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    join_code  TEXT UNIQUE NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS players (
    id           TEXT PRIMARY KEY,
    group_id     TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    UNIQUE (group_id, display_name)
);
CREATE TABLE IF NOT EXISTS riot_accounts (
    id         TEXT PRIMARY KEY,
    player_id  TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    game_name  TEXT NOT NULL,
    tag_line   TEXT NOT NULL,
    puuid      TEXT NOT NULL,
    is_primary INTEGER NOT NULL DEFAULT 0,
    UNIQUE (player_id, puuid)
);
CREATE TABLE IF NOT EXISTS matches (
    id            TEXT PRIMARY KEY,
    group_id      TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    riot_match_id TEXT NOT NULL,
    source        TEXT NOT NULL,
    game_start    INTEGER NOT NULL,
    duration_sec  INTEGER NOT NULL,
    winning_side  TEXT NOT NULL,
    raw_info      TEXT,
    UNIQUE (group_id, riot_match_id)
);
CREATE TABLE IF NOT EXISTS match_participants (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id     TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    player_id    TEXT,
    puuid        TEXT NOT NULL,
    riot_id      TEXT NOT NULL,
    side         TEXT NOT NULL,
    position     TEXT NOT NULL,
    champion     TEXT NOT NULL,
    kills        INTEGER NOT NULL DEFAULT 0,
    deaths       INTEGER NOT NULL DEFAULT 0,
    assists      INTEGER NOT NULL DEFAULT 0,
    gold         INTEGER NOT NULL DEFAULT 0,
    cs           INTEGER NOT NULL DEFAULT 0,
    vision_score INTEGER NOT NULL DEFAULT 0,
    raw          TEXT
);
CREATE TABLE IF NOT EXISTS memberships (
    client_id TEXT NOT NULL,
    group_id  TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (client_id, group_id)
);
CREATE TABLE IF NOT EXISTS tournaments (
    group_id      TEXT PRIMARY KEY REFERENCES groups(id) ON DELETE CASCADE,
    provider_id   INTEGER NOT NULL,
    tournament_id INTEGER NOT NULL,
    region        TEXT NOT NULL,
    created_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tournament_codes (
    code           TEXT PRIMARY KEY,
    group_id       TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    created_at     INTEGER NOT NULL,
    team_size      INTEGER NOT NULL,
    pick_type      TEXT NOT NULL,
    map_type       TEXT NOT NULL,
    spectator_type TEXT NOT NULL,
    metadata       TEXT
);
CREATE TABLE IF NOT EXISTS feedback (
    id         TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    message    TEXT NOT NULL,
    contact    TEXT,
    client_id  TEXT,
    sent       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_matches_group_start ON matches (group_id, game_start DESC);
CREATE INDEX IF NOT EXISTS idx_participants_match  ON match_participants (match_id);
CREATE INDEX IF NOT EXISTS idx_participants_player ON match_participants (player_id);
CREATE INDEX IF NOT EXISTS idx_codes_group ON tournament_codes (group_id, created_at DESC);
