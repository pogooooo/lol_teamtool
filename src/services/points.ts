import axios, { AxiosError } from 'axios';

/*
 * 포인트 API 클라이언트.
 * 본인 확인용 PIN은 브라우저에 그룹별로 저장해 두고 요청마다 함께 보낸다.
 */

const client = axios.create({ baseURL: '/api', timeout: 20000 });

export type ItemKind = 'title' | 'frame' | 'bg';

export interface ShopItem {
    id: string;
    kind: ItemKind;
    name: string;
    price: number;
    desc: string;
}

export interface RankRow {
    playerId: string;
    displayName: string;
    points: number;
    title: string | null;
    frame: string | null;
    bg: string | null;
    hasPin: number;
}

export interface PointLogRow {
    delta: number;
    reason: string;
    balance: number;
    createdAt: number;
}

export interface MyPoints {
    points: number;
    title: string | null;
    frame: string | null;
    bg: string | null;
    hasPin: boolean;
    inventory: string[];
    log: PointLogRow[];
    checkedToday: boolean;
}

export interface BetRow {
    id: string;
    playerId: string;
    displayName: string | null;
    choice: string;
    amount: number;
    status: string;
}

/* --- PIN 보관 (그룹×참가자별) --- */

const pinKey = (playerId: string) => `lol_teamtool:pin:${playerId}`;
export const getPin = (playerId: string) => localStorage.getItem(pinKey(playerId)) ?? '';
export const savePin = (playerId: string, pin: string) => localStorage.setItem(pinKey(playerId), pin);

export const pointsError = (e: unknown): string => {
    const err = e as AxiosError<{ error?: string }>;
    return err.response?.data?.error ?? '요청을 처리하지 못했습니다.';
};

/* --- 조회 --- */

export const getGroupPoints = (groupId: string) =>
    client.get<{ ranking: RankRow[]; shop: ShopItem[]; today: string; treasure: { x: number; y: number } }>(
        `/groups/${groupId}/points`).then(r => r.data);

export const getMyPoints = (playerId: string) =>
    client.get<MyPoints>(`/players/${playerId}/points`).then(r => r.data);

/* --- 행동 (PIN 필요) --- */

const withPin = (playerId: string, body: Record<string, unknown> = {}) =>
    ({ ...body, pin: getPin(playerId) });

export const checkin = (playerId: string) =>
    client.post<{ gained: number; streak: number; balance: number }>(
        `/players/${playerId}/checkin`, withPin(playerId)).then(r => r.data);

export type GambleGame = 'coin' | 'dice' | 'roulette' | 'smite' | 'penta' | 'slot';

export const gamble = (playerId: string, game: GambleGame, pick: string, amount: number) =>
    client.post<{ won: boolean; result: string; payout: number; balance: number }>(
        `/players/${playerId}/gamble`, withPin(playerId, { game, pick, amount })).then(r => r.data);

export const claimTreasure = (playerId: string) =>
    client.post<{ gained: number; balance: number }>(
        `/players/${playerId}/treasure`, withPin(playerId)).then(r => r.data);

export const buyItem = (playerId: string, itemId: string) =>
    client.post<{ balance: number }>(`/players/${playerId}/shop/buy`, withPin(playerId, { itemId })).then(r => r.data);

export const equipItem = (playerId: string, kind: ItemKind, itemId: string | null) =>
    client.post(`/players/${playerId}/shop/equip`, withPin(playerId, { kind, itemId }));

/* --- 관전자 베팅 판 --- */

export type RoundStatus = 'open' | 'locked' | 'settled' | 'cancelled';

export interface BetRound {
    id: string;
    title: string;
    choices: string[];
    status: RoundStatus;
    winner: string | null;
    creatorId: string;
    creatorName: string | null;
    createdAt: number;
    bets: BetRow[];
}

export const listBetRounds = (groupId: string) =>
    client.get<{ rounds: BetRound[] }>(`/groups/${groupId}/bet-rounds`).then(r => r.data.rounds);

export const createBetRound = (groupId: string, playerId: string, title: string, choices: string[]) =>
    client.post<{ roundId: string }>(`/groups/${groupId}/bet-rounds`, withPin(playerId, { playerId, title, choices })).then(r => r.data);

export const betOnRound = (roundId: string, playerId: string, choice: string, amount: number) =>
    client.post<{ balance: number }>(`/bet-rounds/${roundId}/bets`, withPin(playerId, { playerId, choice, amount })).then(r => r.data);

export const roundAction = (roundId: string, playerId: string, action: 'lock' | 'unlock' | 'settle' | 'cancel', winner?: string) =>
    client.post<{ winners?: number; pool?: number; refunded?: number }>(
        `/bet-rounds/${roundId}/action`, withPin(playerId, { playerId, action, winner })).then(r => r.data);
