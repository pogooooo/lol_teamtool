import { useState } from 'react';
import styled from 'styled-components';
import { CompactButton, ModalContent, ModalOverlay } from '../../App.styles';
import { sortRankings, winRateOf } from '../../services/api';
import type { PlayerRanking } from '../../services/api';
import type { DuoStat } from '../../services/matchStats';

type Mode = 'games' | 'winrate' | 'duo';

// 전체 참가자 순위 모달 — 출전 횟수 ↔ 승률 ↔ 듀오 승률 토글
export const RankingModal = ({ ranking, duos, initialMode, onClose }: {
    ranking: PlayerRanking[];
    duos: DuoStat[];
    initialMode: Mode;
    onClose: () => void;
}) => {
    const [mode, setMode] = useState<Mode>(initialMode);
    const sorted = sortRankings(ranking, mode === 'duo' ? 'games' : mode);

    return (
        <ModalOverlay onClick={onClose}>
            <RankingBox onClick={e => e.stopPropagation()}>
                <TopRow>
                    <h3>{mode === 'duo' ? '듀오 승률 순위' : '참가자 순위'}</h3>
                    <CompactButton onClick={onClose}>닫기</CompactButton>
                </TopRow>

                <ToggleRow>
                    <ToggleButton $active={mode === 'games'} onClick={() => setMode('games')}>출전 순</ToggleButton>
                    <ToggleButton $active={mode === 'winrate'} onClick={() => setMode('winrate')}>승률 순</ToggleButton>
                    <ToggleButton $active={mode === 'duo'} onClick={() => setMode('duo')} title="같은 팀으로 2판 이상 뛴 듀오">듀오 순</ToggleButton>
                </ToggleRow>

                {mode === 'duo' ? (
                    duos.length === 0 ? (
                        <Empty>같은 팀으로 2판 이상 뛴 듀오가 아직 없습니다.</Empty>
                    ) : (
                        <List>
                            {duos.map((d, i) => (
                                <Row key={d.key} $top={i === 0}>
                                    <span className="rank">{i + 1}</span>
                                    <span className="name">{d.aName} · {d.bName}</span>
                                    <span className="stat tabular">
                                        {d.winRate}% ({d.wins}승 {d.games - d.wins}패)
                                    </span>
                                </Row>
                            ))}
                        </List>
                    )
                ) : sorted.length === 0 ? (
                    <Empty>참가자가 없습니다.</Empty>
                ) : (
                    <List>
                        {sorted.map((r, i) => (
                            <Row key={r.playerId} $top={i === 0 && r.games > 0}>
                                <span className="rank">{i + 1}</span>
                                <span className="name">{r.displayName}</span>
                                <span className="stat tabular">
                                    {mode === 'games'
                                        ? `${r.games}회`
                                        : r.games === 0
                                            ? '-'
                                            : `${winRateOf(r)}% (${r.wins}승 ${r.games - r.wins}패)`}
                                </span>
                            </Row>
                        ))}
                    </List>
                )}
            </RankingBox>
        </ModalOverlay>
    );
};

const RankingBox = styled(ModalContent)`
    width: min(380px, 92vw);
    max-height: 72vh;
    overflow-y: auto;
    text-align: left;

    h3 { margin: 0; }
`;

const TopRow = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid ${({ theme }) => theme.cardBorder};
    margin-bottom: 0.6rem;
`;

const ToggleRow = styled.div`
    display: flex;
    gap: 0.4rem;
    margin-bottom: 0.75rem;
`;

const ToggleButton = styled.button<{ $active?: boolean }>`
    flex: 1;
    padding: 0.35rem;
    border: 1px solid ${({ theme, $active }) => ($active ? theme.accent : theme.cardBorder)};
    border-radius: var(--radius-sm);
    background: ${({ theme, $active }) => ($active ? theme.accentGradient : 'transparent')};
    color: ${({ theme, $active }) => ($active ? theme.accentText : theme.placeholder)};
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
`;

const Empty = styled.p`
    color: ${({ theme }) => theme.placeholder};
    font-size: 0.9rem;
`;

const List = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
`;

const Row = styled.div<{ $top?: boolean }>`
    display: grid;
    grid-template-columns: 28px 1fr auto;
    gap: 0.5rem;
    align-items: center;
    padding: 0.4rem 0.6rem;
    background: ${({ theme }) => theme.body};
    border-radius: var(--radius-sm);
    font-size: 0.9rem;
    color: ${({ theme }) => theme.text};

    .rank {
        font-weight: 700;
        color: ${({ theme, $top }) => ($top ? theme.accent : theme.placeholder)};
    }
    .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .stat { color: ${({ theme }) => theme.placeholder}; font-weight: 600; font-size: 0.82rem; }
`;
