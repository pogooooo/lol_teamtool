/*
 * Cloudflare D1 저장소 (server/db.js의 로컬 SQLite 모듈을 D1로 이식).
 * D1도 SQLite 엔진이라 SQL은 동일하지만 API가 비동기라 전 메서드가 async다.
 * 스키마는 루트의 schema.sql — `npm run db:schema`로 적용한다.
 */

const groupRow = (r) => r && ({ id: r.id, name: r.name, joinCode: r.join_code, createdAt: r.created_at });
const playerRow = (r) => r && ({ id: r.id, groupId: r.group_id, displayName: r.display_name });
const accountRow = (r) => r && ({
    id: r.id, playerId: r.player_id, gameName: r.game_name,
    tagLine: r.tag_line, puuid: r.puuid, isPrimary: !!r.is_primary,
});

/** 요청 단위 저장소 팩토리 — db는 env.DB (D1 바인딩) */
export const makeStore = (db) => {
    const store = {
        /* --- 그룹 / 멤버십 --- */

        /* 그룹 목록은 브라우저(클라이언트)별 멤버십으로 분리된다 */
        listGroupsFor: async (clientId) => {
            const { results } = await db.prepare(`
                SELECT g.* FROM groups g
                JOIN memberships ms ON ms.group_id = g.id
                WHERE ms.client_id = ?
                ORDER BY g.created_at
            `).bind(clientId).all();
            return results.map(groupRow);
        },

        addMembership: (clientId, groupId) =>
            db.prepare('INSERT OR IGNORE INTO memberships (client_id, group_id, joined_at) VALUES (?, ?, ?)')
                .bind(clientId, groupId, Date.now()).run(),

        /** 나가기 — 남은 멤버 수를 반환한다 (0이면 호출측에서 그룹 데이터 삭제) */
        removeMembership: async (clientId, groupId) => {
            await db.prepare('DELETE FROM memberships WHERE client_id = ? AND group_id = ?').bind(clientId, groupId).run();
            const row = await db.prepare('SELECT COUNT(*) AS c FROM memberships WHERE group_id = ?').bind(groupId).first();
            return row?.c ?? 0;
        },

        getGroup: async (groupId) =>
            groupRow(await db.prepare('SELECT * FROM groups WHERE id = ?').bind(groupId).first()),

        /** 그룹 삭제 — 참가자/계정/매치/토너먼트 코드/멤버십이 FK CASCADE로 함께 삭제된다 */
        deleteGroup: (groupId) =>
            db.prepare('DELETE FROM groups WHERE id = ?').bind(groupId).run(),

        findGroupByCode: async (code) =>
            groupRow(await db.prepare('SELECT * FROM groups WHERE join_code = ?').bind(code).first()),

        createGroup: async ({ id, name, joinCode, createdAt }) => {
            await db.prepare('INSERT INTO groups (id, name, join_code, created_at) VALUES (?, ?, ?, ?)')
                .bind(id, name, joinCode, createdAt).run();
            return store.getGroup(id);
        },

        /* --- 참가자 / 계정 --- */

        listPlayers: async (groupId) => {
            const { results } = await db.prepare('SELECT * FROM players WHERE group_id = ? ORDER BY rowid').bind(groupId).all();
            return results.map(playerRow);
        },

        listAccountsByPlayer: async (playerId) => {
            const { results } = await db.prepare('SELECT * FROM riot_accounts WHERE player_id = ? ORDER BY rowid').bind(playerId).all();
            return results.map(accountRow);
        },

        listAccountsByGroup: async (groupId) => {
            const { results } = await db.prepare(`
                SELECT a.* FROM riot_accounts a
                JOIN players p ON p.id = a.player_id
                WHERE p.group_id = ? ORDER BY a.rowid
            `).bind(groupId).all();
            return results.map(accountRow);
        },

        addPlayer: ({ id, groupId, displayName }) =>
            db.prepare('INSERT OR IGNORE INTO players (id, group_id, display_name) VALUES (?, ?, ?)')
                .bind(id, groupId, displayName).run(),

        removePlayer: (playerId) =>
            // 기록은 보존하고 연결만 끊는다 (용병 처리)
            db.batch([
                db.prepare('UPDATE match_participants SET player_id = NULL WHERE player_id = ?').bind(playerId),
                db.prepare('DELETE FROM players WHERE id = ?').bind(playerId),
            ]),

        getPlayer: async (playerId) =>
            playerRow(await db.prepare('SELECT * FROM players WHERE id = ?').bind(playerId).first()),

        addAccount: async ({ id, playerId, groupId, gameName, tagLine, puuid }) => {
            const hasPrimary = await db.prepare('SELECT 1 AS x FROM riot_accounts WHERE player_id = ? AND is_primary = 1')
                .bind(playerId).first();
            await db.batch([
                db.prepare(`
                    INSERT INTO riot_accounts (id, player_id, game_name, tag_line, puuid, is_primary)
                    VALUES (?, ?, ?, ?, ?, ?)
                `).bind(id, playerId, gameName, tagLine, puuid, hasPrimary ? 0 : 1),
                // 과거 수집 기록 중 이 계정으로 뛴 판을 소급 연결 (같은 그룹 안에서만)
                db.prepare(`
                    UPDATE match_participants SET player_id = ?
                    WHERE puuid = ? AND match_id IN (SELECT id FROM matches WHERE group_id = ?)
                `).bind(playerId, puuid, groupId),
            ]);
        },

        removeAccount: async (accountId) => {
            const acc = await db.prepare('SELECT * FROM riot_accounts WHERE id = ?').bind(accountId).first();
            if (!acc) return;
            await db.prepare('DELETE FROM riot_accounts WHERE id = ?').bind(accountId).run();
            if (acc.is_primary) {
                const heir = await db.prepare('SELECT id FROM riot_accounts WHERE player_id = ? LIMIT 1').bind(acc.player_id).first();
                if (heir) await db.prepare('UPDATE riot_accounts SET is_primary = 1 WHERE id = ?').bind(heir.id).run();
            }
        },

        setPrimaryAccount: async (accountId) => {
            const acc = await db.prepare('SELECT * FROM riot_accounts WHERE id = ?').bind(accountId).first();
            if (!acc) return;
            await db.prepare('UPDATE riot_accounts SET is_primary = (id = ?) WHERE player_id = ?')
                .bind(accountId, acc.player_id).run();
        },

        // 같은 그룹 안에서만 계정 중복을 막는다 (같은 계정이 다른 그룹에는 등록될 수 있어야 함)
        findAccountInGroup: async (groupId, puuid) =>
            accountRow(await db.prepare(`
                SELECT a.* FROM riot_accounts a
                JOIN players p ON p.id = a.player_id
                WHERE p.group_id = ? AND a.puuid = ?
            `).bind(groupId, puuid).first()),

        /* --- 매치 --- */

        hasMatch: async (groupId, riotMatchId) =>
            !!(await db.prepare('SELECT 1 AS x FROM matches WHERE group_id = ? AND riot_match_id = ?')
                .bind(groupId, riotMatchId).first()),

        insertMatch: async (match) => {
            const res = await db.prepare(`
                INSERT OR IGNORE INTO matches (id, group_id, riot_match_id, source, game_start, duration_sec, winning_side, raw_info)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
                match.id, match.groupId, match.riotMatchId, match.source,
                match.gameStart, match.durationSec, match.winningSide,
                match.rawInfo ?? null,
            ).run();
            if ((res.meta?.changes ?? 0) === 0) return false; // 이미 수집된 매치

            const insertP = db.prepare(`
                INSERT INTO match_participants
                    (match_id, player_id, puuid, riot_id, side, position, champion, kills, deaths, assists, gold, cs, vision_score, raw)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            await db.batch(match.participants.map(pt => insertP.bind(
                match.id, pt.playerId ?? null, pt.puuid, pt.riotId, pt.side, pt.position, pt.champion,
                pt.kills, pt.deaths, pt.assists, pt.gold, pt.cs, pt.visionScore,
                pt.raw ?? null,
            )));
            return true;
        },

        listMatches: async (groupId) => {
            const [{ results: matches }, { results: parts }] = await db.batch([
                db.prepare('SELECT * FROM matches WHERE group_id = ? ORDER BY game_start DESC').bind(groupId),
                db.prepare(`
                    SELECT mp.* FROM match_participants mp
                    JOIN matches m ON m.id = mp.match_id
                    WHERE m.group_id = ?
                    ORDER BY mp.id
                `).bind(groupId),
            ]);
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
        },

        deleteMatch: (matchId) =>
            db.prepare('DELETE FROM matches WHERE id = ?').bind(matchId).run(),

        /** 매치의 저장된 원본 데이터 전체 (기획 5장: 전부 저장 → "상세정보 보기"에서 모두 노출) */
        getMatchDetail: async (matchId) => {
            const m = await db.prepare('SELECT * FROM matches WHERE id = ?').bind(matchId).first();
            if (!m) return null;
            const parse = (s) => {
                try { return s ? JSON.parse(s) : null; } catch { return null; }
            };
            const { results: parts } = await db.prepare('SELECT * FROM match_participants WHERE match_id = ? ORDER BY id')
                .bind(matchId).all();
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
        },

        /* --- 토너먼트 (Stub) --- */

        getTournament: async (groupId) => {
            const r = await db.prepare('SELECT * FROM tournaments WHERE group_id = ?').bind(groupId).first();
            return r
                ? { providerId: r.provider_id, tournamentId: r.tournament_id, region: r.region, createdAt: r.created_at }
                : null;
        },

        saveTournament: ({ groupId, providerId, tournamentId, region }) =>
            db.prepare(`
                INSERT INTO tournaments (group_id, provider_id, tournament_id, region, created_at)
                VALUES (?, ?, ?, ?, ?)
            `).bind(groupId, providerId, tournamentId, region, Date.now()).run(),

        listTournamentCodes: async (groupId) => {
            const { results } = await db.prepare('SELECT * FROM tournament_codes WHERE group_id = ? ORDER BY created_at DESC')
                .bind(groupId).all();
            return results.map(codeRowToJson);
        },

        getTournamentCode: async (code) => {
            const r = await db.prepare('SELECT * FROM tournament_codes WHERE code = ?').bind(code).first();
            return r ? { ...codeRowToJson(r), groupId: r.group_id } : null;
        },

        deleteTournamentCode: (code) =>
            db.prepare('DELETE FROM tournament_codes WHERE code = ?').bind(code).run(),

        saveTournamentCodes: async (groupId, codes, params) => {
            const st = db.prepare(`
                INSERT OR IGNORE INTO tournament_codes (code, group_id, created_at, team_size, pick_type, map_type, spectator_type, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const now = Date.now();
            await db.batch(codes.map(code =>
                st.bind(code, groupId, now, params.teamSize, params.pickType, params.mapType, params.spectatorType, params.metadata ?? ''),
            ));
        },

        /* --- 통계 --- */

        /** 요약 통계 — 출전 횟수 등 고정 집계는 SQL로 계산 */
        groupStats: async (groupId) => {
            const total = await db.prepare('SELECT COUNT(*) AS c FROM matches WHERE group_id = ?').bind(groupId).first();
            const top = await db.prepare(`
                SELECT p.display_name AS name, COUNT(*) AS c
                FROM match_participants mp
                JOIN matches m ON m.id = mp.match_id
                JOIN players p ON p.id = mp.player_id
                WHERE m.group_id = ? AND mp.player_id IS NOT NULL
                GROUP BY mp.player_id
                ORDER BY c DESC, p.display_name
                LIMIT 1
            `).bind(groupId).first();
            const latest = await db.prepare('SELECT game_start FROM matches WHERE group_id = ? ORDER BY game_start DESC LIMIT 1')
                .bind(groupId).first();
            return {
                totalMatches: total?.c ?? 0,
                topPlayerName: top?.name ?? null,
                topPlayerCount: top?.c ?? 0,
                latestGameStart: latest?.game_start ?? null,
            };
        },

        /** 참가자별 출전/승수 순위 — 출전순·승률순 토글은 클라이언트에서 정렬한다 */
        playerRankings: async (groupId) => {
            const { results } = await db.prepare(`
                SELECT p.id AS playerId, p.display_name AS displayName,
                    COUNT(m.id) AS games,
                    COALESCE(SUM(CASE WHEN mp.side = m.winning_side THEN 1 ELSE 0 END), 0) AS wins
                FROM players p
                LEFT JOIN match_participants mp ON mp.player_id = p.id
                LEFT JOIN matches m ON m.id = mp.match_id
                WHERE p.group_id = ?
                GROUP BY p.id
                ORDER BY games DESC, p.display_name
            `).bind(groupId).all();
            return results;
        },
    };
    return store;
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
