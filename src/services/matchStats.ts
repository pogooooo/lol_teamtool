import type { GroupPlayer, MatchRecord } from '../types';

/*
 * 매치 기록 파생 통계 — 서버 요청 없이 이미 로드된 매치 목록에서 계산한다.
 * (그룹당 매치 수가 수백 판 수준이라 클라이언트 계산으로 충분)
 */

export interface DuoStat {
    key: string;
    aName: string;
    bName: string;
    games: number;
    wins: number;
    winRate: number; // 0~100 반올림
}

/**
 * 같은 팀으로 뛴 듀오별 승률 순위.
 * 등록 참가자(playerId 보유)끼리의 조합만 집계하고, minGames 미만은 표본 부족으로 제외한다.
 */
export const computeDuoStats = (
    matches: MatchRecord[],
    players: GroupPlayer[],
    minGames = 2,
): DuoStat[] => {
    const nameOf = new Map(players.map(p => [p.id, p.displayName]));
    const acc = new Map<string, { aId: string; bId: string; games: number; wins: number }>();

    for (const m of matches) {
        for (const side of ['blue', 'red'] as const) {
            const team = m.participants.filter(pt => pt.side === side && pt.playerId && nameOf.has(pt.playerId));
            for (let i = 0; i < team.length; i++) {
                for (let j = i + 1; j < team.length; j++) {
                    const [aId, bId] = [team[i].playerId as string, team[j].playerId as string].sort();
                    const key = `${aId}|${bId}`;
                    const rec = acc.get(key) ?? { aId, bId, games: 0, wins: 0 };
                    rec.games += 1;
                    if (side === m.winningSide) rec.wins += 1;
                    acc.set(key, rec);
                }
            }
        }
    }

    return [...acc.entries()]
        .filter(([, r]) => r.games >= minGames)
        .map(([key, r]) => ({
            key,
            aName: nameOf.get(r.aId) ?? '?',
            bName: nameOf.get(r.bId) ?? '?',
            games: r.games,
            wins: r.wins,
            winRate: Math.round((r.wins / r.games) * 100),
        }))
        .sort((a, b) => b.winRate - a.winRate || b.games - a.games || a.aName.localeCompare(b.aName));
};
