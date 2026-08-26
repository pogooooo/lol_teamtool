import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * 로컬 SQLite 저장소 (PLANNING.md 6.3 데이터 모델의 로컬 버전).
 * 프로덕션 전환 시 이 모듈을 Supabase/Postgres 쿼리로 교체한다.
 */

const dataDir = join(dirname(fileURLToPath(import.meta.url)), 'data');
mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(join(dataDir, 'archive.sqlite'));

db.exec('PRAGMA foreign_keys = ON');

// 마이그레이션: 기존 DB에 metadata 컬럼이 없으면 추가
try {
    db.exec('ALTER TABLE tournament_codes ADD COLUMN metadata TEXT');
} catch { /* 이미 존재 */ }
// 마이그레이션: auction_states에 rev(낙관적 잠금) 컬럼 추가
try {
    db.exec('ALTER TABLE auction_states ADD COLUMN rev INTEGER NOT NULL DEFAULT 0');
} catch { /* 이미 존재 */ }
// 마이그레이션: player_points에 배경 장식 컬럼 추가
try {
    db.exec('ALTER TABLE player_points ADD COLUMN bg TEXT');
} catch { /* 이미 존재 */ }
// 마이그레이션: groups에 연동 구글 시트 주소 추가
try {
    db.exec('ALTER TABLE groups ADD COLUMN sheet_url TEXT');
} catch { /* 이미 존재 */ }
db.exec(`
CREATE TABLE IF NOT EXISTS groups (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    join_code  TEXT UNIQUE NOT NULL,
    created_at INTEGER NOT NULL,
    sheet_url  TEXT
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
    updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS auction_bids (
    id           TEXT PRIMARY KEY,
    group_id     TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    created_at   INTEGER NOT NULL,
    team_id      TEXT NOT NULL,
    lot_player_id TEXT NOT NULL,
    amount       INTEGER NOT NULL,
    by_name      TEXT
);
CREATE TABLE IF NOT EXISTS player_comments (
    player_id  TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
    comment    TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
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
CREATE TABLE IF NOT EXISTS point_log (
    id         TEXT PRIMARY KEY,
    group_id   TEXT NOT NULL,
    player_id  TEXT NOT NULL,
    delta      INTEGER NOT NULL,
    reason     TEXT NOT NULL,
    balance    INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS daily_claims (
    player_id TEXT NOT NULL,
    kind      TEXT NOT NULL,
    day       TEXT NOT NULL,
    PRIMARY KEY (player_id, kind, day)
);
CREATE TABLE IF NOT EXISTS inventory (
    player_id   TEXT NOT NULL,
    item_id     TEXT NOT NULL,
    acquired_at INTEGER NOT NULL,
    PRIMARY KEY (player_id, item_id)
);
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
`);

/* --- 조회 --- */

const groupRow = (r) => r && ({ id: r.id, name: r.name, joinCode: r.join_code, createdAt: r.created_at, sheetUrl: r.sheet_url ?? null });
const playerRow = (r) => r && ({ id: r.id, groupId: r.group_id, displayName: r.display_name });
const accountRow = (r) => r && ({
    id: r.id, playerId: r.player_id, gameName: r.game_name,
    tagLine: r.tag_line, puuid: r.puuid, isPrimary: !!r.is_primary,
});

/* 그룹 목록은 브라우저(클라이언트)별 멤버십으로 분리된다 */
export const listGroupsFor = (clientId) =>
    db.prepare(`
        SELECT g.* FROM groups g
        JOIN memberships ms ON ms.group_id = g.id
        WHERE ms.client_id = ?
        ORDER BY g.created_at
    `).all(clientId).map(groupRow);

export const addMembership = (clientId, groupId) =>
    db.prepare('INSERT OR IGNORE INTO memberships (client_id, group_id, joined_at) VALUES (?, ?, ?)')
        .run(clientId, groupId, Date.now());

/** 나가기 — 남은 멤버 수를 반환한다 (0이면 호출측에서 그룹 데이터 삭제) */
export const removeMembership = (clientId, groupId) => {
    db.prepare('DELETE FROM memberships WHERE client_id = ? AND group_id = ?').run(clientId, groupId);
    return db.prepare('SELECT COUNT(*) AS c FROM memberships WHERE group_id = ?').get(groupId).c;
};

export const getGroup = (groupId) =>
    groupRow(db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId));

/** 연동 구글 시트 주소 저장 (null이면 해제) */
export const setGroupSheet = (groupId, url) =>
    db.prepare('UPDATE groups SET sheet_url = ? WHERE id = ?').run(url, groupId);

/** 그룹 삭제 — 참가자/계정/매치/토너먼트 코드/멤버십이 FK CASCADE로 함께 삭제된다 */
export const deleteGroup = (groupId) =>
    db.prepare('DELETE FROM groups WHERE id = ?').run(groupId);

export const findGroupByCode = (code) =>
    groupRow(db.prepare('SELECT * FROM groups WHERE join_code = ?').get(code));

export const createGroup = ({ id, name, joinCode, createdAt }) => {
    db.prepare('INSERT INTO groups (id, name, join_code, created_at) VALUES (?, ?, ?, ?)')
        .run(id, name, joinCode, createdAt);
    return groupRow(db.prepare('SELECT * FROM groups WHERE id = ?').get(id));
};

export const listPlayers = (groupId) =>
    db.prepare('SELECT * FROM players WHERE group_id = ? ORDER BY rowid').all(groupId).map(playerRow);

export const listAccountsByPlayer = (playerId) =>
    db.prepare('SELECT * FROM riot_accounts WHERE player_id = ? ORDER BY rowid').all(playerId).map(accountRow);

export const listAccountsByGroup = (groupId) =>
    db.prepare(`
        SELECT a.* FROM riot_accounts a
        JOIN players p ON p.id = a.player_id
        WHERE p.group_id = ? ORDER BY a.rowid
    `).all(groupId).map(accountRow);

export const addPlayer = ({ id, groupId, displayName }) => {
    db.prepare('INSERT OR IGNORE INTO players (id, group_id, display_name) VALUES (?, ?, ?)')
        .run(id, groupId, displayName);
};

export const removePlayer = (playerId) => {
    // 기록은 보존하고 연결만 끊는다 (용병 처리)
    db.prepare('UPDATE match_participants SET player_id = NULL WHERE player_id = ?').run(playerId);
    db.prepare('DELETE FROM players WHERE id = ?').run(playerId);
};

export const getPlayer = (playerId) =>
    playerRow(db.prepare('SELECT * FROM players WHERE id = ?').get(playerId));

export const addAccount = ({ id, playerId, groupId, gameName, tagLine, puuid }) => {
    const hasPrimary = db.prepare('SELECT 1 FROM riot_accounts WHERE player_id = ? AND is_primary = 1').get(playerId);
    db.prepare(`
        INSERT INTO riot_accounts (id, player_id, game_name, tag_line, puuid, is_primary)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, playerId, gameName, tagLine, puuid, hasPrimary ? 0 : 1);
    // 과거 수집 기록 중 이 계정으로 뛴 판을 소급 연결 (같은 그룹 안에서만)
    db.prepare(`
        UPDATE match_participants SET player_id = ?
        WHERE puuid = ? AND match_id IN (SELECT id FROM matches WHERE group_id = ?)
    `).run(playerId, puuid, groupId);
};

export const removeAccount = (accountId) => {
    const acc = db.prepare('SELECT * FROM riot_accounts WHERE id = ?').get(accountId);
    if (!acc) return;
    db.prepare('DELETE FROM riot_accounts WHERE id = ?').run(accountId);
    if (acc.is_primary) {
        const heir = db.prepare('SELECT id FROM riot_accounts WHERE player_id = ? LIMIT 1').get(acc.player_id);
        if (heir) db.prepare('UPDATE riot_accounts SET is_primary = 1 WHERE id = ?').run(heir.id);
    }
};

export const setPrimaryAccount = (accountId) => {
    const acc = db.prepare('SELECT * FROM riot_accounts WHERE id = ?').get(accountId);
    if (!acc) return;
    db.prepare('UPDATE riot_accounts SET is_primary = (id = ?) WHERE player_id = ?').run(accountId, acc.player_id);
};

// 같은 그룹 안에서만 계정 중복을 막는다 (같은 계정이 다른 그룹에는 등록될 수 있어야 함)
export const findAccountInGroup = (groupId, puuid) =>
    accountRow(db.prepare(`
        SELECT a.* FROM riot_accounts a
        JOIN players p ON p.id = a.player_id
        WHERE p.group_id = ? AND a.puuid = ?
    `).get(groupId, puuid));

/* --- 매치 --- */

export const hasMatch = (groupId, riotMatchId) =>
    !!db.prepare('SELECT 1 FROM matches WHERE group_id = ? AND riot_match_id = ?').get(groupId, riotMatchId);

export const insertMatch = (match) => {
    const insertM = db.prepare(`
        INSERT OR IGNORE INTO matches (id, group_id, riot_match_id, source, game_start, duration_sec, winning_side, raw_info)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertP = db.prepare(`
        INSERT INTO match_participants
            (match_id, player_id, puuid, riot_id, side, position, champion, kills, deaths, assists, gold, cs, vision_score, raw)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const res = insertM.run(
        match.id, match.groupId, match.riotMatchId, match.source,
        match.gameStart, match.durationSec, match.winningSide,
        match.rawInfo ?? null,
    );
    if (res.changes === 0) return false; // 이미 수집된 매치
    for (const pt of match.participants) {
        insertP.run(
            match.id, pt.playerId ?? null, pt.puuid, pt.riotId, pt.side, pt.position, pt.champion,
            pt.kills, pt.deaths, pt.assists, pt.gold, pt.cs, pt.visionScore,
            pt.raw ?? null,
        );
    }
    return true;
};

/** 참가자 원본 JSON에서 화면용 부가 지표(아이템/레벨/딜량/스펠)를 꺼낸다 */
const parseExtras = (raw) => {
    if (!raw) return {};
    try {
        const p = JSON.parse(raw);
        return {
            champLevel: p.champLevel ?? null,
            items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6].map(x => x ?? 0),
            damage: p.totalDamageDealtToChampions ?? null,
            spells: [p.summoner1Id, p.summoner2Id].filter(x => x != null),
        };
    } catch {
        return {};
    }
};

export const listMatches = (groupId) => {
    const matches = db.prepare('SELECT * FROM matches WHERE group_id = ? ORDER BY game_start DESC').all(groupId);
    const parts = db.prepare(`
        SELECT mp.* FROM match_participants mp
        JOIN matches m ON m.id = mp.match_id
        WHERE m.group_id = ?
        ORDER BY mp.id
    `).all(groupId);
    const byMatch = new Map();
    for (const p of parts) {
        if (!byMatch.has(p.match_id)) byMatch.set(p.match_id, []);
        byMatch.get(p.match_id).push({
            puuid: p.puuid,
            playerId: p.player_id,
            riotId: p.riot_id,
            side: p.side,
            position: p.position,
            champion: p.champion,
            kills: p.kills,
            deaths: p.deaths,
            assists: p.assists,
            gold: p.gold,
            cs: p.cs,
            visionScore: p.vision_score,
            ...parseExtras(p.raw),
        });
    }
    return matches.map(m => ({
        id: m.id,
        groupId: m.group_id,
        riotMatchId: m.riot_match_id,
        source: m.source,
        gameStart: m.game_start,
        durationSec: m.duration_sec,
        winningSide: m.winning_side,
        participants: byMatch.get(m.id) ?? [],
    }));
};

export const deleteMatch = (matchId) =>
    db.prepare('DELETE FROM matches WHERE id = ?').run(matchId);

/** 매치의 저장된 원본 데이터 전체 (기획 5장: 전부 저장 → "상세정보 보기"에서 모두 노출) */
export const getMatchDetail = (matchId) => {
    const m = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
    if (!m) return null;
    const parse = (s) => {
        try { return s ? JSON.parse(s) : null; } catch { return null; }
    };
    const parts = db.prepare('SELECT * FROM match_participants WHERE match_id = ? ORDER BY id').all(matchId);
    return {
        id: m.id,
        riotMatchId: m.riot_match_id,
        source: m.source,
        gameStart: m.game_start,
        durationSec: m.duration_sec,
        winningSide: m.winning_side,
        rawInfo: parse(m.raw_info),
        participants: parts.map(p => ({
            puuid: p.puuid,
            playerId: p.player_id,
            riotId: p.riot_id,
            side: p.side,
            position: p.position,
            champion: p.champion,
            raw: parse(p.raw),
        })),
    };
};

/* --- 토너먼트 (Stub) --- */

export const getTournament = (groupId) => {
    const r = db.prepare('SELECT * FROM tournaments WHERE group_id = ?').get(groupId);
    return r
        ? { providerId: r.provider_id, tournamentId: r.tournament_id, region: r.region, createdAt: r.created_at }
        : null;
};

export const saveTournament = ({ groupId, providerId, tournamentId, region }) => {
    db.prepare(`
        INSERT INTO tournaments (group_id, provider_id, tournament_id, region, created_at)
        VALUES (?, ?, ?, ?, ?)
    `).run(groupId, providerId, tournamentId, region, Date.now());
};

const codeRowToJson = (r) => ({
    code: r.code,
    createdAt: r.created_at,
    teamSize: r.team_size,
    pickType: r.pick_type,
    mapType: r.map_type,
    spectatorType: r.spectator_type,
    metadata: r.metadata ?? '',
});

export const listTournamentCodes = (groupId) =>
    db.prepare('SELECT * FROM tournament_codes WHERE group_id = ? ORDER BY created_at DESC').all(groupId)
        .map(codeRowToJson);

export const getTournamentCode = (code) => {
    const r = db.prepare('SELECT * FROM tournament_codes WHERE code = ?').get(code);
    return r ? { ...codeRowToJson(r), groupId: r.group_id } : null;
};

export const deleteTournamentCode = (code) =>
    db.prepare('DELETE FROM tournament_codes WHERE code = ?').run(code);

export const saveTournamentCodes = (groupId, codes, params) => {
    const st = db.prepare(`
        INSERT OR IGNORE INTO tournament_codes (code, group_id, created_at, team_size, pick_type, map_type, spectator_type, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    for (const code of codes) {
        st.run(code, groupId, now, params.teamSize, params.pickType, params.mapType, params.spectatorType, params.metadata ?? '');
    }
};

/* --- 경매 상태 공유 (실시간 관전) --- */

export const getAuctionState = (groupId) => {
    const r = db.prepare('SELECT state, updated_at, rev FROM auction_states WHERE group_id = ?').get(groupId);
    return r ? { state: r.state, updatedAt: r.updated_at, rev: r.rev ?? 0 } : null;
};

export const saveAuctionState = (groupId, stateJson) =>
    db.prepare(`
        INSERT INTO auction_states (group_id, state, updated_at, rev) VALUES (?, ?, ?, 0)
        ON CONFLICT (group_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at, rev = rev + 1
    `).run(groupId, stateJson, Date.now());

/** 낙관적 잠금 갱신 — rev 일치 시에만 갱신하고 성공 여부 반환 */
export const casAuctionState = (groupId, stateJson, rev) => {
    const res = db.prepare('UPDATE auction_states SET state = ?, rev = ?, updated_at = ? WHERE group_id = ? AND rev = ?')
        .run(stateJson, rev + 1, Date.now(), groupId, rev);
    return res.changes > 0;
};

/* --- 팀장 제어 입찰 인박스 --- */

export const addAuctionBid = ({ id, groupId, teamId, lotPlayerId, amount, byName }) =>
    db.prepare('INSERT INTO auction_bids (id, group_id, created_at, team_id, lot_player_id, amount, by_name) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, groupId, Date.now(), teamId, lotPlayerId, Math.round(amount), byName || null);

export const listAuctionBids = (groupId) =>
    db.prepare('SELECT * FROM auction_bids WHERE group_id = ? ORDER BY created_at').all(groupId)
        .map(r => ({ id: r.id, teamId: r.team_id, lotPlayerId: r.lot_player_id, amount: r.amount, by: r.by_name ?? undefined }));

export const deleteAuctionBids = (groupId, ids) => {
    if (!ids || ids.length === 0) return;
    const marks = ids.map(() => '?').join(',');
    db.prepare(`DELETE FROM auction_bids WHERE group_id = ? AND id IN (${marks})`).run(groupId, ...ids);
};

/* --- 참가자 코멘트 --- */

export const getPlayerComment = (playerId) =>
    db.prepare('SELECT comment FROM player_comments WHERE player_id = ?').get(playerId)?.comment ?? '';

export const setPlayerComment = (playerId, comment) =>
    db.prepare(`
        INSERT INTO player_comments (player_id, comment, updated_at) VALUES (?, ?, ?)
        ON CONFLICT (player_id) DO UPDATE SET comment = excluded.comment, updated_at = excluded.updated_at
    `).run(playerId, comment, Date.now());

/* --- 라인별 티어 --- */

export const listLaneTiers = (groupId) =>
    db.prepare(`
        SELECT lt.player_id AS playerId, lt.position AS position, lt.tier AS tier
        FROM player_lane_tiers lt
        JOIN players p ON p.id = lt.player_id
        WHERE p.group_id = ?
    `).all(groupId);

export const setLaneTier = (playerId, position, tier) => (tier
    ? db.prepare(`
        INSERT INTO player_lane_tiers (player_id, position, tier) VALUES (?, ?, ?)
        ON CONFLICT (player_id, position) DO UPDATE SET tier = excluded.tier
      `).run(playerId, position, tier)
    : db.prepare('DELETE FROM player_lane_tiers WHERE player_id = ? AND position = ?').run(playerId, position));

/** 그룹의 내전 전적을 참가자×라인으로 집계 (functions/_lib/db.js와 동일) */
export const listLaneStats = (groupId) =>
    db.prepare(`
        SELECT mp.player_id AS playerId, mp.position AS position,
               COUNT(*) AS games,
               SUM(CASE WHEN mp.side = m.winning_side THEN 1 ELSE 0 END) AS wins
        FROM match_participants mp
        JOIN matches m ON m.id = mp.match_id
        WHERE m.group_id = ? AND mp.player_id IS NOT NULL
        GROUP BY mp.player_id, mp.position
    `).all(groupId);

/* --- 포인트 (functions/_lib/db.js와 동일 규칙) --- */

export const ensurePoints = (groupId, playerId) => {
    db.prepare('INSERT OR IGNORE INTO player_points (player_id, group_id, points, updated_at) VALUES (?, ?, 0, ?)')
        .run(playerId, groupId, Date.now());
    return db.prepare('SELECT * FROM player_points WHERE player_id = ?').get(playerId);
};

export const getPoints = (playerId) =>
    db.prepare('SELECT * FROM player_points WHERE player_id = ?').get(playerId);

export const addPoints = (groupId, playerId, delta, reason) => {
    const need = delta < 0 ? -delta : 0;
    const res = db.prepare('UPDATE player_points SET points = points + ?, updated_at = ? WHERE player_id = ? AND points >= ?')
        .run(delta, Date.now(), playerId, need);
    if (res.changes === 0) return null;
    const balance = db.prepare('SELECT points FROM player_points WHERE player_id = ?').get(playerId)?.points ?? 0;
    db.prepare('INSERT INTO point_log (id, group_id, player_id, delta, reason, balance, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(randomUUID(), groupId, playerId, delta, reason, balance, Date.now());
    return balance;
};

export const listGroupPoints = (groupId) =>
    db.prepare(`
        SELECT pp.player_id AS playerId, p.display_name AS displayName,
               pp.points AS points, pp.title AS title, pp.frame AS frame, pp.bg AS bg,
               CASE WHEN pp.pin IS NULL THEN 0 ELSE 1 END AS hasPin
        FROM player_points pp JOIN players p ON p.id = pp.player_id
        WHERE pp.group_id = ? ORDER BY pp.points DESC, p.display_name
    `).all(groupId);

export const listPointLog = (playerId, limit = 20) =>
    db.prepare('SELECT delta, reason, balance, created_at AS createdAt FROM point_log WHERE player_id = ? ORDER BY created_at DESC LIMIT ?')
        .all(playerId, limit);

export const claimDaily = (playerId, kind, day) =>
    db.prepare('INSERT OR IGNORE INTO daily_claims (player_id, kind, day) VALUES (?, ?, ?)')
        .run(playerId, kind, day).changes > 0;

export const checkinStreak = (playerId) =>
    db.prepare("SELECT day FROM daily_claims WHERE player_id = ? AND kind = 'checkin' ORDER BY day DESC LIMIT 14")
        .all(playerId).map(r => r.day);

export const setPin = (playerId, pin) =>
    db.prepare('UPDATE player_points SET pin = ?, updated_at = ? WHERE player_id = ?').run(pin, Date.now(), playerId);

export const listInventory = (playerId) =>
    db.prepare('SELECT item_id AS itemId FROM inventory WHERE player_id = ?').all(playerId).map(r => r.itemId);

export const addInventory = (playerId, itemId) =>
    db.prepare('INSERT OR IGNORE INTO inventory (player_id, item_id, acquired_at) VALUES (?, ?, ?)')
        .run(playerId, itemId, Date.now()).changes > 0;

export const equipItem = (playerId, kind, itemId) => {
    const col = kind === 'title' ? 'title' : kind === 'bg' ? 'bg' : 'frame';
    return db.prepare(`UPDATE player_points SET ${col} = ?, updated_at = ? WHERE player_id = ?`)
        .run(itemId, Date.now(), playerId);
};

export const addBetRound = ({ id, groupId, title, choices, creatorId }) =>
    db.prepare('INSERT INTO bet_rounds (id, group_id, title, choices, status, creator_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, groupId, title, JSON.stringify(choices), 'open', creatorId, Date.now());

export const getBetRound = (roundId) =>
    db.prepare('SELECT * FROM bet_rounds WHERE id = ?').get(roundId);

export const listBetRounds = (groupId, limit = 8) =>
    db.prepare(`
        SELECT br.*, p.display_name AS creatorName
        FROM bet_rounds br LEFT JOIN players p ON p.id = br.creator_id
        WHERE br.group_id = ?
        ORDER BY (br.status IN ('open','locked')) DESC, br.created_at DESC
        LIMIT ?
    `).all(groupId, limit);

export const setBetRoundStatus = (roundId, status, winner = null) =>
    db.prepare('UPDATE bet_rounds SET status = ?, winner = ? WHERE id = ?').run(status, winner, roundId);

export const addBet = ({ id, groupId, subject, playerId, choice, amount }) =>
    db.prepare('INSERT INTO bets (id, group_id, subject, player_id, choice, amount, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, groupId, subject, playerId, choice, amount, 'open', Date.now());

export const listBets = (groupId, subject) =>
    db.prepare(`
        SELECT b.id, b.player_id AS playerId, p.display_name AS displayName, b.choice, b.amount, b.status
        FROM bets b LEFT JOIN players p ON p.id = b.player_id
        WHERE b.group_id = ? AND b.subject = ? ORDER BY b.created_at
    `).all(groupId, subject);

export const openBetsOf = (groupId, subject) =>
    db.prepare("SELECT * FROM bets WHERE group_id = ? AND subject = ? AND status = 'open'").all(groupId, subject);

export const markBet = (betId, status) =>
    db.prepare('UPDATE bets SET status = ? WHERE id = ?').run(status, betId);

export const claimMatchReward = (groupId, matchId) =>
    db.prepare('INSERT OR IGNORE INTO match_rewards (match_id, group_id, created_at) VALUES (?, ?, ?)')
        .run(matchId, groupId, Date.now()).changes > 0;

/* --- 문의/건의 --- */

export const addFeedback = ({ id, message, contact, clientId, sent }) =>
    db.prepare('INSERT INTO feedback (id, created_at, message, contact, client_id, sent) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, Date.now(), message, contact || null, clientId || null, sent ? 1 : 0);

/** 요약 통계 — 출전 횟수 등 고정 집계는 SQL로 계산 */
export const groupStats = (groupId) => {
    const total = db.prepare('SELECT COUNT(*) AS c FROM matches WHERE group_id = ?').get(groupId).c;
    const top = db.prepare(`
        SELECT p.display_name AS name, COUNT(*) AS c
        FROM match_participants mp
        JOIN matches m ON m.id = mp.match_id
        JOIN players p ON p.id = mp.player_id
        WHERE m.group_id = ? AND mp.player_id IS NOT NULL
        GROUP BY mp.player_id
        ORDER BY c DESC, p.display_name
        LIMIT 1
    `).get(groupId);
    const latest = db.prepare('SELECT game_start FROM matches WHERE group_id = ? ORDER BY game_start DESC LIMIT 1').get(groupId);
    return {
        totalMatches: total,
        topPlayerName: top?.name ?? null,
        topPlayerCount: top?.c ?? 0,
        latestGameStart: latest?.game_start ?? null,
    };
};

/** 참가자별 출전/승수 순위 — 출전순·승률순 토글은 클라이언트에서 정렬한다 */
export const playerRankings = (groupId) =>
    db.prepare(`
        SELECT p.id AS playerId, p.display_name AS displayName,
            COUNT(m.id) AS games,
            COALESCE(SUM(CASE WHEN mp.side = m.winning_side THEN 1 ELSE 0 END), 0) AS wins
        FROM players p
        LEFT JOIN match_participants mp ON mp.player_id = p.id
        LEFT JOIN matches m ON m.id = mp.match_id
        WHERE p.group_id = ?
        GROUP BY p.id
        ORDER BY games DESC, p.display_name
    `).all(groupId);
