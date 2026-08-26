import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { useTeamBuilderContext, MIN_TEAMS, MAX_TEAMS } from '../hooks/useTeamBuilderLogic';
import type { Cosmetic } from '../hooks/useTeamBuilderLogic';
import * as pts from '../services/points';
import { useActiveGroupId, useActiveGroupBadge } from '../hooks/useActiveGroupBadge';
import { PlayerCard } from './PlayerCard';
import { AlgorithmModal } from './AlgorithmModal';
import { TierSheetModal } from './TierSheetModal';
import { Spinner } from './ui/Spinner';

/*
 * 현재 명단 — 참가자를 카드로 보여준다.
 * 내전 기록 그룹이 선택돼 있으면 등록된 라이엇 계정에서 티어를 자동으로 채우고 점수를 계산한다.
 */
export const TierPool = () => {
    const {
        poolPlayers, dragOverTarget, handlers, teamCount,
        balanceNote, clearBalanceNote, groupRoster, allPlayers,
        syncState, lastSyncAt, rankedCount, sheetLive,
    } = useTeamBuilderContext();
    const groupId = useActiveGroupId();
    const groupName = useActiveGroupBadge();
    const [showAlgo, setShowAlgo] = useState(false);
    const [showSheet, setShowSheet] = useState(false);

    // 포인트 상점에서 산 칭호·테두리·배경을 팀 빌더 카드에도 반영한다
    const applyCosmetics = handlers.applyCosmetics;
    useEffect(() => {
        if (!groupId) { applyCosmetics({}); return; }
        let stopped = false;
        pts.getGroupPoints(groupId)
            .then(({ ranking, shop }) => {
                if (stopped) return;
                const nameOf = (id: string | null) => shop.find(s => s.id === id)?.name;
                const map: Record<string, Cosmetic> = {};
                for (const r of ranking) {
                    map[r.displayName.trim().toLowerCase()] = {
                        title: r.title, frame: r.frame, bg: r.bg, titleName: nameOf(r.title),
                    };
                }
                applyCosmetics(map);
            })
            .catch(() => { /* 장식은 없어도 팀 빌더는 동작한다 */ });
        return () => { stopped = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groupId]);


    // 그룹에 등록됐지만 아직 명단에 없는 사람 — 한 번에 불러올 수 있게 개수를 보여 준다
    const notAdded = groupRoster.filter(n => !allPlayers.some(p => p.name === n)).length;

    return (
        <>
            <PoolCard
                onDragOver={(e) => handlers.onDragOver(e, { type: 'pool' })}
                onDragLeave={handlers.onDragLeave}
                onDrop={(e) => handlers.onDrop(e, { type: 'pool' })}
                $isDragOver={dragOverTarget?.type === 'pool'}
            >
                <Head>
                    <span className="title">현재 명단</span>
                    <span className="count tabular">{poolPlayers.length}</span>
                    {groupId && (
                        <span className="sync">
                            {syncState === 'loading' ? (
                                <><Spinner $size={11} /> {groupName ?? '그룹'} 전적을 불러오는 중…</>
                            ) : syncState === 'error' ? '전적을 불러오지 못했습니다. 다시 시도해 주세요'
                                : `${groupName ?? '그룹'} · 롤 티어 ${rankedCount}명${lastSyncAt
                                    ? ` · ${new Date(lastSyncAt).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })} 갱신`
                                    : ''}`}
                            <button
                                className="reload"
                                onClick={handlers.refreshTiers}
                                disabled={syncState === 'loading'}
                                title="롤 전적과 티어를 지금 새로 불러옵니다"
                            >{syncState === 'loading' ? <Spinner $size={9} /> : '↻'}</button>
                        </span>
                    )}
                    {!groupId && <span className="sync">내전 기록에서 그룹을 선택하면 참가자의 롤 티어를 자동으로 불러옵니다</span>}

                    <TeamCountBox title="팀 수">
                        <button onClick={() => handlers.setTeamCount(teamCount - 1)} disabled={teamCount <= MIN_TEAMS}>−</button>
                        <span className="v tabular">{teamCount}팀</span>
                        <button onClick={() => handlers.setTeamCount(teamCount + 1)} disabled={teamCount >= MAX_TEAMS}>+</button>
                    </TeamCountBox>
                    {notAdded > 0 && (
                        <button
                            className="algo pull"
                            onClick={() => handlers.importGroupRoster()}
                            title="이 그룹에 등록된 참가자를 모두 명단에 넣습니다"
                        >
                            그룹 명단 +{notAdded}
                        </button>
                    )}
                    <button className="algo hi" onClick={handlers.autoBalance} title="점수가 비슷하도록 팀을 자동으로 나눕니다">자동 분배</button>
                    <button className="algo" onClick={() => setShowAlgo(true)}>점수 기준</button>
                    <button className="algo" onClick={() => setShowSheet(true)} title="구글 시트·엑셀로 참가자와 기본 티어를 관리합니다">엑셀·시트</button>
                    {sheetLive !== 'off' && (
                        <span
                            className={sheetLive === 'live' ? 'sheet' : 'sheet err'}
                            title={sheetLive === 'live'
                                ? '구글 시트와 실시간 연동 중 — 시트를 고치면 참가자 티어에 자동 반영됩니다'
                                : '시트를 읽지 못했습니다. 엑셀·시트에서 연결 상태를 확인해 주세요'}
                        >
                            {sheetLive === 'live' ? '● 시트 연동 중' : '시트 연동 오류'}
                        </span>
                    )}
                    <button
                        className="algo danger"
                        disabled={poolPlayers.length === 0}
                        onClick={() => { if (window.confirm('현재 명단을 모두 지울까요?')) handlers.clearPlayers(); }}
                    >모두 지우기</button>
                </Head>

                {balanceNote && (
                    <Note $warn={balanceNote.kind === 'warn'} onClick={clearBalanceNote} title="눌러서 닫기">
                        {balanceNote.text}
                    </Note>
                )}

                {poolPlayers.length === 0 ? (
                    <Empty>아래에 이름을 입력하면 명단에 추가됩니다. 기본 티어는 롤 최고 솔랭(없으면 자랭)이 자동으로 붙고, 이름을 우클릭해 직접 지정할 수 있어요.</Empty>
                ) : (
                    <Grid>
                        {poolPlayers.map(player => (
                            <PlayerCard
                                key={player.name}
                                player={player}
                                score={handlers.effectiveScore(player.name)}
                                tier={handlers.bestTierOf(player.name)}
                                captain={handlers.isCaptain(player.name)}
                                onDragStart={(e) => handlers.onDragStart(e, { name: player.name, origin: { type: 'pool' } })}
                                onContextMenu={(e) => handlers.handleContextMenu(e, player.name)}
                                onRemove={() => handlers.handleDeletePlayer(player.name)}
                                onToggleCaptain={() => handlers.toggleCaptain(player.name)}
                                onScoreStep={(d) => handlers.adjustScore(player.name, d)}
                                cosmetic={handlers.cosmeticOf(player.name)}
                            />
                        ))}
                    </Grid>
                )}
            </PoolCard>

            {showAlgo && <AlgorithmModal onClose={() => setShowAlgo(false)} />}
            {showSheet && <TierSheetModal onClose={() => setShowSheet(false)} />}
        </>
    );
};

const PoolCard = styled.div<{ $isDragOver?: boolean }>`
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    padding: 0.75rem;
    border-radius: var(--radius-lg);
    background: ${({ theme, $isDragOver }) => ($isDragOver ? theme.dragOver : theme.card)};
    border: 1px solid ${({ theme }) => theme.cardBorder};
    transition: background-color 0.2s ease;
    max-height: 32vh;
    overflow-y: auto;
`;

const Head = styled.div`
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;

    .title { font-size: 0.95rem; font-weight: 800; color: ${({ theme }) => theme.text}; }
    .count {
        padding: 0.08rem 0.5rem;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 800;
        background: ${({ theme }) => theme.accent};
        color: ${({ theme }) => theme.accentText};
    }
    .sync {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        font-size: 0.72rem;
        color: ${({ theme }) => theme.placeholder};
        margin-right: auto;
    }
    .sync .reload {
        width: 20px;
        height: 20px;
        line-height: 1;
        padding: 0;
        border: 1px solid ${({ theme }) => theme.cardBorder};
        border-radius: 50%;
        background: transparent;
        color: ${({ theme }) => theme.text};
        font-size: 0.78rem;
        cursor: pointer;
        &:hover:not(:disabled) { background: ${({ theme }) => theme.dragOver}; }
        &:disabled { opacity: 0.4; cursor: default; }
    }
    .algo {
        border: 1px solid ${({ theme }) => theme.cardBorder};
        background: transparent;
        color: ${({ theme }) => theme.text};
        font-size: 0.72rem;
        font-weight: 700;
        padding: 0.25rem 0.6rem;
        border-radius: 999px;
        cursor: pointer;
        &:hover { background: ${({ theme }) => theme.dragOver}; }
    }
    /* 구글 시트 상시 연동 상태 */
    .sheet {
        font-size: 0.68rem;
        font-weight: 700;
        padding: 0.12rem 0.45rem;
        border-radius: 999px;
        border: 1px solid ${({ theme }) => theme.accent};
        color: ${({ theme }) => theme.accent};
    }
    .sheet.err {
        border-color: ${({ theme }) => theme.teamRed};
        color: ${({ theme }) => theme.teamRed};
    }
    .algo.danger {
        border-color: ${({ theme }) => theme.teamRed};
        color: ${({ theme }) => theme.teamRed};
        &:disabled { opacity: 0.35; cursor: default; }
    }
    .algo.hi {
        border-color: ${({ theme }) => theme.accent};
        background: ${({ theme }) => theme.accentGradient};
        color: ${({ theme }) => theme.accentText};
    }
`;

const TeamCountBox = styled.div`
    display: inline-flex;
    align-items: center;
    gap: 0.15rem;
    border: 1px solid ${({ theme }) => theme.cardBorder};
    border-radius: 999px;
    padding: 0.1rem 0.2rem;

    button {
        width: 20px;
        height: 20px;
        border: none;
        border-radius: 50%;
        background: transparent;
        color: ${({ theme }) => theme.text};
        font-size: 0.85rem;
        font-weight: 800;
        cursor: pointer;
        &:hover:not(:disabled) { background: ${({ theme }) => theme.dragOver}; }
        &:disabled { opacity: 0.3; cursor: default; }
    }
    .v { font-size: 0.72rem; font-weight: 700; color: ${({ theme }) => theme.text}; min-width: 26px; text-align: center; }
`;

/* 자동 분배가 합격선을 못 맞췄을 때의 안내 */
const Note = styled.div<{ $warn: boolean }>`
    padding: 0.35rem 0.55rem;
    border-radius: var(--radius-sm);
    border: 1px solid ${({ theme, $warn }) => ($warn ? theme.teamRed : theme.cardBorder)};
    background: ${({ theme }) => theme.body};
    color: ${({ theme }) => theme.text};
    font-size: 0.72rem;
    line-height: 1.5;
    cursor: pointer;
`;

const Grid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(158px, 1fr));
    gap: 0.35rem;
`;

const Empty = styled.span`
    font-size: 0.8rem;
    color: ${({ theme }) => theme.placeholder};
    line-height: 1.5;
`;
