import { makeStore } from '../_lib/db.js';
import { makeRiot, RiotError, toMatchRecord } from '../_lib/riot.js';
import { getAssetMeta, getChampionImage, getItemImage, getRuneImage, getSpellImage } from '../_lib/assets.js';
import { applyAuctionAction } from '../_lib/auctionEngine.js';
import {
    sheetsConfigured, serviceAccountEmail, spreadsheetIdOf,
    firstSheet, firstSheetTitle, readValues, writeValues, valuesToCsv, setTierDropdown, setTierColors, beautifySheet,
    buildTierGrid,
} from '../_lib/gsheets.js';
import {
    kstDay, CHECKIN_BASE, CHECKIN_STREAK_BONUS, WIN_REWARD, LOSE_REWARD, TREASURE_REWARD,
    GAMBLE_MIN, GAMBLE_MAX, playGamble, treasureSpot, SHOP_ITEMS, findItem,
} from '../_lib/points.js';

/*
 * 프로덕션 API — Cloudflare Pages Functions (server/index.js의 Express 라우트 포팅).
 * /api/* 전체를 이 파일 하나가 처리한다. 저장소는 D1(binding: DB), Riot 키는 시크릿 RIOT_API_KEY.
 * 로컬 개발은 기존대로 npm run server(Express + SQLite)를 사용한다 — 두 구현의 라우트는 1:1 동일.
 */

const json = (data, status = 200, headers = {}) =>
    new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
    });

const png = (buf) =>
    new Response(buf, {
        headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' },
    });

// 헷갈리는 문자(0/O, 1/I/L) 제외 8자 참여 코드
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newJoinCode = () =>
    Array.from({ length: 8 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* --- 라우트 테이블 --- */

const routes = [];
const on = (method, pattern, handler) =>
    routes.push({ method, parts: pattern.split('/').filter(Boolean), handler });

/* --- 헬스체크 --- */

on('GET', '/health', ({ riot }) => json({ ok: true, riotKeyConfigured: riot.configured() }));

/* --- 게임 에셋 프록시 (functions/_lib/assets.js) --- */

on('GET', '/assets/meta', async () => {
    try {
        const meta = await getAssetMeta();
        // 브라우저 캐시 금지 — 필드가 추가될 때 구버전 응답이 붙잡히지 않도록
        return json({
            version: meta.version,
            champNames: meta.champNames,
            champKeys: meta.champKeys ?? {},
            itemNames: meta.itemNames,
            runeNames: meta.runeNames ?? {},
            spellNames: meta.spellNames ?? {},
        }, 200, { 'Cache-Control': 'no-store' });
    } catch {
        // CDN 불가 시에도 200 — 프론트는 내장 한글 맵으로 동작한다
        return json({ version: null, champNames: {}, champKeys: {}, itemNames: {}, runeNames: {}, spellNames: {} });
    }
});

// 이미지 4종은 엣지 캐시(caches.default)를 태운다 — onRequest에서 공통 처리
const imageRoute = (loader) => async ({ params }) => {
    try {
        return png(await loader(params.id));
    } catch {
        return new Response(null, { status: 404 });
    }
};
on('GET', '/assets/champion/:id', imageRoute(getChampionImage));
on('GET', '/assets/item/:id', imageRoute(getItemImage));
on('GET', '/assets/rune/:id', imageRoute(getRuneImage));
on('GET', '/assets/spell/:id', imageRoute(getSpellImage));

/* --- 그룹 ---
 * 그룹 "목록"은 브라우저별 클라이언트 ID(X-Client-Id 헤더)로 분리된다.
 * 그룹 "내용" 접근은 참여 코드 기반 격리 원칙 유지 (PLANNING.md 6.1).
 */

on('GET', '/groups', async ({ store, clientId }) =>
    json(clientId ? await store.listGroupsFor(clientId) : []));

on('POST', '/groups', async ({ store, clientId, body }) => {
    if (!clientId) return json({ error: '클라이언트 식별자가 없습니다. 새로고침 후 다시 시도해 주세요.' }, 400);
    const name = String(body?.name ?? '').trim();
    if (!name) return json({ error: '그룹 이름을 입력해 주세요.' }, 400);
    const group = await store.createGroup({ id: crypto.randomUUID(), name, joinCode: newJoinCode(), createdAt: Date.now() });
    await store.addMembership(clientId, group.id);
    return json(group);
});

on('POST', '/groups/join', async ({ store, clientId, body }) => {
    if (!clientId) return json({ error: '클라이언트 식별자가 없습니다. 새로고침 후 다시 시도해 주세요.' }, 400);
    const code = String(body?.code ?? '').trim().toUpperCase();
    const group = await store.findGroupByCode(code);
    if (!group) return json({ error: '참여 코드에 해당하는 그룹이 없습니다.' }, 404);
    await store.addMembership(clientId, group.id);
    return json(group);
});

// 그룹 나가기 — 마지막 멤버가 나가면 그룹 데이터 전체 삭제
on('POST', '/groups/:groupId/leave', async ({ store, clientId, params }) => {
    if (!clientId) return json({ error: '클라이언트 식별자가 없습니다.' }, 400);
    const remaining = await store.removeMembership(clientId, params.groupId);
    if (remaining === 0) await store.deleteGroup(params.groupId);
    return json({ left: true, deleted: remaining === 0 });
});

/* --- 참가자 / 계정 --- */

on('GET', '/groups/:groupId/players', async ({ store, params }) =>
    json({
        players: await store.listPlayers(params.groupId),
        accounts: await store.listAccountsByGroup(params.groupId),
        laneTiers: await store.listLaneTiers(params.groupId),
    }));

on('POST', '/groups/:groupId/players', async (ctx) => {
    const { store, params, body } = ctx;
    const displayName = String(body?.displayName ?? '').trim();
    if (!displayName) return json({ error: '참가자 이름을 입력해 주세요.' }, 400);
    await store.addPlayer({ id: crypto.randomUUID(), groupId: params.groupId, displayName });
    scheduleSheetPush(ctx, params.groupId);
    return json({ ok: true });
});

on('DELETE', '/players/:playerId', async (ctx) => {
    const { store, params } = ctx;
    const player = await store.getPlayer(params.playerId);
    await store.removePlayer(params.playerId);
    if (player) scheduleSheetPush(ctx, player.groupId);
    return json({ ok: true });
});

// 계정 등록 — Riot Account-V1로 실제 검증 후 puuid 저장
on('POST', '/players/:playerId/accounts', async ({ store, riot, params, body }) => {
    const player = await store.getPlayer(params.playerId);
    if (!player) return json({ error: '참가자를 찾을 수 없습니다.' }, 404);
    if (!riot.configured()) return json({ error: '라이엇 연동이 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.' }, 503);

    const gameName = String(body?.gameName ?? '').trim();
    const tagLine = String(body?.tagLine ?? '').trim();
    if (!gameName || !tagLine) return json({ error: '게임명#태그 형식으로 입력해 주세요.' }, 400);

    const account = await riot.resolveAccount(gameName, tagLine);
    /*
     * 태그를 잘못 넣으면(예: KR1 대신 kr) 전혀 다른 계정이 잡힐 수 있다.
     * KR 서버 소환사인지 확인해 "등록은 됐는데 티어가 안 뜨는" 상태를 막는다.
     */
    try {
        await riot.getSummonerByPuuid(account.puuid);
    } catch {
        return json({
            error: `"${account.gameName ?? gameName}#${account.tagLine ?? tagLine}" 은(는) KR 서버에서 찾을 수 없습니다. 태그를 정확히 입력해 주세요. (예: Hide on bush#KR1)`,
        }, 404);
    }
    if (await store.findAccountInGroup(player.groupId, account.puuid)) {
        return json({ error: '이미 이 그룹에 등록된 계정입니다.' }, 409);
    }
    await store.addAccount({
        id: crypto.randomUUID(),
        playerId: player.id,
        groupId: player.groupId,
        gameName: account.gameName ?? gameName,
        tagLine: account.tagLine ?? tagLine,
        puuid: account.puuid,
    });
    return json({ ok: true });
});

on('DELETE', '/accounts/:accountId', async ({ store, params }) => {
    await store.removeAccount(params.accountId);
    return json({ ok: true });
});

on('POST', '/accounts/:accountId/primary', async ({ store, params }) => {
    await store.setPrimaryAccount(params.accountId);
    return json({ ok: true });
});

/*
 * 참가자 상세 프로필 — 등록된 모든 계정의 Riot 정보(Summoner-V4 + League-V4 전 필드)를
 * 실시간 조회하고 합산 요약을 만든다. 계정별 5분 메모리 캐시로 레이트 리밋을 보호한다.
 */
const TIER_ORDER = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'];
const RANK_ORDER = ['IV', 'III', 'II', 'I'];
const profileCache = new Map(); // puuid -> { data, at } — isolate 생존 동안 유지 (best effort)
const PROFILE_TTL = 5 * 60 * 1000;

/*
 * 최근 매치 샘플 수: Workers 무료 플랜은 요청당 서브리퀘스트 50개 제한이 있어
 * 로컬(10)보다 줄인다 — 계정당 4(프로필) + 1(ids) + 5(매치) = 10 서브리퀘스트.
 */
const RECENT_SAMPLE = 5;

const analyzeRecentMatches = async (riot, puuid) => {
    const ids = await riot.listRecentMatchIds(puuid, RECENT_SAMPLE);
    const champions = new Map();
    const positions = new Map();
    const keystones = new Map();
    const spellPairs = new Map();
    let sampleSize = 0;

    for (const matchId of ids) {
        let match;
        try {
            match = await riot.getMatch(matchId);
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

const fetchAccountProfile = async (riot, puuid) => {
    const cached = profileCache.get(puuid);
    if (cached && Date.now() - cached.at < PROFILE_TTL) return cached.data;
    const [summoner, leagues, masteries, masteryScore] = await Promise.all([
        riot.getSummonerByPuuid(puuid),
        riot.getLeagueEntriesByPuuid(puuid),
        riot.getChampionMasteries(puuid),
        riot.getMasteryScore(puuid),
    ]);
    const recentStats = await analyzeRecentMatches(riot, puuid);
    const data = { summoner, leagues, masteries, masteryScore, recentStats };
    profileCache.set(puuid, { data, at: Date.now() });
    return data;
};

on('GET', '/players/:playerId/profile', async ({ store, riot, params }) => {
    const player = await store.getPlayer(params.playerId);
    if (!player) return json({ error: '참가자를 찾을 수 없습니다.' }, 404);

    const accounts = await store.listAccountsByPlayer(player.id);
    const rankings = await store.playerRankings(player.groupId);
    const scrim = rankings.find(r => r.playerId === player.id) ?? { games: 0, wins: 0 };

    const results = [];
    for (const acc of accounts) {
        if (!riot.configured()) {
            results.push({ ...acc, summoner: null, leagues: [], masteries: [], masteryScore: null, recentStats: null, error: '라이엇 연동이 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.' });
            continue;
        }
        try {
            const { summoner, leagues, masteries, masteryScore, recentStats } = await fetchAccountProfile(riot, acc.puuid);
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

    return json({
        player,
        comment: await store.getPlayerComment(player.id),
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

/*
 * --- 그룹 참가자 레이팅 (팀 빌더 자동 티어·점수용) ---
 * 참가자별 대표 계정 하나만 골라 티어/랭크 승패/최근 30일 활동량을 가볍게 가져온다.
 * 계정당 서브리퀘스트 3회(소환사·리그·최근 매치ID)라 Workers 제한(50) 안에서 최대 15명까지 처리한다.
 */
const RATING_TTL = 10 * 60 * 1000;
const RATING_MAX_PLAYERS = 15;
const ratingCache = new Map(); // puuid -> { data, at }

const fetchRating = async (riot, puuid) => {
    const cached = ratingCache.get(puuid);
    if (cached && Date.now() - cached.at < RATING_TTL) return cached.data;

    const since = Math.floor((Date.now() - 30 * 24 * 3600 * 1000) / 1000);
    const [summoner, leagues, recentIds] = await Promise.all([
        riot.getSummonerByPuuid(puuid).catch(() => null),
        riot.getLeagueEntriesByPuuid(puuid).catch(() => []),
        riot.listMatchIdsSince(puuid, since, 30).catch(() => []),
    ]);
    // 소환사 조회 자체가 실패하면 "언랭"이 아니라 "조회 실패" — 화면에서 구분해 보여준다
    const lookupFailed = summoner === null;

    // 솔로랭크 우선, 없으면 자유랭크
    const solo = (leagues ?? []).find(e => e.queueType === 'RANKED_SOLO_5x5');
    const flex = (leagues ?? []).find(e => e.queueType === 'RANKED_FLEX_SR');
    const entry = solo ?? flex ?? null;

    const data = {
        summonerLevel: summoner?.summonerLevel ?? null,
        profileIconId: summoner?.profileIconId ?? null,
        queueType: entry?.queueType ?? null,
        tier: entry?.tier ?? null,          // 'GOLD' 등 (없으면 언랭)
        division: entry?.rank ?? null,      // 'I'~'IV'
        leaguePoints: entry?.leaguePoints ?? 0,
        wins: entry?.wins ?? 0,
        losses: entry?.losses ?? 0,
        recentGames30d: Array.isArray(recentIds) ? recentIds.length : 0,
        lookupFailed,
    };
    ratingCache.set(puuid, { data, at: Date.now() });
    return data;
};

/*
 * 팀 빌더의 기본 티어 — "그 사람의 최고 솔로랭크 티어(없으면 자유랭크)".
 * 부계정을 여러 개 등록했으면 그중 가장 높은 랭크를 기본값으로 삼는다.
 * 점수 가감(활동량·승률·표본)에 쓰이는 값도 같이 담아 보낸다.
 */
const RANK_TTL = 10 * 60 * 1000;
const rankCache = new Map();  // puuid -> { data, at }
const gamesCache = new Map(); // puuid -> { games, at }

/** Workers 서브리퀘스트 50회 제한 안에서 안전한 상한 (요청 하나 기준) */
const BUILDER_RIOT_BUDGET = 36;
/** 한 요청에서 처리할 인원 — 1인당 최대 3회 호출이라 12명이면 한도 안에 든다 */
const RANK_PAGE = 12;
/** 한 사람당 들여다볼 계정 수 — 본계 + 부계 하나 */
const ACCOUNTS_PER_PLAYER = 2;

const RIOT_TIER_ORDER = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'];
const RIOT_DIV_ORDER = ['IV', 'III', 'II', 'I'];

/** 랭크 세기 — 티어 > 디비전 > LP 순으로 비교한다 */
const rankStrength = (r) => (r
    ? RIOT_TIER_ORDER.indexOf(r.tier) * 1000 + (RIOT_DIV_ORDER.indexOf(r.division ?? 'I') + 1) * 100 + Math.min(r.lp ?? 0, 99)
    : -1);

/** 계정의 솔로랭크·자유랭크 (승패까지) */
const fetchRiotRank = async (riot, puuid) => {
    const cached = rankCache.get(puuid);
    if (cached && Date.now() - cached.at < RANK_TTL) return cached.data;

    const entries = await riot.getLeagueEntriesByPuuid(puuid).catch(() => []);
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

/** 최근 30일 게임 수 — 매치 ID 개수만 세므로 서브리퀘스트 1회 */
const fetchRecentGames = async (riot, puuid) => {
    const cached = gamesCache.get(puuid);
    if (cached && Date.now() - cached.at < RANK_TTL) return cached.games;
    const since = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
    const ids = await riot.listMatchIdsSince(puuid, since, 100).catch(() => null);
    const games = Array.isArray(ids) ? ids.length : null;
    gamesCache.set(puuid, { games, at: Date.now() });
    return games;
};

/**
 * 참가자들의 기본 티어를 모아 온다.
 *
 * 인원이 많으면 한 요청의 서브리퀘스트 한도(50회)에 걸려 뒷사람들이 통째로 빠진다.
 * 그래서 한 번에 RANK_PAGE명씩만 처리하고, 나머지는 클라이언트가 이어서 요청한다.
 */
const collectRanks = async (riot, players, accounts) => {
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
            try { r = await fetchRiotRank(riot, acc.puuid); } catch { continue; }
            const riotId = `${acc.gameName}#${acc.tagLine}`;
            if (r.solo) cands.push({ queue: 'solo', puuid: acc.puuid, riotId, ...r.solo });
            if (r.flex) cands.push({ queue: 'flex', puuid: acc.puuid, riotId, ...r.flex });
        }
        if (cands.length === 0) continue;

        // 솔랭이 하나라도 있으면 솔랭끼리만 비교하고, 없을 때만 자랭을 쓴다
        const solos = cands.filter(c => c.queue === 'solo');
        const best = (solos.length ? solos : cands).sort((a, b) => rankStrength(b) - rankStrength(a))[0];

        let games30d = null;
        if (used < BUILDER_RIOT_BUDGET) {
            used += 1;
            games30d = await fetchRecentGames(riot, best.puuid);
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

on('GET', '/groups/:groupId/builder', async ({ store, riot, params }) => {
    const [players, laneTiers, laneStats, accounts] = await Promise.all([
        store.listPlayers(params.groupId),
        store.listLaneTiers(params.groupId),
        store.listLaneStats(params.groupId),
        store.listAccountsByGroup(params.groupId),
    ]);

    const riotRanks = riot.configured() ? await collectRanks(riot, players.slice(0, RANK_PAGE), accounts) : [];
    const rankNext = riot.configured() && players.length > RANK_PAGE ? RANK_PAGE : null;

    return json({ players, laneTiers, laneStats, riotRanks, rankNext });
});

/** 나머지 인원의 기본 티어 — 클라이언트가 next가 null이 될 때까지 이어서 부른다 */
on('GET', '/groups/:groupId/ranks', async ({ store, riot, params, url }) => {
    const start = Math.max(0, Number(url.searchParams.get('start') ?? 0) || 0);
    const [players, accounts] = await Promise.all([
        store.listPlayers(params.groupId),
        store.listAccountsByGroup(params.groupId),
    ]);
    if (!riot.configured()) return json({ riotRanks: [], next: null });

    const riotRanks = await collectRanks(riot, players.slice(start, start + RANK_PAGE), accounts);
    const end = start + RANK_PAGE;
    return json({ riotRanks, next: end < players.length ? end : null });
});

/**
 * 시트/엑셀 한 판을 그룹에 통째로 반영한다.
 * 명단에 없는 이름은 참가자로 새로 만들어, 시트 하나로 그룹 전체를 관리할 수 있게 한다.
 */
on('POST', '/groups/:groupId/import-tiers', async (ctx) => {
    const { store, params, body } = ctx;
    const group = await store.getGroup(params.groupId);
    if (!group) return json({ error: '그룹을 찾을 수 없습니다.' }, 404);

    const rows = Array.isArray(body?.rows) ? body.rows : [];
    const [players, existingTiers] = await Promise.all([
        store.listPlayers(group.id),
        store.listLaneTiers(group.id),
    ]);
    const byName = new Map(players.map(p => [p.displayName.trim().toLowerCase(), p]));
    // 상시 동기화가 주기적으로 부르므로, 실제로 달라진 값만 저장한다
    const tierMap = new Map(existingTiers.map(t => [`${t.playerId}|${t.position}`, t.tier]));

    let added = 0;
    let updated = 0;
    for (const row of rows.slice(0, 200)) {
        const name = String(row?.name ?? '').trim();
        if (!name) continue;

        let player = byName.get(name.toLowerCase());
        if (!player) {
            player = { id: crypto.randomUUID(), groupId: group.id, displayName: name };
            await store.addPlayer(player);
            byName.set(name.toLowerCase(), player);
            added += 1;
        }
        const setIfChanged = async (pos, raw) => {
            const next = raw || null;
            if ((tierMap.get(`${player.id}|${pos}`) ?? null) === next) return;
            await store.setLaneTier(player.id, pos, next);
        };
        if (row.base !== undefined) await setIfChanged('기본', row.base);
        for (const [pos, value] of Object.entries(row.lanes ?? {})) {
            if (value !== undefined) await setIfChanged(pos, value);
        }
        updated += 1;
    }
    // 시트에서 온 반영이면 시트에 되돌려 쓸 필요가 없다
    if (!body?.fromSheet) scheduleSheetPush(ctx, group.id);
    return json({ ok: true, added, updated });
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

/** 연동할 시트 주소 저장 (url이 비면 연동 해제) */
on('PUT', '/groups/:groupId/sheet', async ({ store, env, params, body }) => {
    const group = await store.getGroup(params.groupId);
    if (!group) return json({ error: '그룹을 찾을 수 없습니다.' }, 404);

    const raw = String(body?.url ?? '').trim();
    if (!raw) {
        await store.setGroupSheet(group.id, null);
        return json({ ok: true, url: null });
    }
    const csvUrl = toCsvUrl(raw);
    if (!csvUrl) return json({ error: '구글 시트 주소가 아닙니다. 시트 링크를 그대로 붙여 넣어 주세요.' }, 400);

    /*
     * 저장 전에 한 번 읽어 본다.
     * 서비스 계정에 공유된 시트면 비공개여도 읽히고, 아니면 공개 링크(CSV)로 시도한다.
     */
    let csv = null;
    let failure = null;
    try {
        csv = await readViaAccount(env, csvUrl);
    } catch (e) {
        failure = e.message;
    }
    if (csv === null) {
        const probe = await fetchSheetCsv(csvUrl).catch(() => ({ error: '시트를 읽지 못했습니다.' }));
        if (probe.error) return json({ error: failure ?? probe.error }, 400);
        csv = probe.csv;
    }

    await store.setGroupSheet(group.id, csvUrl);
    return json({ ok: true, url: csvUrl, csv });
});

/** 연동한 시트 내용 가져오기 — 서비스 계정 우선, 안 되면 공개 링크 */
on('GET', '/groups/:groupId/sheet', async ({ store, env, params }) => {
    const group = await store.getGroup(params.groupId);
    if (!group) return json({ error: '그룹을 찾을 수 없습니다.' }, 404);
    if (!group.sheetUrl) return json({ url: null, csv: null });

    try {
        const csv = await readViaAccount(env, group.sheetUrl);
        if (csv !== null) return json({ url: group.sheetUrl, csv, via: 'account' });
    } catch { /* 공유가 안 됐으면 공개 링크로 시도 */ }

    const out = await fetchSheetCsv(group.sheetUrl).catch(() => ({ error: '시트를 읽지 못했습니다.' }));
    if (out.error) return json({ url: group.sheetUrl, error: out.error }, 502);
    return json({ url: group.sheetUrl, csv: out.csv, via: 'public' });
});

/* --- 구글 시트 양방향 (서비스 계정) ---
 * 시트를 서비스 계정에 편집자로 공유해 두면 비공개 시트도 읽고 쓸 수 있다.
 * 공개 링크(CSV)만 있는 시트는 예전처럼 읽기만 된다.
 */

/** 연동 상태 — 화면에서 "어느 이메일에 공유해야 하는지" 안내하는 데 쓴다 */
on('GET', '/sheets/account', ({ env }) => json({
    ready: sheetsConfigured(env),
    email: serviceAccountEmail(env),
}));

/** 서비스 계정으로 시트를 읽어 CSV로 돌려준다 (실패하면 null) */
const readViaAccount = async (env, url) => {
    if (!sheetsConfigured(env)) return null;
    const id = spreadsheetIdOf(url);
    if (!id) return null;
    const title = await firstSheetTitle(env, id);
    const values = await readValues(env, id, title);
    return valuesToCsv(values);
};

/** 앱 → 시트 저장. 클라이언트가 만든 표를 그대로 덮어쓴다 */
on('POST', '/groups/:groupId/sheet/push', async ({ store, env, params, body }) => {
    const group = await store.getGroup(params.groupId);
    if (!group) return json({ error: '그룹을 찾을 수 없습니다.' }, 404);
    if (!group.sheetUrl) return json({ error: '연동된 시트가 없습니다.' }, 400);
    if (!sheetsConfigured(env)) return json({ error: '구글 서비스 계정이 설정되지 않았습니다.' }, 503);

    const id = spreadsheetIdOf(group.sheetUrl);
    if (!id) return json({ error: '웹에 게시한 주소는 쓰기가 안 됩니다. 시트 편집 링크로 다시 연결해 주세요.' }, 400);

    const values = Array.isArray(body?.values) ? body.values : null;
    if (!values) return json({ error: '보낼 표가 없습니다.' }, 400);

    try {
        const { title, sheetId } = await firstSheet(env, id);
        await writeValues(env, id, title, values);
        await beautifySheet(env, id, sheetId, values.length).catch(() => { /* 꾸미기 실패는 무시 */ });
        // 티어 칸은 목록에서 고르게 한다 (목록은 앱이 만들어 보낸다)
        const choices = Array.isArray(body?.choices) ? body.choices : null;
        if (choices?.length) {
            await setTierDropdown(env, id, sheetId, choices).catch(() => { /* 서식 실패는 치명적이지 않다 */ });
        }
        const tiers = Array.isArray(body?.tiers) ? body.tiers : null;
        if (tiers?.length) {
            await setTierColors(env, id, sheetId, tiers).catch(() => { /* 색은 없어도 동작한다 */ });
        }
        return json({ ok: true, rows: Math.max(0, values.length - 1) });
    } catch (e) {
        return json({ error: e.message ?? '시트에 쓰지 못했습니다.' }, 502);
    }
});



/**
 * 참가자 데이터가 바뀔 때 연결된 시트에 곧바로 반영한다 (상시 동기화의 "팀툴 → 시트" 방향).
 * 응답을 붙잡지 않도록 waitUntil로 미뤄 두고, 실패해도 본 동작에는 영향을 주지 않는다.
 */
const pushSheetFromDb = async (env, store, groupId) => {
    if (!sheetsConfigured(env)) return;
    const group = await store.getGroup(groupId);
    const id = group?.sheetUrl ? spreadsheetIdOf(group.sheetUrl) : null;
    if (!id) return;

    const [players, laneTiers] = await Promise.all([
        store.listPlayers(groupId),
        store.listLaneTiers(groupId),
    ]);
    const { title } = await firstSheet(env, id);
    // 시트에 적어 둔 점수 조절 값은 지우지 않고 이어 간다
    const current = await readValues(env, id, title).catch(() => []);
    const adjustByName = new Map();
    for (const row of current.slice(1)) {
        const name = String(row?.[0] ?? '').trim();
        if (name) adjustByName.set(name, row?.[7] ?? '');
    }
    await writeValues(env, id, title, buildTierGrid(players, laneTiers, adjustByName));
};

/** 변경 후 시트 반영 예약 — waitUntil이 있으면 응답 이후에 처리한다 */
const scheduleSheetPush = (ctx, groupId) => {
    const job = pushSheetFromDb(ctx.env, ctx.store, groupId).catch(() => { /* 시트 반영 실패는 무시 */ });
    if (ctx.waitUntil) ctx.waitUntil(job);
};

/**
 * 이 참가자의 롤 랭크를 조회해 "기본" 티어로 저장한다 — 참가자 관리의 사람별 버튼.
 * 최고 솔랭(없으면 자랭)을 고르고, 저장까지 해서 새로고침해도 유지된다.
 */
on('POST', '/players/:playerId/riot-tier', async (ctx) => {
    const { store, riot, params } = ctx;
    const player = await store.getPlayer(params.playerId);
    if (!player) return json({ error: '참가자를 찾을 수 없습니다.' }, 404);
    if (!riot.configured()) return json({ error: '라이엇 연동이 준비되지 않았습니다.' }, 503);

    const accounts = await store.listAccountsByPlayer(player.id);
    if (accounts.length === 0) {
        return json({ error: '등록된 롤 계정이 없습니다. 계정을 먼저 등록해 주세요.' }, 400);
    }

    const mine = accounts
        .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0))
        .slice(0, ACCOUNTS_PER_PLAYER);
    const cands = [];
    for (const acc of mine) {
        let r;
        try { r = await fetchRiotRank(riot, acc.puuid); } catch { continue; }
        const riotId = `${acc.gameName}#${acc.tagLine}`;
        if (r.solo) cands.push({ queue: 'solo', riotId, ...r.solo });
        if (r.flex) cands.push({ queue: 'flex', riotId, ...r.flex });
    }
    if (cands.length === 0) {
        return json({ error: '랭크 기록이 없습니다 (언랭). 표나 우클릭으로 직접 지정해 주세요.' }, 404);
    }

    const solos = cands.filter(c => c.queue === 'solo');
    const best = (solos.length ? solos : cands).sort((a, b) => rankStrength(b) - rankStrength(a))[0];
    const division = ['I', 'II', 'III', 'IV'].includes(best.division) ? best.division : 'I';
    const value = `${String(best.tier).toLowerCase()}:${division}`;
    await store.setLaneTier(player.id, '기본', value);
    scheduleSheetPush(ctx, player.groupId);
    return json({ ok: true, value, queue: best.queue, riotId: best.riotId, lp: best.lp });
});

/** 라인별 티어 지정 — tier가 비어 있으면 해제 */
on('PUT', '/players/:playerId/lane-tiers', async (ctx) => {
    const { store, params, body } = ctx;
    const player = await store.getPlayer(params.playerId);
    if (!player) return json({ error: '참가자를 찾을 수 없습니다.' }, 404);
    const position = String(body?.position ?? '');
    const tier = body?.tier ? String(body.tier) : null;
    if (!position) return json({ error: '라인이 지정되지 않았습니다.' }, 400);
    await store.setLaneTier(player.id, position, tier);
    scheduleSheetPush(ctx, player.groupId);
    return json({ ok: true });
});

on('GET', '/groups/:groupId/ratings', async ({ store, riot, params }) => {
    const players = await store.listPlayers(params.groupId);
    const accounts = await store.listAccountsByGroup(params.groupId);
    // 라인별 숙련도 — 라이엇 연동과 무관하게 그룹 내전 기록만으로 계산된다
    const laneStats = await store.listLaneStats(params.groupId);
    if (!riot.configured()) {
        return json({ ratings: [], laneStats, error: '라이엇 연동이 아직 준비되지 않았습니다.' });
    }

    const ratings = [];
    let used = 0;
    for (const p of players) {
        const mine = accounts.filter(a => a.playerId === p.id);
        const acc = mine.find(a => a.isPrimary) ?? mine[0];
        const row = { playerId: p.id, displayName: p.displayName, riotId: acc ? `${acc.gameName}#${acc.tagLine}` : null };
        if (!acc || used >= RATING_MAX_PLAYERS) {
            ratings.push({ ...row, tier: null, recentGames30d: 0, truncated: !acc ? false : true });
            continue;
        }
        used += 1;
        try {
            ratings.push({ ...row, ...(await fetchRating(riot, acc.puuid)) });
        } catch {
            ratings.push({ ...row, tier: null, recentGames30d: 0, error: true });
        }
    }
    return json({ ratings, laneStats });
});

/* --- 매치 --- */

on('GET', '/groups/:groupId/matches', async ({ store, params }) =>
    json(await store.listMatches(params.groupId)));

on('GET', '/groups/:groupId/stats', async ({ store, params }) =>
    json(await store.groupStats(params.groupId)));

on('GET', '/groups/:groupId/rankings', async ({ store, params }) =>
    json(await store.playerRankings(params.groupId)));

// 데모 매치 저장 (프론트에서 생성한 레코드)
on('POST', '/groups/:groupId/matches', async ({ store, params, body }) => {
    const m = body;
    if (!m?.riotMatchId || !Array.isArray(m.participants)) {
        return json({ error: '잘못된 매치 데이터입니다.' }, 400);
    }
    const record = { ...m, groupId: params.groupId };
    if (await store.insertMatch(record)) {
        await grantMatchPoints(store, params.groupId, record);
    }
    return json({ ok: true });
});

on('DELETE', '/matches/:matchId', async ({ store, params }) => {
    await store.deleteMatch(params.matchId);
    return json({ ok: true });
});

// 저장된 원본 데이터 전체 ("상세정보 보기") — 로비 이벤트 포함
on('GET', '/matches/:matchId/detail', async ({ store, riot, params }) => {
    const detail = await store.getMatchDetail(params.matchId);
    if (!detail) return json({ error: '매치를 찾을 수 없습니다.' }, 404);

    // 토너먼트 코드로 치러진 매치면 해당 코드의 로비 이벤트를 함께 반환
    if (await store.getTournamentCode(detail.riotMatchId) && riot.configured()) {
        try {
            detail.lobbyEvents = await riot.stubLobbyEvents(detail.riotMatchId);
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
    return json(detail);
});

/*
 * 내전 자동 수집 (PLANNING.md 4장):
 * 그룹 등록 계정들의 최근 사용자 지정 게임(queueId 0)을 조회해
 * 그룹 계정이 minMembers명 이상 포함된 매치를 내전으로 저장한다.
 */
const IMPORT_DETAIL_CAP = 30; // 서브리퀘스트 50개 제한 보호 — 남은 매치는 다음 수집에서 이어서 처리된다

/**
 * 내전 결과 포인트 지급 — 승리 팀에 더 많이 준다.
 * 같은 매치로 두 번 지급되지 않도록 match_rewards에 먼저 기록한다.
 */
const grantMatchPoints = async (store, groupId, record) => {
    if (!(await store.claimMatchReward(groupId, record.id))) return;
    for (const pt of record.participants) {
        if (!pt.playerId) continue; // 그룹에 등록되지 않은 용병은 제외
        const won = pt.side === record.winningSide;
        await store.ensurePoints(groupId, pt.playerId);
        await store.addPoints(groupId, pt.playerId, won ? WIN_REWARD : LOSE_REWARD, won ? '내전 승리' : '내전 참가');
    }
};

on('POST', '/groups/:groupId/import', async ({ store, riot, params, body }) => {
    const groupId = params.groupId;
    if (!riot.configured()) return json({ error: '라이엇 연동이 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.' }, 503);

    const minMembers = Math.max(1, Number(body?.minMembers ?? 1));
    const accounts = await store.listAccountsByGroup(groupId);
    if (accounts.length === 0) {
        return json({ error: '등록된 롤 계정이 없습니다. 참가자에게 계정을 먼저 등록해 주세요.' }, 400);
    }

    const puuidToPlayerId = new Map(accounts.map(a => [a.puuid, a.playerId]));

    // 1) 계정별 최근 커스텀 매치 ID 수집 (중복 제거)
    const idSet = new Set();
    for (const acc of accounts) {
        const ids = await riot.listCustomMatchIds(acc.puuid, 10);
        ids.forEach(id => idSet.add(id));
        await sleep(60); // 레이트 리밋 보호 (개발 키 20req/s)
    }

    // 2) 미수집 매치만 상세 조회 → 내전 판정 → 저장
    let added = 0;
    let skippedMembers = 0;
    let scanned = 0;
    for (const matchId of idSet) {
        if (await store.hasMatch(groupId, matchId)) continue;
        if (scanned >= IMPORT_DETAIL_CAP) break;
        scanned += 1;
        const match = await riot.getMatch(matchId);
        await sleep(60);

        const info = match.info ?? {};
        if (info.queueId !== 0 && info.gameType !== 'CUSTOM_GAME') continue;

        const memberCount = (info.participants ?? []).filter(p => puuidToPlayerId.has(p.puuid)).length;
        if (memberCount < minMembers) {
            skippedMembers += 1;
            continue;
        }
        const record = toMatchRecord(match, groupId, puuidToPlayerId);
        if (await store.insertMatch(record)) {
            added += 1;
            await grantMatchPoints(store, groupId, record);
        }
    }

    return json({ added, scanned, skippedMembers, accountCount: accounts.length });
});

/*
 * --- 토너먼트 코드 (Tournament-Stub-V5, PLANNING.md 5.4) ---
 * 정식 Tournament API 승인 후 riot.js의 STUB URL에서 -stub만 제거하면 실코드로 전환된다.
 */

const PICK_TYPES = new Set(['TOURNAMENT_DRAFT', 'DRAFT_MODE', 'BLIND_PICK', 'ALL_RANDOM']);
const MAP_TYPES = new Set(['SUMMONERS_RIFT', 'HOWLING_ABYSS']);
// 프로바이더 등록용 콜백 URL — 정식 전환 시 Riot이 경기 결과를 이 주소로 POST한다
const CALLBACK_URL = 'https://lol-teamtool.pages.dev/api/tournament-callback';

const ensureTournament = async (store, riot, group) => {
    const existing = await store.getTournament(group.id);
    if (existing) return existing;
    const providerId = await riot.stubCreateProvider(CALLBACK_URL);
    const tournamentId = await riot.stubCreateTournament(providerId, group.name);
    await store.saveTournament({ groupId: group.id, providerId, tournamentId, region: 'KR' });
    return store.getTournament(group.id);
};

on('GET', '/groups/:groupId/tournament', async ({ store, params }) =>
    json({
        tournament: await store.getTournament(params.groupId),
        codes: await store.listTournamentCodes(params.groupId),
    }));

on('POST', '/groups/:groupId/tournament/codes', async ({ store, riot, params, body }) => {
    if (!riot.configured()) return json({ error: '라이엇 연동이 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.' }, 503);
    const group = await store.getGroup(params.groupId);
    if (!group) return json({ error: '그룹을 찾을 수 없습니다.' }, 404);

    const pickType = PICK_TYPES.has(body?.pickType) ? body.pickType : 'TOURNAMENT_DRAFT';
    const mapType = MAP_TYPES.has(body?.mapType) ? body.mapType : 'SUMMONERS_RIFT';
    const metadata = String(body?.metadata ?? '').slice(0, 200);
    // metadata는 정식 API에서 결과 콜백에 그대로 되돌아오는 값 — 내전 회차 메모 등으로 활용
    const codeParams = { teamSize: 5, pickType, mapType, spectatorType: 'ALL', metadata: metadata || group.id };

    const tournament = await ensureTournament(store, riot, group);
    const codes = await riot.stubCreateCodes(tournament.tournamentId, 1, codeParams);
    await store.saveTournamentCodes(group.id, codes, { ...codeParams, metadata });
    return json(await store.listTournamentCodes(group.id));
});

on('DELETE', '/tournament/codes/:code', async ({ store, params }) => {
    await store.deleteTournamentCode(params.code);
    return json({ ok: true });
});

on('GET', '/tournament/codes/:code/events', async ({ store, riot, params }) => {
    if (!(await store.getTournamentCode(params.code))) {
        return json({ error: '이 사이트에서 발급한 코드가 아닙니다.' }, 404);
    }
    const eventList = await riot.stubLobbyEvents(params.code);
    return json({ eventList });
});

// 코드로 치러진 매치를 수집해 내전 기록으로 저장
on('POST', '/tournament/codes/:code/collect', async ({ store, riot, params }) => {
    const codeInfo = await store.getTournamentCode(params.code);
    if (!codeInfo) return json({ error: '이 사이트에서 발급한 코드가 아닙니다.' }, 404);

    try {
        const ids = await riot.listMatchIdsByTournamentCode(params.code);
        const accounts = await store.listAccountsByGroup(codeInfo.groupId);
        const puuidToPlayerId = new Map(accounts.map(a => [a.puuid, a.playerId]));

        let added = 0;
        for (const matchId of ids) {
            if (await store.hasMatch(codeInfo.groupId, matchId)) continue;
            const match = await riot.getMatch(matchId);
            if (await store.insertMatch(toMatchRecord(match, codeInfo.groupId, puuidToPlayerId))) added += 1;
            await sleep(60);
        }
        return json({ found: ids.length, added });
    } catch (e) {
        if (e instanceof RiotError && (e.status === 401 || e.status === 403)) {
            return json({
                error: '지금은 테스트 기간이라 코드로 치러진 경기를 자동 수집할 수 없습니다. 정식 오픈 후 지원될 예정이며, 그동안은 "내전 자동 수집" 기능을 이용해 주세요.',
            }, 403);
        }
        if (e instanceof RiotError && e.status === 404) {
            return json({ found: 0, added: 0 });
        }
        throw e;
    }
});

/*
 * --- 경매 상태 공유 (실시간 관전) ---
 * 진행자가 경매 상태를 주기적으로 올리면(PUT) 같은 그룹 멤버가 폴링(GET)으로 함께 본다.
 */

on('GET', '/groups/:groupId/auction', async ({ store, params, url }) => {
    const row = await store.getAuctionState(params.groupId);
    if (!row) return json({ state: null, updatedAt: null, rev: null });
    // 조건부 폴링 — 클라이언트가 마지막으로 본 rev와 같으면 초경량 응답 (대역폭·부하 절감)
    const since = url.searchParams.get('rev');
    if (since != null && String(row.rev) === since) return json({ unchanged: true, rev: row.rev });
    let parsed = null;
    try { parsed = JSON.parse(row.state); } catch { /* 손상된 상태는 없음 처리 */ }
    return json({ state: parsed, updatedAt: row.updatedAt, rev: row.rev });
});

on('PUT', '/groups/:groupId/auction', async ({ store, params, body }) => {
    if (!body?.state || typeof body.state !== 'object') return json({ error: '잘못된 경매 상태입니다.' }, 400);
    const raw = JSON.stringify(body.state);
    if (raw.length > 200000) return json({ error: '경매 상태가 너무 큽니다.' }, 413);
    if (!(await store.getGroup(params.groupId))) return json({ error: '그룹을 찾을 수 없습니다.' }, 404);
    await store.saveAuctionState(params.groupId, raw);
    return json({ ok: true });
});

/*
 * --- 팀장 제어 방식 서버 액션 (진행자 없음 · 누구나 액션 가능) ---
 * 서버가 단일 권위로 상태를 바꾼다. 동시 액션은 rev 기반 낙관적 잠금(CAS)으로 직렬화해
 * 입찰 유실을 막는다. action: draw / bid / resolve / endNow
 */
const mutateAuction = async (store, groupId, mutate) => {
    for (let i = 0; i < 6; i += 1) {
        const row = await store.getAuctionState(groupId);
        if (!row) return null;
        let state;
        try { state = JSON.parse(row.state); } catch { return null; }
        const next = mutate(state);
        if (next === state) return { state, rev: row.rev }; // 변경 없음 (no-op) — 동시 draw/종료 등
        if (await store.casAuctionState(groupId, JSON.stringify(next), row.rev)) return { state: next, rev: row.rev + 1 };
        await sleep(12 * (i + 1)); // 충돌 시 짧은 백오프 후 재시도
    }
    return null;
};

on('POST', '/groups/:groupId/auction/action', async ({ store, params, body }) => {
    const type = String(body?.type ?? '');
    if (!['draw', 'bid', 'resolve', 'endNow'].includes(type)) return json({ error: '알 수 없는 액션입니다.' }, 400);
    const res = await mutateAuction(store, params.groupId, (state) => applyAuctionAction(state, body));
    if (!res) return json({ error: '진행 중인 경매가 없습니다.' }, 404);
    return json({ ok: true, state: res.state, rev: res.rev });
});

/* --- 참가자 코멘트 --- */
on('PUT', '/players/:playerId/comment', async ({ store, params, body }) => {
    const player = await store.getPlayer(params.playerId);
    if (!player) return json({ error: '참가자를 찾을 수 없습니다.' }, 404);
    await store.setPlayerComment(params.playerId, String(body?.comment ?? '').slice(0, 1000));
    return json({ ok: true });
});

/*
 * --- 포인트 ---
 * 그룹×참가자 단위로 쌓인다. 본인 확인은 PIN(간이 계정)으로 하며, PIN을 처음 설정한 사람이
 * 그 참가자의 주인이 된다. 같은 이름이 여러 명이거나 기기를 바꿔도 PIN으로 이어 쓸 수 있다.
 */

/** PIN 확인 — 아직 없으면 이번 요청의 PIN으로 등록한다 */
const checkPin = async (store, playerId, groupId, pin) => {
    const row = await store.ensurePoints(groupId, playerId);
    const given = String(pin ?? '').trim();
    if (!row.pin) {
        if (given.length < 4) return { ok: false, error: '이 참가자를 처음 사용합니다. 4자리 이상 PIN을 정해 주세요.' };
        await store.setPin(playerId, given);
        return { ok: true, row: { ...row, pin: given } };
    }
    if (row.pin !== given) return { ok: false, error: 'PIN이 일치하지 않습니다.' };
    return { ok: true, row };
};

/** 그룹 포인트 현황 + 상점 목록 */
on('GET', '/groups/:groupId/points', async ({ store, params }) => {
    const ranking = await store.listGroupPoints(params.groupId);
    return json({ ranking, shop: SHOP_ITEMS, today: kstDay(), treasure: treasureSpot(params.groupId) });
});

/** 내 상세 (잔액·보유 아이템·최근 내역) */
on('GET', '/players/:playerId/points', async ({ store, params }) => {
    const player = await store.getPlayer(params.playerId);
    if (!player) return json({ error: '참가자를 찾을 수 없습니다.' }, 404);
    const row = await store.ensurePoints(player.groupId, player.id);
    const [inventory, log, streakDays] = await Promise.all([
        store.listInventory(player.id),
        store.listPointLog(player.id, 20),
        store.checkinStreak(player.id),
    ]);
    return json({
        points: row.points, title: row.title, frame: row.frame, bg: row.bg, hasPin: Boolean(row.pin),
        inventory, log, checkedToday: streakDays.includes(kstDay()),
    });
});

/** 출석 체크 — 하루 1회, 연속 출석 보너스 */
on('POST', '/players/:playerId/checkin', async ({ store, params, body }) => {
    const player = await store.getPlayer(params.playerId);
    if (!player) return json({ error: '참가자를 찾을 수 없습니다.' }, 404);
    const auth = await checkPin(store, player.id, player.groupId, body?.pin);
    if (!auth.ok) return json({ error: auth.error }, 403);

    const today = kstDay();
    if (!(await store.claimDaily(player.id, 'checkin', today))) {
        return json({ error: '오늘은 이미 출석했습니다.' }, 409);
    }
    // 어제부터 거꾸로 이어지는 날짜 수를 세어 연속 보너스를 준다
    const days = new Set(await store.checkinStreak(player.id));
    let streak = 0;
    for (let i = 0; i < 7; i += 1) {
        const d = kstDay(Date.now() - i * 86400000);
        if (days.has(d)) streak += 1; else break;
    }
    const gained = CHECKIN_BASE + Math.min(streak - 1, 6) * CHECKIN_STREAK_BONUS;
    const balance = await store.addPoints(player.groupId, player.id, gained, `출석 ${streak}일차`);
    return json({ ok: true, gained, streak, balance });
});

/** 도박 — 서버가 결과를 정한다 */
on('POST', '/players/:playerId/gamble', async ({ store, params, body }) => {
    const player = await store.getPlayer(params.playerId);
    if (!player) return json({ error: '참가자를 찾을 수 없습니다.' }, 404);
    const auth = await checkPin(store, player.id, player.groupId, body?.pin);
    if (!auth.ok) return json({ error: auth.error }, 403);

    const amount = Math.floor(Number(body?.amount));
    const game = String(body?.game ?? '');
    if (!Number.isFinite(amount) || amount < GAMBLE_MIN || amount > GAMBLE_MAX) {
        return json({ error: `${GAMBLE_MIN}~${GAMBLE_MAX} 사이로 걸어 주세요.` }, 400);
    }
    const outcome = playGamble(game, amount, String(body?.pick ?? ''));
    if (!outcome) return json({ error: '알 수 없는 게임입니다.' }, 400);

    // 먼저 차감 (잔액 부족이면 여기서 막힌다)
    const afterBet = await store.addPoints(player.groupId, player.id, -amount, `${game} 베팅`);
    if (afterBet === null) return json({ error: '포인트가 부족합니다.' }, 400);

    let balance = afterBet;
    if (outcome.payout > 0) {
        balance = await store.addPoints(player.groupId, player.id, outcome.payout, `${game} 당첨`);
    }
    return json({ ok: true, ...outcome, balance });
});

/** 1px 보물찾기 — 하루 1회, 좌표는 그룹×날짜로 정해진다 */
on('POST', '/players/:playerId/treasure', async ({ store, params, body }) => {
    const player = await store.getPlayer(params.playerId);
    if (!player) return json({ error: '참가자를 찾을 수 없습니다.' }, 404);
    const auth = await checkPin(store, player.id, player.groupId, body?.pin);
    if (!auth.ok) return json({ error: auth.error }, 403);

    if (!(await store.claimDaily(player.id, 'treasure', kstDay()))) {
        return json({ error: '오늘 보물은 이미 찾았습니다.' }, 409);
    }
    const balance = await store.addPoints(player.groupId, player.id, TREASURE_REWARD, '보물찾기');
    return json({ ok: true, gained: TREASURE_REWARD, balance });
});

/** 상점 구매 */
on('POST', '/players/:playerId/shop/buy', async ({ store, params, body }) => {
    const player = await store.getPlayer(params.playerId);
    if (!player) return json({ error: '참가자를 찾을 수 없습니다.' }, 404);
    const auth = await checkPin(store, player.id, player.groupId, body?.pin);
    if (!auth.ok) return json({ error: auth.error }, 403);

    const item = findItem(String(body?.itemId ?? ''));
    if (!item) return json({ error: '없는 상품입니다.' }, 400);
    const owned = await store.listInventory(player.id);
    if (owned.includes(item.id)) return json({ error: '이미 가지고 있습니다.' }, 409);

    const balance = await store.addPoints(player.groupId, player.id, -item.price, `구매: ${item.name}`);
    if (balance === null) return json({ error: '포인트가 부족합니다.' }, 400);
    await store.addInventory(player.id, item.id);
    return json({ ok: true, balance, itemId: item.id });
});

/** 칭호·테두리 장착 (null이면 해제) */
on('POST', '/players/:playerId/shop/equip', async ({ store, params, body }) => {
    const player = await store.getPlayer(params.playerId);
    if (!player) return json({ error: '참가자를 찾을 수 없습니다.' }, 404);
    const auth = await checkPin(store, player.id, player.groupId, body?.pin);
    if (!auth.ok) return json({ error: auth.error }, 403);

    const kind = ['title', 'frame', 'bg'].includes(body?.kind) ? body.kind : 'frame';
    const itemId = body?.itemId ? String(body.itemId) : null;
    if (itemId) {
        const item = findItem(itemId);
        if (!item || item.kind !== kind) return json({ error: '장착할 수 없는 상품입니다.' }, 400);
        const owned = await store.listInventory(player.id);
        if (!owned.includes(itemId)) return json({ error: '보유하지 않은 상품입니다.' }, 403);
    }
    await store.equipItem(player.id, kind, itemId);
    return json({ ok: true });
});

/*
 * --- 관전자 베팅 판 ---
 * 한 사람이 판을 열면 그룹 전원이 같은 판을 보고 베팅한다 (이름을 각자 입력할 필요 없음).
 * 마감·정산·취소는 판을 연 사람만 할 수 있다. 정산은 패리뮤추얼(이긴 쪽이 진 쪽 판돈을 비율대로).
 */

const roundToClient = (r, bets) => ({
    id: r.id,
    title: r.title,
    choices: JSON.parse(r.choices),
    status: r.status,
    winner: r.winner,
    creatorId: r.creator_id,
    creatorName: r.creatorName ?? null,
    createdAt: r.created_at,
    bets,
});

on('GET', '/groups/:groupId/bet-rounds', async ({ store, params }) => {
    const rounds = await store.listBetRounds(params.groupId);
    const out = [];
    for (const r of rounds) {
        out.push(roundToClient(r, await store.listBets(params.groupId, r.id)));
    }
    return json({ rounds: out });
});

on('POST', '/groups/:groupId/bet-rounds', async ({ store, params, body }) => {
    const player = await store.getPlayer(String(body?.playerId ?? ''));
    if (!player || player.groupId !== params.groupId) return json({ error: '참가자를 찾을 수 없습니다.' }, 404);
    const auth = await checkPin(store, player.id, player.groupId, body?.pin);
    if (!auth.ok) return json({ error: auth.error }, 403);

    const title = String(body?.title ?? '').trim().slice(0, 60);
    const choices = [...new Set((Array.isArray(body?.choices) ? body.choices : [])
        .map(c => String(c).trim().slice(0, 30)).filter(Boolean))];
    if (!title) return json({ error: '판 이름을 입력해 주세요.' }, 400);
    if (choices.length < 2 || choices.length > 6) return json({ error: '선택지는 2~6개여야 합니다.' }, 400);

    // 열려 있는 판이 너무 쌓이지 않게 3개로 제한
    const existing = await store.listBetRounds(params.groupId);
    if (existing.filter(r => r.status === 'open' || r.status === 'locked').length >= 3) {
        return json({ error: '진행 중인 판이 이미 3개 있습니다. 먼저 정산하거나 취소해 주세요.' }, 409);
    }

    const id = crypto.randomUUID();
    await store.addBetRound({ id, groupId: params.groupId, title, choices, creatorId: player.id });
    return json({ ok: true, roundId: id });
});

/** 이 판에 베팅 — 판이 열려 있어야 하고, 인당 한 번 */
on('POST', '/bet-rounds/:roundId/bets', async ({ store, params, body }) => {
    const round = await store.getBetRound(params.roundId);
    if (!round) return json({ error: '베팅 판을 찾을 수 없습니다.' }, 404);
    if (round.status !== 'open') return json({ error: round.status === 'locked' ? '마감된 판입니다.' : '이미 끝난 판입니다.' }, 409);

    const player = await store.getPlayer(String(body?.playerId ?? ''));
    if (!player || player.groupId !== round.group_id) return json({ error: '참가자를 찾을 수 없습니다.' }, 404);
    const auth = await checkPin(store, player.id, player.groupId, body?.pin);
    if (!auth.ok) return json({ error: auth.error }, 403);

    const choice = String(body?.choice ?? '');
    if (!JSON.parse(round.choices).includes(choice)) return json({ error: '없는 선택지입니다.' }, 400);
    const amount = Math.floor(Number(body?.amount));
    if (!Number.isFinite(amount) || amount <= 0) return json({ error: '베팅 금액이 올바르지 않습니다.' }, 400);

    const existing = await store.listBets(round.group_id, round.id);
    if (existing.some(b => b.playerId === player.id && b.status === 'open')) {
        return json({ error: '이미 이 판에 베팅했습니다.' }, 409);
    }
    const balance = await store.addPoints(round.group_id, player.id, -amount, `베팅: ${round.title} · ${choice}`);
    if (balance === null) return json({ error: '포인트가 부족합니다.' }, 400);
    await store.addBet({ id: crypto.randomUUID(), groupId: round.group_id, subject: round.id, playerId: player.id, choice, amount });
    return json({ ok: true, balance });
});

/** 판 관리 — 마감/재개/정산/취소. 판을 연 사람만 가능 */
on('POST', '/bet-rounds/:roundId/action', async ({ store, params, body }) => {
    const round = await store.getBetRound(params.roundId);
    if (!round) return json({ error: '베팅 판을 찾을 수 없습니다.' }, 404);

    const player = await store.getPlayer(String(body?.playerId ?? ''));
    if (!player) return json({ error: '참가자를 찾을 수 없습니다.' }, 404);
    const auth = await checkPin(store, player.id, player.groupId, body?.pin);
    if (!auth.ok) return json({ error: auth.error }, 403);
    if (round.creator_id !== player.id) return json({ error: '판을 연 사람만 관리할 수 있습니다.' }, 403);

    const action = String(body?.action ?? '');
    if (round.status === 'settled' || round.status === 'cancelled') {
        return json({ error: '이미 끝난 판입니다.' }, 409);
    }

    if (action === 'lock') { await store.setBetRoundStatus(round.id, 'locked'); return json({ ok: true }); }
    if (action === 'unlock') { await store.setBetRoundStatus(round.id, 'open'); return json({ ok: true }); }

    if (action === 'cancel') {
        const open = await store.openBetsOf(round.group_id, round.id);
        for (const b of open) {
            await store.addPoints(round.group_id, b.player_id, b.amount, `베팅 취소 환불: ${round.title}`);
            await store.markBet(b.id, 'refunded');
        }
        await store.setBetRoundStatus(round.id, 'cancelled');
        return json({ ok: true, refunded: open.length });
    }

    if (action === 'settle') {
        const winner = String(body?.winner ?? '');
        if (!JSON.parse(round.choices).includes(winner)) return json({ error: '승리 선택지가 올바르지 않습니다.' }, 400);
        const open = await store.openBetsOf(round.group_id, round.id);
        const winners = open.filter(b => b.choice === winner);
        const losers = open.filter(b => b.choice !== winner);
        const winPool = winners.reduce((s, b) => s + b.amount, 0);
        const losePool = losers.reduce((s, b) => s + b.amount, 0);

        for (const b of winners) {
            const share = winPool > 0 ? Math.floor((b.amount / winPool) * losePool) : 0;
            await store.addPoints(round.group_id, b.player_id, b.amount + share, `베팅 적중: ${round.title} · ${winner}`);
            await store.markBet(b.id, 'won');
        }
        if (winners.length === 0) {
            for (const b of losers) {
                await store.addPoints(round.group_id, b.player_id, b.amount, `베팅 무효 환불: ${round.title}`);
                await store.markBet(b.id, 'refunded');
            }
        } else {
            for (const b of losers) await store.markBet(b.id, 'lost');
        }
        await store.setBetRoundStatus(round.id, 'settled', winner);
        return json({ ok: true, winners: winners.length, pool: losePool });
    }

    return json({ error: '알 수 없는 동작입니다.' }, 400);
});

/* --- 관전자 베팅 --- */

on('GET', '/groups/:groupId/bets', async ({ store, params, url }) =>
    json({ bets: await store.listBets(params.groupId, String(url.searchParams.get('subject') ?? '')) }));

on('POST', '/groups/:groupId/bets', async ({ store, params, body }) => {
    const playerId = String(body?.playerId ?? '');
    const player = await store.getPlayer(playerId);
    if (!player) return json({ error: '참가자를 찾을 수 없습니다.' }, 404);
    const auth = await checkPin(store, player.id, player.groupId, body?.pin);
    if (!auth.ok) return json({ error: auth.error }, 403);

    const subject = String(body?.subject ?? '').slice(0, 120);
    const choice = String(body?.choice ?? '').slice(0, 60);
    const amount = Math.floor(Number(body?.amount));
    if (!subject || !choice || !Number.isFinite(amount) || amount <= 0) {
        return json({ error: '베팅 정보가 올바르지 않습니다.' }, 400);
    }
    const existing = await store.listBets(params.groupId, subject);
    if (existing.some(b => b.playerId === playerId && b.status === 'open')) {
        return json({ error: '이미 이 경기에 베팅했습니다.' }, 409);
    }
    const balance = await store.addPoints(player.groupId, player.id, -amount, `베팅: ${choice}`);
    if (balance === null) return json({ error: '포인트가 부족합니다.' }, 400);
    await store.addBet({ id: crypto.randomUUID(), groupId: params.groupId, subject, playerId, choice, amount });
    return json({ ok: true, balance });
});

/**
 * 베팅 정산 — 이긴 쪽이 진 쪽의 판돈을 나눠 갖는다(패리뮤추얼).
 * 한쪽만 베팅했으면 전액 환불한다.
 */
on('POST', '/groups/:groupId/bets/settle', async ({ store, params, body }) => {
    const subject = String(body?.subject ?? '');
    const winner = String(body?.winner ?? '');
    if (!subject || !winner) return json({ error: '정산 정보가 없습니다.' }, 400);

    const open = await store.openBetsOf(params.groupId, subject);
    if (open.length === 0) return json({ ok: true, settled: 0 });

    const winners = open.filter(b => b.choice === winner);
    const losers = open.filter(b => b.choice !== winner);
    const winPool = winners.reduce((s, b) => s + b.amount, 0);
    const losePool = losers.reduce((s, b) => s + b.amount, 0);

    for (const b of winners) {
        // 원금 + 진 쪽 판돈을 베팅 비율만큼 나눠 받는다
        const share = winPool > 0 ? Math.floor((b.amount / winPool) * losePool) : 0;
        await store.addPoints(params.groupId, b.player_id, b.amount + share, `베팅 적중: ${winner}`);
        await store.markBet(b.id, 'won');
    }
    if (winners.length === 0) {
        // 아무도 못 맞혔으면 전원 환불
        for (const b of losers) {
            await store.addPoints(params.groupId, b.player_id, b.amount, '베팅 무효 환불');
            await store.markBet(b.id, 'refunded');
        }
    } else {
        for (const b of losers) await store.markBet(b.id, 'lost');
    }
    return json({ ok: true, settled: open.length, winners: winners.length, pool: losePool });
});

/*
 * --- 문의/건의 ---
 * D1에 먼저 저장(유실 방지)하고, 무료 메일 릴레이로 운영자 메일로 전달한다.
 * 1순위 Web3Forms(시크릿 WEB3FORMS_KEY 필요) → 2순위 FormSubmit. 릴레이가 모두
 * 실패해도 저장은 되므로 사용자는 항상 성공 응답을 받는다.
 */
const FEEDBACK_EMAIL = 'pogooo1103@gmail.com';

const forwardFeedback = async (env, message, contact) => {
    // 1순위: Web3Forms — 안정적이지만 액세스 키 필요
    if (env.WEB3FORMS_KEY) {
        try {
            const res = await fetch('https://api.web3forms.com/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({
                    access_key: env.WEB3FORMS_KEY,
                    subject: '[팀툴] 문의/건의',
                    from_name: '팀툴 문의',
                    message: `${message}\n\n— 답장 연락처: ${contact || '(미기재)'}`,
                }),
                signal: AbortSignal.timeout(8000),
            });
            const data = await res.json().catch(() => null);
            if (res.ok && data?.success) return true;
        } catch { /* 아래 FormSubmit으로 폴백 */ }
    }
    // 2순위: FormSubmit — 키가 필요 없지만 간헐적으로 불안정
    try {
        const res = await fetch(`https://formsubmit.co/ajax/${FEEDBACK_EMAIL}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
                _subject: '[팀툴] 문의/건의',
                _template: 'box',
                message,
                contact: contact || '(미기재)',
            }),
            signal: AbortSignal.timeout(8000),
        });
        const data = await res.json().catch(() => null);
        return res.ok && String(data?.success) === 'true';
    } catch {
        return false;
    }
};

on('POST', '/feedback', async ({ store, env, body, clientId }) => {
    const message = String(body?.message ?? '').trim().slice(0, 2000);
    const contact = String(body?.contact ?? '').trim().slice(0, 200);
    if (!message) return json({ error: '내용을 입력해 주세요.' }, 400);
    const sent = await forwardFeedback(env, message, contact);
    await store.addFeedback({ id: crypto.randomUUID(), message, contact, clientId, sent });
    return json({ ok: true });
});

// 정식 Tournament API 결과 콜백 수신부 — 승인 전에는 호출되지 않는다.
// Riot이 경기 종료 시 결과를 POST하므로 우선 200으로 수신만 확인한다 (수집은 collect 라우트가 담당).
on('POST', '/tournament-callback', () => json({ ok: true }));

/* --- 엔트리 포인트 --- */

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const segs = url.pathname.replace(/^\/api/, '').split('/').filter(Boolean);

    for (const r of routes) {
        if (r.method !== request.method || r.parts.length !== segs.length) continue;
        const params = {};
        let matched = true;
        for (let i = 0; i < r.parts.length; i += 1) {
            const p = r.parts[i];
            if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(segs[i]);
            else if (p !== segs[i]) { matched = false; break; }
        }
        if (!matched) continue;

        // 이미지 라우트는 Cloudflare 엣지 캐시 적중 시 오리진 CDN 호출을 생략
        const cacheable = request.method === 'GET' && segs[0] === 'assets' && segs.length === 3;
        if (cacheable) {
            const hit = await caches.default.match(request);
            if (hit) return hit;
        }

        try {
            const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
                ? await request.json().catch(() => null)
                : null;
            const ctx = {
                request,
                env,
                url,
                params,
                body,
                clientId: String(request.headers.get('x-client-id') ?? '').slice(0, 64),
                store: makeStore(env.DB),
                waitUntil: (p) => context.waitUntil(p),
                riot: makeRiot(env.RIOT_API_KEY ?? ''),
            };
            const res = await r.handler(ctx);
            if (cacheable && res.status === 200) {
                context.waitUntil(caches.default.put(request, res.clone()));
            }
            return res;
        } catch (e) {
            if (e instanceof RiotError) {
                return json({ error: e.message }, e.status >= 400 && e.status < 600 ? e.status : 500);
            }
            console.error(e);
            return json({ error: '서버 내부 오류가 발생했습니다.' }, 500);
        }
    }
    return json({ error: 'Not Found' }, 404);
}
