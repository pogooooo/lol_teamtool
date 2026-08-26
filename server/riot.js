import axios from 'axios';

/*
 * Riot API 클라이언트 (PLANNING.md 4·5장).
 * KR 계정/매치 조회는 asia 리전 라우팅을 사용한다.
 * 개발 키(24시간 만료)는 .env의 RIOT_API_KEY — 프론트에 절대 노출 금지.
 */

const ASIA = 'https://asia.api.riotgames.com';
const KR = 'https://kr.api.riotgames.com';

const riot = axios.create({
    timeout: 10000,
    headers: { 'X-Riot-Token': process.env.RIOT_API_KEY ?? '' },
});

export const riotKeyConfigured = () => Boolean(process.env.RIOT_API_KEY);

/** Riot API 에러를 사용자에게 보여줄 한국어 메시지로 변환 */
export class RiotError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const wrap = (e) => {
    const status = e.response?.status;
    if (status === 401 || status === 403) {
        return new RiotError(status, 'Riot API 키가 유효하지 않거나 만료되었습니다. 개발 키는 24시간마다 재발급해야 합니다.');
    }
    if (status === 404) return new RiotError(404, '해당 Riot ID를 찾을 수 없습니다. 게임명과 태그를 확인해 주세요.');
    if (status === 429) return new RiotError(429, 'Riot API 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.');
    return new RiotError(status ?? 500, `Riot API 호출 실패 (${status ?? e.code ?? 'unknown'})`);
};

/** Account-V1: Riot ID → 계정(puuid) */
export const resolveAccount = async (gameName, tagLine) => {
    try {
        const { data } = await riot.get(
            `${ASIA}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
        );
        return data; // { puuid, gameName, tagLine }
    } catch (e) {
        throw wrap(e);
    }
};

/** Summoner-V4: 소환사 정보 (레벨, 아이콘 등) — KR 플랫폼 라우팅 */
export const getSummonerByPuuid = async (puuid) => {
    try {
        const { data } = await riot.get(`${KR}/lol/summoner/v4/summoners/by-puuid/${puuid}`);
        return data;
    } catch (e) {
        throw wrap(e);
    }
};

/** League-V4: 랭크 정보 (솔로/자유랭크 전체 필드) — KR 플랫폼 라우팅 */
export const getLeagueEntriesByPuuid = async (puuid) => {
    try {
        const { data } = await riot.get(`${KR}/lol/league/v4/entries/by-puuid/${puuid}`);
        return data;
    } catch (e) {
        throw wrap(e);
    }
};

/** Champion-Mastery-V4: 전 챔피언 숙련도 (전 필드) */
export const getChampionMasteries = async (puuid) => {
    try {
        const { data } = await riot.get(`${KR}/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}`);
        return data;
    } catch (e) {
        throw wrap(e);
    }
};

/** Champion-Mastery-V4: 총 숙련도 점수 */
export const getMasteryScore = async (puuid) => {
    try {
        const { data } = await riot.get(`${KR}/lol/champion-mastery/v4/scores/by-puuid/${puuid}`);
        return data;
    } catch (e) {
        throw wrap(e);
    }
};

/**
 * Match-V5: 특정 시점 이후의 매치 ID — 최근 활동량(며칠간 몇 판) 산정용.
 * 매치 상세를 받지 않고 개수만 세므로 호출 1회로 끝난다.
 */
export const listMatchIdsSince = async (puuid, startTimeSec, count = 30) => {
    try {
        const { data } = await riot.get(
            `${ASIA}/lol/match/v5/matches/by-puuid/${puuid}/ids`,
            { params: { startTime: startTimeSec, start: 0, count } },
        );
        return data;
    } catch (e) {
        throw wrap(e);
    }
};

/** Match-V5: 최근 매치 ID (큐 무관) — 룬/스펠/챔피언 선호 집계용 */
export const listRecentMatchIds = async (puuid, count = 10) => {
    try {
        const { data } = await riot.get(
            `${ASIA}/lol/match/v5/matches/by-puuid/${puuid}/ids`,
            { params: { start: 0, count } },
        );
        return data;
    } catch (e) {
        throw wrap(e);
    }
};

/** Match-V5: 최근 사용자 지정 게임(queueId 0) 매치 ID 목록 */
export const listCustomMatchIds = async (puuid, count = 10) => {
    try {
        const { data } = await riot.get(
            `${ASIA}/lol/match/v5/matches/by-puuid/${puuid}/ids`,
            { params: { queue: 0, start: 0, count } },
        );
        return data; // string[]
    } catch (e) {
        throw wrap(e);
    }
};

/** Match-V5: 매치 상세 */
export const getMatch = async (matchId) => {
    try {
        const { data } = await riot.get(`${ASIA}/lol/match/v5/matches/${matchId}`);
        return data;
    } catch (e) {
        throw wrap(e);
    }
};

/* --- Tournament-Stub-V5 (모의 API, PLANNING.md 5.4) ---
 * 토너먼트 API는 리전과 무관하게 americas 라우팅을 사용한다.
 * Stub은 발급/조회 "흐름"만 검증한다 — 발급된 코드로 실제 게임 로비는 생성되지 않으며,
 * 정식 Tournament API 승인 후 URL의 -stub만 제거하면 실코드로 전환된다.
 */

const AMERICAS = 'https://americas.api.riotgames.com';
const STUB = `${AMERICAS}/lol/tournament-stub/v5`;

/** 프로바이더 등록 (콜백 URL + 리전) → providerId */
export const stubCreateProvider = async (callbackUrl) => {
    try {
        const { data } = await riot.post(`${STUB}/providers`, { region: 'KR', url: callbackUrl });
        return data;
    } catch (e) {
        throw wrap(e);
    }
};

/** 토너먼트 생성 → tournamentId */
export const stubCreateTournament = async (providerId, name) => {
    try {
        const { data } = await riot.post(`${STUB}/tournaments`, { providerId, name });
        return data;
    } catch (e) {
        throw wrap(e);
    }
};

/** 토너먼트 코드 발급 → string[] */
export const stubCreateCodes = async (tournamentId, count, { teamSize, pickType, mapType, spectatorType, metadata }) => {
    try {
        const { data } = await riot.post(
            `${STUB}/codes`,
            { enoughPlayers: false, mapType, metadata, pickType, spectatorType, teamSize },
            { params: { tournamentId, count } },
        );
        return data;
    } catch (e) {
        throw wrap(e);
    }
};

/** 코드의 로비 이벤트 (입장/퇴장/게임 시작) */
export const stubLobbyEvents = async (code) => {
    try {
        const { data } = await riot.get(`${STUB}/lobby-events/by-code/${encodeURIComponent(code)}`);
        return data?.eventList ?? [];
    } catch (e) {
        throw wrap(e);
    }
};

/** Match-V5: 토너먼트 코드로 치러진 매치 ID 목록 (정식 승인 키 필요) */
export const listMatchIdsByTournamentCode = async (code) => {
    try {
        const { data } = await riot.get(`${ASIA}/lol/match/v5/matches/by-tournament-code/${encodeURIComponent(code)}/ids`);
        return data;
    } catch (e) {
        throw wrap(e);
    }
};

/* --- Match-V5 DTO → 내부 MatchRecord 변환 --- */

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
    // 참가자 원본은 participants 테이블에 개별 저장되므로 rawInfo에서 제외 — 매치당 저장 용량 절반
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
