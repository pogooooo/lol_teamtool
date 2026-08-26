-- Cloudflare D1 스키마 (server/db.js의 로컬 SQLite 스키마를 D1로 이식).
-- 적용: npx wrangler d1 execute lol-teamtool --remote --file=./schema.sql
-- D1도 SQLite 엔진이라 스키마는 로컬과 동일하다.

CREATE TABLE IF NOT EXISTS groups (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    join_code  TEXT UNIQUE NOT NULL,
    created_at INTEGER NOT NULL,
    -- 연동한 구글 시트 (CSV 내려받기 주소). 기존 DB에는 아래 ALTER로 추가한다
    sheet_url  TEXT
);
-- 이미 만들어진 DB용 — 컬럼이 있으면 에러가 나므로 한 번만 실행한다
-- ALTER TABLE groups ADD COLUMN sheet_url TEXT;
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
-- 참가자별 라인 티어 — 같은 사람도 라인마다 실력이 다르므로 주최자가 직접 지정한다
CREATE TABLE IF NOT EXISTS player_lane_tiers (
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    position  TEXT NOT NULL,
    tier      TEXT NOT NULL,
    PRIMARY KEY (player_id, position)
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
CREATE TABLE IF NOT EXISTS auction_states (
    group_id   TEXT PRIMARY KEY REFERENCES groups(id) ON DELETE CASCADE,
    state      TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    rev        INTEGER NOT NULL DEFAULT 0  -- 낙관적 잠금 리비전 (팀장 제어 방식 동시 액션 직렬화)
);
-- 팀장 제어 방식 입찰 인박스 — 팀장이 각자 보낸 입찰을 진행자가 수신해 적용
CREATE TABLE IF NOT EXISTS auction_bids (
    id           TEXT PRIMARY KEY,
    group_id     TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    created_at   INTEGER NOT NULL,
    team_id      TEXT NOT NULL,
    lot_player_id TEXT NOT NULL,
    amount       INTEGER NOT NULL,
    by_name      TEXT
);
-- 참가자 코멘트 (자유 메모, 한 사람 당 하나)
CREATE TABLE IF NOT EXISTS player_comments (
    player_id  TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
    comment    TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
-- 포인트 잔액 + 간이 계정(PIN) + 장착 중인 칭호/테두리 (그룹×참가자 단위)
CREATE TABLE IF NOT EXISTS player_points (
    player_id  TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
    group_id   TEXT NOT NULL,
    points     INTEGER NOT NULL DEFAULT 0,
    pin        TEXT,
    title      TEXT,
    frame      TEXT,
    bg         TEXT,
    updated_at INTEGER NOT NULL
);
-- 포인트 증감 내역 (감사·표시용)
CREATE TABLE IF NOT EXISTS point_log (
    id         TEXT PRIMARY KEY,
    group_id   TEXT NOT NULL,
    player_id  TEXT NOT NULL,
    delta      INTEGER NOT NULL,
    reason     TEXT NOT NULL,
    balance    INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);
-- 하루 1회 제한이 있는 행동 (출석·보물찾기)
CREATE TABLE IF NOT EXISTS daily_claims (
    player_id TEXT NOT NULL,
    kind      TEXT NOT NULL,
    day       TEXT NOT NULL,
    PRIMARY KEY (player_id, kind, day)
);
-- 상점에서 구매한 칭호/테두리
CREATE TABLE IF NOT EXISTS inventory (
    player_id   TEXT NOT NULL,
    item_id     TEXT NOT NULL,
    acquired_at INTEGER NOT NULL,
    PRIMARY KEY (player_id, item_id)
);
-- 관전자 베팅 판 — 그룹 전체가 공유하는 한 판 (bets.subject가 이 id를 가리킨다)
CREATE TABLE IF NOT EXISTS bet_rounds (
    id         TEXT PRIMARY KEY,
    group_id   TEXT NOT NULL,
    title      TEXT NOT NULL,
    choices    TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'open',
    winner     TEXT,
    creator_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
-- 관전자 베팅
CREATE TABLE IF NOT EXISTS bets (
    id         TEXT PRIMARY KEY,
    group_id   TEXT NOT NULL,
    subject    TEXT NOT NULL,
    player_id  TEXT NOT NULL,
    choice     TEXT NOT NULL,
    amount     INTEGER NOT NULL,
    status     TEXT NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL
);
-- 내전 승리 포인트를 이미 지급한 매치 (중복 지급 방지)
CREATE TABLE IF NOT EXISTS match_rewards (
    match_id   TEXT PRIMARY KEY,
    group_id   TEXT NOT NULL,
    created_at INTEGER NOT NULL
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
CREATE INDEX IF NOT EXISTS idx_auction_bids_group ON auction_bids (group_id, created_at);
CREATE INDEX IF NOT EXISTS idx_point_log_player ON point_log (player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_points_group ON player_points (group_id, points DESC);
CREATE INDEX IF NOT EXISTS idx_bets_subject ON bets (group_id, subject, status);
