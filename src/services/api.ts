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

/* --- 그룹 --- */
export const listGroups = () => client.get<Group[]>('/groups').then(r => r.data);
export const createGroup = (name: string) => client.post<Group>('/groups', { name }).then(r => r.data);
export const joinGroup = (code: string) => client.post<Group>('/groups/join', { code }).then(r => r.data);
export const leaveGroup = (groupId: string) =>
    client.post<{ left: boolean; deleted: boolean }>(`/groups/${groupId}/leave`).then(r => r.data);

/* --- 참가자 / 계정 --- */
export const getRoster = (groupId: string) =>
    client.get<{ players: GroupPlayer[]; accounts: RiotAccount[] }>(`/groups/${groupId}/players`).then(r => r.data);
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

export const getPlayerProfile = (playerId: string) =>
    client.get<PlayerProfile>(`/players/${playerId}/profile`).then(r => r.data);
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
