import type { OperatorSymbol, Position, Tier } from './types';

export const POSITIONS: Position[] = ['탑', '정글', '미드', '원딜', '서포터'];
export const OPERATORS: OperatorSymbol[] = ['>', '>=', '=', '<=', '<'];

/*
 * 롤 티어 메타 — 아이언(약)~챌린저(강) 순.
 * 색상은 라이엇 공식 에셋이 아닌, 각 티어를 연상시키는 자체 팔레트다.
 */
export interface TierMeta {
    key: Tier;
    label: string;   // 한글 표기
    short: string;   // 짧은 표기(엠블럼 밑 등)
    color: string;   // 주 색
    glow: string;    // 밝은 강조색
}

export const TIERS: Tier[] = [
    'iron', 'bronze', 'silver', 'gold', 'platinum',
    'emerald', 'diamond', 'master', 'grandmaster', 'challenger',
];

export const TIER_META: Record<Tier, TierMeta> = {
    iron:        { key: 'iron',        label: '아이언',     short: 'I',   color: '#7A7A7A', glow: '#B7B7B7' },
    bronze:      { key: 'bronze',      label: '브론즈',     short: 'B',   color: '#A9713B', glow: '#D69A5E' },
    silver:      { key: 'silver',      label: '실버',       short: 'S',   color: '#9AABBC', glow: '#CFE0EE' },
    gold:        { key: 'gold',        label: '골드',       short: 'G',   color: '#E0A92E', glow: '#FFD666' },
    platinum:    { key: 'platinum',    label: '플래티넘',   short: 'P',   color: '#3FB3A6', glow: '#77E3D6' },
    emerald:     { key: 'emerald',     label: '에메랄드',   short: 'E',   color: '#22A86A', glow: '#5FE3A3' },
    diamond:     { key: 'diamond',     label: '다이아',     short: 'D',   color: '#4A7FE0', glow: '#8FB4FF' },
    master:      { key: 'master',      label: '마스터',     short: 'M',   color: '#9D4EDD', glow: '#CE9BFF' },
    grandmaster: { key: 'grandmaster', label: '그랜드마스터', short: 'GM', color: '#E0483D', glow: '#FF8A80' },
    challenger:  { key: 'challenger',  label: '챌린저',     short: 'C',   color: '#46C8F5', glow: '#B7EEFF' },
};

/** 디비전이 없는 상위 티어 */
export const APEX_TIERS: Tier[] = ['master', 'grandmaster', 'challenger'];

/** 롤과 같은 세부 랭크 한 칸 — 다이아3, 플래티넘1처럼 */
export interface RankOption {
    tier: Tier;
    /** 'I'~'IV', 마스터 이상은 null */
    division: string | null;
    /** 저장·선택 값 (예: 'platinum:II') */
    value: string;
    /** 짧은 표기 (예: '플2') */
    short: string;
    /** 전체 표기 (예: '플래티넘 2') */
    label: string;
}

const DIVISIONS = ['IV', 'III', 'II', 'I'];
const DIV_NUM: Record<string, string> = { IV: '4', III: '3', II: '2', I: '1' };
/** 짧은 한글 티어 표기 — 칩에 좁게 넣기 위해 한 글자 위주 */
const TIER_ABBR: Record<Tier, string> = {
    iron: '아', bronze: '브', silver: '실', gold: '골', platinum: '플',
    emerald: '에', diamond: '다', master: '마', grandmaster: '그마', challenger: '챌',
};

/*
 * 약→강 순서의 전체 랭크 목록 (아이언4 → 챌린저1).
 *
 * 롤에서 마스터 이상은 디비전이 없고 LP로만 갈리지만, 내전에서는 "마스터 안에서도
 * 누가 더 세냐"를 손으로 구분하고 싶어 한다. 그래서 마스터·그랜드마스터·챌린저에도
 * 1~4칸을 두어 똑같이 지정할 수 있게 한다. (라이엇에서 자동으로 가져온 랭크는 LP로 계산한다)
 */
export const RANK_OPTIONS: RankOption[] = TIERS.flatMap((tier): RankOption[] =>
    DIVISIONS.map(division => ({
        tier,
        division,
        value: `${tier}:${division}`,
        short: `${TIER_ABBR[tier]}${DIV_NUM[division]}`,
        label: `${TIER_META[tier].label} ${DIV_NUM[division]}`,
    })),
);

/** 저장값 → 랭크 (구버전의 티어만 저장된 값도 받아 준다) */
export const parseRank = (value: string | null | undefined): RankOption | null => {
    if (!value) return null;
    const exact = RANK_OPTIONS.find(o => o.value === value);
    if (exact) return exact;
    // 'platinum' 처럼 디비전 없이 저장된 구버전 값 → 그 티어의 가운데(II)로 본다
    const t = value.split(':')[0] as Tier;
    return RANK_OPTIONS.find(o => o.tier === t && o.division === 'II')
        ?? RANK_OPTIONS.find(o => o.tier === t) ?? null;
};

/** 문맥 메뉴 등에서 쓰는 티어 키 목록 (약→강) */
export const TIER_KEYS: Tier[] = TIERS;

export const tierColor = (t: Tier | null | undefined): string | undefined =>
    t ? TIER_META[t].color : undefined;

export const tierLabel = (t: Tier): string => TIER_META[t].label;

/** 강도(정렬용) — 챌린저가 가장 큼 */
export const tierStrength = (t: Tier | null | undefined): number =>
    t ? TIERS.indexOf(t) : -1;

/** 참가자 목록을 탑→정글→미드→원딜→서포터 순으로 정렬 */
export const sortByLane = <T extends { position: Position }>(list: T[]): T[] =>
    [...list].sort((a, b) => POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position));
