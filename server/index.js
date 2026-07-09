import 'dotenv/config';
import express from 'express';
import { randomUUID } from 'node:crypto';
import * as store from './db.js';
import {
    RiotError, riotKeyConfigured, resolveAccount, listCustomMatchIds, getMatch, toMatchRecord,
    stubCreateProvider, stubCreateTournament, stubCreateCodes, stubLobbyEvents, listMatchIdsByTournamentCode,
    getSummonerByPuuid, getLeagueEntriesByPuuid,
    getChampionMasteries, getMasteryScore, listRecentMatchIds,
} from './riot.js';
import { getAssetMeta, getChampionImage, getItemImage, getRuneImage, getSpellImage } from './assets.js';

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
    });
});

app.post('/api/groups/:groupId/players', (req, res) => {
    const displayName = String(req.body?.displayName ?? '').trim();
    if (!displayName) return res.status(400).json({ error: '참가자 이름을 입력해 주세요.' });
    store.addPlayer({ id: randomUUID(), groupId: req.params.groupId, displayName });
    res.json({ ok: true });
});

app.delete('/api/players/:playerId', (req, res) => {
    store.removePlayer(req.params.playerId);
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
    store.insertMatch({ ...m, groupId: req.params.groupId });
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
        if (store.insertMatch(toMatchRecord(match, groupId, puuidToPlayerId))) added += 1;
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
const CALLBACK_URL = 'https://lol-teamtool.vercel.app/api/tournament-callback';

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
