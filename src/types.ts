/** 롤 티어 (아이언~챌린저) */
export type Tier =
    | 'iron' | 'bronze' | 'silver' | 'gold' | 'platinum'
    | 'emerald' | 'diamond' | 'master' | 'grandmaster' | 'challenger';
export type Position = '탑' | '정글' | '미드' | '원딜' | '서포터';
export type OperatorSymbol = '>' | '>=' | '=' | '<=' | '<';
/** 팀 슬롯 = 팀 번호 (0부터) */
export type SlotKey = number;

export interface Player {
    name: string;
    /** 구버전 필드 — 로드 시 baseRank로 옮긴다 */
    tier?: Tier | null;
    /**
     * 직접 지정한 기본 티어 (예: 'platinum:II'). 비어 있으면 롤 최고 솔랭(없으면 자랭)을 쓴다.
     * 그룹에 속한 참가자면 서버에도 함께 저장된다.
     */
    baseRank?: string | null;
    /** 자동 계산된 최종 점수에 사용자가 더한 값 (+/−) */
    scoreAdjust?: number;
    /** 희망 라인 — 앞에 있을수록 높은 지망 (1지망, 2지망 …) */
    wishes?: Position[];
}

export interface LaneState {
    /** 팀별 배치 — 인덱스가 팀 번호 (0=1팀, 1=2팀 …) */
    slots: (string | null)[];
    /** 구버전 필드 (로드 시 마이그레이션 후 무시) */
    temps?: string[];
    name1?: string | null;
    name2?: string | null;
    temp?: string | null;
    operator: OperatorSymbol;
}

export type LanesState = Record<Position, LaneState>;

export type DragOrigin =
    | { type: 'pool' }
    | { type: 'slot'; position: Position; slot: SlotKey };

export type DragTarget =
    | { type: 'pool' }
    | { type: 'slot'; position: Position; slot: SlotKey }
    /** 희망 라인 칸 — 떨어뜨리면 그 라인을 지망 목록에 추가 (배치는 그대로) */
    | { type: 'wish'; position: Position };

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
