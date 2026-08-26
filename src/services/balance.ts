import { POSITIONS } from '../constants';
import { LANE_WEIGHTS } from './ratings';
import type { Position } from '../types';

/*
 * 자동 팀 분배.
 *
 * 설계 근거:
 *  1) 균형은 "끝까지 짜내야 할 목표"가 아니라 합격선이다. 총점 차 0.3점을 줄이자고
 *     누군가의 1지망을 버리는 건 손해다. 그래서 편차에 상한을 두고, 그 안에서
 *     지망을 최대한 지키는 문제로 푼다.
 *  2) 총점만 맞추면 라인 매치업이 깨진다. 팀A 미드가 다이아, 팀B 미드가 골드여도
 *     다른 라인이 반대로 기울면 총점은 같다. 하지만 롤은 라인전 격차가 스노우볼로
 *     굴러가 그 보상이 성립하지 않는다. 그래서 라인별 편차에도 상한을 둔다.
 *  3) 라인을 하나씩 확정하는 그리디는 되돌아보지 못해 최적해를 놓친다.
 *     초안을 여럿 만들고 자리 교환으로 다듬는 지역 탐색으로 바꾼다.
 */

/** 팀 총점 편차 합격선 — 팀 평균 총점의 2% (최소 2점) */
const TEAM_SPREAD_RATIO = 0.02;
const TEAM_SPREAD_MIN = 2;

/**
 * 라인 편차 합격선 — 티어 1~2칸(5~10점).
 * 영향력이 큰 라인일수록 빡빡하게 잡는다. 점수 계산에 쓰는 라인 가중치를 그대로
 * 재활용해 기준이 따로 놀지 않게 하고, 차이가 드러나도록 제곱으로 벌린다.
 * 결과: 정글·미드 약 7점 · 탑·원딜 약 8.6점 · 서포터 약 9.8점
 */
const LANE_GAP_BASE = 8.5;

const avgWeight = (pos: Position) =>
    (LANE_WEIGHTS.low[pos] + LANE_WEIGHTS.mid[pos] + LANE_WEIGHTS.high[pos]) / 3;

export const laneGapLimit = (pos: Position): number => LANE_GAP_BASE / avgWeight(pos) ** 2;

/** 지망 만족 점수 — 1지망을 가장 크게 친다 */
const wishPoint = (wishes: Position[], pos: Position): number => {
    if (wishes.length === 0) return 0;
    const i = wishes.indexOf(pos);
    if (i === -1) return 0;
    return i === 0 ? 3 : i === 1 ? 2 : 1;
};

/* 목적 함수 가중치 — 합격선 위반 > 지망 > 주라인 > 미세 편차 순으로 확실히 갈리게 둔다 */
const W_TEAM_VIOLATION = 200; // 팀 총점 합격선을 넘은 1점당
const W_LANE_VIOLATION = 100; // 라인 편차 합격선을 넘은 1점당 (팀보다 싸다 = 먼저 완화된다)
const W_WISH = 10;            // 지망 1점당
const W_MAIN = 1;             // 주라인 배치 1명당
const W_TIEBREAK = 0.01;      // 나머지가 같으면 더 촘촘한 쪽

/** 초안 개수 — 서로 다른 출발점에서 지역 탐색을 돌려 가장 좋은 것을 고른다 */
const RESTARTS = 24;
/** 실력 띠 초안 개수 — 라인 편차를 지키는 해를 따로 노린다 */
const BAND_RESTARTS = 10;
/** 지역 탐색 안전장치 (보통 10회 안에 멈춘다) */
const MAX_ROUNDS = 60;
/** 다양성 — 최소 편차보다 이만큼까지 나쁜 해도 후보로 인정하고 그중 무작위로 고른다 */
const SPREAD_TOLERANCE = 1.0;

export type Board = Record<Position, (string | null)[]>;

export interface BalanceInput {
    names: string[];
    teamCount: number;
    /** 그 사람을 그 라인에 뒀을 때의 최종 점수 */
    laneScore: (name: string, pos: Position) => number;
    wishesOf: (name: string) => Position[];
    /** 지정된 라인 티어가 가장 높은 라인들 */
    mainLanesOf: (name: string) => Position[];
}

export interface BalanceResult {
    board: Board;
    /** 자리를 못 받고 명단에 남는 사람 */
    bench: string[];
    /** 최고팀 − 최저팀 */
    spread: number;
    /** 팀 총점 편차 합격선 */
    teamLimit: number;
    laneGaps: Record<Position, number>;
    /** 지망을 낸 사람 중 지망 라인을 받은 인원 */
    wishMet: number;
    wishTotal: number;
    /** 합격선을 못 지킨 항목 — 화면에 이유를 알려주기 위해 */
    overTeam: boolean;
    overLanes: Position[];
}

/** 몇 번 섞어 보고 고를지 — 2팀은 32가지뿐이라 이 정도면 사실상 전부 훑는다 */
const SHUFFLE_TRIES = 400;

/**
 * 라인은 그대로 두고 팀 배정만 섞는다.
 * 라인 안에서 자리를 맞바꾸는 것이라 지망 충족도, 라인 격차도 그대로다.
 * 총점 편차만 달라지므로, 허용 편차 안에 드는 조합을 모아 그중 하나를 고른다.
 */
const shuffleTeams = (
    base: Solution,
    evaluate: (b: Board) => Metrics,
    spreadLimit: number,
): Solution => {
    const found: Solution[] = [base];
    for (let i = 0; i < SHUFFLE_TRIES; i += 1) {
        const next = cloneBoard(base.board);
        for (const pos of POSITIONS) {
            const row = next[pos];
            for (let k = row.length - 1; k > 0; k -= 1) {
                const j = Math.floor(Math.random() * (k + 1));
                [row[k], row[j]] = [row[j], row[k]];
            }
        }
        const m = evaluate(next);
        if (m.spread <= spreadLimit + 1e-9) found.push({ board: next, bench: base.bench, m });
    }
    return found[Math.floor(Math.random() * found.length)];
};

const emptyBoard = (teamCount: number): Board =>
    POSITIONS.reduce((acc, pos) => {
        acc[pos] = Array<string | null>(teamCount).fill(null);
        return acc;
    }, {} as Board);

const cloneBoard = (b: Board): Board =>
    POSITIONS.reduce((acc, pos) => {
        acc[pos] = [...b[pos]];
        return acc;
    }, {} as Board);

interface Metrics {
    cost: number;
    /** 합격선을 넘은 정도 (0이면 합격) */
    violation: number;
    spread: number;
    laneGaps: Record<Position, number>;
    wish: number;
    main: number;
}

interface Solution { board: Board; bench: string[]; m: Metrics }

export const balanceTeams = (input: BalanceInput): BalanceResult | null => {
    const { names, teamCount, laneScore, wishesOf, mainLanesOf } = input;
    if (names.length === 0) return null;

    const capacity = POSITIONS.length * teamCount;

    /*
     * 사람×라인 값을 미리 다 구해 둔다. 탐색 중 수만 번 평가하므로
     * 그때마다 티어를 파싱하면 눈에 띄게 느려진다.
     */
    const info = new Map<string, { s: number[]; w: number[]; m: boolean[]; hasWish: boolean }>();
    for (const name of names) {
        const wishes = wishesOf(name);
        const mains = mainLanesOf(name);
        info.set(name, {
            s: POSITIONS.map(pos => laneScore(name, pos)),
            w: POSITIONS.map(pos => wishPoint(wishes, pos)),
            m: POSITIONS.map(pos => mains.includes(pos)),
            hasWish: wishes.length > 0,
        });
    }
    const val = (name: string, p: number) => info.get(name)!.s[p];

    // 합격선은 명단 실력대를 따라간다 (챌린저 판의 2%가 아이언 판의 2%보다 크다)
    const midIdx = POSITIONS.indexOf('미드');
    const sample = names.slice(0, capacity);
    const avgPlayer = sample.reduce((s, n) => s + val(n, midIdx), 0) / Math.max(1, sample.length);
    const teamLimit = Math.max(TEAM_SPREAD_MIN, avgPlayer * POSITIONS.length * TEAM_SPREAD_RATIO);

    const laneLimits = POSITIONS.map(pos => laneGapLimit(pos));
    // 인원이 모자라 빈 자리가 생기면 총점 편차는 어차피 벌어지므로 팀 합격선을 따지지 않는다
    const shortHanded = names.length < capacity;

    /* --- 평가 --- */

    const evaluate = (board: Board): Metrics => {
        const totals = Array<number>(teamCount).fill(0);
        const laneGaps = {} as Record<Position, number>;
        let wish = 0;
        let main = 0;
        let laneOver = 0;
        let gapSum = 0;

        for (let p = 0; p < POSITIONS.length; p += 1) {
            const pos = POSITIONS[p];
            const row = board[pos];
            let hi = 0;
            let lo = Infinity;
            for (let t = 0; t < teamCount; t += 1) {
                const name = row[t];
                if (!name) { lo = 0; continue; }
                const rec = info.get(name)!;
                const v = rec.s[p];
                totals[t] += v;
                if (v > hi) hi = v;
                if (v < lo) lo = v;
                wish += rec.w[p];
                if (rec.m[p]) main += 1;
            }
            const gap = hi - (lo === Infinity ? hi : lo);
            laneGaps[pos] = gap;
            gapSum += gap;
            laneOver += Math.max(0, gap - laneLimits[p]);
        }

        const spread = Math.max(...totals) - Math.min(...totals);
        const teamOver = shortHanded ? 0 : Math.max(0, spread - teamLimit);
        const violation = W_TEAM_VIOLATION * teamOver + W_LANE_VIOLATION * laneOver;

        return {
            cost: violation - W_WISH * wish - W_MAIN * main + W_TIEBREAK * (spread + gapSum),
            violation,
            spread,
            laneGaps,
            wish,
            main,
        };
    };

    /* --- 초안 --- */

    /**
     * 라인마다 적임자를 뽑아 총점이 낮은 팀부터 채운다.
     * jitter를 키우면 엉뚱한 조합이 나오는데, 지역 탐색의 출발점을 흩뿌리는 게 목적이라
     * 이 단계의 품질 자체는 중요하지 않다.
     */
    const seed = (jitter: number): { board: Board; bench: string[] } => {
        const board = emptyBoard(teamCount);
        const remaining = new Set(names);
        const totals = Array<number>(teamCount).fill(0);

        // 그 라인을 원하는 사람이 적은 라인부터 — 자리가 귀한 쪽을 먼저 확정한다
        const demand = (p: number) =>
            names.filter(n => info.get(n)!.w[p] === 3 || info.get(n)!.m[p]).length;
        const laneOrder = POSITIONS.map((pos, p) => ({ pos, p })).sort((a, b) => demand(a.p) - demand(b.p));

        for (const { pos, p } of laneOrder) {
            const fit = (n: string) =>
                info.get(n)!.w[p] * 300 + (info.get(n)!.m[p] ? 200 : 0) + info.get(n)!.s[p] + Math.random() * jitter;
            const picks = [...remaining].sort((a, b) => fit(b) - fit(a)).slice(0, teamCount);

            picks
                .sort((a, b) => val(b, p) - val(a, p))
                .forEach(name => {
                    let target = -1;
                    for (let t = 0; t < teamCount; t += 1) {
                        if (board[pos][t] !== null) continue;
                        if (target < 0 || totals[t] < totals[target]) target = t;
                    }
                    if (target < 0) return;
                    board[pos][target] = name;
                    totals[target] += val(name, p);
                    remaining.delete(name);
                });
        }
        return { board, bench: [...remaining] };
    };

    /**
     * 실력 띠(band) 초안 — 점수 순으로 잘라 비슷한 사람끼리 같은 라인에 몰아넣는다.
     * 라인 편차 합격선을 지키려면 결국 이런 모양이어야 하는데, 지망을 좇는 초안에서
     * 자리 교환만으로는 여기까지 오지 못하는 경우가 있어 출발점으로 따로 만들어 준다.
     * 어느 띠를 어느 라인에 붙이느냐에 따라 결과가 달라지므로 라인 순서를 섞어 가며 만든다.
     */
    const bandSeed = (laneOrder: number[]): { board: Board; bench: string[] } => {
        const board = emptyBoard(teamCount);
        const avg = (n: string) => info.get(n)!.s.reduce((a, b) => a + b, 0) / POSITIONS.length;
        const sorted = [...names].sort((a, b) => avg(b) - avg(a));
        const used = new Set<string>();

        laneOrder.forEach((p, band) => {
            const pos = POSITIONS[p];
            const chunk = sorted.slice(band * teamCount, (band + 1) * teamCount);
            // 띠 안에서는 점수가 높은 사람을 앞 팀부터 — 팀 배분은 지역 탐색이 다듬는다
            chunk.sort((a, b) => info.get(b)!.s[p] - info.get(a)!.s[p]);
            chunk.forEach((name, t) => {
                if (t >= teamCount) return;
                board[pos][t] = name;
                used.add(name);
            });
        });
        return { board, bench: names.filter(n => !used.has(n)) };
    };

    /* --- 지역 탐색 --- */

    const slots: { pos: Position; team: number }[] = [];
    for (const pos of POSITIONS) {
        for (let t = 0; t < teamCount; t += 1) slots.push({ pos, team: t });
    }

    /**
     * 자리를 맞바꿔 보고 가장 많이 나아지는 교환을 채택하는 것을, 더 나아질 게 없을 때까지 반복한다.
     * 같은 라인 안의 교환은 총점 배분만 바꾸고, 라인을 건너뛰는 교환은 라인 적합도까지 바꾼다.
     */
    const improve = (start: { board: Board; bench: string[] }): Solution => {
        let board = start.board;
        let bench = start.bench;
        let best = evaluate(board);

        for (let round = 0; round < MAX_ROUNDS; round += 1) {
            let move: Solution | null = null;
            const consider = (next: Board, nextBench: string[]) => {
                const m = evaluate(next);
                if (m.cost < best.cost - 1e-9 && (move === null || m.cost < move.m.cost)) {
                    move = { board: next, bench: nextBench, m };
                }
            };

            // 배치된 사람끼리 교환
            for (let i = 0; i < slots.length; i += 1) {
                for (let j = i + 1; j < slots.length; j += 1) {
                    const a = slots[i];
                    const b = slots[j];
                    if (board[a.pos][a.team] === null && board[b.pos][b.team] === null) continue;
                    const next = cloneBoard(board);
                    next[a.pos][a.team] = board[b.pos][b.team];
                    next[b.pos][b.team] = board[a.pos][a.team];
                    consider(next, bench);
                }
            }

            // 대기 인원과 교체 (명단이 정원보다 많을 때)
            for (const s of slots) {
                for (let k = 0; k < bench.length; k += 1) {
                    const next = cloneBoard(board);
                    const out = next[s.pos][s.team];
                    next[s.pos][s.team] = bench[k];
                    const nextBench = [...bench];
                    if (out === null) nextBench.splice(k, 1);
                    else nextBench[k] = out;
                    consider(next, nextBench);
                }
            }

            if (move === null) break;
            const taken = move as Solution;
            board = taken.board;
            bench = taken.bench;
            best = taken.m;
        }
        return { board, bench, m: best };
    };

    /* --- 여러 번 시작해 후보를 모으고 하나를 고른다 --- */

    /*
     * 출발점을 두 종류로 나눈다.
     *  · 지망을 좇는 초안 — 지망 충족이 높은 해를 찾는 데 유리
     *  · 실력 띠 초안 — 라인 편차를 지키는 해를 찾는 데 유리
     * 어느 쪽이 이길지는 명단에 따라 다르므로 둘 다 돌리고 결과로 판단한다.
     */
    const solutions: Solution[] = [];
    for (let i = 0; i < RESTARTS; i += 1) {
        solutions.push(improve(seed(i === 0 ? 0 : 8 + (i % 5) * 12)));
    }
    for (let i = 0; i < BAND_RESTARTS; i += 1) {
        const order = POSITIONS.map((_, p) => p);
        // 첫 번째는 라인 순서 그대로, 나머지는 섞어서 다른 띠-라인 조합을 시도한다
        if (i > 0) {
            for (let k = order.length - 1; k > 0; k -= 1) {
                const j = Math.floor(Math.random() * (k + 1));
                [order[k], order[j]] = [order[j], order[k]];
            }
        }
        solutions.push(improve(bandSeed(order)));
    }

    // 1) 합격선을 가장 잘 지킨 해들만 남기고
    const minViolation = Math.min(...solutions.map(s => s.m.violation));
    const feasible = solutions.filter(s => s.m.violation <= minViolation + 1e-9);
    // 2) 그중 지망을 가장 많이 지킨 해들 중에서
    const topWish = Math.max(...feasible.map(s => s.m.wish));
    const pool = feasible.filter(s => s.m.wish === topWish);
    // 3) 편차가 허용 오차 안에 드는 것들을 후보로 두고 무작위 선택
    const minSpread = Math.min(...pool.map(s => s.m.spread));
    const candidates = pool.filter(s => s.m.spread <= minSpread + SPREAD_TOLERANCE);
    const picked = candidates[Math.floor(Math.random() * candidates.length)];

    /*
     * 여기까지는 매번 같은 답이 나오기 쉽다. 지망을 걸어 두면 누가 어느 라인에 갈지가
     * 거의 정해져 버려서, 서른 번을 다시 돌려도 같은 배치로 수렴하기 때문이다.
     *
     * 그런데 "라인 안에서 팀을 바꾸는 것"은 지망 충족도 라인 격차도 건드리지 않는다.
     * 바뀌는 건 팀 총점뿐이다. 그래서 라인마다 팀 순서를 무작위로 섞어 보고,
     * 편차가 허용 범위에 드는 조합 중 하나를 고른다. 품질을 잃지 않으면서 조합만 달라진다.
     */
    const chosen = shuffleTeams(picked, evaluate, Math.max(teamLimit, picked.m.spread + SPREAD_TOLERANCE));

    let wishMet = 0;
    let wishTotal = 0;
    for (let p = 0; p < POSITIONS.length; p += 1) {
        for (const name of chosen.board[POSITIONS[p]]) {
            if (!name) continue;
            const rec = info.get(name)!;
            if (!rec.hasWish) continue;
            wishTotal += 1;
            if (rec.w[p] > 0) wishMet += 1;
        }
    }

    return {
        board: chosen.board,
        bench: chosen.bench,
        spread: chosen.m.spread,
        teamLimit,
        laneGaps: chosen.m.laneGaps,
        wishMet,
        wishTotal,
        overTeam: !shortHanded && chosen.m.spread > teamLimit + 1e-9,
        overLanes: POSITIONS.filter((pos, p) => chosen.m.laneGaps[pos] > laneLimits[p] + 1e-9),
    };
};
