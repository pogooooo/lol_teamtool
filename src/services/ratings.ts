import type { Position, Tier } from '../types';
import { TIERS, POSITIONS } from '../constants';

/*
 * 참가자 실력 점수 모델.
 *
 * 설계 근거(이론):
 *  1) 기본 점수는 티어·디비전·LP를 하나의 연속값으로 편다. 티어 간 간격(5점)을 균일하게 두고
 *     디비전(IV→I)으로 그 안을 4등분해, "다이아4"와 "다이아1"의 실력 차가 무시되지 않게 한다.
 *  2) 랭크는 "최근"이 아니라 "누적" 지표라, 오래 안 한 사람의 티어는 실제 폼보다 부풀려져 있다.
 *     그래서 최근 30일 게임 수가 적을수록 감점한다(녹슨 정도 보정).
 *  3) 같은 티어라도 승률이 크게 높으면 상승 중(실력 > 현재 티어)일 확률이 높다. 표본이 작을수록
 *     승률의 신뢰도가 낮으므로, 게임 수에 따라 보정폭을 줄인다(수축 추정).
 *  4) 라인마다 캐리 영향력이 다르고, 그 크기는 실력대별로 달라진다. 저티어에서는 오브젝트·갱킹
 *     주도권을 쥔 정글과 로밍이 자유로운 미드의 개인 영향력이 크고, 시야·이니시로 기여하는
 *     서포터의 가치는 팀 합이 안 맞아 덜 발현된다. 반대로 고티어에서는 오브젝트 운영과 시야 싸움이
 *     정착되어 서포터·원딜의 팀 기여가 커지고, 탑은 사이드 고립으로 상대적 영향력이 줄어든다.
 *     → 배치된 라인에 따라 점수에 가중치를 곱해 "이 라인에 이 사람을 두면 팀에 얼마나 보탬인가"를 만든다.
 */

export interface PlayerRating {
    playerId: string;
    displayName: string;
    riotId: string | null;
    summonerLevel?: number | null;
    profileIconId?: number | null;
    queueType?: string | null;
    tier?: string | null;      // Riot 표기 ('GOLD')
    division?: string | null;  // 'I'~'IV'
    leaguePoints?: number;
    wins?: number;
    losses?: number;
    recentGames30d?: number;
    /** 소환사 조회 자체가 실패한 계정 (태그 오입력 등) — "언랭"과 구분한다 */
    lookupFailed?: boolean;
    error?: boolean;
}

/** Riot 티어 문자열 → 내부 티어 키 */
export const riotTierToTier = (riotTier?: string | null): Tier | null => {
    if (!riotTier) return null;
    const key = riotTier.toLowerCase();
    return (TIERS as string[]).includes(key) ? (key as Tier) : null;
};

/** 티어별 기본 점수(디비전 아래 칸). 티어 간 5점 간격 */
const TIER_BASE: Record<Tier, number> = {
    iron: 0, bronze: 5, silver: 10, gold: 15, platinum: 20,
    emerald: 25, diamond: 30, master: 37, grandmaster: 41, challenger: 45,
};

const DIVISION_STEP: Record<string, number> = { IV: 0, III: 1.25, II: 2.5, I: 3.75 };

/**
 * 티어+디비전+LP → 연속 점수 (아이언4 0점 ~ 챌린저 상위 48점대).
 * 디비전 안에서도 LP로 촘촘하게 갈리므로 "골드1 90LP"와 "골드1 10LP"가 구분된다.
 */
export const baseScore = (tier: Tier | null, division?: string | null, lp = 0): number => {
    if (!tier) return 12; // 언랭/미등록은 골드 언저리로 가정 (중앙값)
    const base = TIER_BASE[tier];
    /*
     * 마스터 이상은 롤에 디비전이 없고 LP가 곧 사다리다.
     *  · 라이엇에서 가져온 랭크(LP 있음)는 LP로 계산한다. LP는 위로 갈수록 같은 1점의
     *    가치가 커지므로 제곱근으로 눌러 상위권이 과대평가되지 않게 한다.
     *  · 사람이 직접 "마스터 2"처럼 지정한 값은 LP가 없으므로 디비전 칸으로 계산한다.
     */
    if (tier === 'master' || tier === 'grandmaster' || tier === 'challenger') {
        if (lp > 0) return base + Math.min(Math.sqrt(lp / 1200), 1) * 3.5;
        return base + (DIVISION_STEP[division ?? 'IV'] ?? 0);
    }
    return base + (DIVISION_STEP[division ?? 'IV'] ?? 0) + Math.min(lp / 100, 1) * 1.25;
};

/**
 * 최근 30일 게임 수 → 감점. 랭크 티어는 누적 기록이라 오래 쉬면 실제 폼이 그보다 낮다.
 * 구간을 촘촘히 나눠 "조금 덜 한 사람"과 "아예 안 한 사람"을 구분한다.
 */
export const activityAdjust = (games30d = 0): number => {
    if (games30d >= 30) return 0;
    if (games30d >= 20) return -0.3;
    if (games30d >= 15) return -0.7;
    if (games30d >= 10) return -1.2;
    if (games30d >= 5) return -2.0;
    if (games30d >= 2) return -3.0;
    if (games30d >= 1) return -3.8;
    return -4.5;
};

/** 랭크 승률 → 가감점. 표본이 작으면 신뢰도를 낮춰 폭을 줄인다(수축 추정) */
export const formAdjust = (wins = 0, losses = 0): number => {
    const games = wins + losses;
    if (games < 10) return 0;
    const winRate = wins / games;
    const confidence = Math.min(games / 60, 1); // 60판이면 완전 신뢰
    return Math.max(-2.5, Math.min(2.5, (winRate - 0.5) * 14 * confidence));
};

/**
 * 랭크 표본이 너무 적으면 티어 자체가 불안정하다(배치 직후 등).
 * 판수가 적을수록 소폭 감점해 과신을 줄인다.
 */
export const sampleAdjust = (wins = 0, losses = 0): number => {
    const games = wins + losses;
    if (games >= 40) return 0;
    if (games >= 20) return -0.4;
    if (games >= 10) return -0.9;
    if (games >= 1) return -1.5;
    return -2.0;
};

/** 실력대 구간 — 라인 가중치가 달라지는 기준 */
export type Bracket = 'low' | 'mid' | 'high';

export const bracketOf = (tier: Tier | null): Bracket => {
    if (!tier) return 'low';
    const i = TIERS.indexOf(tier);
    if (i <= TIERS.indexOf('gold')) return 'low';
    if (i <= TIERS.indexOf('emerald')) return 'mid';
    return 'high';
};

/**
 * 라인별 영향력 가중치 — 실력대에 따라 달라진다.
 * 저티어: 정글·미드의 개인 캐리력이 큼 / 고티어: 서폿·원딜의 팀 기여가 살아나고 탑은 고립됨
 */
export const LANE_WEIGHTS: Record<Bracket, Record<Position, number>> = {
    low:  { 탑: 1.00, 정글: 1.15, 미드: 1.10, 원딜: 0.95, 서포터: 0.85 },
    mid:  { 탑: 1.00, 정글: 1.10, 미드: 1.08, 원딜: 1.00, 서포터: 0.92 },
    high: { 탑: 0.98, 정글: 1.06, 미드: 1.08, 원딜: 1.02, 서포터: 1.02 },
};

export const laneWeight = (tier: Tier | null, position: Position): number =>
    LANE_WEIGHTS[bracketOf(tier)][position];

/* --- 라인 숙련도 (그룹 내전 전적 기반) --- */

/** 서버가 집계해 준 참가자×라인 전적 */
export interface LaneStatRow {
    playerId: string;
    position: string;
    games: number;
    wins: number;
}

/** playerId → 라인별 전적 */
export type LaneStatMap = Record<string, Partial<Record<Position, { games: number; wins: number }>>>;

export const buildLaneStats = (rows: LaneStatRow[]): LaneStatMap => {
    const map: LaneStatMap = {};
    for (const r of rows) {
        const pos = r.position as Position;
        if (!POSITIONS.includes(pos)) continue;
        (map[r.playerId] ??= {})[pos] = { games: Number(r.games) || 0, wins: Number(r.wins) || 0 };
    }
    return map;
};

export interface LaneProficiency {
    /** 점수에 곱해지는 배수 */
    factor: number;
    /** 이 라인에서 뛴 판 수 */
    games: number;
    /** 전체 대비 이 라인 비중 (0~1) */
    share: number;
    /** 이 라인 승률 − 본인 전체 승률 */
    winRateDelta: number;
    /** 표시용 분류 */
    label: '주라인' | '부라인' | '오프' | null;
}

/**
 * 라인 숙련도 — 같은 사람이라도 라인마다 실력이 다르다는 점을 그룹 내전 기록으로 보정한다.
 *
 *  · 경험: 그 라인을 자주 뛸수록 편안하다. 한 번도 안 뛴 라인은 오프 포지션으로 감점한다.
 *  · 성적: 그 라인에서의 승률이 본인 평균보다 높으면 가점. 판수가 적으면 신뢰도를 낮춰 폭을 줄인다.
 *
 * 표본이 거의 없으면(전체 3판 미만) 배수 1로 두어 기존 계산을 그대로 쓴다.
 */
export const laneProficiency = (
    lanes: Partial<Record<Position, { games: number; wins: number }>> | undefined,
    position: Position,
): LaneProficiency => {
    const none: LaneProficiency = { factor: 1, games: 0, share: 0, winRateDelta: 0, label: null };
    if (!lanes) return none;

    const total = POSITIONS.reduce((s, p) => s + (lanes[p]?.games ?? 0), 0);
    const totalWins = POSITIONS.reduce((s, p) => s + (lanes[p]?.wins ?? 0), 0);
    if (total < 3) return none;

    const here = lanes[position] ?? { games: 0, wins: 0 };
    const share = here.games / total;

    // 경험 — 한 번도 안 뛴 라인은 −12%, 30% 이상 도맡는 주라인은 +6%
    const exp = here.games === 0 ? 0.88 : 0.94 + 0.12 * Math.min(share / 0.3, 1);

    // 성적 — 본인 평균 승률 대비 편차를 판수만큼만 신뢰한다
    let delta = 0;
    let result = 1;
    if (here.games > 0) {
        delta = here.wins / here.games - totalWins / total;
        const confidence = Math.min(here.games / 8, 1);
        result = 1 + Math.max(-0.3, Math.min(0.3, delta)) * 0.35 * confidence;
    }

    const factor = Math.max(0.82, Math.min(1.18, exp * result));
    const label: LaneProficiency['label'] =
        here.games === 0 ? '오프' : share >= 0.3 ? '주라인' : '부라인';
    return { factor, games: here.games, share, winRateDelta: delta, label };
};

/**
 * 희망 라인 보정 — 본인이 가고 싶다고 표시한 라인은 동기·집중도가 높다고 본다.
 * 1지망 +6%, 2지망 +3%, 3지망 이하 +1.5%. 지망을 하나라도 냈는데 이 라인이 목록에 없으면
 * "원하지 않는 라인"으로 −5%. 아무 지망도 안 냈으면 보정 없음(1).
 */
export const wishFactor = (wishes: Position[] | undefined, position: Position): number => {
    if (!wishes || wishes.length === 0) return 1;
    const idx = wishes.indexOf(position);
    if (idx === -1) return 0.95;
    return idx === 0 ? 1.06 : idx === 1 ? 1.03 : 1.015;
};

export interface ScoreBreakdown {
    tier: Tier | null;
    base: number;
    activity: number;
    form: number;
    sample: number;
    /** 라인 배치 전 개인 점수 */
    score: number;
}

/**
 * 참가자 개인 점수 (라인 무관).
 * 라이엇 계정이 연동돼 있으면 실제 랭크·활동량으로 계산하고,
 * 계정이 없으면 직접 지정한 티어만으로 계산한다(활동/폼 데이터가 없으므로 감점하지 않는다).
 */
export const computeScore = (r?: PlayerRating | null, fallbackTier?: Tier | null): ScoreBreakdown => {
    const riotTier = riotTierToTier(r?.tier);
    const hasRiotData = Boolean(r) && !r?.lookupFailed && riotTier !== null;

    if (!hasRiotData) {
        const tier = fallbackTier ?? null;
        // 티어를 지정하지 않았고 계정도 없으면 중앙값(골드 근처)으로 둔다
        return { tier, base: baseScore(tier), activity: 0, form: 0, sample: 0, score: baseScore(tier) };
    }

    const base = baseScore(riotTier, r?.division, r?.leaguePoints ?? 0);
    const activity = activityAdjust(r?.recentGames30d ?? 0);
    const form = formAdjust(r?.wins ?? 0, r?.losses ?? 0);
    const sample = sampleAdjust(r?.wins ?? 0, r?.losses ?? 0);
    return { tier: riotTier, base, activity, form, sample, score: Math.max(0, base + activity + form + sample) };
};

/**
 * 특정 라인에 배치했을 때의 팀 기여 점수.
 * 개인 점수 × 라인 영향력(실력대별) × 라인 숙련도(그룹 전적)
 */
export const laneScore = (
    r: PlayerRating | null | undefined,
    position: Position,
    fallbackTier?: Tier | null,
    lanes?: Partial<Record<Position, { games: number; wins: number }>>,
): number => {
    const { tier, score } = computeScore(r, fallbackTier);
    return score * laneWeight(tier, position) * laneProficiency(lanes, position).factor;
};

/* --- 팀 빌더 점수 파이프라인 --- */

/** 기본 티어를 어디서 가져왔는지 — 우클릭 메뉴에 그대로 보여준다 */
export type TierSource = '라인 지정' | '직접 지정' | '솔로랭크' | '자유랭크' | '없음';

/**
 * 자유랭크 보정.
 * 자랭은 파티로 돌리는 경우가 많아 같은 티어라도 솔랭보다 개인 실력을 덜 반영한다.
 * 솔랭 기록이 없어 자랭을 기본 티어로 쓸 때만 반 칸(2.5점) 깎는다.
 */
export const FLEX_PENALTY = -2.5;

/** 기본 티어 한 칸 */
export interface BaseRank {
    tier: Tier | null;
    division: string | null;
    lp?: number;
    source: TierSource;
}

/** 라이엇 랭크에서 가져오는 가감용 표본 (계정이 없으면 없다) */
export interface RankStats {
    wins?: number;
    losses?: number;
    /** 최근 30일 게임 수 — 조회하지 못했으면 null */
    games30d?: number | null;
}

/** 점수 한 사람분의 전체 내역 — 우클릭 메뉴에서 그대로 펼쳐 보여준다 */
export interface ScoreParts {
    tier: Tier | null;
    division: string | null;
    source: TierSource;
    /** 1. 기본 티어 점수 */
    base: number;
    /** 2~4. 가감 */
    activity: number;
    form: number;
    sample: number;
    /** 자유랭크를 기본 티어로 쓸 때의 감점 */
    flex: number;
    /** 가감까지 끝난 개인 점수 */
    personal: number;
    /** 5. 배수 */
    laneMul: number;
    profMul: number;
    wishMul: number;
    prof: LaneProficiency;
    /** 자동 계산 최종값 */
    auto: number;
    /** 사용자가 직접 더한 값 */
    adjust: number;
    /** 화면에 쓰는 최종 점수 */
    total: number;
}

/**
 * 기본 티어 → 최종 점수.
 *
 *   (티어 점수 + 활동 + 승률 + 표본) × 라인 가중치 × 내전 라인 숙련도 × 희망 라인 + 사용자 조절
 *
 * 가감 표본(승패·최근 게임 수)은 라이엇 계정에서만 나온다. 계정이 없으면 가감 없이
 * 지정한 티어 점수를 그대로 쓴다(모르는 것을 감점하지 않는다).
 * position이 없으면 라인과 무관한 대표 점수를 낸다.
 */
export const composeScore = (opts: {
    rank: BaseRank | null;
    stats?: RankStats | null;
    position?: Position | null;
    wishes?: Position[];
    lanes?: Partial<Record<Position, { games: number; wins: number }>>;
    adjust?: number;
}): ScoreParts => {
    const { rank, stats, position, wishes, lanes } = opts;
    const tier = rank?.tier ?? null;
    const base = baseScore(tier, rank?.division, rank?.lp ?? 0);

    // 표본이 있을 때만 가감한다 (games30d가 null이면 조회 실패 → 감점하지 않음)
    const hasRecord = Boolean(stats) && ((stats?.wins ?? 0) + (stats?.losses ?? 0)) > 0;
    const activity = typeof stats?.games30d === 'number' ? activityAdjust(stats.games30d) : 0;
    const form = hasRecord ? formAdjust(stats?.wins, stats?.losses) : 0;
    const sample = hasRecord ? sampleAdjust(stats?.wins, stats?.losses) : 0;
    const flex = rank?.source === '자유랭크' ? FLEX_PENALTY : 0;
    const personal = Math.max(0, base + activity + form + sample + flex);

    const prof = laneProficiency(position ? lanes : undefined, position ?? '탑');
    const laneMul = position ? laneWeight(tier, position) : 1;
    const profMul = position ? prof.factor : 1;
    const wishMul = position ? wishFactor(wishes, position) : 1;

    const auto = personal * laneMul * profMul * wishMul;
    const adjust = opts.adjust ?? 0;
    return {
        tier,
        division: rank?.division ?? null,
        source: rank?.source ?? '없음',
        base, activity, form, sample, flex, personal,
        laneMul, profMul, wishMul, prof,
        auto,
        adjust,
        total: Math.max(0, auto + adjust),
    };
};

export const fmtScore = (n: number): string => n.toFixed(1);

/** 부호를 붙인 표기 — 조절량·가감 표시용 */
export const fmtSigned = (n: number): string => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)}`;

/** 티어 표기 — "마스터 178LP", "다이아3" 처럼 */
export const rankLabel = (r?: PlayerRating | null): string => {
    const tier = riotTierToTier(r?.tier);
    if (!tier) return '언랭';
    const meta = { master: '마스터', grandmaster: '그랜드마스터', challenger: '챌린저' } as Record<string, string>;
    if (meta[tier]) return `${meta[tier]} ${r?.leaguePoints ?? 0}LP`;
    const names: Record<string, string> = {
        iron: '아이언', bronze: '브론즈', silver: '실버', gold: '골드',
        platinum: '플래티넘', emerald: '에메랄드', diamond: '다이아',
    };
    const romanToNum: Record<string, string> = { I: '1', II: '2', III: '3', IV: '4' };
    return `${names[tier] ?? tier}${romanToNum[r?.division ?? ''] ?? ''}`;
};
