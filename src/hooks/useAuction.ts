import { useEffect, useRef, useState } from 'react';
import type { Position } from '../types';
import * as api from '../services/api';

/*
 * 롤 경매 상태 머신 (호스트 진행형 — 한 화면에서 사회자가 입찰을 입력한다).
 * 흐름: setup → live(N바퀴) → failed(유찰 라운드, 0원 입찰 허용) → done
 * 상태는 그룹(내전 기록 파티)별 localStorage에 저장되어 새로고침에도 유지된다.
 */

export type AuctionPhase = 'setup' | 'live' | 'failed' | 'done';

export interface AuctionPlayer {
    id: string;
    name: string;
    line: Position | null; // 미리 지정한 라인 (선택)
    isLeader: boolean;
}

export interface AuctionMember {
    playerId: string;
    price: number;
}

export interface AuctionTeam {
    id: string;
    leaderId: string;
    points: number; // 남은 포인트
    members: AuctionMember[]; // 팀장 제외 낙찰 인원
}

/** 타이머 방식 — fixed: 정해진 시간 동안만 / afterBid: 시간 제한 없이 마지막 입찰 후 카운트다운 */
export type TimerMode = 'fixed' | 'afterBid';

/** 진행 방식 — central: 사회자 한 화면에서 전부 입찰 / leader: 서버 권위, 누구나 접속해 자기 팀 입찰·진행 */
export type ControlMode = 'central' | 'leader';

export interface AuctionSettings {
    teamCount: number;   // 팀 수
    teamSize: number;    // 팀 인원 (팀장 포함)
    startPoints: number; // 팀별 시작 포인트
    timerMode: TimerMode;
    controlMode: ControlMode;
    bidTimerSec: number; // fixed: 대상 공개 후 경매 시간
    afterBidSec: number; // afterBid: 마지막 입찰 후 종료 카운트
    maxRounds: number;   // 유찰 전 바퀴 수 (기본 1)
    lineLock: boolean;   // 라인 중복 금지 — 이미 그 라인 선수를 보유한 팀은 같은 라인 입찰 불가
    showOrder: boolean;  // 경매 순서(대기 목록의 실제 순서) 공개 여부
}

export interface CurrentLot {
    playerId: string;
    highest: { teamId: string; amount: number } | null;
    deadline: number | null;      // epoch ms — afterBid 방식은 첫 입찰 전까지 null (무제한)
    zeroAllowed: boolean;         // 유찰 라운드 여부 (0원 입찰 허용)
    eligibleTeamIds: string[] | null; // null = 정원 여유 있는 전체 팀
}

export interface AuctionState {
    phase: AuctionPhase;
    settings: AuctionSettings;
    players: AuctionPlayer[];
    teams: AuctionTeam[];
    queue: string[];      // 이번 바퀴 남은 대상 (셔플됨)
    carry: string[];      // 이번 바퀴 유찰 → 다음 바퀴로
    round: number;        // 현재 바퀴 (1부터)
    failedPool: string[]; // N바퀴 소진 후 유찰 대기
    unassigned: string[]; // 끝까지 배정 못 한 인원
    current: CurrentLot | null;
    log: string[];
    lastResult: string | null;
}

const DEFAULT_SETTINGS: AuctionSettings = {
    teamCount: 2,
    teamSize: 5,
    startPoints: 1000,
    timerMode: 'fixed',
    controlMode: 'central',
    bidTimerSec: 30,
    afterBidSec: 10,
    maxRounds: 1,
    lineLock: false,
    showOrder: false,
};

const newId = () => crypto.randomUUID();

const shuffle = <T,>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};

const emptyState = (): AuctionState => ({
    phase: 'setup',
    settings: { ...DEFAULT_SETTINGS },
    players: [],
    teams: [],
    queue: [],
    carry: [],
    round: 1,
    failedPool: [],
    unassigned: [],
    current: null,
    log: [],
    lastResult: null,
});

const storageKey = (scope: string) => `lol_teamtool:auction:v1:${scope}`;

const load = (scope: string): AuctionState => {
    try {
        const raw = localStorage.getItem(storageKey(scope));
        if (!raw) return emptyState();
        const s = JSON.parse(raw) as AuctionState;
        const settings = { ...DEFAULT_SETTINGS, ...s.settings };
        // 새로고침 복원 시 진행 중이던 타이머는 방식에 맞게 재시작
        if (s.current) {
            s.current.deadline = settings.timerMode === 'fixed'
                ? Date.now() + settings.bidTimerSec * 1000
                : (s.current.highest ? Date.now() + settings.afterBidSec * 1000 : null);
        }
        return { ...emptyState(), ...s, settings };
    } catch {
        return emptyState();
    }
};

/* --- 순수 헬퍼 --- */

const playerOf = (s: AuctionState, id: string) => s.players.find(p => p.id === id);

const teamFull = (s: AuctionState, t: AuctionTeam) => t.members.length + 1 >= s.settings.teamSize;

const teamHasLine = (s: AuctionState, t: AuctionTeam, line: Position) => {
    const ids = [t.leaderId, ...t.members.map(m => m.playerId)];
    return ids.some(id => playerOf(s, id)?.line === line);
};

const openTeams = (s: AuctionState) => s.teams.filter(t => !teamFull(s, t));

/** 유찰 인원의 입찰 가능 팀 — 그 라인이 비어 있는 팀. 없으면 정원 여유 팀 전체로 폴백 */
const eligibleTeamsFor = (s: AuctionState, playerId: string): AuctionTeam[] => {
    const line = playerOf(s, playerId)?.line ?? null;
    const open = openTeams(s);
    if (!line) return open;
    const missing = open.filter(t => !teamHasLine(s, t, line));
    return missing.length > 0 ? missing : open;
};

const withLog = (s: AuctionState, msg: string): AuctionState =>
    ({ ...s, log: [msg, ...s.log].slice(0, 100) });

const teamLabel = (s: AuctionState, teamId: string) => {
    const t = s.teams.find(x => x.id === teamId);
    return t ? `${playerOf(s, t.leaderId)?.name ?? '?'} 팀` : '?';
};

/** 낙찰 처리 — 포인트 차감 + 팀 배정 */
const assign = (s: AuctionState, teamId: string, playerId: string, price: number, note = ''): AuctionState => {
    const name = playerOf(s, playerId)?.name ?? '?';
    const next = {
        ...s,
        teams: s.teams.map(t => t.id === teamId
            ? { ...t, points: t.points - price, members: [...t.members, { playerId, price }] }
            : t),
        lastResult: `${name} → ${teamLabel(s, teamId)} (${price}pt${note})`,
    };
    return withLog(next, `[낙찰] ${name} — ${teamLabel(s, teamId)} ${price}pt${note}`);
};

/** 현재 경매 대상 종료 (타이머 만료 or 즉시 종료) */
const resolveLot = (s: AuctionState): AuctionState => {
    const cur = s.current;
    if (!cur) return s;
    const name = playerOf(s, cur.playerId)?.name ?? '?';

    if (cur.highest) {
        return { ...assign(s, cur.highest.teamId, cur.playerId, cur.highest.amount), current: null };
    }

    if (s.phase === 'failed') {
        // 유찰 라운드 무입찰 → 입찰 가능 팀 중 랜덤 자동 배정 (0원)
        const eligible = (cur.eligibleTeamIds ?? openTeams(s).map(t => t.id));
        if (eligible.length > 0) {
            const pick = eligible[Math.floor(Math.random() * eligible.length)];
            return { ...assign(s, pick, cur.playerId, 0, ' · 무입찰 자동'), current: null };
        }
        return withLog({ ...s, current: null, unassigned: [...s.unassigned, cur.playerId], lastResult: `${name} — 미배정` }, `[미배정] ${name} — 전 팀 정원 초과`);
    }

    // 일반 바퀴 유찰: 남은 바퀴가 있으면 다음 바퀴로, 없으면 유찰 풀로
    if (s.round < s.settings.maxRounds) {
        return withLog({ ...s, current: null, carry: [...s.carry, cur.playerId], lastResult: `${name} — 유찰 (${s.round}바퀴)` }, `[유찰] ${name} — ${s.round + 1}바퀴로`);
    }
    return withLog({ ...s, current: null, failedPool: [...s.failedPool, cur.playerId], lastResult: `${name} — 유찰 확정` }, `[유찰] ${name} — 유찰 라운드 대기`);
};

const makeLot = (s: AuctionState, playerId: string, zeroAllowed: boolean, eligibleTeamIds: string[] | null): CurrentLot => ({
    playerId,
    highest: null,
    // fixed: 공개 즉시 카운트다운 / afterBid: 첫 입찰 전까지 무제한
    deadline: s.settings.timerMode === 'fixed' ? Date.now() + s.settings.bidTimerSec * 1000 : null,
    zeroAllowed,
    eligibleTeamIds,
});

/** 다음 대상 뽑기 — 바퀴 순환 / 유찰 라운드 전환 / 종료 판정까지 처리 */
const drawNext = (s0: AuctionState): AuctionState => {
    let s = { ...s0 };
    if (s.current) return s; // 진행 중이면 무시

    // 전 팀 정원 마감 → 남은 인원 미배정 처리 후 종료
    if (openTeams(s).length === 0) {
        const rest = [...s.queue, ...s.carry, ...s.failedPool];
        return withLog({ ...s, phase: 'done', queue: [], carry: [], failedPool: [], unassigned: [...s.unassigned, ...rest] },
            '[종료] 전 팀 정원 마감 — 경매 종료');
    }

    if (s.phase === 'live') {
        if (s.queue.length === 0 && s.carry.length > 0) {
            s = withLog({ ...s, round: s.round + 1, queue: shuffle(s.carry), carry: [] }, `[진행] ${s.round + 1}바퀴 시작`);
        }
        if (s.queue.length === 0) {
            if (s.failedPool.length > 0) {
                s = withLog({ ...s, phase: 'failed', failedPool: shuffle(s.failedPool) }, '[유찰 라운드] 시작 — 0원 입찰 가능');
            } else {
                return withLog({ ...s, phase: 'done' }, '[종료] 경매 종료');
            }
        }
    }

    if (s.phase === 'live') {
        const [pid, ...rest] = s.queue;
        return { ...s, queue: rest, current: makeLot(s, pid, false, null), lastResult: null };
    }

    /* 유찰 라운드: 라인 빈 팀이 하나면 자동 배정, 여러 팀이면 0원 경매 */
    while (s.failedPool.length > 0) {
        const [pid, ...rest] = s.failedPool;
        s = { ...s, failedPool: rest };
        const name = playerOf(s, pid)?.name ?? '?';
        const eligible = eligibleTeamsFor(s, pid);
        if (eligible.length === 0) {
            s = withLog({ ...s, unassigned: [...s.unassigned, pid] }, `[미배정] ${name} — 전 팀 정원 초과`);
            continue;
        }
        if (eligible.length === 1) {
            s = assign(s, eligible[0].id, pid, 0, ' · 강제 배정');
            continue;
        }
        return { ...s, current: makeLot(s, pid, true, eligible.map(t => t.id)), lastResult: null };
    }
    return withLog({ ...s, phase: 'done' }, '[종료] 경매 종료');
};

/** 입찰 시도 — 검증 통과 시 새 상태를, 실패 시 원본 상태와 오류 메시지를 반환한다 (순수 함수) */
const tryBid = (s: AuctionState, teamId: string, amount: number): { s: AuctionState; error: string | null } => {
    const cur = s.current;
    if (!cur) return { s, error: '진행 중인 경매가 없습니다.' };
    const team = s.teams.find(t => t.id === teamId);
    if (!team) return { s, error: '팀을 찾을 수 없습니다.' };
    if (teamFull(s, team)) return { s, error: '이미 정원이 찬 팀입니다.' };
    if (cur.eligibleTeamIds && !cur.eligibleTeamIds.includes(teamId)) return { s, error: '이 유찰 경매에 참여할 수 없는 팀입니다.' };
    // 라인 중복 금지: 이미 그 라인 선수를 보유한 팀은 같은 라인 입찰 불가
    if (s.settings.lineLock) {
        const line = playerOf(s, cur.playerId)?.line ?? null;
        if (line && teamHasLine(s, team, line)) return { s, error: '이미 그 라인 선수를 보유한 팀입니다.' };
    }
    if (!Number.isFinite(amount) || amount < 0) return { s, error: '올바른 금액이 아닙니다.' };
    const min = cur.highest ? cur.highest.amount + 1 : (cur.zeroAllowed ? 0 : 1);
    if (amount < min) return { s, error: `최소 ${min}pt 이상 입찰해야 합니다.` };
    if (amount > team.points) return { s, error: '남은 포인트가 부족합니다.' };
    const name = playerOf(s, cur.playerId)?.name ?? '?';
    const ns = withLog({
        ...s,
        current: {
            ...cur,
            highest: { teamId, amount },
            // fixed: 정해진 시간 유지 / afterBid: 입찰마다 카운트다운 리셋
            deadline: s.settings.timerMode === 'fixed' ? cur.deadline : Date.now() + s.settings.afterBidSec * 1000,
        },
    }, `[입찰] ${teamLabel(s, teamId)} — ${name}에게 ${amount}pt`);
    return { s: ns, error: null };
};

/* --- 훅 --- */

export const useAuction = (scope: string) => {
    const [state, setState] = useState<AuctionState>(() => load(scope));
    const scopeRef = useRef(scope);
    const [, setTick] = useState(0); // 타이머 표시 갱신용

    // scope(그룹) 전환 시 해당 그룹의 경매를 불러오고, 그 외에는 변경분을 저장
    useEffect(() => {
        if (scopeRef.current !== scope) {
            scopeRef.current = scope;
            setState(load(scope));
            return;
        }
        try {
            localStorage.setItem(storageKey(scope), JSON.stringify(state));
        } catch { /* 저장 실패는 무시 */ }
    }, [scope, state]);

    // 그룹 경매면 진행 상태를 서버로 동기화 — 같은 그룹 멤버가 관전/참여로 함께 본다.
    // 팀장 제어 방식은 딜레이를 줄이려 짧게(150ms), 중앙 제어는 0.8초 디바운스.
    // 설정 단계는 푸시하지 않는다: 탭만 연 다른 멤버의 빈 상태가 진행자 상태를 덮어쓰면 안 됨
    useEffect(() => {
        if (scope === 'standalone' || state.phase === 'setup') return;
        const delay = state.settings.controlMode === 'leader' ? 150 : 800;
        const t = setTimeout(() => {
            api.putAuctionSync(scope, state).catch(() => { /* 동기화 실패는 진행에 영향 없음 */ });
        }, delay);
        return () => clearTimeout(t);
    }, [scope, state]);

    // 입찰 타이머 — 만료 시 자동 종료 처리 (deadline이 null이면 무제한 대기)
    const running = state.current != null;
    useEffect(() => {
        if (!running) return;
        const iv = setInterval(() => {
            setTick(t => t + 1);
            setState(prev => (prev.current?.deadline != null && Date.now() >= prev.current.deadline
                ? resolveLot(prev)
                : prev));
        }, 200);
        return () => clearInterval(iv);
    }, [running]);

    /** 남은 초 — null이면 타이머 없음 (afterBid 방식의 첫 입찰 대기) */
    const remainingSec = state.current?.deadline != null
        ? Math.max(0, Math.ceil((state.current.deadline - Date.now()) / 1000))
        : null;

    /* --- setup 액션 --- */

    const updateSettings = (patch: Partial<AuctionSettings>) =>
        setState(prev => ({ ...prev, settings: { ...prev.settings, ...patch } }));

    const addPlayers = (names: string[]) =>
        setState(prev => {
            const existing = new Set(prev.players.map(p => p.name));
            const added = names.map(n => n.trim()).filter(n => n && !existing.has(n))
                .map(name => ({ id: newId(), name, line: null, isLeader: false }));
            return added.length ? { ...prev, players: [...prev.players, ...added] } : prev;
        });

    const removePlayer = (id: string) =>
        setState(prev => ({ ...prev, players: prev.players.filter(p => p.id !== id) }));

    const toggleLeader = (id: string) =>
        setState(prev => {
            const p = prev.players.find(x => x.id === id);
            if (!p) return prev;
            if (!p.isLeader && prev.players.filter(x => x.isLeader).length >= prev.settings.teamCount) return prev;
            return { ...prev, players: prev.players.map(x => x.id === id ? { ...x, isLeader: !x.isLeader } : x) };
        });

    const setLine = (id: string, line: Position | null) =>
        setState(prev => ({ ...prev, players: prev.players.map(x => x.id === id ? { ...x, line } : x) }));

    /** 초기 진행 상태를 만든다 (검증 포함) — start / startLeader 공용 */
    const buildLive = (s: AuctionState): { state?: AuctionState; error?: string } => {
        const leaders = s.players.filter(p => p.isLeader);
        if (leaders.length !== s.settings.teamCount) {
            return { error: `팀장을 ${s.settings.teamCount}명 선택해 주세요. (현재 ${leaders.length}명)` };
        }
        if (s.players.length < s.settings.teamCount + 1) {
            return { error: '경매 대상 인원이 없습니다. 참가자를 추가해 주세요.' };
        }
        const teams: AuctionTeam[] = leaders.map(p => ({
            id: newId(), leaderId: p.id, points: s.settings.startPoints, members: [],
        }));
        const targets = shuffle(s.players.filter(p => !p.isLeader).map(p => p.id));
        const live = withLog({
            ...s, phase: 'live', teams, queue: targets, carry: [], round: 1,
            failedPool: [], unassigned: [], current: null, lastResult: null,
        }, `[시작] ${teams.length}팀 · 대상 ${targets.length}명`);
        return { state: live };
    };

    /** 중앙 제어 시작 — 로컬 엔진을 진행자 화면에서 돌린다 */
    const start = (): string | null => {
        const { state: live, error } = buildLive(state);
        if (error) return error;
        setState(live!);
        return null;
    };

    /** 팀장 제어 시작 — 초기 상태를 서버에 올리고(진행자 없이 서버가 권위), 로컬은 setup 유지 → 생성자도 참여자가 된다 */
    const startLeader = async (groupId: string): Promise<string | null> => {
        const { state: live, error } = buildLive(state);
        if (error) return error;
        try {
            await api.putAuctionSync(groupId, live);
        } catch {
            return '서버에 경매를 올리지 못했습니다. 잠시 후 다시 시도해 주세요.';
        }
        return null;
    };

    /* --- 진행 액션 --- */

    const draw = () => setState(drawNext);

    /** 입찰 — 오류 메시지를 반환하면 거절 (중앙 제어: 사회자 직접 입력) */
    const placeBid = (teamId: string, amount: number): string | null => {
        const { error } = tryBid(state, teamId, amount);
        if (error) return error;
        setState(prev => tryBid(prev, teamId, amount).s);
        return null;
    };

    /** 타이머를 기다리지 않고 즉시 종료 (낙찰/유찰 확정) */
    const endNow = () => setState(resolveLot);

    /** 결과는 버리고 설정 화면으로 (참가자/설정은 유지) */
    const backToSetup = () =>
        setState(prev => ({
            ...emptyState(), settings: prev.settings,
            players: prev.players.map(p => ({ ...p })),
        }));

    /** 전체 초기화 */
    const wipe = () => setState(emptyState());

    return {
        state, remainingSec,
        updateSettings, addPlayers, removePlayer, toggleLeader, setLine,
        start, startLeader, draw, placeBid, endNow, backToSetup, wipe,
        helpers: {
            playerOf: (id: string) => playerOf(state, id),
            teamFull: (t: AuctionTeam) => teamFull(state, t),
            teamLabel: (id: string) => teamLabel(state, id),
        },
    };
};
