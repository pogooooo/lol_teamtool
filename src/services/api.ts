import axios, { AxiosError } from 'axios';
import type { Group, GroupPlayer, MatchRecord, RiotAccount } from '../types';

/*
 * 로컬 API 서버(/api → :5175, vite proxy) 클라이언트.
 * 서버가 SQLite 저장 + Riot API 프록시를 담당한다 (server/index.js).
 */

/*
 * 브라우저별 클라이언트 ID — 그룹 목록 분리(멤버십)에 사용된다.
 * 최초 방문 시 생성해 localStorage에 보관하고 모든 요청 헤더에 실어 보낸다.
 */
const CLIENT_ID_KEY = 'lol_teamtool:clientId';
const getClientId = (): string => {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
        id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `cid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
};

const client = axios.create({
    baseURL: '/api',
    timeout: 60000,
    headers: { 'X-Client-Id': getClientId() },
});

export interface GroupStats {
    totalMatches: number;
    topPlayerName: string | null;
    topPlayerCount: number;
    latestGameStart: number | null;
}

export interface TournamentInfo {
    providerId: number;
    tournamentId: number;
    region: string;
    createdAt: number;
}

export interface TournamentCode {
    code: string;
    createdAt: number;
    teamSize: number;
    pickType: string;
    mapType: string;
    spectatorType: string;
    metadata: string;
}

export interface LobbyEvent {
    timestamp: string;
    eventType: string;
    puuid?: string;
}

export interface CollectResult {
    found: number;
    added: number;
}

export interface PlayerRanking {
    playerId: string;
    displayName: string;
    games: number;
    wins: number;
}

export const winRateOf = (r: PlayerRanking): number =>
    r.games === 0 ? 0 : Math.round((r.wins / r.games) * 100);

/** 출전순 / 승률순 정렬 (승률순은 출전 0판을 뒤로) */
export const sortRankings = (ranking: PlayerRanking[], mode: 'games' | 'winrate'): PlayerRanking[] =>
    [...ranking].sort((a, b) => {
        if (mode === 'games') return b.games - a.games || a.displayName.localeCompare(b.displayName);
        if (a.games === 0 || b.games === 0) return b.games - a.games;
        return winRateOf(b) - winRateOf(a) || b.games - a.games || a.displayName.localeCompare(b.displayName);
    });

/** axios 에러에서 서버가 내려준 한국어 메시지를 꺼낸다 */
export const errorMessage = (e: unknown): string => {
    if (e instanceof AxiosError) {
        const serverMsg = (e.response?.data as { error?: string } | undefined)?.error;
        if (serverMsg) return serverMsg;
        if (e.code === 'ERR_NETWORK' || !e.response) {
            // 개발 모드에서만 로컬 서버 실행 안내를 노출한다
            return import.meta.env.DEV
                ? '로컬 API 서버에 연결할 수 없습니다. `npm run server`를 실행해 주세요.'
                : '서버에 연결할 수 없습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.';
        }
    }
    return '요청 처리 중 오류가 발생했습니다.';
};

export const health = () =>
    client.get<{ ok: boolean; riotKeyConfigured: boolean }>('/health').then(r => r.data);

/** 문의/건의 전송 — 서버가 저장 후 운영자 메일로 전달한다 */
export const sendFeedback = (message: string, contact: string) =>
    client.post<{ ok: boolean }>('/feedback', { message, contact });

/* --- 경매 상태 공유 (실시간 관전) --- */

export interface AuctionSyncResult {
    state?: unknown;
    updatedAt?: number | null;
    rev: number | null;
    unchanged?: boolean;
}

/** 조건부 폴링 — sinceRev가 서버와 같으면 서버가 { unchanged: true } 만 반환 (대역폭 절감) */
export const getAuctionSync = (groupId: string, sinceRev?: number | null) =>
    client.get<AuctionSyncResult>(`/groups/${groupId}/auction`, {
        params: sinceRev != null ? { rev: sinceRev } : undefined,
    }).then(r => r.data);

export const putAuctionSync = (groupId: string, state: unknown) =>
    client.put<{ ok: boolean }>(`/groups/${groupId}/auction`, { state });

/* --- 팀장 제어 방식 서버 액션 (진행자 없음 · 누구나 액션) --- */

export type AuctionAction =
    | { type: 'draw' }
    | { type: 'endNow' }
    | { type: 'resolve' }
    | { type: 'bid'; teamId: string; amount: number; lotPlayerId: string };

/** 서버에 액션을 보내고 적용된 최신 상태 + rev를 받는다 */
export const postAuctionAction = (groupId: string, action: AuctionAction) =>
    client.post<{ ok: boolean; state: unknown; rev: number }>(`/groups/${groupId}/auction/action`, action)
        .then(r => ({ state: r.data.state, rev: r.data.rev }));

/* --- 그룹 --- */
export const listGroups = () => client.get<Group[]>('/groups').then(r => r.data);
export const createGroup = (name: string) => client.post<Group>('/groups', { name }).then(r => r.data);
export const joinGroup = (code: string) => client.post<Group>('/groups/join', { code }).then(r => r.data);
export const leaveGroup = (groupId: string) =>
    client.post<{ left: boolean; deleted: boolean }>(`/groups/${groupId}/leave`).then(r => r.data);

/* --- 참가자 / 계정 --- */
export const getRoster = (groupId: string) =>
    client.get<{ players: GroupPlayer[]; accounts: RiotAccount[]; laneTiers?: LaneTierRow[] }>(`/groups/${groupId}/players`).then(r => r.data);
export const addPlayer = (groupId: string, displayName: string) =>
    client.post(`/groups/${groupId}/players`, { displayName });
export const removePlayer = (playerId: string) => client.delete(`/players/${playerId}`);
export const addAccount = (playerId: string, gameName: string, tagLine: string) =>
    client.post(`/players/${playerId}/accounts`, { gameName, tagLine });
export const removeAccount = (accountId: string) => client.delete(`/accounts/${accountId}`);
export const setPrimaryAccount = (accountId: string) => client.post(`/accounts/${accountId}/primary`);

/* --- 매치 --- */
export const listMatches = (groupId: string) =>
    client.get<MatchRecord[]>(`/groups/${groupId}/matches`).then(r => r.data);

/** 저장된 원본 데이터 전체 — "상세정보 보기" */
export interface MatchFullDetail {
    id: string;
    riotMatchId: string;
    source: 'riot' | 'demo';
    gameStart: number;
    durationSec: number;
    winningSide: 'blue' | 'red';
    rawInfo: Record<string, unknown> | null;
    lobbyEvents?: LobbyEvent[];
    participants: {
        puuid: string;
        playerId: string | null;
        riotId: string;
        side: 'blue' | 'red';
        position: string;
        champion: string;
        raw: Record<string, unknown> | null;
    }[];
}

export const getMatchDetail = (matchId: string) =>
    client.get<MatchFullDetail>(`/matches/${matchId}/detail`).then(r => r.data);
export const getStats = (groupId: string) =>
    client.get<GroupStats>(`/groups/${groupId}/stats`).then(r => r.data);
export const getRankings = (groupId: string) =>
    client.get<PlayerRanking[]>(`/groups/${groupId}/rankings`).then(r => r.data);

/* --- 참가자 상세 프로필 (계정별 Riot 정보 전 필드 + 합산) --- */
export interface RecentStats {
    sampleSize: number;
    champions: { champion: string; games: number; wins: number }[];
    positions: { position: string; games: number }[];
    keystones: { perk: number; games: number }[];
    spells: { pair: string; games: number }[];
}

export interface AccountProfile extends RiotAccount {
    summoner: Record<string, unknown> | null;
    leagues: Record<string, unknown>[];
    masteries: Record<string, unknown>[];
    masteryScore: number | null;
    recentStats: RecentStats | null;
    error?: string;
}

export interface PlayerProfile {
    player: GroupPlayer;
    /** 참가자 코멘트 (자유 메모) */
    comment: string;
    scrim: { games: number; wins: number };
    accounts: AccountProfile[];
    /** 최근 경기 경향 — 전 계정 합산 */
    recent: RecentStats;
    aggregate: {
        accountCount: number;
        totalRankedWins: number;
        totalRankedLosses: number;
        bestTier: { tier: string; rank: string; leaguePoints: number; queueType: string; riotId: string } | null;
        maxSummonerLevel: number;
    };
}

/** 참가자×라인 티어 한 줄 */
export interface LaneTierRow { playerId: string; position: string; tier: string }

/** 팀 빌더 데이터 — 라인별 티어와 라인별 전적 (라이엇 호출 없음) */
/** 참가자의 기본 티어 — 최고 솔랭(없으면 자랭)과 점수 가감에 쓰는 표본 */
export interface RiotRankRow {
    playerId: string;
    queue: 'solo' | 'flex';
    riotId: string | null;
    tier: string;
    division: string | null;
    lp: number;
    wins: number;
    losses: number;
    /** 최근 30일 게임 수 — 조회하지 못했으면 null */
    games30d: number | null;
}

/** 나머지 인원의 기본 티어 (인원이 많으면 나눠 온다) */
export const getRanks = (groupId: string, start: number) =>
    client.get<{ riotRanks: RiotRankRow[]; next: number | null }>(
        `/groups/${groupId}/ranks`, { params: { start } }).then(r => r.data);

/** 시트 한 판을 그룹에 통째로 반영 (없는 이름은 참가자로 새로 만든다) */
export const importTiers = (groupId: string, rows: unknown[], opts?: { fromSheet?: boolean }) =>
    client.post<{ ok: boolean; added: number; updated: number }>(
        `/groups/${groupId}/import-tiers`, { rows, fromSheet: opts?.fromSheet ?? false }).then(r => r.data);

export const getBuilderData = (groupId: string) =>
    client.get<{
        players: unknown[];
        laneTiers: unknown[];
        laneStats: unknown[];
        riotRanks?: RiotRankRow[];
        /** 남은 인원의 시작 위치 (null이면 끝) */
        rankNext?: number | null;
    }>(`/groups/${groupId}/builder`).then(r => r.data);

/* --- 구글 시트 연동 --- */

export interface SheetLink { url: string | null; csv: string | null; error?: string }

/** 연동된 시트를 지금 읽어 온다 (서버가 대신 받아 온다 — 브라우저에서 직접 부르면 CORS에 막힌다) */
export const getSheet = (groupId: string) =>
    client.get<SheetLink>(`/groups/${groupId}/sheet`).then(r => r.data);

/** 구글 서비스 계정 상태 — 시트를 어느 이메일에 공유해야 하는지 알려 준다 */
export const getSheetAccount = () =>
    client.get<{ ready: boolean; email: string | null }>('/sheets/account').then(r => r.data);

/** 앱 → 시트 저장 (표 전체를 덮어쓰고 티어 칸에 드롭다운을 건다) */
export const pushSheet = (
    groupId: string,
    values: string[][],
    choices: string[],
    tiers: { label: string; color: string }[],
) =>
    client.post<{ ok: boolean; rows: number }>(`/groups/${groupId}/sheet/push`, { values, choices, tiers })
        .then(r => r.data);

/** 시트 연동 (url이 빈 문자열이면 해제) */
export const setSheet = (groupId: string, url: string) =>
    client.put<{ ok: boolean; url: string | null; csv?: string }>(`/groups/${groupId}/sheet`, { url })
        .then(r => r.data);

/** 참가자의 롤 랭크를 조회해 기본 티어로 저장 (참가자 관리의 사람별 버튼) */
export const fetchPlayerTier = (playerId: string) =>
    client.post<{ ok: boolean; value: string; queue: 'solo' | 'flex'; riotId: string; lp: number }>(
        `/players/${playerId}/riot-tier`).then(r => r.data);

/** 라인별 티어 지정 (tier가 null이면 해제) */
export const setLaneTier = (playerId: string, position: string, tier: string | null) =>
    client.put(`/players/${playerId}/lane-tiers`, { position, tier });

/** 그룹 참가자들의 티어·활동량 (팀 빌더 자동 티어/점수용) */
export const getGroupRatings = (groupId: string) =>
    client.get<{ ratings: unknown[]; laneStats?: unknown[]; error?: string }>(`/groups/${groupId}/ratings`).then(r => r.data);

export const getPlayerProfile = (playerId: string) =>
    client.get<PlayerProfile>(`/players/${playerId}/profile`).then(r => r.data);

/** 참가자 코멘트 저장 */
export const savePlayerComment = (playerId: string, comment: string) =>
    client.put<{ ok: boolean }>(`/players/${playerId}/comment`, { comment });
export const postMatch = (groupId: string, match: MatchRecord) =>
    client.post(`/groups/${groupId}/matches`, match);
export const deleteMatch = (matchId: string) => client.delete(`/matches/${matchId}`);

/* --- 토너먼트 코드 (Tournament-Stub) --- */
export const getTournament = (groupId: string) =>
    client.get<{ tournament: TournamentInfo | null; codes: TournamentCode[] }>(`/groups/${groupId}/tournament`).then(r => r.data);
export const createTournamentCodes = (groupId: string, opts: { pickType: string; mapType: string; metadata: string }) =>
    client.post<TournamentCode[]>(`/groups/${groupId}/tournament/codes`, opts).then(r => r.data);
export const deleteTournamentCode = (code: string) =>
    client.delete(`/tournament/codes/${encodeURIComponent(code)}`);
// 참고: 코드 기준 결과 수집(collect)·로비 이벤트 라우트는 서버에 유지 —
// 정식 Tournament API 전환 시 상세정보(lobbyEvents)와 자동 수집이 이를 사용한다.
