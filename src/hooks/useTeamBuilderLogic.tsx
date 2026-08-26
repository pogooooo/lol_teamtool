import { useState, useEffect, useRef } from 'react';
import type * as React from 'react';
import constate from 'constate';
import { POSITIONS, OPERATORS, TIERS, tierStrength, parseRank, RANK_OPTIONS } from '../constants';
import type { DraggedItem, DragTarget, LanesState, Player, Position, Tier } from '../types';
import type { PlayerRating } from '../services/ratings';
import { riotTierToTier, laneProficiency, buildLaneStats, composeScore } from '../services/ratings';
import type { LaneStatRow, LaneStatMap, LaneProficiency, BaseRank, ScoreParts } from '../services/ratings';
import * as api from '../services/api';
import { useActiveGroupId } from './useActiveGroupBadge';
import type { RiotRankRow } from '../services/api';
import type { SheetRow } from '../services/tierSheet';
import { parseSheetCsv } from '../services/tierSheet';
import { balanceTeams, laneGapLimit } from '../services/balance';

/** 포인트 상점 장식 (칭호·테두리·배경) */
export interface Cosmetic { title: string | null; frame: string | null; bg: string | null; titleName?: string }

export const MIN_TEAMS = 2;
export const MAX_TEAMS = 6;

const makeLanes = (teamCount: number): LanesState =>
    POSITIONS.reduce((acc, pos) => {
        acc[pos] = { slots: Array<string | null>(teamCount).fill(null), operator: '=' };
        return acc;
    }, {} as LanesState);

const initialLanes: LanesState = makeLanes(MIN_TEAMS);

/** 디비전 약→강 (정렬용) */
const DIV_ORDER = ['IV', 'III', 'II', 'I'];

/** 라인이 아니라 "전체 기본 티어"를 가리키는 자리 이름 (서버에도 이 키로 저장된다) */
export const BASE_POS = '기본';

/** 라이엇에서 가져온 랭크 → 저장값('platinum:II') */
const autoRankValue = (r?: { tier: Tier; division: string | null }): string | null => {
    if (!r) return null;
    return RANK_OPTIONS.find(o => o.tier === r.tier && o.division === (r.division ?? null))?.value
        ?? RANK_OPTIONS.find(o => o.tier === r.tier)?.value
        ?? null;
};

/** 서버가 준 랭크 목록을 이름 기준 맵으로 (playerId → 이름 변환표가 필요하다) */
const toRankMap = (ranks: RiotRankRow[], nameById: Record<string, string>) => {
    const map: Record<string, RiotRankInfo> = {};
    for (const r of ranks) {
        const key = nameById[r.playerId];
        const t = riotTierToTier(r.tier);
        if (!key || !t) continue;
        map[key] = {
            tier: t,
            division: r.division ?? null,
            lp: r.lp ?? 0,
            wins: r.wins ?? 0,
            losses: r.losses ?? 0,
            games30d: r.games30d ?? null,
            queue: r.queue === 'flex' ? 'flex' : 'solo',
            riotId: r.riotId ?? null,
        };
    }
    return map;
};

/** 서버에서 받은 라이엇 랭크 — 기본 티어이자 점수 가감의 표본 */
export interface RiotRankInfo {
    tier: Tier;
    division: string | null;
    lp: number;
    wins: number;
    losses: number;
    games30d: number | null;
    queue: 'solo' | 'flex';
    riotId: string | null;
}

/** 자동 분배 결과 안내 — 합격선을 못 지켰거나 지망을 덜 지켰을 때 */
export interface BalanceNote { kind: 'warn' | 'info'; text: string }

interface ContextMenuState {
    visible: boolean;
    x: number;
    y: number;
    targetName: string | null;
    /** 라인에 배치된 카드를 우클릭했으면 그 라인 */
    position: Position | null;
}

const cloneLanes = (lanes: LanesState): LanesState => JSON.parse(JSON.stringify(lanes)) as LanesState;

// 새로고침해도 팀 빌더 상태(테마/참가자/배치)가 유지되도록 localStorage에 저장한다
const BUILDER_STORAGE = 'lol_teamtool:builder:v1';

// 최근에 팀 빌더에 사용한 이름 기록 — 최신순, 최대 30명
const RECENT_KEY = 'lol_teamtool:recentNames:v1';
const RECENT_MAX = 30;

const loadRecentNames = (): string[] => {
    try {
        const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
        return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    } catch {
        return [];
    }
};

interface SavedBuilderState {
    theme?: 'light' | 'dark';
    allPlayers?: Player[];
    lanes?: Partial<LanesState>;
    captains?: string[];
    teamCount?: number;
}

const loadSavedState = (): SavedBuilderState => {
    try {
        return JSON.parse(localStorage.getItem(BUILDER_STORAGE) ?? '{}') as SavedBuilderState;
    } catch {
        return {};
    }
};

const saved = loadSavedState();

// 구버전 상/중/하 티어를 롤 티어로 마이그레이션 (상→다이아, 중→골드, 하→실버)
const OLD_TIER_MAP: Record<string, Tier> = { '상': 'diamond', '중': 'gold', '하': 'silver' };

/** 구버전 저장본 → 현재 구조 (tier → baseRank, scoreOverride 폐기) */
const migratePlayers = (list: Player[]): Player[] =>
    list.map(p => {
        const out: Player = { ...p };
        const legacy = out.tier as string | null | undefined;
        if (legacy && !out.baseRank) {
            const tier = (TIERS as string[]).includes(legacy) ? (legacy as Tier) : OLD_TIER_MAP[legacy] ?? null;
            // 디비전 정보가 없던 값이라 그 티어의 가운데(2)로 본다
            if (tier) out.baseRank = RANK_OPTIONS.find(o => o.tier === tier && o.division === 'II')?.value ?? tier;
        }
        delete out.tier;
        delete (out as { scoreOverride?: unknown }).scoreOverride;
        return out;
    });

export const useTeamBuilderLogic = () => {
    const [theme, setTheme] = useState<'light' | 'dark'>(saved.theme === 'light' ? 'light' : 'dark');
    const [allPlayers, setAllPlayers] = useState<Player[]>(Array.isArray(saved.allPlayers) ? migratePlayers(saved.allPlayers) : []);
    const [inputValue, setInputValue] = useState('');

    /* 이름으로 참가자 찾기 — 점수 계산이 모두 여기서 시작하므로 위쪽에 둔다 */
    const findPlayer = (name: string) => allPlayers.find(p => p.name === name);

    // 팀 수 — 저장본에 없으면 기존 2팀
    const [teamCount, setTeamCountState] = useState<number>(() => {
        const n = Number(saved.teamCount);
        return Number.isFinite(n) ? Math.max(MIN_TEAMS, Math.min(MAX_TEAMS, n)) : MIN_TEAMS;
    });

    /*
     * 저장본을 라인별로 병합한다.
     * 구버전 마이그레이션: 단일 temp → temps 배열, name1/name2 → slots 배열
     */
    const [lanes, setLanes] = useState<LanesState>(() => {
        const savedTeams = Number(saved.teamCount);
        const count = Number.isFinite(savedTeams) ? Math.max(MIN_TEAMS, Math.min(MAX_TEAMS, savedTeams)) : MIN_TEAMS;
        const base = makeLanes(count);
        if (saved.lanes) {
            for (const pos of POSITIONS) {
                const src = saved.lanes[pos];
                if (!src) continue;
                const merged = { ...base[pos], ...src };
                if (!Array.isArray(merged.slots)) {
                    merged.slots = [src.name1 ?? null, src.name2 ?? null];
                }
                // 팀 수에 맞게 길이 보정 · 구버전 임시 칸은 폐기 (희망 라인으로 대체됨)
                merged.slots = Array.from({ length: count }, (_, i) => merged.slots[i] ?? null);
                delete merged.temp;
                delete merged.temps;
                delete merged.name1;
                delete merged.name2;
                base[pos] = merged;
            }
        }
        return base;
    });

    /** 팀 수 변경 — 줄이면 잘린 팀의 인원은 대기 명단으로 돌아간다 */
    const setTeamCount = (next: number) => {
        const count = Math.max(MIN_TEAMS, Math.min(MAX_TEAMS, Math.round(next)));
        setTeamCountState(count);
        setLanes(prev => {
            const out = cloneLanes(prev);
            for (const pos of POSITIONS) {
                out[pos].slots = Array.from({ length: count }, (_, i) => out[pos].slots[i] ?? null);
            }
            return out;
        });
    };

    // 팀장 표시 — 이름 더블클릭으로 토글, 글로우 효과로 표시 (아이콘 없음)
    const [captains, setCaptains] = useState<string[]>(Array.isArray(saved.captains) ? saved.captains : []);

    /*
     * 내전 기록 그룹에서 불러온 참가자 레이팅 — 이름(또는 라이엇 게임명) 기준으로 찾는다.
     * 서버에서 받은 값이라 localStorage에 저장하지 않고 매번 갱신한다.
     */
    const [ratings, setRatings] = useState<Record<string, PlayerRating>>({});
    const ratingOf = (name: string): PlayerRating | undefined => ratings[name.trim().toLowerCase()];

    /** 포인트 상점에서 산 칭호·테두리·배경 — 이름 기준으로 팀 빌더 카드에도 그대로 보여준다 */
    const [cosmetics, setCosmetics] = useState<Record<string, Cosmetic>>({});
    const cosmeticOf = (name: string): Cosmetic | undefined => cosmetics[name.trim().toLowerCase()];
    const applyCosmetics = (map: Record<string, Cosmetic>) => setCosmetics(map);

    /*
     * 라인별 전적 — 같은 사람이라도 라인마다 실력이 다르므로 점수에 숙련도를 얹는다.
     * playerId 기준이라 이름 → playerId 매핑을 통해 찾는다.
     */
    const [laneStats, setLaneStats] = useState<LaneStatMap>({});
    const applyLaneStats = (rows: LaneStatRow[]) => setLaneStats(buildLaneStats(rows));

    /*
     * 지정 티어 — 이름(소문자) → 라인(또는 '기본') → 랭크값('platinum:II').
     * 참가자 관리·우클릭·엑셀에서 지정하며, 그룹에 속한 사람은 서버에도 저장된다.
     */
    const [laneTiers, setLaneTiers] = useState<Record<string, Partial<Record<string, string>>>>({});
    const [nameToId, setNameToId] = useState<Record<string, string>>({});
    const [idToName, setIdToName] = useState<Record<string, string>>({});
    /** 이 그룹에 등록된 참가자 이름 — 팀 빌더 검색창에서 불러올 목록 */
    const [groupRoster, setGroupRoster] = useState<string[]>([]);
    /** 이름 → 라이엇 최고 랭크 + 점수 가감에 쓰는 표본 */
    const [riotRanks, setRiotRanks] = useState<Record<string, RiotRankInfo>>({});

    /** 서버에서 받은 참가자·지정 티어·라인 전적·라이엇 랭크를 한 번에 반영한다 */
    const applyBuilderData = (
        players: { id: string; displayName: string }[],
        tiers: { playerId: string; position: string; tier: string }[],
        stats: LaneStatRow[],
        ranks: RiotRankRow[] = [],
    ) => {
        const idByName: Record<string, string> = {};
        const nameById: Record<string, string> = {};
        for (const p of players) {
            idByName[p.displayName.trim().toLowerCase()] = p.id;
            nameById[p.id] = p.displayName.trim().toLowerCase();
        }
        setNameToId(idByName);
        setIdToName(nameById);
        setGroupRoster(players.map(p => p.displayName));

        const map: Record<string, Partial<Record<string, string>>> = {};
        for (const t of tiers) {
            const key = nameById[t.playerId];
            if (!key) continue;
            if (t.position !== BASE_POS && !POSITIONS.includes(t.position as Position)) continue;
            (map[key] ??= {})[t.position] = t.tier;
        }
        setLaneTiers(map);
        setLaneStats(buildLaneStats(stats));

        // 서버에 저장된 기본 티어를 로컬 명단에도 반영한다 (다른 기기에서 지정한 값)
        setAllPlayers(prev => prev.map(p => {
            const v = map[p.name.trim().toLowerCase()]?.[BASE_POS];
            return v && p.baseRank !== v ? { ...p, baseRank: v } : p;
        }));

        setRiotRanks(toRankMap(ranks, nameById));
    };

    /**
     * 뒤이어 도착한 랭크를 합친다.
     * 인원이 많으면 서버가 나눠서 주기 때문에 첫 응답만으로는 명단 뒷사람들의 티어가 비어 있다.
     */
    const mergeRiotRanks = (ranks: RiotRankRow[]) => {
        if (ranks.length === 0) return;
        setRiotRanks(prev => ({ ...prev, ...toRankMap(ranks, idToName) }));
    };

    /*
     * 그룹 데이터 로딩.
     *
     * 예전에는 팀 빌더 화면(TierPool)이 불러왔는데, 그러면 내전 기록 탭에서 시트 창을 열었을 때
     * 참가자·티어가 비어 있어 빈 표가 나갔다. 화면과 무관하게 훅이 직접 챙긴다.
     */
    const activeGroupId = useActiveGroupId();
    const [syncState, setSyncState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
    /** 마지막으로 롤 티어를 불러온 시각 — "언제 데이터인지"를 화면에 보여 준다 */
    const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
    const [reloadTick, setReloadTick] = useState(0);
    /** 롤 전적·티어를 지금 다시 불러온다 (그룹 전환 없이) */
    const refreshTiers = () => setReloadTick(t => t + 1);

    useEffect(() => {
        if (!activeGroupId) {
            setSyncState('idle');
            setGroupRoster([]);
            setLaneTiers({});
            setRiotRanks({});
            setNameToId({});
            setIdToName({});
            return;
        }
        let stopped = false;
        setSyncState('loading');

        (async () => {
            try {
                const data = await api.getBuilderData(activeGroupId);
                if (stopped) return;
                applyBuilderData(
                    (data.players ?? []) as { id: string; displayName: string }[],
                    (data.laneTiers ?? []) as { playerId: string; position: string; tier: string }[],
                    (data.laneStats ?? []) as LaneStatRow[],
                    data.riotRanks ?? [],
                );
                setSyncState('done');

                /*
                 * 인원이 많으면 서버가 티어를 나눠서 준다. 한 요청에 다 담으면 라이엇 호출
                 * 한도에 걸려 뒷사람들이 통째로 빠지기 때문이다. 나머지를 이어서 받아 채운다.
                 */
                let cursor = data.rankNext ?? null;
                while (cursor !== null && !stopped) {
                    const more = await api.getRanks(activeGroupId, cursor);
                    if (stopped) return;
                    mergeRiotRanks(more.riotRanks ?? []);
                    cursor = more.next;
                }
                if (!stopped) setLastSyncAt(Date.now());
            } catch {
                if (!stopped) setSyncState('error');
            }
        })();

        return () => { stopped = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeGroupId, reloadTick]);

    /*
     * 시트 상시 동기화 — 연결된 시트를 주기적으로 확인해, 바뀐 내용을 참가자 데이터(그룹)에 반영한다.
     * 참가자 쪽 변경은 서버가 저장 시점에 시트로 바로 써 주므로, 여기서는 시트 → 참가자 방향만 챙긴다.
     * 팀 빌더 명단은 어느 방향으로도 건드리지 않는다.
     */
    const [sheetLive, setSheetLive] = useState<'off' | 'live' | 'error'>('off');
    const lastSheetCsv = useRef<string | null>(null);

    useEffect(() => {
        if (!activeGroupId) { setSheetLive('off'); lastSheetCsv.current = null; return; }
        let stopped = false;

        const pull = async () => {
            try {
                const r = await api.getSheet(activeGroupId);
                if (stopped) return;
                if (!r.csv) { setSheetLive(r.url ? 'error' : 'off'); return; }
                setSheetLive('live');
                if (r.csv === lastSheetCsv.current) return;
                lastSheetCsv.current = r.csv;

                const { rows } = parseSheetCsv(r.csv);
                if (!rows.length) return;
                // 달라진 값만 저장되므로 내용이 같으면 서버에 쓰기가 일어나지 않는다
                await api.importTiers(activeGroupId, rows, { fromSheet: true });
                if (stopped) return;
                setReloadTick(t => t + 1);
                // 내전 기록(참가자 관리) 화면도 새 데이터를 다시 불러오게 알린다
                window.dispatchEvent(new Event('lol_teamtool:groupbadge'));
            } catch {
                if (!stopped) setSheetLive('error');
            }
        };

        void pull();
        const timer = setInterval(() => void pull(), 30000);
        return () => { stopped = true; clearInterval(timer); };
    }, [activeGroupId]);

    /** 이 사람의 라인별 전적 (없으면 undefined) */
    const lanesOf = (name: string) => {
        const pid = nameToId[name.trim().toLowerCase()] ?? ratingOf(name)?.playerId;
        return pid ? laneStats[pid] : undefined;
    };

    /**
     * 기본 티어 — 이 사람(또는 이 라인)의 점수 기준이 되는 랭크.
     *
     * 우선순위: 그 라인에 지정한 티어 → 직접 지정한 기본 티어 → 롤 최고 솔랭(없으면 자랭)
     *          → (라인 지정만 해 둔 경우) 지정된 라인 중 가장 높은 티어
     * 사용자가 지정한 값이 항상 라이엇 조회값을 이긴다.
     */
    const baseRankOf = (name: string, position?: Position | null): BaseRank | null => {
        const key = name.trim().toLowerCase();

        if (position) {
            const lane = parseRank(laneTiers[key]?.[position]);
            if (lane) return { tier: lane.tier, division: lane.division, source: '라인 지정' };
        }

        const manual = parseRank(findPlayer(name)?.baseRank ?? laneTiers[key]?.[BASE_POS]);
        if (manual) return { tier: manual.tier, division: manual.division, source: '직접 지정' };

        const riot = riotRanks[key];
        if (riot) {
            return {
                tier: riot.tier,
                division: riot.division,
                lp: riot.lp,
                source: riot.queue === 'flex' ? '자유랭크' : '솔로랭크',
            };
        }

        // 라인 티어만 지정해 둔 사람의 대표 티어 — 지정된 라인 중 가장 높은 것
        const t = laneTiers[key];
        const ranks = t
            ? (POSITIONS.map(pos => parseRank(t[pos])).filter(Boolean) as NonNullable<ReturnType<typeof parseRank>>[])
            : [];
        if (ranks.length) {
            const top = ranks.sort((a, b) =>
                tierStrength(b.tier) - tierStrength(a.tier)
                || DIV_ORDER.indexOf(b.division ?? 'I') - DIV_ORDER.indexOf(a.division ?? 'I'))[0];
            return { tier: top.tier, division: top.division, source: '라인 지정' };
        }
        return null;
    };

    /** 그 자리에 직접 지정해 둔 랭크값 — 라이엇에서 가져온 자동값은 제외한다 */
    const assignedRank = (name: string, position?: Position | null): string | null => {
        const key = name.trim().toLowerCase();
        if (position) return laneTiers[key]?.[position] ?? null;
        return findPlayer(name)?.baseRank ?? laneTiers[key]?.[BASE_POS] ?? null;
    };

    /** 이 라인의 티어만 (휘장·색 표시용) */
    const laneTierOf = (name: string, position: Position): Tier | null =>
        baseRankOf(name, position)?.tier ?? null;

    const bestRankOf = (name: string) => baseRankOf(name);
    const bestTierOf = (name: string): Tier | null => baseRankOf(name)?.tier ?? null;

    /** 이 사람의 라이엇 표본 (승패·최근 30일 게임 수) — 점수 가감에 쓴다 */
    const statsOf = (name: string): RiotRankInfo | undefined => riotRanks[name.trim().toLowerCase()];

    /**
     * 점수 전체 내역. position을 주면 그 라인에 배치했을 때의 값,
     * 없으면 라인과 무관한 대표 점수를 낸다. 우클릭 메뉴가 이걸 그대로 펼쳐 보여준다.
     */
    const scorePartsOf = (name: string, position?: Position | null): ScoreParts => {
        const p = findPlayer(name);
        return composeScore({
            rank: baseRankOf(name, position),
            stats: statsOf(name),
            position,
            wishes: p?.wishes,
            lanes: lanesOf(name),
            adjust: p?.scoreAdjust ?? 0,
        });
    };

    /** 지정 티어 변경 — '기본' 또는 특정 라인. 그룹 참가자면 서버에도 저장한다 */
    const setLaneRank = (name: string, position: Position | typeof BASE_POS, value: string | null) => {
        const key = name.trim().toLowerCase();
        setLaneTiers(prev => {
            const mine = { ...(prev[key] ?? {}) };
            if (value) mine[position] = value;
            else delete mine[position];
            return { ...prev, [key]: mine };
        });
        if (position === BASE_POS) {
            setAllPlayers(prev => prev.map(p => (p.name === name ? { ...p, baseRank: value } : p)));
        }
        const pid = nameToId[key];
        if (pid) void api.setLaneTier(pid, position, value).catch(() => { /* 오프라인이면 로컬에만 둔다 */ });
    };

    /* --- 엑셀 연동 --- */

    /**
     * 시트로 내보낼 표.
     * 팀 빌더 명단뿐 아니라 **그룹에 등록된 사람 전부**를 담는다.
     * 라인 티어를 아직 안 정한 사람이야말로 시트에서 채워 넣어야 할 대상이기 때문이다.
     */
    const sheetRows = (): SheetRow[] => {
        /*
         * 시트는 "참가자 관리"와 짝이다.
         * 그룹이 있으면 그룹 참가자 전원을 등록 순서 그대로 내보내고,
         * 그룹 없이 쓸 때만 팀 빌더 명단을 대상으로 한다.
         */
        const names = activeGroupId && groupRoster.length ? [...groupRoster] : allPlayers.map(p => p.name);

        return names.map(name => {
            const key = name.trim().toLowerCase();
            const player = findPlayer(name);
            const lanes: SheetRow['lanes'] = {};
            for (const pos of POSITIONS) {
                lanes[pos] = laneTiers[key]?.[pos] ?? null;
            }
            return {
                name,
                // 지정한 값이 없으면 라이엇에서 가져온 기본 티어를 참고용으로 채워 준다
                base: player?.baseRank ?? laneTiers[key]?.[BASE_POS] ?? autoRankValue(riotRanks[key]),
                lanes,
                adjust: player?.scoreAdjust ?? 0,
            };
        });
    };

    /**
     * 엑셀·시트에서 읽은 표 반영 — 없는 이름은 명단에 새로 추가한다.
     * sync를 끄면 서버 저장은 건너뛴다 (참가자 관리에서 이미 통째로 반영한 경우).
     */
    const applySheetRows = (
        rows: SheetRow[],
        { sync = true, addMissing = true }: { sync?: boolean; addMissing?: boolean } = {},
    ) => {
        const byName = new Map(rows.map(r => [r.name.trim().toLowerCase(), r]));

        setAllPlayers(prev => {
            const out = prev.map(p => {
                const r = byName.get(p.name.trim().toLowerCase());
                if (!r) return p;
                return {
                    ...p,
                    baseRank: r.base === undefined ? p.baseRank : r.base,
                    scoreAdjust: r.adjust === undefined ? p.scoreAdjust : r.adjust,
                };
            });
            if (addMissing) {
                const existing = new Set(out.map(p => p.name.trim().toLowerCase()));
                for (const r of rows) {
                    const key = r.name.trim().toLowerCase();
                    if (existing.has(key)) continue;
                    existing.add(key);
                    out.push({ name: r.name.trim(), baseRank: r.base ?? null, scoreAdjust: r.adjust ?? 0 });
                }
            }
            return out;
        });

        setLaneTiers(prev => {
            const next = { ...prev };
            for (const r of rows) {
                const key = r.name.trim().toLowerCase();
                const mine = { ...(next[key] ?? {}) };
                if (r.base !== undefined) {
                    if (r.base) mine[BASE_POS] = r.base;
                    else delete mine[BASE_POS];
                }
                for (const pos of POSITIONS) {
                    const v = r.lanes[pos];
                    if (v === undefined) continue;
                    if (v) mine[pos] = v;
                    else delete mine[pos];
                }
                next[key] = mine;
            }
            return next;
        });

        // 그룹에 등록된 참가자는 서버에도 저장해 다른 기기·다음 접속에서도 유지된다
        let synced = 0;
        if (!sync) return { applied: rows.length, synced };
        for (const r of rows) {
            const pid = nameToId[r.name.trim().toLowerCase()];
            if (!pid) continue;
            synced += 1;
            if (r.base !== undefined) void api.setLaneTier(pid, BASE_POS, r.base).catch(() => {});
            for (const pos of POSITIONS) {
                const v = r.lanes[pos];
                if (v !== undefined) void api.setLaneTier(pid, pos, v).catch(() => {});
            }
        }
        return { applied: rows.length, synced };
    };

    /** 라인 랭크가 가장 높은 라인들 = 주라인 */
    const mainLanesOf = (name: string): Position[] => {
        const t = laneTiers[name.trim().toLowerCase()];
        if (!t) return [];
        let best = -Infinity;
        let out: Position[] = [];
        for (const pos of POSITIONS) {
            const r = parseRank(t[pos]);
            if (!r) continue;
            const st = tierStrength(r.tier) * 10 + DIV_ORDER.indexOf(r.division ?? 'I');
            if (st > best) { best = st; out = [pos]; }
            else if (st === best) out.push(pos);
        }
        return out;
    };

    /** 이 사람의 특정 라인 숙련도 */
    const proficiencyOf = (name: string, position: Position): LaneProficiency =>
        laneProficiency(lanesOf(name), position);

    /** 그룹 레이팅 반영 — 이름이 일치하는 참가자의 티어를 자동으로 채운다 */
    const applyRatings = (list: PlayerRating[]) => {
        const map: Record<string, PlayerRating> = {};
        for (const r of list) {
            map[r.displayName.trim().toLowerCase()] = r;
            const gameName = r.riotId?.split('#')[0]?.trim().toLowerCase();
            if (gameName && !map[gameName]) map[gameName] = r;
        }
        setRatings(map);
    };

    useEffect(() => {
        localStorage.setItem(BUILDER_STORAGE, JSON.stringify({ theme, allPlayers, lanes, captains, teamCount }));
    }, [theme, allPlayers, lanes, captains, teamCount]);

    const toggleCaptain = (name: string) =>
        setCaptains(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
    const isCaptain = (name: string) => captains.includes(name);
    const [recentNames, setRecentNames] = useState<string[]>(loadRecentNames);

    useEffect(() => {
        localStorage.setItem(RECENT_KEY, JSON.stringify(recentNames));
    }, [recentNames]);

    /** 이름 사용 기록 — 최신 사용을 앞으로 올린다 */
    const recordRecent = (names: string[]) => {
        const clean = names.map(n => n.trim()).filter(Boolean);
        if (clean.length === 0) return;
        setRecentNames(prev => [...clean, ...prev.filter(n => !clean.includes(n))].slice(0, RECENT_MAX));
    };

    const removeRecentName = (name: string) =>
        setRecentNames(prev => prev.filter(n => n !== name));

    const clearRecentNames = () => setRecentNames([]);

    const [dragOverTarget, setDragOverTarget] = useState<DragTarget | null>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, targetName: null, position: null });
    const lanesRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        const handleClick = () => setContextMenu({ visible: false, x: 0, y: 0, targetName: null, position: null });
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light');

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value);

    const handleInputSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && e.currentTarget.value.trim() !== '') {
            const newNames = e.currentTarget.value.trim().split(/\s+/);
            setAllPlayers(prevPlayers => {
                const existingNames = prevPlayers.map(p => p.name);
                // 기본 티어는 그룹에 등록된 롤 계정에서 자동으로 붙으므로 여기서 지정하지 않는다
                const newPlayers: Player[] = newNames
                    .filter(name => !existingNames.includes(name))
                    .map(name => ({ name }));
                return [...prevPlayers, ...newPlayers];
            });
            recordRecent(newNames);
            setInputValue('');
        }
    };

    /** 그룹에 등록된 참가자를 전부 명단으로 불러온다 (이미 있는 사람은 건너뛴다) */
    const importGroupRoster = () => {
        const fresh = groupRoster.filter(n => !allPlayers.some(p => p.name === n));
        if (fresh.length) importPlayers(fresh);
        return fresh.length;
    };

    /** 내전 기록 탭의 참가자 명단이나 최근 기록에서 팀 빌더 풀로 불러온다 */
    const importPlayers = (names: string[]) => {
        setAllPlayers(prev => {
            const existing = prev.map(p => p.name);
            const added: Player[] = names
                .filter(name => name.trim() !== '' && !existing.includes(name))
                .map(name => ({ name }));
            return [...prev, ...added];
        });
        recordRecent(names);
    };

    const closeContextMenu = () =>
        setContextMenu({ visible: false, x: 0, y: 0, targetName: null, position: null });

    const handleContextMenu = (e: React.MouseEvent, name: string, position: Position | null = null) => {
        e.preventDefault();
        setContextMenu({ visible: true, x: e.pageX, y: e.pageY, targetName: name, position });
    };

    const handleDeletePlayer = (nameToDelete: string) => {
        setAllPlayers(prev => prev.filter(p => p.name !== nameToDelete));
        setCaptains(prev => prev.filter(n => n !== nameToDelete));
        setLanes(prev => {
            const newLanes = cloneLanes(prev);
            for (const pos of POSITIONS) {
                newLanes[pos].slots = newLanes[pos].slots.map(n => (n === nameToDelete ? null : n));
            }
            return newLanes;
        });
    };

    /** 명단 전체 비우기 — 배치·팀장 표시까지 초기화한다 */
    const clearPlayers = () => {
        setAllPlayers([]);
        setCaptains([]);
        setLanes(makeLanes(teamCount));
    };

    /** 기본 티어 직접 지정 — value는 'platinum:II' 형식, null이면 자동(롤 랭크)으로 되돌린다 */
    const setBaseRank = (name: string, value: string | null) => setLaneRank(name, BASE_POS, value);

    /** 희망 라인 토글 — 이미 지망했으면 해제, 아니면 맨 뒤 순위로 추가 */
    const toggleWish = (name: string, position: Position) => {
        setAllPlayers(prev => prev.map(p => {
            if (p.name !== name) return p;
            const wishes = p.wishes ?? [];
            return wishes.includes(position)
                ? { ...p, wishes: wishes.filter(w => w !== position) }
                : { ...p, wishes: [...wishes, position] };
        }));
    };

    /**
     * 세부 점수 조절 — 자동 계산된 최종 점수에 더할 값을 누적한다.
     * 절대값이 아니라 "얼마나 조절했는지"를 남겨야 우클릭에서 조절량을 확인할 수 있다.
     */
    const adjustScore = (name: string, delta: number) => {
        setAllPlayers(prev => prev.map(p => p.name === name
            ? { ...p, scoreAdjust: Math.round(((p.scoreAdjust ?? 0) + delta) * 10) / 10 }
            : p));
    };

    /** 조절값 초기화 — 자동 계산 점수로 되돌린다 */
    const resetScoreAdjust = (name: string) => {
        setAllPlayers(prev => prev.map(p => (p.name === name ? { ...p, scoreAdjust: 0 } : p)));
    };

    /** 팀 위치 랜덤 — 라인별로 팀 배정을 섞는다 (누가 어느 팀인지만 바뀜) */
    const handleRandomizeSides = () => {
        setLanes(prevLanes => {
            const newLanes = cloneLanes(prevLanes);
            for (const pos of POSITIONS) {
                const slots = [...newLanes[pos].slots];
                for (let i = slots.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [slots[i], slots[j]] = [slots[j], slots[i]];
                }
                newLanes[pos].slots = slots;
                const op = newLanes[pos].operator;
                newLanes[pos].operator = op === '>' ? '<' : op === '<' ? '>' : op;
            }
            return newLanes;
        });
    };

    const handleReset = () => {
        setLanes(initialLanes);
    };

    const handleRandomAssign = () => {
        const assigned = Object.values(lanes).flatMap(l => l.slots).filter(Boolean);
        const unassignedPlayers = allPlayers.filter(p => !assigned.includes(p.name));

        const emptySlots: { position: Position; slot: number }[] = [];
        POSITIONS.forEach(pos => {
            lanes[pos].slots.forEach((v, i) => {
                if (v === null) emptySlots.push({ position: pos, slot: i });
            });
        });

        if (unassignedPlayers.length === 0 || emptySlots.length === 0) return;

        const playerToAssign = unassignedPlayers[Math.floor(Math.random() * unassignedPlayers.length)];
        const slotToFill = emptySlots[Math.floor(Math.random() * emptySlots.length)];

        setLanes(prevLanes => {
            const newLanes = cloneLanes(prevLanes);
            newLanes[slotToFill.position].slots[slotToFill.slot] = playerToAssign.name;
            return newLanes;
        });
    };

    const onDragStart = (e: React.DragEvent, item: DraggedItem) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", JSON.stringify(item));
    };

    const onDragOver = (e: React.DragEvent, target: DragTarget) => { e.preventDefault(); setDragOverTarget(target); };
    const onDragLeave = () => setDragOverTarget(null);

    /** 드래그 출발지에서 이름을 떼어낸다 */
    const detachFromOrigin = (lanesObj: LanesState, origin: DraggedItem['origin'], name: string) => {
        if (origin.type !== 'slot') return;
        void name;
        lanesObj[origin.position].slots[origin.slot] = null;
    };

    const onDrop = (e: React.DragEvent, target: DragTarget) => {
        e.preventDefault();
        setDragOverTarget(null);
        const dragged = JSON.parse(e.dataTransfer.getData("text/plain")) as DraggedItem;
        const { name: draggedName, origin: draggedOrigin } = dragged;

        if (target.type === 'pool') {
            // 풀로 되돌리기 — 라인에서 빼기만 하고 티어(랭크)는 유지한다
            if (draggedOrigin.type === 'slot') {
                setLanes(prev => {
                    const newLanes = cloneLanes(prev);
                    detachFromOrigin(newLanes, draggedOrigin, draggedName);
                    return newLanes;
                });
            }
            return;
        }

        // 희망 칸: 배치는 건드리지 않고 그 라인을 지망 목록에 추가한다
        if (target.type === 'wish') {
            const already = findPlayer(draggedName)?.wishes?.includes(target.position);
            if (!already) toggleWish(draggedName, target.position);
            return;
        }

        if (target.type === 'slot') {
            const { position, slot } = target;
            if (draggedOrigin.type === 'slot' && draggedOrigin.position === position && draggedOrigin.slot === slot) return;

            const nameInTargetSlot = lanes[position].slots[slot];
            setLanes(prev => {
                const newLanes = cloneLanes(prev);
                detachFromOrigin(newLanes, draggedOrigin, draggedName);
                /*
                 * 출발지 정보가 어긋나도(빠른 연속 드래그 등) 같은 사람이 두 자리에 남지 않도록,
                 * 배치 전에 다른 모든 자리에서 이름을 걷어낸다.
                 */
                for (const pos of POSITIONS) {
                    newLanes[pos].slots = newLanes[pos].slots.map(n => (n === draggedName ? null : n));
                }
                newLanes[position].slots[slot] = draggedName;
                // 자리에 있던 사람: 슬롯끼리는 맞교환, 풀 출신이면 풀로
                if (nameInTargetSlot && draggedOrigin.type === 'slot') {
                    newLanes[draggedOrigin.position].slots[draggedOrigin.slot] = nameInTargetSlot;
                }
                return newLanes;
            });
        }
    };

    const handleOperatorClick = (position: Position, event: React.MouseEvent) => {
        event.preventDefault();
        const currentOperator = lanes[position].operator;
        const currentIndex = OPERATORS.indexOf(currentOperator);
        let nextIndex;
        if (event.type === 'contextmenu') {
            nextIndex = (currentIndex + 1) % OPERATORS.length;
        } else {
            nextIndex = (currentIndex - 1 + OPERATORS.length) % OPERATORS.length;
        }
        setLanes(prev => ({ ...prev, [position]: { ...prev[position], operator: OPERATORS[nextIndex] } }));
    };

    /** 이 라인의 팀 배치를 한 칸씩 회전 (2팀이면 좌우 교체와 같다) */
    const handleSwap = (position: Position) => {
        setLanes(prev => {
            const out = cloneLanes(prev);
            const slots = out[position].slots;
            out[position].slots = slots.map((_, i) => slots[(i + slots.length - 1) % slots.length]);
            const op = out[position].operator;
            out[position].operator = op === '>' ? '<' : op === '<' ? '>' : op;
            return out;
        });
    };

    const playersInLanes = Object.values(lanes).flatMap(l => l.slots).filter(Boolean);
    // 대기 풀 — 티어 강한 순(챌린저→아이언), 언랭은 맨 아래
    const poolPlayers = allPlayers
        .filter(p => !playersInLanes.includes(p.name))
        .sort((a, b) => tierStrength(bestTierOf(b.name)) - tierStrength(bestTierOf(a.name)) || a.name.localeCompare(b.name));

    /** 라인에 배치했을 때의 팀 기여 점수 (가감·배수·사용자 조절까지 반영된 최종값) */
    const laneScoreOf = (name: string, position: Position): number => scorePartsOf(name, position).total;

    /** 대기 명단에 표시할 대표 점수 — 라인과 무관한 최종 점수 */
    const effectiveScore = (name: string): number => scorePartsOf(name).total;

    /*
     * 자동 팀 분배 — services/balance.ts의 제약 기반 탐색에 맡긴다.
     * 팀 총점 편차와 라인별 편차를 합격선 안에 넣고, 그 안에서 지망을 최대한 지킨다.
     */
    const [balanceNote, setBalanceNote] = useState<BalanceNote | null>(null);

    const autoBalance = () => {
        const result = balanceTeams({
            names: allPlayers.map(p => p.name),
            teamCount,
            laneScore: laneScoreOf,
            wishesOf: (name) => findPlayer(name)?.wishes ?? [],
            mainLanesOf,
        });
        if (!result) return;

        setLanes(prev => {
            const out = cloneLanes(prev);
            for (const pos of POSITIONS) out[pos].slots = result.board[pos];
            return out;
        });

        /*
         * 결과가 목표에 못 미치면 이유를 알려 준다.
         * 합격선을 못 지킨 건 인원 구성 문제이고, 지망만 덜 지킨 건 매치업과의 맞바꿈이다.
         */
        const hard: string[] = [];
        if (result.overTeam) hard.push(`팀 총점 차 ${result.spread.toFixed(1)}점 (목표 ${result.teamLimit.toFixed(1)}점 이하)`);
        if (result.overLanes.length) hard.push(`${result.overLanes.join('·')} 라인 격차가 큽니다`);

        if (hard.length) {
            setBalanceNote({ kind: 'warn', text: `현재 인원으로는 여기까지가 최선입니다 — ${hard.join(' · ')}` });
        } else if (result.wishTotal > 0 && result.wishMet < result.wishTotal) {
            setBalanceNote({
                kind: 'info',
                text: `균형·라인 매치업을 맞추느라 지망은 ${result.wishMet}/${result.wishTotal}명만 충족했습니다 (팀 총점 차 ${result.spread.toFixed(1)}점)`,
            });
        } else {
            setBalanceNote(null);
        }
    };

    /** 라인별 점수 격차 — 합격선을 넘으면 화면에 표시한다 */
    const laneGapOf = (position: Position) => {
        const names = lanes[position].slots.filter(Boolean) as string[];
        if (names.length < 2) return { gap: 0, over: false };
        const scores = names.map(n => laneScoreOf(n, position));
        const gap = Math.max(...scores) - Math.min(...scores);
        return { gap, over: gap > laneGapLimit(position) };
    };

    return {
        theme,
        toggleTheme,
        lanes,
        lanesRef,
        dragOverTarget,
        contextMenu,
        inputValue,
        poolPlayers,
        allPlayers,
        recentNames,
        ratings,
        teamCount,
        groupRoster,
        syncState,
        sheetLive,
        lastSyncAt,
        rankedCount: Object.keys(riotRanks).length,
        balanceNote,
        clearBalanceNote: () => setBalanceNote(null),
        handlers: {
            ratingOf,
            applyRatings,
            applyLaneStats,
            applyBuilderData,
            refreshTiers,
            proficiencyOf,
            laneScoreOf,
            laneTierOf,
            assignedRank,
            bestTierOf,
            bestRankOf,
            mainLanesOf,
            cosmeticOf,
            applyCosmetics,
            setTeamCount,
            adjustScore,
            resetScoreAdjust,
            scorePartsOf,
            baseRankOf,
            closeContextMenu,
            setLaneRank,
            setBaseRank,
            applySheetRows,
            sheetRows,
            mergeRiotRanks,
            importGroupRoster,
            effectiveScore,
            autoBalance,
            laneGapOf,
            removeRecentName,
            clearRecentNames,
            toggleCaptain,
            isCaptain,
            handleInputChange,
            handleInputSubmit,
            setInputValue,
            handleContextMenu,
            handleDeletePlayer,
            clearPlayers,
            toggleWish,
            handleRandomizeSides,
            handleReset,
            onDragStart,
            onDragOver,
            onDragLeave,
            onDrop,
            handleOperatorClick,
            handleSwap,
            findPlayer,
            handleRandomAssign,
            importPlayers,
        }
    };
};

export const [TeamBuilderProvider, useTeamBuilderContext] = constate(useTeamBuilderLogic);
