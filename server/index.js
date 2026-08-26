import 'dotenv/config';
import express from 'express';
import { randomUUID } from 'node:crypto';
import * as store from './db.js';
import {
    RiotError, riotKeyConfigured, resolveAccount, listCustomMatchIds, getMatch, toMatchRecord,
    stubCreateProvider, stubCreateTournament, stubCreateCodes, stubLobbyEvents, listMatchIdsByTournamentCode,
    getSummonerByPuuid, getLeagueEntriesByPuuid,
    getChampionMasteries, getMasteryScore, listRecentMatchIds, listMatchIdsSince,
} from './riot.js';
import { getAssetMeta, getChampionImage, getItemImage, getRuneImage, getSpellImage } from './assets.js';
import { applyAuctionAction } from '../functions/_lib/auctionEngine.js';
import {
    sheetsConfigured, serviceAccountEmail, spreadsheetIdOf,
    firstSheet, firstSheetTitle, readValues, writeValues, valuesToCsv, setTierDropdown, setTierColors, beautifySheet,
    buildTierGrid,
} from '../functions/_lib/gsheets.js';
import {
    kstDay, CHECKIN_BASE, CHECKIN_STREAK_BONUS, WIN_REWARD, LOSE_REWARD, TREASURE_REWARD,
    GAMBLE_MIN, GAMBLE_MAX, playGamble, treasureSpot, SHOP_ITEMS, findItem,
} from '../functions/_lib/points.js';

/*
 * 로컬 개발용 API 서버 (M1).
 * 실행: npm run server  ·  프론트는 Vite 프록시(/api → :5175)로 접근한다.
 * 프로덕션 전환 시 이 서버의 라우트를 Cloudflare Pages Functions로 이식한다 (PLANNING.md 8장).
 */

const app = express();
app.use(express.json());

// 헷갈리는 문자(0/O, 1/I/L) 제외 8자 참여 코드
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newJoinCode = () =>
    Array.from({ length: 8 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

app.get('/api/health', (_req, res) => {
    res.json({ ok: true, riotKeyConfigured: riotKeyConfigured() });
});

/* --- 게임 에셋 프록시 (server/assets.js) --- */

app.get('/api/assets/meta', async (_req, res) => {
    try {
        const meta = await getAssetMeta();
        // 브라우저 캐시 금지 — 필드가 추가될 때 구버전 응답이 붙잡히지 않도록 (서버 메모리 캐시가 이미 있음)
        res.set('Cache-Control', 'no-store');
        res.json({
            version: meta.version,
            champNames: meta.champNames,
            champKeys: meta.champKeys ?? {},
            itemNames: meta.itemNames,
            runeNames: meta.runeNames ?? {},
            spellNames: meta.spellNames ?? {},
        });
    } catch {
        // CDN 불가 시에도 200 — 프론트는 내장 한글 맵으로 동작한다
        res.json({ version: null, champNames: {}, champKeys: {}, itemNames: {}, runeNames: {}, spellNames: {} });
    }
});

app.get('/api/assets/champion/:id', async (req, res) => {
    try {
        const buf = await getChampionImage(req.params.id);
        res.set('Content-Type', 'image/png').set('Cache-Control', 'public, max-age=86400').send(buf);
    } catch {
        res.status(404).end();
    }
});

app.get('/api/assets/item/:id', async (req, res) => {
    try {
        const buf = await getItemImage(req.params.id);
        res.set('Content-Type', 'image/png').set('Cache-Control', 'public, max-age=86400').send(buf);
    } catch {
        res.status(404).end();
    }
});

app.get('/api/assets/rune/:id', async (req, res) => {
    try {
        const buf = await getRuneImage(req.params.id);
        res.set('Content-Type', 'image/png').set('Cache-Control', 'public, max-age=86400').send(buf);
    } catch {
        res.status(404).end();
    }
});

app.get('/api/assets/spell/:id', async (req, res) => {
    try {
        const buf = await getSpellImage(req.params.id);
        res.set('Content-Type', 'image/png').set('Cache-Control', 'public, max-age=86400').send(buf);
    } catch {
        res.status(404).end();
    }
});

/* --- 그룹 ---
 * 그룹 "목록"은 브라우저별 클라이언트 ID(X-Client-Id 헤더)로 분리된다.
 * 그룹 "내용" 접근은 참여 코드 기반 격리 원칙 유지 (PLANNING.md 6.1).
 */

const clientIdOf = (req) => String(req.header('x-client-id') ?? '').slice(0, 64);

app.get('/api/groups', (req, res) => {
    const clientId = clientIdOf(req);
    res.json(clientId ? store.listGroupsFor(clientId) : []);
});

app.post('/api/groups', (req, res) => {
    const clientId = clientIdOf(req);
    if (!clientId) return res.status(400).json({ error: '클라이언트 식별자가 없습니다. 새로고침 후 다시 시도해 주세요.' });
    const name = String(req.body?.name ?? '').trim();
    if (!name) return res.status(400).json({ error: '그룹 이름을 입력해 주세요.' });
    const group = store.createGroup({ id: randomUUID(), name, joinCode: newJoinCode(), createdAt: Date.now() });
    store.addMembership(clientId, group.id);
    res.json(group);
});

app.post('/api/groups/join', (req, res) => {
    const clientId = clientIdOf(req);
    if (!clientId) return res.status(400).json({ error: '클라이언트 식별자가 없습니다. 새로고침 후 다시 시도해 주세요.' });
    const code = String(req.body?.code ?? '').trim().toUpperCase();
    const group = store.findGroupByCode(code);
    if (!group) return res.status(404).json({ error: '참여 코드에 해당하는 그룹이 없습니다.' });
    store.addMembership(clientId, group.id);
    res.json(group);
});

// 그룹 나가기 — 마지막 멤버가 나가면 그룹 데이터 전체 삭제
app.post('/api/groups/:groupId/leave', (req, res) => {
    const clientId = clientIdOf(req);
    if (!clientId) return res.status(400).json({ error: '클라이언트 식별자가 없습니다.' });
    const remaining = store.removeMembership(clientId, req.params.groupId);
    if (remaining === 0) store.deleteGroup(req.params.groupId);
    res.json({ left: true, deleted: remaining === 0 });
});

/* --- 참가자 / 계정 --- */

app.get('/api/groups/:groupId/players', (req, res) => {
    res.json({
        players: store.listPlayers(req.params.groupId),
        accounts: store.listAccountsByGroup(req.params.groupId),
        laneTiers: store.listLaneTiers(req.params.groupId),
    });
});

app.post('/api/groups/:groupId/players', (req, res) => {
    const displayName = String(req.body?.displayName ?? '').trim();
    if (!displayName) return res.status(400).json({ error: '참가자 이름을 입력해 주세요.' });
    store.addPlayer({ id: randomUUID(), groupId: req.params.groupId, displayName });
    scheduleSheetPush(req.params.groupId);
    res.json({ ok: true });
});

app.delete('/api/players/:playerId', (req, res) => {
    const player = store.getPlayer(req.params.playerId);
    store.removePlayer(req.params.playerId);
    if (player) scheduleSheetPush(player.groupId);
    res.json({ ok: true });
});

// 계정 등록 — Riot Account-V1로 실제 검증 후 puuid 저장
app.post('/api/players/:playerId/accounts', async (req, res) => {
    const player = store.getPlayer(req.params.playerId);
    if (!player) return res.status(404).json({ error: '참가자를 찾을 수 없습니다.' });
    if (!riotKeyConfigured()) return res.status(503).json({ error: '.env에 RIOT_API_KEY가 설정되지 않았습니다.' });

    const gameName = String(req.body?.gameName ?? '').trim();
    const tagLine = String(req.body?.tagLine ?? '').trim();
    if (!gameName || !tagLine) return res.status(400).json({ error: '게임명#태그 형식으로 입력해 주세요.' });

    const account = await resolveAccount(gameName, tagLine);
    // 태그 오입력으로 엉뚱한 계정이 잡히는 것을 막는다 (KR 소환사 존재 확인)
    try {
        await getSummonerByPuuid(account.puuid);
    } catch {
        return res.status(404).json({
            error: `"${account.gameName ?? gameName}#${account.tagLine ?? tagLine}" 은(는) KR 서버에서 찾을 수 없습니다. 태그를 정확히 입력해 주세요. (예: Hide on bush#KR1)`,
        });
    }
    if (store.findAccountInGroup(player.groupId, account.puuid)) {
        return res.status(409).json({ error: '이미 이 그룹에 등록된 계정입니다.' });
    }
    store.addAccount({
        id: randomUUID(),
        playerId: player.id,
        groupId: player.groupId,
        gameName: account.gameName ?? gameName,
        tagLine: account.tagLine ?? tagLine,
        puuid: account.puuid,
    });
    res.json({ ok: true });
});

app.delete('/api/accounts/:accountId', (req, res) => {
    store.removeAccount(req.params.accountId);
    res.json({ ok: true });
});

/*
 * 참가자 상세 프로필 — 등록된 모든 계정의 Riot 정보(Summoner-V4 + League-V4 전 필드)를
 * 실시간 조회하고 합산 요약을 만든다. 계정별 5분 메모리 캐시로 레이트 리밋을 보호한다.
 */
const TIER_ORDER = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'];
const RANK_ORDER = ['IV', 'III', 'II', 'I'];
const profileCache = new Map(); // puuid -> { data, at }
const PROFILE_TTL = 5 * 60 * 1000;

/** 최근 매치를 훑어 챔피언/포지션/키스톤 룬/스펠 조합 선호도를 집계한다 (API가 직접 주지 않는 값) */
const RECENT_SAMPLE = 10;

const analyzeRecentMatches = async (puuid) => {
    const ids = await listRecentMatchIds(puuid, RECENT_SAMPLE);
    const champions = new Map();
    const positions = new Map();
    const keystones = new Map();
    const spellPairs = new Map();
    let sampleSize = 0;

    for (const matchId of ids) {
        let match;
        try {
            match = await getMatch(matchId);
        } catch {
            continue; // 개별 매치 실패는 건너뛴다
        }
        await sleep(50);
        const p = match.info?.participants?.find(x => x.puuid === puuid);
        if (!p) continue;
        sampleSize += 1;

        const champ = champions.get(p.championName) ?? { games: 0, wins: 0 };
        champ.games += 1;
        if (p.win) champ.wins += 1;
        champions.set(p.championName, champ);

        const pos = p.teamPosition || 'UNKNOWN';
        positions.set(pos, (positions.get(pos) ?? 0) + 1);

        const keystone = p.perks?.styles?.[0]?.selections?.[0]?.perk;
        if (keystone) keystones.set(keystone, (keystones.get(keystone) ?? 0) + 1);

        const pair = [p.summoner1Id, p.summoner2Id].filter(x => x != null).sort((a, b) => a - b).join('/');
        if (pair) spellPairs.set(pair, (spellPairs.get(pair) ?? 0) + 1);
    }

    const toSorted = (map, mapper) =>
        [...map.entries()].map(mapper).sort((a, b) => b.games - a.games);

    return {
        sampleSize,
        champions: toSorted(champions, ([champion, v]) => ({ champion, games: v.games, wins: v.wins })),
        positions: toSorted(positions, ([position, games]) => ({ position, games })),
        keystones: toSorted(keystones, ([perk, games]) => ({ perk, games })),
        spells: toSorted(spellPairs, ([pair, games]) => ({ pair, games })),
    };
};

const fetchAccountProfile = async (puuid) => {
    const cached = profileCache.get(puuid);
    if (cached && Date.now() - cached.at < PROFILE_TTL) return cached.data;
    const [summoner, leagues, masteries, masteryScore] = await Promise.all([
        getSummonerByPuuid(puuid),
        getLeagueEntriesByPuuid(puuid),
        getChampionMasteries(puuid),
        getMasteryScore(puuid),
    ]);
    const recentStats = await analyzeRecentMatches(puuid);
    const data = { summoner, leagues, masteries, masteryScore, recentStats };
    profileCache.set(puuid, { data, at: Date.now() });
    return data;
};

app.get('/api/players/:playerId/profile', async (req, res) => {
    const player = store.getPlayer(req.params.playerId);
    if (!player) return res.status(404).json({ error: '참가자를 찾을 수 없습니다.' });

    const accounts = store.listAccountsByPlayer(player.id);
    const scrim = store.playerRankings(player.groupId).find(r => r.playerId === player.id) ?? { games: 0, wins: 0 };

    const results = [];
    for (const acc of accounts) {
        if (!riotKeyConfigured()) {
            results.push({ ...acc, summoner: null, leagues: [], masteries: [], masteryScore: null, recentStats: null, error: 'RIOT_API_KEY가 설정되지 않았습니다.' });
            continue;
        }
        try {
            const { summoner, leagues, masteries, masteryScore, recentStats } = await fetchAccountProfile(acc.puuid);
            results.push({ ...acc, summoner, leagues, masteries, masteryScore, recentStats });
        } catch (e) {
            results.push({
                ...acc, summoner: null, leagues: [], masteries: [], masteryScore: null, recentStats: null,
                error: e instanceof RiotError ? e.message : '조회에 실패했습니다.',
            });
        }
        await sleep(40);
    }

    // 최근 경향 합산 (전 계정)
    const merge = (getKey, getGames, getWins) => {
        const map = new Map();
        for (const acc of results) {
            for (const row of acc.recentStats?.[getKey] ?? []) {
                const key = JSON.stringify(Object.values(row).slice(0, 1));
                const prev = map.get(key) ?? { ...row, games: 0, wins: 0 };
                prev.games += getGames(row);
                if (getWins) prev.wins = (prev.wins ?? 0) + (row.wins ?? 0);
                map.set(key, prev);
            }
        }
        return [...map.values()].sort((a, b) => b.games - a.games);
    };
    const recent = {
        sampleSize: results.reduce((s, a) => s + (a.recentStats?.sampleSize ?? 0), 0),
        champions: merge('champions', r => r.games, true),
        positions: merge('positions', r => r.games, false),
        keystones: merge('keystones', r => r.games, false),
        spells: merge('spells', r => r.games, false),
    };

    // 합산: 랭크 승/패 합계(전 계정·전 큐), 최고 티어, 최고 레벨
    let totalWins = 0;
    let totalLosses = 0;
    let best = null;
    let maxLevel = 0;
    for (const acc of results) {
        if (acc.summoner?.summonerLevel > maxLevel) maxLevel = acc.summoner.summonerLevel;
        for (const entry of acc.leagues ?? []) {
            totalWins += entry.wins ?? 0;
            totalLosses += entry.losses ?? 0;
            const tierIdx = TIER_ORDER.indexOf(entry.tier);
            if (tierIdx < 0) continue;
            const rankIdx = RANK_ORDER.indexOf(entry.rank);
            const score = tierIdx * 1000 + rankIdx * 100 + (entry.leaguePoints ?? 0) / 10;
            if (!best || score > best.score) {
                best = {
                    score, tier: entry.tier, rank: entry.rank,
                    leaguePoints: entry.leaguePoints ?? 0, queueType: entry.queueType,
                    riotId: `${acc.gameName}#${acc.tagLine}`,
                };
            }
        }
    }

    res.json({
        player,
        comment: store.getPlayerComment(player.id),
        scrim: { games: scrim.games, wins: scrim.wins },
        accounts: results,
        recent,
        aggregate: {
            accountCount: accounts.length,
            totalRankedWins: totalWins,
            totalRankedLosses: totalLosses,
            bestTier: best ? { tier: best.tier, rank: best.rank, leaguePoints: best.leaguePoints, queueType: best.queueType, riotId: best.riotId } : null,
            maxSummonerLevel: maxLevel,
        },
    });
});

app.post('/api/accounts/:accountId/primary', (req, res) => {
    store.setPrimaryAccount(req.params.accountId);
    res.json({ ok: true });
});

/* --- 그룹 참가자 레이팅 (팀 빌더 자동 티어·점수용, functions/api와 동일) --- */

const RATING_TTL = 10 * 60 * 1000;
const RATING_MAX_PLAYERS = 15;
const ratingCache = new Map();

const fetchRating = async (puuid) => {
    const cached = ratingCache.get(puuid);
    if (cached && Date.now() - cached.at < RATING_TTL) return cached.data;

    const since = Math.floor((Date.now() - 30 * 24 * 3600 * 1000) / 1000);
    const [summoner, leagues, recentIds] = await Promise.all([
        getSummonerByPuuid(puuid).catch(() => null),
        getLeagueEntriesByPuuid(puuid).catch(() => []),
        listMatchIdsSince(puuid, since, 30).catch(() => []),
    ]);
    const solo = (leagues ?? []).find(e => e.queueType === 'RANKED_SOLO_5x5');
    const flex = (leagues ?? []).find(e => e.queueType === 'RANKED_FLEX_SR');
    const entry = solo ?? flex ?? null;

    const data = {
        summonerLevel: summoner?.summonerLevel ?? null,
        profileIconId: summoner?.profileIconId ?? null,
        queueType: entry?.queueType ?? null,
        tier: entry?.tier ?? null,
        division: entry?.rank ?? null,
        leaguePoints: entry?.leaguePoints ?? 0,
        wins: entry?.wins ?? 0,
        losses: entry?.losses ?? 0,
        recentGames30d: Array.isArray(recentIds) ? recentIds.length : 0,
        lookupFailed: summoner === null,
    };
    ratingCache.set(puuid, { data, at: Date.now() });
    return data;
};

/* 팀 빌더 기본 티어 — 최고 솔랭(없으면 자랭) (functions/api와 동일 규칙) */
const RANK_TTL = 10 * 60 * 1000;
const rankCache = new Map();
const gamesCache = new Map();
const BUILDER_RIOT_BUDGET = 36;
const ACCOUNTS_PER_PLAYER = 2;
const RANK_PAGE = 12;

const RIOT_TIER_ORDER = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'];
const RIOT_DIV_ORDER = ['IV', 'III', 'II', 'I'];
const rankStrength = (r) => (r
    ? RIOT_TIER_ORDER.indexOf(r.tier) * 1000 + (RIOT_DIV_ORDER.indexOf(r.division ?? 'I') + 1) * 100 + Math.min(r.lp ?? 0, 99)
    : -1);

const fetchRiotRank = async (puuid) => {
    const cached = rankCache.get(puuid);
    if (cached && Date.now() - cached.at < RANK_TTL) return cached.data;
    const entries = await getLeagueEntriesByPuuid(puuid).catch(() => []);
    const pick = (queue) => {
        const e = (entries ?? []).find(x => x.queueType === queue);
        return e
            ? { tier: e.tier, division: e.rank ?? null, lp: e.leaguePoints ?? 0, wins: e.wins ?? 0, losses: e.losses ?? 0 }
            : null;
    };
    const data = { solo: pick('RANKED_SOLO_5x5'), flex: pick('RANKED_FLEX_SR') };
    rankCache.set(puuid, { data, at: Date.now() });
    return data;
};

const fetchRecentGames = async (puuid) => {
    const cached = gamesCache.get(puuid);
    if (cached && Date.now() - cached.at < RANK_TTL) return cached.games;
    const since = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
    const ids = await listMatchIdsSince(puuid, since, 100).catch(() => null);
    const games = Array.isArray(ids) ? ids.length : null;
    gamesCache.set(puuid, { games, at: Date.now() });
    return games;
};

const collectRanks = async (players, accounts) => {
    const out = [];
    let used = 0;
    for (const p of players) {
        if (used >= BUILDER_RIOT_BUDGET) break;
        const mine = accounts
            .filter(a => a.playerId === p.id)
            .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0))
            .slice(0, ACCOUNTS_PER_PLAYER);

        const cands = [];
        for (const acc of mine) {
            if (used >= BUILDER_RIOT_BUDGET) break;
            used += 1;
            let r;
            try { r = await fetchRiotRank(acc.puuid); } catch { continue; }
            const riotId = `${acc.gameName}#${acc.tagLine}`;
            if (r.solo) cands.push({ queue: 'solo', puuid: acc.puuid, riotId, ...r.solo });
            if (r.flex) cands.push({ queue: 'flex', puuid: acc.puuid, riotId, ...r.flex });
        }
        if (cands.length === 0) continue;

        const solos = cands.filter(c => c.queue === 'solo');
        const best = (solos.length ? solos : cands).sort((a, b) => rankStrength(b) - rankStrength(a))[0];

        let games30d = null;
        if (used < BUILDER_RIOT_BUDGET) {
            used += 1;
            games30d = await fetchRecentGames(best.puuid);
        }
        out.push({
            playerId: p.id,
            queue: best.queue,
            riotId: best.riotId,
            tier: best.tier,
            division: best.division,
            lp: best.lp,
            wins: best.wins,
            losses: best.losses,
            games30d,
        });
    }
    return out;
};

app.get('/api/groups/:groupId/builder', async (req, res) => {
    const players = store.listPlayers(req.params.groupId);
    const accounts = store.listAccountsByGroup(req.params.groupId);
    const riotRanks = riotKeyConfigured() ? await collectRanks(players.slice(0, RANK_PAGE), accounts) : [];

    res.json({
        players,
        laneTiers: store.listLaneTiers(req.params.groupId),
        laneStats: store.listLaneStats(req.params.groupId),
        riotRanks,
        rankNext: riotKeyConfigured() && players.length > RANK_PAGE ? RANK_PAGE : null,
    });
});

/** 나머지 인원의 기본 티어 — 클라이언트가 next가 null이 될 때까지 이어서 부른다 */
app.get('/api/groups/:groupId/ranks', async (req, res) => {
    const start = Math.max(0, Number(req.query.start ?? 0) || 0);
    const players = store.listPlayers(req.params.groupId);
    if (!riotKeyConfigured()) return res.json({ riotRanks: [], next: null });
    const riotRanks = await collectRanks(
        players.slice(start, start + RANK_PAGE),
        store.listAccountsByGroup(req.params.groupId),
    );
    const end = start + RANK_PAGE;
    return res.json({ riotRanks, next: end < players.length ? end : null });
});

/** 시트/엑셀 한 판을 그룹에 통째로 반영 — 없는 이름은 참가자로 새로 만든다 */
app.post('/api/groups/:groupId/import-tiers', (req, res) => {
    const group = store.getGroup(req.params.groupId);
    if (!group) return res.status(404).json({ error: '그룹을 찾을 수 없습니다.' });

    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const players = store.listPlayers(group.id);
    const byName = new Map(players.map(p => [p.displayName.trim().toLowerCase(), p]));
    // 상시 동기화가 주기적으로 부르므로, 실제로 달라진 값만 저장한다
    const tierMap = new Map(store.listLaneTiers(group.id).map(t => [`${t.playerId}|${t.position}`, t.tier]));

    let added = 0;
    let updated = 0;
    for (const row of rows.slice(0, 200)) {
        const name = String(row?.name ?? '').trim();
        if (!name) continue;
        let player = byName.get(name.toLowerCase());
        if (!player) {
            player = { id: randomUUID(), groupId: group.id, displayName: name };
            store.addPlayer(player);
            byName.set(name.toLowerCase(), player);
            added += 1;
        }
        const setIfChanged = (pos, raw) => {
            const next = raw || null;
            if ((tierMap.get(`${player.id}|${pos}`) ?? null) === next) return;
            store.setLaneTier(player.id, pos, next);
        };
        if (row.base !== undefined) setIfChanged('기본', row.base);
        for (const [pos, value] of Object.entries(row.lanes ?? {})) {
            if (value !== undefined) setIfChanged(pos, value);
        }
        updated += 1;
    }
    if (!req.body?.fromSheet) scheduleSheetPush(group.id);
    return res.json({ ok: true, added, updated });
});


/* --- 구글 시트 연동 ---
 * 시트를 CSV로 내려받아 그대로 클라이언트에 넘긴다. 파싱은 앱이 하던 것을 그대로 쓴다.
 * 브라우저에서 직접 부르면 CORS에 막히므로 서버가 대신 받아 온다.
 * 임의의 주소를 받아 오는 통로가 되지 않도록 저장 단계에서 구글 도메인만 허용한다.
 */

/** 시트 주소 → CSV 내려받기 주소. 편집 링크·게시 링크 둘 다 받는다 */
const toCsvUrl = (raw) => {
    let u;
    try { u = new URL(String(raw).trim()); } catch { return null; }
    if (u.hostname !== 'docs.google.com') return null;

    // 웹에 게시한 주소 (/spreadsheets/d/e/<key>/pub...)
    if (u.pathname.includes('/d/e/')) {
        const base = u.pathname.replace(/\/(pubhtml|pub|edit).*$/, '/pub');
        const gid = u.searchParams.get('gid') ?? u.hash.match(/gid=(\d+)/)?.[1];
        return `https://docs.google.com${base}?output=csv${gid ? `&gid=${gid}` : ''}`;
    }
    // 일반 편집 주소 (/spreadsheets/d/<id>/edit#gid=0)
    const id = u.pathname.match(/\/spreadsheets\/d\/([^/]+)/)?.[1];
    if (!id) return null;
    const gid = u.searchParams.get('gid') ?? u.hash.match(/gid=(\d+)/)?.[1] ?? '0';
    return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
};

/** 연동한 시트를 지금 읽어 온다 */
const fetchSheetCsv = async (url) => {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) return { error: res.status === 404 ? '시트를 찾을 수 없습니다.' : '시트를 읽지 못했습니다.' };
    const text = await res.text();
    // 접근 권한이 없으면 구글이 CSV 대신 로그인 페이지(HTML)를 내려준다
    if (/^\s*<(!doctype|html)/i.test(text)) {
        return { error: '시트가 비공개입니다. 공유 설정을 "링크가 있는 모든 사용자"로 바꿔 주세요.' };
    }
    return { csv: text };
};

app.put('/api/groups/:groupId/sheet', async (req, res) => {
    const group = store.getGroup(req.params.groupId);
    if (!group) return res.status(404).json({ error: '그룹을 찾을 수 없습니다.' });

    const raw = String(req.body?.url ?? '').trim();
    if (!raw) {
        store.setGroupSheet(group.id, null);
        return res.json({ ok: true, url: null });
    }
    const csvUrl = toCsvUrl(raw);
    if (!csvUrl) return res.status(400).json({ error: '구글 시트 주소가 아닙니다. 시트 링크를 그대로 붙여 넣어 주세요.' });

    let csv = null;
    let failure = null;
    try {
        csv = await readViaAccount(csvUrl);
    } catch (e) {
        failure = e.message;
    }
    if (csv === null) {
        const probe = await fetchSheetCsv(csvUrl).catch(() => ({ error: '시트를 읽지 못했습니다.' }));
        if (probe.error) return res.status(400).json({ error: failure ?? probe.error });
        csv = probe.csv;
    }

    store.setGroupSheet(group.id, csvUrl);
    return res.json({ ok: true, url: csvUrl, csv });
});

app.get('/api/groups/:groupId/sheet', async (req, res) => {
    const group = store.getGroup(req.params.groupId);
    if (!group) return res.status(404).json({ error: '그룹을 찾을 수 없습니다.' });
    if (!group.sheetUrl) return res.json({ url: null, csv: null });

    try {
        const csv = await readViaAccount(group.sheetUrl);
        if (csv !== null) return res.json({ url: group.sheetUrl, csv, via: 'account' });
    } catch { /* 공유가 안 됐으면 공개 링크로 시도 */ }

    const out = await fetchSheetCsv(group.sheetUrl).catch(() => ({ error: '시트를 읽지 못했습니다.' }));
    if (out.error) return res.status(502).json({ url: group.sheetUrl, error: out.error });
    return res.json({ url: group.sheetUrl, csv: out.csv, via: 'public' });
});

/* --- 구글 시트 양방향 (서비스 계정) --- */

const gsEnv = () => ({
    GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY,
});

const readViaAccount = async (url) => {
    const env = gsEnv();
    if (!sheetsConfigured(env)) return null;
    const id = spreadsheetIdOf(url);
    if (!id) return null;
    const title = await firstSheetTitle(env, id);
    return valuesToCsv(await readValues(env, id, title));
};

app.get('/api/sheets/account', (_req, res) => {
    const env = gsEnv();
    res.json({ ready: sheetsConfigured(env), email: serviceAccountEmail(env) });
});

app.post('/api/groups/:groupId/sheet/push', async (req, res) => {
    const group = store.getGroup(req.params.groupId);
    if (!group) return res.status(404).json({ error: '그룹을 찾을 수 없습니다.' });
    if (!group.sheetUrl) return res.status(400).json({ error: '연동된 시트가 없습니다.' });
    const env = gsEnv();
    if (!sheetsConfigured(env)) return res.status(503).json({ error: '구글 서비스 계정이 설정되지 않았습니다.' });

    const id = spreadsheetIdOf(group.sheetUrl);
    if (!id) return res.status(400).json({ error: '웹에 게시한 주소는 쓰기가 안 됩니다. 시트 편집 링크로 다시 연결해 주세요.' });
    const values = Array.isArray(req.body?.values) ? req.body.values : null;
    if (!values) return res.status(400).json({ error: '보낼 표가 없습니다.' });

    try {
        const { title, sheetId } = await firstSheet(env, id);
        await writeValues(env, id, title, values);
        await beautifySheet(env, id, sheetId, values.length).catch(() => { /* 꾸미기 실패는 무시 */ });
        const choices = Array.isArray(req.body?.choices) ? req.body.choices : null;
        if (choices?.length) {
            await setTierDropdown(env, id, sheetId, choices).catch(() => { /* 서식 실패는 무시 */ });
        }
        const tiers = Array.isArray(req.body?.tiers) ? req.body.tiers : null;
        if (tiers?.length) {
            await setTierColors(env, id, sheetId, tiers).catch(() => { /* 색은 없어도 동작한다 */ });
        }
        return res.json({ ok: true, rows: Math.max(0, values.length - 1) });
    } catch (e) {
        return res.status(502).json({ error: e.message ?? '시트에 쓰지 못했습니다.' });
    }
});



/** 참가자 데이터가 바뀔 때 연결된 시트에 곧바로 반영한다 (상시 동기화) */
const pushSheetFromDb = async (groupId) => {
    const env = gsEnv();
    if (!sheetsConfigured(env)) return;
    const group = store.getGroup(groupId);
    const id = group?.sheetUrl ? spreadsheetIdOf(group.sheetUrl) : null;
    if (!id) return;

    const players = store.listPlayers(groupId);
    const laneTiers = store.listLaneTiers(groupId);
    const { title } = await firstSheet(env, id);
    const current = await readValues(env, id, title).catch(() => []);
    const adjustByName = new Map();
    for (const row of current.slice(1)) {
        const name = String(row?.[0] ?? '').trim();
        if (name) adjustByName.set(name, row?.[7] ?? '');
    }
    await writeValues(env, id, title, buildTierGrid(players, laneTiers, adjustByName));
};

const scheduleSheetPush = (groupId) => {
    void pushSheetFromDb(groupId).catch(() => { /* 시트 반영 실패는 무시 */ });
};

/** 참가자의 롤 랭크 → 기본 티어 저장 (functions/api와 동일 규칙) */
app.post('/api/players/:playerId/riot-tier', async (req, res) => {
    const player = store.getPlayer(req.params.playerId);
    if (!player) return res.status(404).json({ error: '참가자를 찾을 수 없습니다.' });
    if (!riotKeyConfigured()) return res.status(503).json({ error: '라이엇 연동이 준비되지 않았습니다.' });

    const accounts = store.listAccountsByPlayer(player.id);
    if (accounts.length === 0) {
        return res.status(400).json({ error: '등록된 롤 계정이 없습니다. 계정을 먼저 등록해 주세요.' });
    }

    const mine = accounts
        .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0))
        .slice(0, ACCOUNTS_PER_PLAYER);
    const cands = [];
    for (const acc of mine) {
        let r;
        try { r = await fetchRiotRank(acc.puuid); } catch { continue; }
        const riotId = `${acc.gameName}#${acc.tagLine}`;
        if (r.solo) cands.push({ queue: 'solo', riotId, ...r.solo });
        if (r.flex) cands.push({ queue: 'flex', riotId, ...r.flex });
    }
    if (cands.length === 0) {
        return res.status(404).json({ error: '랭크 기록이 없습니다 (언랭). 표나 우클릭으로 직접 지정해 주세요.' });
    }

    const solos = cands.filter(c => c.queue === 'solo');
    const best = (solos.length ? solos : cands).sort((a, b) => rankStrength(b) - rankStrength(a))[0];
    const division = ['I', 'II', 'III', 'IV'].includes(best.division) ? best.division : 'I';
    const value = `${String(best.tier).toLowerCase()}:${division}`;
    store.setLaneTier(player.id, '기본', value);
    scheduleSheetPush(player.groupId);
    return res.json({ ok: true, value, queue: best.queue, riotId: best.riotId, lp: best.lp });
});

app.put('/api/players/:playerId/lane-tiers', (req, res) => {
    const player = store.getPlayer(req.params.playerId);
    if (!player) return res.status(404).json({ error: '참가자를 찾을 수 없습니다.' });
    const position = String(req.body?.position ?? '');
    const tier = req.body?.tier ? String(req.body.tier) : null;
    if (!position) return res.status(400).json({ error: '라인이 지정되지 않았습니다.' });
    store.setLaneTier(player.id, position, tier);
    scheduleSheetPush(player.groupId);
    res.json({ ok: true });
});

app.get('/api/groups/:groupId/ratings', async (req, res) => {
    const players = store.listPlayers(req.params.groupId);
    const accounts = store.listAccountsByGroup(req.params.groupId);
    const laneStats = store.listLaneStats(req.params.groupId);
    if (!riotKeyConfigured()) return res.json({ ratings: [], laneStats, error: '라이엇 연동이 아직 준비되지 않았습니다.' });

    const ratings = [];
    let used = 0;
    for (const p of players) {
        const mine = accounts.filter(a => a.playerId === p.id);
        const acc = mine.find(a => a.isPrimary) ?? mine[0];
        const row = { playerId: p.id, displayName: p.displayName, riotId: acc ? `${acc.gameName}#${acc.tagLine}` : null };
        if (!acc || used >= RATING_MAX_PLAYERS) {
            ratings.push({ ...row, tier: null, recentGames30d: 0 });
            continue;
        }
        used += 1;
        try {
            ratings.push({ ...row, ...(await fetchRating(acc.puuid)) });
        } catch {
            ratings.push({ ...row, tier: null, recentGames30d: 0, error: true });
        }
    }
    res.json({ ratings, laneStats });
});

/* --- 매치 --- */

app.get('/api/groups/:groupId/matches', (req, res) => {
    res.json(store.listMatches(req.params.groupId));
});

app.get('/api/groups/:groupId/stats', (req, res) => {
    res.json(store.groupStats(req.params.groupId));
});

app.get('/api/groups/:groupId/rankings', (req, res) => {
    res.json(store.playerRankings(req.params.groupId));
});

// 데모 매치 저장 (프론트에서 생성한 레코드)
app.post('/api/groups/:groupId/matches', (req, res) => {
    const m = req.body;
    if (!m?.riotMatchId || !Array.isArray(m.participants)) {
        return res.status(400).json({ error: '잘못된 매치 데이터입니다.' });
    }
    const record = { ...m, groupId: req.params.groupId };
    if (store.insertMatch(record)) grantMatchPoints(req.params.groupId, record);
    res.json({ ok: true });
});

app.delete('/api/matches/:matchId', (req, res) => {
    store.deleteMatch(req.params.matchId);
    res.json({ ok: true });
});

// 저장된 원본 데이터 전체 ("상세정보 보기") — 로비 이벤트 포함
app.get('/api/matches/:matchId/detail', async (req, res) => {
    const detail = store.getMatchDetail(req.params.matchId);
    if (!detail) return res.status(404).json({ error: '매치를 찾을 수 없습니다.' });

    // 토너먼트 코드로 치러진 매치면 해당 코드의 로비 이벤트를 함께 반환
    if (store.getTournamentCode(detail.riotMatchId) && riotKeyConfigured()) {
        try {
            detail.lobbyEvents = await stubLobbyEvents(detail.riotMatchId);
        } catch { /* 이벤트 조회 실패는 무시 */ }
    } else if (detail.source === 'demo') {
        // 모의 매치는 UI 확인용 모의 로비 이벤트 (정식 전환 시 실제 이벤트로 대체)
        const t = (offsetSec) => new Date(detail.gameStart - offsetSec * 1000).toISOString();
        detail.lobbyEvents = [
            { timestamp: t(420), eventType: 'PracticeGameCreatedEvent' },
            { timestamp: t(300), eventType: 'ChampSelectStartedEvent' },
            { timestamp: t(60), eventType: 'GameAllocationStartedEvent' },
        ];
    }
    res.json(detail);
});

/*
 * 내전 자동 수집 (PLANNING.md 4장):
 * 그룹 등록 계정들의 최근 사용자 지정 게임(queueId 0)을 조회해
 * 그룹 계정이 minMembers명 이상 포함된 매치를 내전으로 저장한다.
 * 개발 단계 기본값 1 (계정 하나로도 테스트 가능) — 운영 시 6 권장.
 */
app.post('/api/groups/:groupId/import', async (req, res) => {
    const groupId = req.params.groupId;
    if (!riotKeyConfigured()) return res.status(503).json({ error: '.env에 RIOT_API_KEY가 설정되지 않았습니다.' });

    const minMembers = Math.max(1, Number(req.body?.minMembers ?? 1));
    const accounts = store.listAccountsByGroup(groupId);
    if (accounts.length === 0) {
        return res.status(400).json({ error: '등록된 롤 계정이 없습니다. 참가자에게 계정을 먼저 등록해 주세요.' });
    }

    const puuidToPlayerId = new Map(accounts.map(a => [a.puuid, a.playerId]));

    // 1) 계정별 최근 커스텀 매치 ID 수집 (중복 제거)
    const idSet = new Set();
    for (const acc of accounts) {
        const ids = await listCustomMatchIds(acc.puuid, 10);
        ids.forEach(id => idSet.add(id));
        await sleep(60); // 레이트 리밋 보호 (개발 키 20req/s)
    }

    // 2) 미수집 매치만 상세 조회 → 내전 판정 → 저장
    let added = 0;
    let skippedMembers = 0;
    let scanned = 0;
    for (const matchId of idSet) {
        if (store.hasMatch(groupId, matchId)) continue;
        scanned += 1;
        const match = await getMatch(matchId);
        await sleep(60);

        const info = match.info ?? {};
        if (info.queueId !== 0 && info.gameType !== 'CUSTOM_GAME') continue;

        const memberCount = (info.participants ?? []).filter(p => puuidToPlayerId.has(p.puuid)).length;
        if (memberCount < minMembers) {
            skippedMembers += 1;
            continue;
        }
        const rec = toMatchRecord(match, groupId, puuidToPlayerId);
        if (store.insertMatch(rec)) { added += 1; grantMatchPoints(groupId, rec); }
    }

    res.json({ added, scanned, skippedMembers, accountCount: accounts.length });
});

/*
 * --- 토너먼트 코드 (Tournament-Stub-V5, PLANNING.md 5.4) ---
 * 내전 수집의 기본 경로. Stub 코드는 실제 게임 로비를 만들지 못하므로
 * 결과 수집은 정식 Tournament API 승인 후 실코드로 전환해야 동작한다 (riot.js 참고).
 */

const PICK_TYPES = new Set(['TOURNAMENT_DRAFT', 'DRAFT_MODE', 'BLIND_PICK', 'ALL_RANDOM']);
const MAP_TYPES = new Set(['SUMMONERS_RIFT', 'HOWLING_ABYSS']);
// Stub 프로바이더 등록용 콜백 URL — 정식 전환 시 결과 수신 엔드포인트로 교체
const CALLBACK_URL = 'https://lol-teamtool.pages.dev/api/tournament-callback';

const ensureTournament = async (group) => {
    const existing = store.getTournament(group.id);
    if (existing) return existing;
    const providerId = await stubCreateProvider(CALLBACK_URL);
    const tournamentId = await stubCreateTournament(providerId, group.name);
    store.saveTournament({ groupId: group.id, providerId, tournamentId, region: 'KR' });
    return store.getTournament(group.id);
};

app.get('/api/groups/:groupId/tournament', (req, res) => {
    res.json({
        tournament: store.getTournament(req.params.groupId),
        codes: store.listTournamentCodes(req.params.groupId),
    });
});

app.post('/api/groups/:groupId/tournament/codes', async (req, res) => {
    if (!riotKeyConfigured()) return res.status(503).json({ error: '.env에 RIOT_API_KEY가 설정되지 않았습니다.' });
    const group = store.getGroup(req.params.groupId);
    if (!group) return res.status(404).json({ error: '그룹을 찾을 수 없습니다.' });

    const pickType = PICK_TYPES.has(req.body?.pickType) ? req.body.pickType : 'TOURNAMENT_DRAFT';
    const mapType = MAP_TYPES.has(req.body?.mapType) ? req.body.mapType : 'SUMMONERS_RIFT';
    const metadata = String(req.body?.metadata ?? '').slice(0, 200);
    // metadata는 정식 API에서 결과 콜백에 그대로 되돌아오는 값 — 내전 회차 메모 등으로 활용
    const params = { teamSize: 5, pickType, mapType, spectatorType: 'ALL', metadata: metadata || group.id };

    const tournament = await ensureTournament(group);
    const codes = await stubCreateCodes(tournament.tournamentId, 1, params);
    store.saveTournamentCodes(group.id, codes, { ...params, metadata });
    res.json(store.listTournamentCodes(group.id));
});

app.delete('/api/tournament/codes/:code', (req, res) => {
    store.deleteTournamentCode(req.params.code);
    res.json({ ok: true });
});

app.get('/api/tournament/codes/:code/events', async (req, res) => {
    if (!store.getTournamentCode(req.params.code)) {
        return res.status(404).json({ error: '이 서버에서 발급한 코드가 아닙니다.' });
    }
    const eventList = await stubLobbyEvents(req.params.code);
    res.json({ eventList });
});

// 코드로 치러진 매치를 수집해 내전 기록으로 저장
app.post('/api/tournament/codes/:code/collect', async (req, res) => {
    const codeInfo = store.getTournamentCode(req.params.code);
    if (!codeInfo) return res.status(404).json({ error: '이 서버에서 발급한 코드가 아닙니다.' });

    try {
        const ids = await listMatchIdsByTournamentCode(req.params.code);
        const accounts = store.listAccountsByGroup(codeInfo.groupId);
        const puuidToPlayerId = new Map(accounts.map(a => [a.puuid, a.playerId]));

        let added = 0;
        for (const matchId of ids) {
            if (store.hasMatch(codeInfo.groupId, matchId)) continue;
            const match = await getMatch(matchId);
            if (store.insertMatch(toMatchRecord(match, codeInfo.groupId, puuidToPlayerId))) added += 1;
            await sleep(60);
        }
        res.json({ found: ids.length, added });
    } catch (e) {
        if (e instanceof RiotError && (e.status === 401 || e.status === 403)) {
            return res.status(403).json({
                error: 'Stub 코드는 실제 경기 결과가 생성되지 않습니다. 코드 기준 결과 조회는 정식 Tournament API 승인 키부터 가능합니다.',
            });
        }
        if (e instanceof RiotError && e.status === 404) {
            return res.json({ found: 0, added: 0 });
        }
        throw e;
    }
});

/*
 * --- 경매 상태 공유 (실시간 관전) — functions/api와 동일 ---
 */

app.get('/api/groups/:groupId/auction', (req, res) => {
    const row = store.getAuctionState(req.params.groupId);
    if (!row) return res.json({ state: null, updatedAt: null, rev: null });
    const since = req.query.rev;
    if (since != null && String(row.rev) === String(since)) return res.json({ unchanged: true, rev: row.rev });
    let parsed = null;
    try { parsed = JSON.parse(row.state); } catch { /* 손상된 상태는 없음 처리 */ }
    res.json({ state: parsed, updatedAt: row.updatedAt, rev: row.rev });
});

app.put('/api/groups/:groupId/auction', (req, res) => {
    const state = req.body?.state;
    if (!state || typeof state !== 'object') return res.status(400).json({ error: '잘못된 경매 상태입니다.' });
    const raw = JSON.stringify(state);
    if (raw.length > 200000) return res.status(413).json({ error: '경매 상태가 너무 큽니다.' });
    if (!store.getGroup(req.params.groupId)) return res.status(404).json({ error: '그룹을 찾을 수 없습니다.' });
    store.saveAuctionState(req.params.groupId, raw);
    res.json({ ok: true });
});

/* --- 팀장 제어 방식 서버 액션 (진행자 없음, functions/api와 동일) --- */

const mutateAuction = (groupId, mutate) => {
    for (let i = 0; i < 6; i += 1) {
        const row = store.getAuctionState(groupId);
        if (!row) return null;
        let state;
        try { state = JSON.parse(row.state); } catch { return null; }
        const next = mutate(state);
        if (next === state) return { state, rev: row.rev };
        if (store.casAuctionState(groupId, JSON.stringify(next), row.rev)) return { state: next, rev: row.rev + 1 };
    }
    return null;
};

app.post('/api/groups/:groupId/auction/action', (req, res) => {
    const type = String(req.body?.type ?? '');
    if (!['draw', 'bid', 'resolve', 'endNow'].includes(type)) return res.status(400).json({ error: '알 수 없는 액션입니다.' });
    const result = mutateAuction(req.params.groupId, (state) => applyAuctionAction(state, req.body));
    if (!result) return res.status(404).json({ error: '진행 중인 경매가 없습니다.' });
    res.json({ ok: true, state: result.state, rev: result.rev });
});

/* --- 참가자 코멘트 --- */

app.put('/api/players/:playerId/comment', (req, res) => {
    const player = store.getPlayer(req.params.playerId);
    if (!player) return res.status(404).json({ error: '참가자를 찾을 수 없습니다.' });
    store.setPlayerComment(req.params.playerId, String(req.body?.comment ?? '').slice(0, 1000));
    res.json({ ok: true });
});

/* --- 포인트 (functions/api와 동일) --- */

const checkPin = (playerId, groupId, pin) => {
    const row = store.ensurePoints(groupId, playerId);
    const given = String(pin ?? '').trim();
    if (!row.pin) {
        if (given.length < 4) return { ok: false, error: '이 참가자를 처음 사용합니다. 4자리 이상 PIN을 정해 주세요.' };
        store.setPin(playerId, given);
        return { ok: true };
    }
    if (row.pin !== given) return { ok: false, error: 'PIN이 일치하지 않습니다.' };
    return { ok: true };
};

/** 내전 결과 포인트 지급 (중복 방지) */
const grantMatchPoints = (groupId, record) => {
    if (!store.claimMatchReward(groupId, record.id)) return;
    for (const pt of record.participants) {
        if (!pt.playerId) continue;
        const won = pt.side === record.winningSide;
        store.ensurePoints(groupId, pt.playerId);
        store.addPoints(groupId, pt.playerId, won ? WIN_REWARD : LOSE_REWARD, won ? '내전 승리' : '내전 참가');
    }
};

app.get('/api/groups/:groupId/points', (req, res) => {
    res.json({
        ranking: store.listGroupPoints(req.params.groupId),
        shop: SHOP_ITEMS, today: kstDay(), treasure: treasureSpot(req.params.groupId),
    });
});

app.get('/api/players/:playerId/points', (req, res) => {
    const player = store.getPlayer(req.params.playerId);
    if (!player) return res.status(404).json({ error: '참가자를 찾을 수 없습니다.' });
    const row = store.ensurePoints(player.groupId, player.id);
    const streakDays = store.checkinStreak(player.id);
    res.json({
        points: row.points, title: row.title, frame: row.frame, bg: row.bg, hasPin: Boolean(row.pin),
        inventory: store.listInventory(player.id), log: store.listPointLog(player.id, 20),
        checkedToday: streakDays.includes(kstDay()),
    });
});

app.post('/api/players/:playerId/checkin', (req, res) => {
    const player = store.getPlayer(req.params.playerId);
    if (!player) return res.status(404).json({ error: '참가자를 찾을 수 없습니다.' });
    const auth = checkPin(player.id, player.groupId, req.body?.pin);
    if (!auth.ok) return res.status(403).json({ error: auth.error });
    if (!store.claimDaily(player.id, 'checkin', kstDay())) {
        return res.status(409).json({ error: '오늘은 이미 출석했습니다.' });
    }
    const days = new Set(store.checkinStreak(player.id));
    let streak = 0;
    for (let i = 0; i < 7; i += 1) {
        if (days.has(kstDay(Date.now() - i * 86400000))) streak += 1; else break;
    }
    const gained = CHECKIN_BASE + Math.min(streak - 1, 6) * CHECKIN_STREAK_BONUS;
    const balance = store.addPoints(player.groupId, player.id, gained, `출석 ${streak}일차`);
    res.json({ ok: true, gained, streak, balance });
});

app.post('/api/players/:playerId/gamble', (req, res) => {
    const player = store.getPlayer(req.params.playerId);
    if (!player) return res.status(404).json({ error: '참가자를 찾을 수 없습니다.' });
    const auth = checkPin(player.id, player.groupId, req.body?.pin);
    if (!auth.ok) return res.status(403).json({ error: auth.error });

    const amount = Math.floor(Number(req.body?.amount));
    if (!Number.isFinite(amount) || amount < GAMBLE_MIN || amount > GAMBLE_MAX) {
        return res.status(400).json({ error: `${GAMBLE_MIN}~${GAMBLE_MAX} 사이로 걸어 주세요.` });
    }
    const outcome = playGamble(String(req.body?.game ?? ''), amount, String(req.body?.pick ?? ''));
    if (!outcome) return res.status(400).json({ error: '알 수 없는 게임입니다.' });

    const afterBet = store.addPoints(player.groupId, player.id, -amount, `${req.body.game} 베팅`);
    if (afterBet === null) return res.status(400).json({ error: '포인트가 부족합니다.' });
    let balance = afterBet;
    if (outcome.payout > 0) balance = store.addPoints(player.groupId, player.id, outcome.payout, `${req.body.game} 당첨`);
    res.json({ ok: true, ...outcome, balance });
});

app.post('/api/players/:playerId/treasure', (req, res) => {
    const player = store.getPlayer(req.params.playerId);
    if (!player) return res.status(404).json({ error: '참가자를 찾을 수 없습니다.' });
    const auth = checkPin(player.id, player.groupId, req.body?.pin);
    if (!auth.ok) return res.status(403).json({ error: auth.error });
    if (!store.claimDaily(player.id, 'treasure', kstDay())) {
        return res.status(409).json({ error: '오늘 보물은 이미 찾았습니다.' });
    }
    res.json({ ok: true, gained: TREASURE_REWARD, balance: store.addPoints(player.groupId, player.id, TREASURE_REWARD, '보물찾기') });
});

app.post('/api/players/:playerId/shop/buy', (req, res) => {
    const player = store.getPlayer(req.params.playerId);
    if (!player) return res.status(404).json({ error: '참가자를 찾을 수 없습니다.' });
    const auth = checkPin(player.id, player.groupId, req.body?.pin);
    if (!auth.ok) return res.status(403).json({ error: auth.error });
    const item = findItem(String(req.body?.itemId ?? ''));
    if (!item) return res.status(400).json({ error: '없는 상품입니다.' });
    if (store.listInventory(player.id).includes(item.id)) return res.status(409).json({ error: '이미 가지고 있습니다.' });
    const balance = store.addPoints(player.groupId, player.id, -item.price, `구매: ${item.name}`);
    if (balance === null) return res.status(400).json({ error: '포인트가 부족합니다.' });
    store.addInventory(player.id, item.id);
    res.json({ ok: true, balance, itemId: item.id });
});

app.post('/api/players/:playerId/shop/equip', (req, res) => {
    const player = store.getPlayer(req.params.playerId);
    if (!player) return res.status(404).json({ error: '참가자를 찾을 수 없습니다.' });
    const auth = checkPin(player.id, player.groupId, req.body?.pin);
    if (!auth.ok) return res.status(403).json({ error: auth.error });
    const kind = ['title', 'frame', 'bg'].includes(req.body?.kind) ? req.body.kind : 'frame';
    const itemId = req.body?.itemId ? String(req.body.itemId) : null;
    if (itemId) {
        const item = findItem(itemId);
        if (!item || item.kind !== kind) return res.status(400).json({ error: '장착할 수 없는 상품입니다.' });
        if (!store.listInventory(player.id).includes(itemId)) return res.status(403).json({ error: '보유하지 않은 상품입니다.' });
    }
    store.equipItem(player.id, kind, itemId);
    res.json({ ok: true });
});

/* --- 관전자 베팅 판 (functions/api와 동일 규칙) --- */

const roundToClient = (r, bets) => ({
    id: r.id, title: r.title, choices: JSON.parse(r.choices), status: r.status,
    winner: r.winner, creatorId: r.creator_id, creatorName: r.creatorName ?? null,
    createdAt: r.created_at, bets,
});

app.get('/api/groups/:groupId/bet-rounds', (req, res) => {
    const rounds = store.listBetRounds(req.params.groupId)
        .map(r => roundToClient(r, store.listBets(req.params.groupId, r.id)));
    res.json({ rounds });
});

app.post('/api/groups/:groupId/bet-rounds', (req, res) => {
    const player = store.getPlayer(String(req.body?.playerId ?? ''));
    if (!player || player.groupId !== req.params.groupId) return res.status(404).json({ error: '참가자를 찾을 수 없습니다.' });
    const auth = checkPin(player.id, player.groupId, req.body?.pin);
    if (!auth.ok) return res.status(403).json({ error: auth.error });

    const title = String(req.body?.title ?? '').trim().slice(0, 60);
    const choices = [...new Set((Array.isArray(req.body?.choices) ? req.body.choices : [])
        .map(c => String(c).trim().slice(0, 30)).filter(Boolean))];
    if (!title) return res.status(400).json({ error: '판 이름을 입력해 주세요.' });
    if (choices.length < 2 || choices.length > 6) return res.status(400).json({ error: '선택지는 2~6개여야 합니다.' });
    const existing = store.listBetRounds(req.params.groupId);
    if (existing.filter(r => r.status === 'open' || r.status === 'locked').length >= 3) {
        return res.status(409).json({ error: '진행 중인 판이 이미 3개 있습니다. 먼저 정산하거나 취소해 주세요.' });
    }
    const id = randomUUID();
    store.addBetRound({ id, groupId: req.params.groupId, title, choices, creatorId: player.id });
    res.json({ ok: true, roundId: id });
});

app.post('/api/bet-rounds/:roundId/bets', (req, res) => {
    const round = store.getBetRound(req.params.roundId);
    if (!round) return res.status(404).json({ error: '베팅 판을 찾을 수 없습니다.' });
    if (round.status !== 'open') return res.status(409).json({ error: round.status === 'locked' ? '마감된 판입니다.' : '이미 끝난 판입니다.' });
    const player = store.getPlayer(String(req.body?.playerId ?? ''));
    if (!player || player.groupId !== round.group_id) return res.status(404).json({ error: '참가자를 찾을 수 없습니다.' });
    const auth = checkPin(player.id, player.groupId, req.body?.pin);
    if (!auth.ok) return res.status(403).json({ error: auth.error });
    const choice = String(req.body?.choice ?? '');
    if (!JSON.parse(round.choices).includes(choice)) return res.status(400).json({ error: '없는 선택지입니다.' });
    const amount = Math.floor(Number(req.body?.amount));
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: '베팅 금액이 올바르지 않습니다.' });
    if (store.listBets(round.group_id, round.id).some(b => b.playerId === player.id && b.status === 'open')) {
        return res.status(409).json({ error: '이미 이 판에 베팅했습니다.' });
    }
    const balance = store.addPoints(round.group_id, player.id, -amount, `베팅: ${round.title} · ${choice}`);
    if (balance === null) return res.status(400).json({ error: '포인트가 부족합니다.' });
    store.addBet({ id: randomUUID(), groupId: round.group_id, subject: round.id, playerId: player.id, choice, amount });
    res.json({ ok: true, balance });
});

app.post('/api/bet-rounds/:roundId/action', (req, res) => {
    const round = store.getBetRound(req.params.roundId);
    if (!round) return res.status(404).json({ error: '베팅 판을 찾을 수 없습니다.' });
    const player = store.getPlayer(String(req.body?.playerId ?? ''));
    if (!player) return res.status(404).json({ error: '참가자를 찾을 수 없습니다.' });
    const auth = checkPin(player.id, player.groupId, req.body?.pin);
    if (!auth.ok) return res.status(403).json({ error: auth.error });
    if (round.creator_id !== player.id) return res.status(403).json({ error: '판을 연 사람만 관리할 수 있습니다.' });
    const action = String(req.body?.action ?? '');
    if (round.status === 'settled' || round.status === 'cancelled') return res.status(409).json({ error: '이미 끝난 판입니다.' });

    if (action === 'lock') { store.setBetRoundStatus(round.id, 'locked'); return res.json({ ok: true }); }
    if (action === 'unlock') { store.setBetRoundStatus(round.id, 'open'); return res.json({ ok: true }); }
    if (action === 'cancel') {
        const open = store.openBetsOf(round.group_id, round.id);
        for (const b of open) { store.addPoints(round.group_id, b.player_id, b.amount, `베팅 취소 환불: ${round.title}`); store.markBet(b.id, 'refunded'); }
        store.setBetRoundStatus(round.id, 'cancelled');
        return res.json({ ok: true, refunded: open.length });
    }
    if (action === 'settle') {
        const winner = String(req.body?.winner ?? '');
        if (!JSON.parse(round.choices).includes(winner)) return res.status(400).json({ error: '승리 선택지가 올바르지 않습니다.' });
        const open = store.openBetsOf(round.group_id, round.id);
        const winners = open.filter(b => b.choice === winner);
        const losers = open.filter(b => b.choice !== winner);
        const winPool = winners.reduce((s, b) => s + b.amount, 0);
        const losePool = losers.reduce((s, b) => s + b.amount, 0);
        for (const b of winners) {
            const share = winPool > 0 ? Math.floor((b.amount / winPool) * losePool) : 0;
            store.addPoints(round.group_id, b.player_id, b.amount + share, `베팅 적중: ${round.title} · ${winner}`);
            store.markBet(b.id, 'won');
        }
        if (winners.length === 0) {
            for (const b of losers) { store.addPoints(round.group_id, b.player_id, b.amount, `베팅 무효 환불: ${round.title}`); store.markBet(b.id, 'refunded'); }
        } else {
            for (const b of losers) store.markBet(b.id, 'lost');
        }
        store.setBetRoundStatus(round.id, 'settled', winner);
        return res.json({ ok: true, winners: winners.length, pool: losePool });
    }
    res.status(400).json({ error: '알 수 없는 동작입니다.' });
});

app.get('/api/groups/:groupId/bets', (req, res) => {
    res.json({ bets: store.listBets(req.params.groupId, String(req.query.subject ?? '')) });
});

app.post('/api/groups/:groupId/bets', (req, res) => {
    const player = store.getPlayer(String(req.body?.playerId ?? ''));
    if (!player) return res.status(404).json({ error: '참가자를 찾을 수 없습니다.' });
    const auth = checkPin(player.id, player.groupId, req.body?.pin);
    if (!auth.ok) return res.status(403).json({ error: auth.error });
    const subject = String(req.body?.subject ?? '').slice(0, 120);
    const choice = String(req.body?.choice ?? '').slice(0, 60);
    const amount = Math.floor(Number(req.body?.amount));
    if (!subject || !choice || !Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: '베팅 정보가 올바르지 않습니다.' });
    }
    if (store.listBets(req.params.groupId, subject).some(b => b.playerId === player.id && b.status === 'open')) {
        return res.status(409).json({ error: '이미 이 경기에 베팅했습니다.' });
    }
    const balance = store.addPoints(player.groupId, player.id, -amount, `베팅: ${choice}`);
    if (balance === null) return res.status(400).json({ error: '포인트가 부족합니다.' });
    store.addBet({ id: randomUUID(), groupId: req.params.groupId, subject, playerId: player.id, choice, amount });
    res.json({ ok: true, balance });
});

app.post('/api/groups/:groupId/bets/settle', (req, res) => {
    const subject = String(req.body?.subject ?? '');
    const winner = String(req.body?.winner ?? '');
    if (!subject || !winner) return res.status(400).json({ error: '정산 정보가 없습니다.' });
    const open = store.openBetsOf(req.params.groupId, subject);
    if (open.length === 0) return res.json({ ok: true, settled: 0 });
    const winners = open.filter(b => b.choice === winner);
    const losers = open.filter(b => b.choice !== winner);
    const winPool = winners.reduce((s, b) => s + b.amount, 0);
    const losePool = losers.reduce((s, b) => s + b.amount, 0);
    for (const b of winners) {
        const share = winPool > 0 ? Math.floor((b.amount / winPool) * losePool) : 0;
        store.addPoints(req.params.groupId, b.player_id, b.amount + share, `베팅 적중: ${winner}`);
        store.markBet(b.id, 'won');
    }
    if (winners.length === 0) {
        for (const b of losers) { store.addPoints(req.params.groupId, b.player_id, b.amount, '베팅 무효 환불'); store.markBet(b.id, 'refunded'); }
    } else {
        for (const b of losers) store.markBet(b.id, 'lost');
    }
    res.json({ ok: true, settled: open.length, winners: winners.length, pool: losePool });
});

/*
 * --- 문의/건의 ---
 * 로컬 SQLite에 저장하고, FormSubmit 무료 릴레이로 운영자 메일로 전달한다 (functions/api와 동일).
 */
const FEEDBACK_EMAIL = 'pogooo1103@gmail.com';

app.post('/api/feedback', async (req, res) => {
    const message = String(req.body?.message ?? '').trim().slice(0, 2000);
    const contact = String(req.body?.contact ?? '').trim().slice(0, 200);
    if (!message) return res.status(400).json({ error: '내용을 입력해 주세요.' });

    let sent = false;
    try {
        const { default: axios } = await import('axios');
        const r = await axios.post(`https://formsubmit.co/ajax/${FEEDBACK_EMAIL}`, {
            _subject: '[팀툴] 문의/건의',
            _template: 'box',
            message,
            contact: contact || '(미기재)',
        }, { timeout: 8000, headers: { Accept: 'application/json' } });
        sent = r.status >= 200 && r.status < 300;
    } catch { /* 릴레이 실패해도 저장은 유지 */ }

    store.addFeedback({ id: randomUUID(), message, contact, clientId: clientIdOf(req), sent });
    res.json({ ok: true });
});

/* --- 에러 처리 --- */

app.use((err, _req, res, _next) => {
    if (err instanceof RiotError) {
        return res.status(err.status >= 400 && err.status < 600 ? err.status : 500).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: '서버 내부 오류가 발생했습니다.' });
});

const port = Number(process.env.API_PORT ?? 5175);
app.listen(port, () => {
    console.log(`[lol_teamtool] 로컬 API 서버 실행 중: http://localhost:${port}`);
    console.log(`[lol_teamtool] Riot API 키: ${riotKeyConfigured() ? '설정됨' : '없음 (.env 확인)'}`);
});
