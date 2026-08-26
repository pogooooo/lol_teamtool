import styled from 'styled-components';
import { useTeamBuilderContext } from '../hooks/useTeamBuilderLogic';
import { LanesContainer } from '../App.styles';
import { POSITIONS, TIER_META } from '../constants';
import type { Position } from '../types';
import { LaneIcon } from './ui/LaneIcon';
import { TierEmblem } from './ui/TierEmblem';
import { fmtScore } from '../services/ratings';
import { decorate, FrameLayer } from './ui/NameFrame';
import { withAlpha } from '../services/color';

const TEAM_COLORS = ['#4DA8DA', '#F07178', '#5FE3A3', '#C99BFF', '#FFC46B', '#7CE0E0'];

/*
 * 팀 구성판 — 팀 하나가 한 줄(탑·정글·미드·원딜·서포터 5명)이다.
 * 팀 수를 늘리면 줄이 늘어난다.
 */
export const LaneDisplay = () => {
    const { lanes, dragOverTarget, handlers, lanesRef, teamCount, allPlayers } = useTeamBuilderContext();

    /** 라인 가중치 + 라인 숙련도가 적용된 팀 기여 점수 */
    const scoreOf = (name: string | null | undefined, pos: Position): number =>
        name ? handlers.laneScoreOf(name, pos) : 0;

    const teamTotals = Array.from({ length: teamCount }, (_, t) =>
        POSITIONS.reduce((sum, pos) => sum + scoreOf(lanes[pos].slots[t], pos), 0));
    const maxTotal = Math.max(...teamTotals);
    const minTotal = Math.min(...teamTotals);

    const isOver = (pos: Position, slot: number) =>
        dragOverTarget?.type === 'slot' && dragOverTarget.position === pos && dragOverTarget.slot === slot;

    const isWishOver = (pos: Position) =>
        dragOverTarget?.type === 'wish' && dragOverTarget.position === pos;

    /** 이 라인을 지망한 사람들 — 각자의 지망 순위(1지망=1)와 함께 */
    const wishersOf = (pos: Position) =>
        allPlayers
            .filter(p => p.wishes?.includes(pos))
            .map(p => ({ name: p.name, rank: (p.wishes ?? []).indexOf(pos) + 1 }))
            .sort((a, b) => a.rank - b.rank);

    const slotCell = (pos: Position, team: number) => {
        const name = lanes[pos].slots[team] ?? null;
        const player = name ? handlers.findPlayer(name) : undefined;
        // 휘장·색은 그 라인에 지정된 티어를 따른다
        const tier = name ? handlers.laneTierOf(name, pos) : null;
        const tuned = Boolean(player?.scoreAdjust);
        return (
            <SlotBox
                key={`${pos}-${team}`}
                $team={TEAM_COLORS[team % TEAM_COLORS.length]}
                $over={isOver(pos, team)}
                $filled={Boolean(name)}
                $color={tier ? TIER_META[tier].color : null}
                onDragOver={(e) => handlers.onDragOver(e, { type: 'slot', position: pos, slot: team })}
                onDragLeave={handlers.onDragLeave}
                onDrop={(e) => handlers.onDrop(e, { type: 'slot', position: pos, slot: team })}
            >
                {name ? (
                    <Card
                        draggable
                        onDragStart={(e) => handlers.onDragStart(e, { name, origin: { type: 'slot', position: pos, slot: team } })}
                        /* 오른쪽 버튼을 두 번 빠르게 누르면 제거 — 메뉴는 뜨지 않는다 */
                        onMouseDown={(e) => { if (e.button === 2 && e.detail >= 2) { e.preventDefault(); handlers.handleDeletePlayer(name); } }}
                        onContextMenu={(e) => { if (e.detail >= 2) { e.preventDefault(); return; } handlers.handleContextMenu(e, name, pos); }}
                        onDoubleClick={() => handlers.toggleCaptain(name)}
                        data-captain={handlers.isCaptain(name) ? '' : undefined}
                        $captain={handlers.isCaptain(name)}
                        $frame={handlers.cosmeticOf(name)?.frame}
                        $bg={handlers.cosmeticOf(name)?.bg}
                        title={`${name} — 더블클릭: 팀장 지정 · 오른쪽 더블클릭: 제거 · 우클릭: 점수 내역·${pos} 티어 지정`}
                    >
                        <FrameLayer frame={handlers.cosmeticOf(name)?.frame} />
                        <span className="rank">
                            {tier ? <TierEmblem tier={tier} size={14} /> : null}
                            <em>{tier ? TIER_META[tier].label : '미지정'}</em>
                        </span>
                        {handlers.cosmeticOf(name)?.titleName && (
                            <span className="ttl">[{handlers.cosmeticOf(name)!.titleName}]</span>
                        )}
                        <span className="nm fx-text" data-text={name}>{name}</span>
                        {(() => {
                            const wishes = handlers.findPlayer(name)?.wishes ?? [];
                            const wi = wishes.indexOf(pos);
                            if (wi >= 0) return <em className="pf wish" title={`본인 ${wi + 1}지망`}>{wi + 1}지망</em>;
                            const pf = handlers.proficiencyOf(name, pos);
                            return pf.label ? (
                                <em className={`pf ${pf.label === '주라인' ? 'main' : pf.label === '오프' ? 'off' : 'sub'}`}
                                    title={`${pos} ${pf.games}판 · 숙련도 ×${pf.factor.toFixed(2)}`}>
                                    {pf.label}
                                </em>
                            ) : null;
                        })()}
                        <ScoreLine $fixed={tuned} title={tuned ? `직접 조절 ${(player?.scoreAdjust ?? 0) > 0 ? '+' : '−'}${Math.abs(player?.scoreAdjust ?? 0)}` : '자동 계산 점수'}>
                            <button className="step" onClick={(e) => { e.stopPropagation(); handlers.adjustScore(name, -1); }} title="점수 −1">−</button>
                            <span className="v tabular">{fmtScore(scoreOf(name, pos))}</span>
                            <button className="step" onClick={(e) => { e.stopPropagation(); handlers.adjustScore(name, 1); }} title="점수 +1">+</button>
                        </ScoreLine>
                    </Card>
                ) : (
                    <span className="ph">비어 있음</span>
                )}
            </SlotBox>
        );
    };

    /* 2팀일 때만 라인별 전력 비교 기호가 의미가 있어 가운데 열을 하나 더 둔다 */
    const withCompare = teamCount === 2;
    const gridCols = withCompare
        ? '46px minmax(0, 1fr) 42px minmax(0, 1fr) minmax(104px, 0.8fr)'
        : `46px repeat(${teamCount}, minmax(0, 1fr)) minmax(104px, 0.8fr)`;

    return (
        <LanesContainer ref={lanesRef} data-capture-root>
            <Board data-capture-board style={{ gridTemplateColumns: gridCols }}>
                {/* 헤더 — 팀이 열이 된다 */}
                <CornerCell />
                {Array.from({ length: teamCount }, (_, t) => (
                    <ColHead key={`h-${t}`} $color={TEAM_COLORS[t % TEAM_COLORS.length]}>
                        {t + 1}팀
                        <b className="tot tabular">{fmtScore(teamTotals[t])}</b>
                        {teamTotals[t] === maxTotal && maxTotal !== minTotal && <i className="lead">최고</i>}
                    </ColHead>
                )).flatMap((node, i) => (withCompare && i === 0 ? [node, <CornerCell key="h-gap" />] : [node]))}
                <ColHead className="muted" data-capture-exclude>희망</ColHead>

                {/* 라인별 한 줄 — 왼쪽에 라인, 오른쪽으로 각 팀 */}
                {POSITIONS.map(pos => (
                    <RowGroup key={pos}>
                        <LaneCell>
                            <LaneIcon line={pos} size={14} />{pos}
                            {(() => {
                                const { gap, over } = handlers.laneGapOf(pos);
                                return over ? (
                                    <b className="gap" title={`이 라인의 점수 차가 ${gap.toFixed(1)}점입니다 — 매치업이 기울어 있어요`}>
                                        ⚠ {gap.toFixed(0)}
                                    </b>
                                ) : null;
                            })()}
                        </LaneCell>

                        {Array.from({ length: teamCount }, (_, t) => slotCell(pos, t))
                            .flatMap((node, i) => (withCompare && i === 0
                                ? [node, (
                                    <CompareCell key={`c-${pos}`}>
                                        <button
                                            className="op"
                                            onClick={(e) => handlers.handleOperatorClick(pos, e)}
                                            onContextMenu={(e) => handlers.handleOperatorClick(pos, e)}
                                            title="클릭해서 전력 비교 기호 변경"
                                        >
                                            {lanes[pos].operator}
                                        </button>
                                        <button className="swap" onClick={() => handlers.handleSwap(pos)} title="이 라인 팀 교체">⇆</button>
                                    </CompareCell>
                                )]
                                : [node]))}

                        {/* 희망 라인 — 카드를 끌어다 놓으면 지망 (공유 이미지에서는 제외) */}
                        <WishBox
                            data-capture-exclude
                            $over={isWishOver(pos)}
                            onDragOver={(e) => handlers.onDragOver(e, { type: 'wish', position: pos })}
                            onDragLeave={handlers.onDragLeave}
                            onDrop={(e) => handlers.onDrop(e, { type: 'wish', position: pos })}
                            title="희망 라인 — 카드를 끌어다 놓으면 지망 (놓은 순서=순위), 이름을 누르면 해제"
                        >
                            {wishersOf(pos).length === 0
                                ? <span className="ph">없음</span>
                                : wishersOf(pos).map(w => (
                                    <WishChip
                                        key={w.name}
                                        $rank={w.rank}
                                        onClick={() => handlers.toggleWish(w.name, pos)}
                                        title={`${w.name} ${w.rank}지망 — 누르면 해제`}
                                    >
                                        <b className="tabular">{w.rank}</b>{w.name}
                                    </WishChip>
                                ))}
                        </WishBox>
                    </RowGroup>
                ))}
            </Board>
        </LanesContainer>
    );
};

const Board = styled.div`
    display: grid;
    gap: 0.35rem;
    align-content: center;
`;

/* 헤더 좌상단·빈 칸 */
const CornerCell = styled.div``;

/* 각 줄을 그리드에 그대로 펼친다 */
const RowGroup = styled.div`
    display: contents;
`;

/* 팀 이름 + 총점 — 각 팀 열의 머리 */
const ColHead = styled.div<{ $color?: string }>`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    gap: 0.05rem;
    padding-bottom: 0.15rem;
    font-size: 0.8rem;
    font-weight: 800;
    color: ${({ $color, theme }) => $color ?? theme.placeholder};

    .tot { font-size: 0.95rem; font-weight: 900; }
    .lead {
        font-style: normal;
        font-size: 0.58rem;
        font-weight: 800;
        padding: 0 0.3rem;
        border-radius: 999px;
        background: currentColor;
        color: ${({ theme }) => theme.body};
    }
    &.muted { font-size: 0.68rem; font-weight: 600; opacity: 0.7; justify-content: flex-end; }
`;

/* 라인 이름 — 각 행의 머리 */
const LaneCell = styled.div`
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.74rem;
    font-weight: 700;
    color: ${({ theme }) => theme.placeholder};

    /* 라인 격차 경고 — 한쪽이 크게 세면 표시한다 */
    .gap {
        font-size: 0.6rem;
        font-weight: 800;
        padding: 0 0.2rem;
        border-radius: 3px;
        color: ${({ theme }) => theme.teamRed};
        border: 1px solid ${({ theme }) => theme.teamRed};
        cursor: help;
    }
`;

const SlotBox = styled.div<{ $team: string; $over: boolean; $filled: boolean; $color: string | null }>`
    min-height: 58px;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3px;
    transition: background-color 0.15s ease;
    background: ${({ theme, $over }) => ($over ? theme.dragOver : theme.body)};
    border: 1px solid ${({ $filled, $color, $team }) =>
        $filled && $color ? $color : withAlpha($team, 0.4)};

    .ph { font-size: 0.7rem; color: ${({ theme }) => theme.placeholder}; opacity: 0.45; }
`;

const Card = styled.div<{ $captain: boolean; $frame?: string | null; $bg?: string | null }>`
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    padding: 0.2rem;
    border: 2px solid transparent;
    border-radius: var(--radius-sm);
    background: ${({ theme }) => theme.white};
    color: #1B1F27;
    cursor: grab;
    user-select: none;
    /* 포인트 상점 장식 — 배경·테두리를 그대로 입힌다 */
    ${({ $frame, $bg }) => decorate($frame, $bg)}
    .rank em, .sc { ${({ $bg }) => ($bg ? 'color: inherit; opacity: 0.9;' : '')} }

    &:active { cursor: grabbing; }

    ${({ $captain }) => $captain && `
        box-shadow: 0 0 0 2px #FFD060, 0 0 8px 1px rgba(255,214,102,0.5);
        &::before {
            content: '';
            position: absolute;
            top: -9px; left: 50%; transform: translateX(-50%);
            width: 20px; height: 15px;
            background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 22' fill='none' stroke='%23FFD060' stroke-width='2.2' stroke-linejoin='round' stroke-linecap='round'%3E%3Cpath d='M3 19V8.5l6 4.2L15 4l6 8.5 6-4.2V19z'/%3E%3Cpath d='M3 15.6h24'/%3E%3C/svg%3E") center / contain no-repeat;
            filter: drop-shadow(0 1px 1px rgba(0,0,0,0.4));
        }
    `}

    .rank {
        display: flex;
        align-items: center;
        gap: 0.2rem;
        font-size: 0.58rem;
        color: #5A6472;
        em { font-style: normal; font-weight: 700; }
    }
    /* 라인 숙련도 배지 — 그룹 내전 전적 기반 */
    .pf {
        font-style: normal;
        font-size: 0.5rem;
        font-weight: 800;
        padding: 0 0.22rem;
        border-radius: 3px;
        line-height: 1.4;
    }
    .pf.main { background: rgba(78, 143, 123, 0.9); color: #F5EFE2; }
    .pf.sub { background: rgba(138, 130, 112, 0.75); color: #F5EFE2; }
    .pf.off { background: rgba(181, 69, 60, 0.9); color: #F5EFE2; }
    .pf.wish { background: rgba(201, 165, 92, 0.95); color: #1E222B; }

    .nm {
        font-size: 0.85rem;
        font-weight: 700;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    /* 칭호 — 이름 바로 앞줄에 작게 */
    .ttl {
        max-width: 100%;
        font-size: 0.54rem;
        font-weight: 800;
        color: ${({ $bg }) => ($bg ? 'inherit' : '#B8860B')};
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
`;

/* 점수 — 평소엔 숫자만, 마우스를 올리면 ± 버튼이 나타난다 */
const ScoreLine = styled.span<{ $fixed: boolean }>`
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: 0.64rem;
    font-weight: 700;
    color: ${({ $fixed }) => ($fixed ? '#B26B00' : '#5A6472')};

    .v { min-width: 26px; text-align: center; }

    .step {
        width: 14px;
        height: 14px;
        line-height: 1;
        border: none;
        border-radius: 3px;
        background: #E7EAEF;
        color: #1B1F27;
        font-size: 0.72rem;
        font-weight: 800;
        cursor: pointer;
        padding: 0;
        opacity: 0.55;

        &:hover { background: #CBD2DB; opacity: 1; }
    }

    &:hover .step { opacity: 1; }
`;

const CompareCell = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;

    button {
        border: none;
        background: none;
        cursor: pointer;
        color: ${({ theme }) => theme.placeholder};
        &:hover { color: ${({ theme }) => theme.text}; }
    }
    .op { font-size: 1.1rem; font-weight: 800; }
    .swap { font-size: 0.9rem; }
`;

const WishBox = styled.div<{ $over: boolean }>`
    min-height: 100%;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 3px;
    padding: 3px;
    border-radius: var(--radius-sm);
    border: 1px dashed ${({ theme }) => theme.cardBorder};
    background: ${({ theme, $over }) => ($over ? theme.dragOver : 'transparent')};

    .ph { width: 100%; text-align: center; font-size: 0.64rem; color: ${({ theme }) => theme.placeholder}; opacity: 0.5; }
`;

/* 희망자 칩 — 앞의 숫자가 그 사람의 지망 순위, 클릭하면 해제 */
const WishChip = styled.button<{ $rank: number }>`
    display: inline-flex;
    align-items: center;
    gap: 3px;
    min-width: 0;
    padding: 0.08rem 0.32rem;
    border-radius: 4px;
    border: 1px solid ${({ $rank, theme }) => ($rank === 1 ? theme.accent : theme.cardBorder)};
    background: ${({ theme }) => theme.body};
    color: ${({ theme }) => theme.text};
    font-size: 0.66rem;
    font-weight: 600;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    b {
        font-size: 0.6rem;
        padding: 0 3px;
        border-radius: 3px;
        background: ${({ $rank, theme }) => ($rank === 1 ? theme.accent : theme.cardBorder)};
        color: ${({ $rank, theme }) => ($rank === 1 ? theme.accentText : theme.text)};
    }
    &:hover { border-color: ${({ theme }) => theme.teamRed}; }
`;
