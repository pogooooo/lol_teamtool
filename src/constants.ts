import type { OperatorSymbol, Position, Tier } from './types';

export const POSITIONS: Position[] = ['탑', '정글', '미드', '원딜', '서포터'];
export const OPERATORS: OperatorSymbol[] = ['>', '>=', '=', '<=', '<'];
export const TIER_KEYS: Tier[] = ['상', '중', '하'];

/** 참가자 목록을 탑→정글→미드→원딜→서포터 순으로 정렬 */
export const sortByLane = <T extends { position: Position }>(list: T[]): T[] =>
    [...list].sort((a, b) => POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position));
