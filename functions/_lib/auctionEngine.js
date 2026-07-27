/*
 * 경매 엔진 (서버 권위 · 팀장 각자 제어 방식 전용).
 * src/hooks/useAuction.ts 의 순수 리듀서를 그대로 이식한 것 — 중앙 제어 방식은 클라이언트가
 * 이 로직의 TS 버전을 쓰고, 팀장 제어 방식은 서버(이 파일)가 단일 권위로 상태를 바꾼다.
 * 두 구현의 규칙은 동일해야 한다. (functions/api·server/index.js 양쪽에서 import)
 */

const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};

const playerOf = (s, id) => s.players.find(p => p.id === id);
const teamFull = (s, t) => t.members.length + 1 >= s.settings.teamSize;
const teamHasLine = (s, t, line) => {
    const ids = [t.leaderId, ...t.members.map(m => m.playerId)];
    return ids.some(id => playerOf(s, id)?.line === line);
};
const openTeams = (s) => s.teams.filter(t => !teamFull(s, t));

const eligibleTeamsFor = (s, playerId) => {
    const line = playerOf(s, playerId)?.line ?? null;
    const open = openTeams(s);
    if (!line) return open;
    const missing = open.filter(t => !teamHasLine(s, t, line));
    return missing.length > 0 ? missing : open;
};

const withLog = (s, msg) => ({ ...s, log: [msg, ...s.log].slice(0, 100) });

const teamLabel = (s, teamId) => {
    const t = s.teams.find(x => x.id === teamId);
    return t ? `${playerOf(s, t.leaderId)?.name ?? '?'} 팀` : '?';
};

const assign = (s, teamId, playerId, price, note = '') => {
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

const resolveLot = (s) => {
    const cur = s.current;
    if (!cur) return s;
    const name = playerOf(s, cur.playerId)?.name ?? '?';

    if (cur.highest) {
        return { ...assign(s, cur.highest.teamId, cur.playerId, cur.highest.amount), current: null };
    }
    if (s.phase === 'failed') {
        const eligible = (cur.eligibleTeamIds ?? openTeams(s).map(t => t.id));
        if (eligible.length > 0) {
            const pick = eligible[Math.floor(Math.random() * eligible.length)];
            return { ...assign(s, pick, cur.playerId, 0, ' · 무입찰 자동'), current: null };
        }
        return withLog({ ...s, current: null, unassigned: [...s.unassigned, cur.playerId], lastResult: `${name} — 미배정` }, `[미배정] ${name} — 전 팀 정원 초과`);
    }
    if (s.round < s.settings.maxRounds) {
        return withLog({ ...s, current: null, carry: [...s.carry, cur.playerId], lastResult: `${name} — 유찰 (${s.round}바퀴)` }, `[유찰] ${name} — ${s.round + 1}바퀴로`);
    }
    return withLog({ ...s, current: null, failedPool: [...s.failedPool, cur.playerId], lastResult: `${name} — 유찰 확정` }, `[유찰] ${name} — 유찰 라운드 대기`);
};

const makeLot = (s, playerId, zeroAllowed, eligibleTeamIds) => ({
    playerId,
    highest: null,
    deadline: s.settings.timerMode === 'fixed' ? Date.now() + s.settings.bidTimerSec * 1000 : null,
    zeroAllowed,
    eligibleTeamIds,
});

const drawNext = (s0) => {
    let s = { ...s0 };
    if (s.current) return s;

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

/** 입찰 시도 — 통과 시 새 상태, 실패 시 원본과 오류 */
const tryBid = (s, teamId, amount) => {
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
            deadline: s.settings.timerMode === 'fixed' ? cur.deadline : Date.now() + s.settings.afterBidSec * 1000,
        },
    }, `[입찰] ${teamLabel(s, teamId)} — ${name}에게 ${amount}pt`);
    return { s: ns, error: null };
};

/**
 * 서버 액션 적용 — 변경이 없으면 동일 참조를 반환한다 (호출측 CAS가 no-op을 판별).
 * action: { type: 'draw' | 'endNow' | 'resolve' | 'bid', teamId?, amount?, lotPlayerId? }
 */
export const applyAuctionAction = (state, action) => {
    if (!state) return state;
    switch (action?.type) {
        case 'draw':
            return drawNext(state);
        case 'endNow':
            return state.current ? resolveLot(state) : state;
        case 'resolve':
            return (state.current && state.current.deadline != null && Date.now() >= state.current.deadline)
                ? resolveLot(state) : state;
        case 'bid': {
            if (!state.current || state.current.playerId !== action.lotPlayerId) return state;
            const r = tryBid(state, action.teamId, Number(action.amount));
            return r.error ? state : r.s;
        }
        default:
            return state;
    }
};
