export type Tier = '상' | '중' | '하';
export type Position = '탑' | '정글' | '미드' | '원딜' | '서포터';
export type OperatorSymbol = '>' | '>=' | '=' | '<=' | '<';
export type SlotKey = 'name1' | 'name2';

export interface Player {
    name: string;
    tier: Tier | null;
}

export interface LaneState {
    name1: string | null;
    name2: string | null;
    operator: OperatorSymbol;
}

export type LanesState = Record<Position, LaneState>;

export type DragOrigin =
    | { type: 'pool' }
    | { type: 'slot'; position: Position; slot: SlotKey };

export type DragTarget =
    | { type: 'pool'; tier: Tier }
    | { type: 'slot'; position: Position; slot: SlotKey };

export interface DraggedItem {
    name: string;
    origin: DragOrigin;
}

/* --- 내전 기록 (M1, PLANNING.md 4·6장) --- */

export type TeamSide = 'blue' | 'red';

export interface Group {
    id: string;
    name: string;
    joinCode: string;
    createdAt: number;
}

export interface GroupPlayer {
    id: string;
    groupId: string;
    displayName: string;
}

export interface RiotAccount {
    id: string;
    playerId: string;
    gameName: string;
    tagLine: string;
    puuid: string;
    isPrimary: boolean;
}

export interface MatchParticipant {
    puuid: string;
    playerId: string | null; // null = 그룹 미등록 용병
    riotId: string;
    side: TeamSide;
    position: Position;
    champion: string; // 영문 챔피언 ID (예: "Akali") — 화면에서 한글로 변환
    kills: number;
    deaths: number;
    assists: number;
    gold: number;
    cs: number;
    visionScore: number;
    /* 원본(raw)에서 파생되는 부가 지표 — 서버가 목록 응답에 채워준다 */
    champLevel?: number | null;
    items?: number[]; // item0~6 (0 = 빈 슬롯)
    damage?: number | null; // 챔피언에게 가한 피해량
    spells?: number[];
    /** 저장용 원본 JSON (데모 생성 시 부가 지표를 담아 보낸다) */
    raw?: string;
}

export interface MatchRecord {
    id: string;
    groupId: string;
    riotMatchId: string;
    source: 'riot' | 'demo';
    gameStart: number;
    durationSec: number;
    winningSide: TeamSide;
    participants: MatchParticipant[];
    /** 매치 레벨 원본 JSON (상세정보 보기에서 노출) */
    rawInfo?: string;
}
