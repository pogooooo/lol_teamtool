/*
 * Riot API 클라이언트 — Cloudflare Pages Functions용 (server/riot.js의 fetch 포팅).
 * axios/Node 전용 API 없이 Workers 런타임의 fetch만 사용한다.
 * KR 계정/매치 조회는 asia 리전 라우팅, 토너먼트는 americas 라우팅.
 */

const ASIA = 'https://asia.api.riotgames.com';
const KR = 'https://kr.api.riotgames.com';
const AMERICAS = 'https://americas.api.riotgames.com';
const STUB = `${AMERICAS}/lol/tournament-stub/v5`;

/** Riot API 에러를 사용자에게 보여줄 한국어 메시지로 변환 */
export class RiotError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const wrapStatus = (status) => {
    if (status === 401 || status === 403) {
        return new RiotError(status, '라이엇 연동에 일시적인 문제가 있습니다. 잠시 후 다시 시도해 주세요.');
    }
    if (status === 404) return new RiotError(404, '해당 Riot ID를 찾을 수 없습니다. 게임명과 태그를 확인해 주세요.');
    if (status === 429) return new RiotError(429, '요청이 많아 잠시 지연되고 있습니다. 잠시 후 다시 시도해 주세요.');
    return new RiotError(status ?? 500, '라이엇 서버에서 정보를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.');
};

const call = async (key, url, init = {}) => {
    let res;
    try {
        res = await fetch(url, {
            ...init,
            headers: {
                'X-Riot-Token': key,
                ...(init.body ? { 'Content-Type': 'application/json' } : {}),
            },
            signal: AbortSignal.timeout(10000),
        });
    } catch {
        throw new RiotError(500, 'Riot API 호출 실패 (network)');
    }
    if (!res.ok) throw wrapStatus(res.status);
    return res.json();
};

/** 요청 단위로 생성하는 클라이언트 팩토리 — key는 env.RIOT_API_KEY */
export const makeRiot = (key) => ({
    configured: () => Boolean(key),

    /** Account-V1: Riot ID → 계정(puuid) */
    resolveAccount: (gameName, tagLine) =>
        call(key, `${ASIA}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`),

    /** Summoner-V4: 소환사 정보 (레벨, 아이콘 등) — KR 플랫폼 라우팅 */
    getSummonerByPuuid: (puuid) =>
        call(key, `${KR}/lol/summoner/v4/summoners/by-puuid/${puuid}`),

    /** League-V4: 랭크 정보 (솔로/자유랭크 전체 필드) — KR 플랫폼 라우팅 */
    getLeagueEntriesByPuuid: (puuid) =>
        call(key, `${KR}/lol/league/v4/entries/by-puuid/${puuid}`),

    /** Champion-Mastery-V4: 전 챔피언 숙련도 */
    getChampionMasteries: (puuid) =>
        call(key, `${KR}/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}`),

    /** Champion-Mastery-V4: 총 숙련도 점수 */
    getMasteryScore: (puuid) =>
        call(key, `${KR}/lol/champion-mastery/v4/scores/by-puuid/${puuid}`),

    /** Match-V5: 최근 매치 ID (큐 무관) — 룬/스펠/챔피언 선호 집계용 */
    listRecentMatchIds: (puuid, count = 10) =>
        call(key, `${ASIA}/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}`),

    /**
     * Match-V5: 특정 시점 이후의 매치 ID — 최근 활동량(며칠간 몇 판) 산정용.
     * 매치 상세를 받지 않고 개수만 세므로 서브리퀘스트 1회로 끝난다.
     */
    listMatchIdsSince: (puuid, startTimeSec, count = 30) =>
        call(key, `${ASIA}/lol/match/v5/matches/by-puuid/${puuid}/ids?startTime=${startTimeSec}&start=0&count=${count}`),

    /** Match-V5: 최근 사용자 지정 게임(queueId 0) 매치 ID 목록 */
    listCustomMatchIds: (puuid, count = 10) =>
        call(key, `${ASIA}/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=0&start=0&count=${count}`),

    /** Match-V5: 매치 상세 */
    getMatch: (matchId) =>
        call(key, `${ASIA}/lol/match/v5/matches/${matchId}`),

    /* --- Tournament-Stub-V5 (정식 승인 후 URL의 -stub만 제거하면 실코드 전환) --- */

    /** 프로바이더 등록 (콜백 URL + 리전) → providerId */
    stubCreateProvider: (callbackUrl) =>
        call(key, `${STUB}/providers`, { method: 'POST', body: JSON.stringify({ region: 'KR', url: callbackUrl }) }),

    /** 토너먼트 생성 → tournamentId */
    stubCreateTournament: (providerId, name) =>
        call(key, `${STUB}/tournaments`, { method: 'POST', body: JSON.stringify({ providerId, name }) }),

    /** 토너먼트 코드 발급 → string[] */
    stubCreateCodes: (tournamentId, count, { teamSize, pickType, mapType, spectatorType, metadata }) =>
        call(key, `${STUB}/codes?tournamentId=${tournamentId}&count=${count}`, {
            method: 'POST',
            body: JSON.stringify({ enoughPlayers: false, mapType, metadata, pickType, spectatorType, teamSize }),
        }),

    /** 코드의 로비 이벤트 (입장/퇴장/게임 시작) */
    stubLobbyEvents: async (code) => {
        const data = await call(key, `${STUB}/lobby-events/by-code/${encodeURIComponent(code)}`);
        return data?.eventList ?? [];
    },

    /** Match-V5: 토너먼트 코드로 치러진 매치 ID 목록 (정식 승인 키 필요) */
    listMatchIdsByTournamentCode: (code) =>
        call(key, `${ASIA}/lol/match/v5/matches/by-tournament-code/${encodeURIComponent(code)}/ids`),
});

/* --- Match-V5 DTO → 내부 MatchRecord 변환 (server/riot.js와 동일) --- */

const POSITION_MAP = { TOP: '탑', JUNGLE: '정글', MIDDLE: '미드', BOTTOM: '원딜', UTILITY: '서포터' };
const FALLBACK_POSITIONS = ['탑', '정글', '미드', '원딜', '서포터'];

/**
 * @param match Riot Match-V5 응답
 * @param puuidToPlayerId 그룹 등록 계정 puuid → playerId 매핑
 */
export const toMatchRecord = (match, groupId, puuidToPlayerId) => {
    const info = match.info;

    // 기획 5.3장: 로비 생성 시각·토너먼트 코드는 저장 전 제거, 나머지는 원본 보관
    const rawInfo = { ...info };
    delete rawInfo.gameCreation;
    delete rawInfo.tournamentCode;
    // 참가자 원본은 participants 테이블에 개별 저장되므로 rawInfo에서 제외 — 매치당 저장 용량 절반 (D1 5GB 무료 한도 보호)
    delete rawInfo.participants;

    const blueWin = info.teams?.find(t => t.teamId === 100)?.win ?? false;

    // 사용자 지정 게임은 teamPosition이 비어 있는 경우가 많다 → 팀 내 순번으로 보정
    const teamIndex = { blue: 0, red: 0 };

    const participants = info.participants.map(p => {
        const side = p.teamId === 100 ? 'blue' : 'red';
        const mapped = POSITION_MAP[p.teamPosition];
        const position = mapped ?? FALLBACK_POSITIONS[teamIndex[side] % 5];
        teamIndex[side] += 1;
        const gameName = p.riotIdGameName || p.summonerName || 'unknown';
        const tagLine = p.riotIdTagline || '';
        return {
            puuid: p.puuid,
            playerId: puuidToPlayerId.get(p.puuid) ?? null,
            riotId: tagLine ? `${gameName}#${tagLine}` : gameName,
            side,
            position,
            champion: p.championName ?? String(p.championId),
            kills: p.kills ?? 0,
            deaths: p.deaths ?? 0,
            assists: p.assists ?? 0,
            gold: p.goldEarned ?? 0,
            cs: (p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0),
            visionScore: p.visionScore ?? 0,
            raw: JSON.stringify(p),
        };
    });

    return {
        id: crypto.randomUUID(),
        groupId,
        riotMatchId: match.metadata?.matchId ?? String(info.gameId ?? crypto.randomUUID()),
        source: 'riot',
        gameStart: info.gameStartTimestamp ?? 0,
        durationSec: info.gameDuration ?? 0,
        winningSide: blueWin ? 'blue' : 'red',
        rawInfo: JSON.stringify(rawInfo),
        participants,
    };
};
