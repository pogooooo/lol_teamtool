/*
 * Cloudflare D1 저장소 (server/db.js의 로컬 SQLite 모듈을 D1로 이식).
 * D1도 SQLite 엔진이라 SQL은 동일하지만 API가 비동기라 전 메서드가 async다.
 * 스키마는 루트의 schema.sql — `npm run db:schema`로 적용한다.
 */

const groupRow = (r) => r && ({ id: r.id, name: r.name, joinCode: r.join_code, createdAt: r.created_at, sheetUrl: r.sheet_url ?? null });
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

        /** 연동 구글 시트 주소 저장 (null이면 해제) */
        setGroupSheet: (groupId, url) =>
            db.prepare('UPDATE groups SET sheet_url = ? WHERE id = ?').bind(url, groupId).run(),

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

        /* --- 경매 상태 공유 (실시간 관전) --- */

        getAuctionState: async (groupId) => {
            const r = await db.prepare('SELECT state, updated_at, rev FROM auction_states WHERE group_id = ?').bind(groupId).first();
            return r ? { state: r.state, updatedAt: r.updated_at, rev: r.rev ?? 0 } : null;
        },

        saveAuctionState: (groupId, stateJson) =>
            db.prepare(`
                INSERT INTO auction_states (group_id, state, updated_at, rev) VALUES (?, ?, ?, 0)
                ON CONFLICT (group_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at, rev = rev + 1
            `).bind(groupId, stateJson, Date.now()).run(),

        /** 낙관적 잠금 갱신 — rev가 일치할 때만 갱신하고 성공 여부를 반환 (팀장 제어 동시 액션 직렬화) */
        casAuctionState: async (groupId, stateJson, rev) => {
            const res = await db.prepare('UPDATE auction_states SET state = ?, rev = ?, updated_at = ? WHERE group_id = ? AND rev = ?')
                .bind(stateJson, rev + 1, Date.now(), groupId, rev).run();
            return (res.meta?.changes ?? 0) > 0;
        },

        /* --- 팀장 제어 입찰 인박스 --- */

        addAuctionBid: ({ id, groupId, teamId, lotPlayerId, amount, byName }) =>
            db.prepare('INSERT INTO auction_bids (id, group_id, created_at, team_id, lot_player_id, amount, by_name) VALUES (?, ?, ?, ?, ?, ?, ?)')
                .bind(id, groupId, Date.now(), teamId, lotPlayerId, Math.round(amount), byName || null).run(),

        listAuctionBids: async (groupId) => {
            const { results } = await db.prepare('SELECT * FROM auction_bids WHERE group_id = ? ORDER BY created_at').bind(groupId).all();
            return results.map(r => ({ id: r.id, teamId: r.team_id, lotPlayerId: r.lot_player_id, amount: r.amount, by: r.by_name ?? undefined }));
        },

        deleteAuctionBids: async (groupId, ids) => {
            if (!ids || ids.length === 0) return;
            const marks = ids.map(() => '?').join(',');
            await db.prepare(`DELETE FROM auction_bids WHERE group_id = ? AND id IN (${marks})`).bind(groupId, ...ids).run();
        },

        /* --- 참가자 코멘트 --- */

        getPlayerComment: async (playerId) => {
            const r = await db.prepare('SELECT comment FROM player_comments WHERE player_id = ?').bind(playerId).first();
            return r?.comment ?? '';
        },

        setPlayerComment: (playerId, comment) =>
            db.prepare(`
                INSERT INTO player_comments (player_id, comment, updated_at) VALUES (?, ?, ?)
                ON CONFLICT (player_id) DO UPDATE SET comment = excluded.comment, updated_at = excluded.updated_at
            `).bind(playerId, comment, Date.now()).run(),

        /* --- 라인별 티어 (주최자가 직접 지정) --- */

        listLaneTiers: async (groupId) => {
            const { results } = await db.prepare(`
                SELECT lt.player_id AS playerId, lt.position AS position, lt.tier AS tier
                FROM player_lane_tiers lt
                JOIN players p ON p.id = lt.player_id
                WHERE p.group_id = ?
            `).bind(groupId).all();
            return results;
        },

        /** tier가 null이면 지정 해제 */
        setLaneTier: (playerId, position, tier) => (tier
            ? db.prepare(`
                INSERT INTO player_lane_tiers (player_id, position, tier) VALUES (?, ?, ?)
                ON CONFLICT (player_id, position) DO UPDATE SET tier = excluded.tier
              `).bind(playerId, position, tier).run()
            : db.prepare('DELETE FROM player_lane_tiers WHERE player_id = ? AND position = ?')
                .bind(playerId, position).run()),

        /**
         * 그룹의 내전 전적을 참가자×라인으로 집계한다.
         * 같은 사람이라도 라인마다 실력이 다르므로, 팀 빌더 점수에 라인 숙련도를 얹는 데 쓴다.
         */
        listLaneStats: async (groupId) => {
            const { results } = await db.prepare(`
                SELECT mp.player_id AS playerId, mp.position AS position,
                       COUNT(*) AS games,
                       SUM(CASE WHEN mp.side = m.winning_side THEN 1 ELSE 0 END) AS wins
                FROM match_participants mp
                JOIN matches m ON m.id = mp.match_id
                WHERE m.group_id = ? AND mp.player_id IS NOT NULL
                GROUP BY mp.player_id, mp.position
            `).bind(groupId).all();
            return results;
        },

        /* --- 포인트 --- */

        /** 참가자 포인트 행 (없으면 생성) */
        ensurePoints: async (groupId, playerId) => {
            await db.prepare(`
                INSERT INTO player_points (player_id, group_id, points, updated_at) VALUES (?, ?, 0, ?)
                ON CONFLICT (player_id) DO NOTHING
            `).bind(playerId, groupId, Date.now()).run();
            return db.prepare('SELECT * FROM player_points WHERE player_id = ?').bind(playerId).first();
        },

        getPoints: (playerId) =>
            db.prepare('SELECT * FROM player_points WHERE player_id = ?').bind(playerId).first(),

        /**
         * 포인트 증감. 차감(delta<0)은 잔액이 충분할 때만 반영되도록 조건부 UPDATE를 써서
         * 동시에 여러 요청이 들어와도 잔액이 음수가 되지 않게 한다.
         */
        addPoints: async (groupId, playerId, delta, reason) => {
            const need = delta < 0 ? -delta : 0;
            const res = await db.prepare(
                'UPDATE player_points SET points = points + ?, updated_at = ? WHERE player_id = ? AND points >= ?'
            ).bind(delta, Date.now(), playerId, need).run();
            if ((res.meta?.changes ?? 0) === 0) return null; // 잔액 부족

            const row = await db.prepare('SELECT points FROM player_points WHERE player_id = ?').bind(playerId).first();
            const balance = row?.points ?? 0;
            await db.prepare(
                'INSERT INTO point_log (id, group_id, player_id, delta, reason, balance, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
            ).bind(crypto.randomUUID(), groupId, playerId, delta, reason, balance, Date.now()).run();
            return balance;
        },

        /** 그룹 포인트 랭킹 (참가자 이름 포함) */
        listGroupPoints: async (groupId) => {
            const { results } = await db.prepare(`
                SELECT pp.player_id AS playerId, p.display_name AS displayName,
                       pp.points AS points, pp.title AS title, pp.frame AS frame, pp.bg AS bg,
                       CASE WHEN pp.pin IS NULL THEN 0 ELSE 1 END AS hasPin
                FROM player_points pp
                JOIN players p ON p.id = pp.player_id
                WHERE pp.group_id = ?
                ORDER BY pp.points DESC, p.display_name
            `).bind(groupId).all();
            return results;
        },

        listPointLog: async (playerId, limit = 20) => {
            const { results } = await db.prepare(
                'SELECT delta, reason, balance, created_at AS createdAt FROM point_log WHERE player_id = ? ORDER BY created_at DESC LIMIT ?'
            ).bind(playerId, limit).all();
            return results;
        },

        /** 하루 1회 행동 — 처음이면 true, 이미 했으면 false */
        claimDaily: async (playerId, kind, day) => {
            const res = await db.prepare(
                'INSERT INTO daily_claims (player_id, kind, day) VALUES (?, ?, ?) ON CONFLICT DO NOTHING'
            ).bind(playerId, kind, day).run();
            return (res.meta?.changes ?? 0) > 0;
        },

        /** 최근 연속 출석 일수 */
        checkinStreak: async (playerId) => {
            const { results } = await db.prepare(
                "SELECT day FROM daily_claims WHERE player_id = ? AND kind = 'checkin' ORDER BY day DESC LIMIT 14"
            ).bind(playerId).all();
            return results.map(r => r.day);
        },

        /* --- PIN (간이 계정) --- */

        setPin: (playerId, pin) =>
            db.prepare('UPDATE player_points SET pin = ?, updated_at = ? WHERE player_id = ?')
                .bind(pin, Date.now(), playerId).run(),

        /* --- 상점 --- */

        listInventory: async (playerId) => {
            const { results } = await db.prepare('SELECT item_id AS itemId FROM inventory WHERE player_id = ?')
                .bind(playerId).all();
            return results.map(r => r.itemId);
        },

        addInventory: async (playerId, itemId) => {
            const res = await db.prepare(
                'INSERT INTO inventory (player_id, item_id, acquired_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING'
            ).bind(playerId, itemId, Date.now()).run();
            return (res.meta?.changes ?? 0) > 0;
        },

        equipItem: (playerId, kind, itemId) => {
            const col = kind === 'title' ? 'title' : kind === 'bg' ? 'bg' : 'frame';
            return db.prepare(`UPDATE player_points SET ${col} = ?, updated_at = ? WHERE player_id = ?`)
                .bind(itemId, Date.now(), playerId).run();
        },

        /* --- 베팅 판 (그룹 공유) --- */

        addBetRound: ({ id, groupId, title, choices, creatorId }) =>
            db.prepare('INSERT INTO bet_rounds (id, group_id, title, choices, status, creator_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
                .bind(id, groupId, title, JSON.stringify(choices), 'open', creatorId, Date.now()).run(),

        getBetRound: (roundId) =>
            db.prepare('SELECT * FROM bet_rounds WHERE id = ?').bind(roundId).first(),

        listBetRounds: async (groupId, limit = 8) => {
            const { results } = await db.prepare(`
                SELECT br.*, p.display_name AS creatorName
                FROM bet_rounds br LEFT JOIN players p ON p.id = br.creator_id
                WHERE br.group_id = ?
                ORDER BY (br.status IN ('open','locked')) DESC, br.created_at DESC
                LIMIT ?
            `).bind(groupId, limit).all();
            return results;
        },

        setBetRoundStatus: (roundId, status, winner = null) =>
            db.prepare('UPDATE bet_rounds SET status = ?, winner = ? WHERE id = ?')
                .bind(status, winner, roundId).run(),

        /* --- 베팅 --- */

        addBet: ({ id, groupId, subject, playerId, choice, amount }) =>
            db.prepare('INSERT INTO bets (id, group_id, subject, player_id, choice, amount, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
                .bind(id, groupId, subject, playerId, choice, amount, 'open', Date.now()).run(),

        listBets: async (groupId, subject) => {
            const { results } = await db.prepare(`
                SELECT b.id, b.player_id AS playerId, p.display_name AS displayName,
                       b.choice, b.amount, b.status
                FROM bets b LEFT JOIN players p ON p.id = b.player_id
                WHERE b.group_id = ? AND b.subject = ?
                ORDER BY b.created_at
            `).bind(groupId, subject).all();
            return results;
        },

        openBetsOf: async (groupId, subject) => {
            const { results } = await db.prepare(
                "SELECT * FROM bets WHERE group_id = ? AND subject = ? AND status = 'open'"
            ).bind(groupId, subject).all();
            return results;
        },

        markBet: (betId, status) =>
            db.prepare('UPDATE bets SET status = ? WHERE id = ?').bind(status, betId).run(),

        /* --- 내전 승리 포인트 중복 방지 --- */

        claimMatchReward: async (groupId, matchId) => {
            const res = await db.prepare(
                'INSERT INTO match_rewards (match_id, group_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING'
            ).bind(matchId, groupId, Date.now()).run();
            return (res.meta?.changes ?? 0) > 0;
        },

        /* --- 문의/건의 --- */

        addFeedback: ({ id, message, contact, clientId, sent }) =>
            db.prepare('INSERT INTO feedback (id, created_at, message, contact, client_id, sent) VALUES (?, ?, ?, ?, ?, ?)')
                .bind(id, Date.now(), message, contact || null, clientId || null, sent ? 1 : 0).run(),

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
