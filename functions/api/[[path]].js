import { makeStore } from '../_lib/db.js';
import { makeRiot, RiotError, toMatchRecord } from '../_lib/riot.js';
import { getAssetMeta, getChampionImage, getItemImage, getRuneImage, getSpellImage } from '../_lib/assets.js';

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
    }));

on('POST', '/groups/:groupId/players', async ({ store, params, body }) => {
    const displayName = String(body?.displayName ?? '').trim();
    if (!displayName) return json({ error: '참가자 이름을 입력해 주세요.' }, 400);
    await store.addPlayer({ id: crypto.randomUUID(), groupId: params.groupId, displayName });
    return json({ ok: true });
});

on('DELETE', '/players/:playerId', async ({ store, params }) => {
    await store.removePlayer(params.playerId);
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
    await store.insertMatch({ ...m, groupId: params.groupId });
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
        if (await store.insertMatch(toMatchRecord(match, groupId, puuidToPlayerId))) added += 1;
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
            const body = ['POST', 'PUT', 'PATCH'].includes(request.method)
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
