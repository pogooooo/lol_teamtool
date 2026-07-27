import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { Card, CompactButton, SecondaryButton } from '../App.styles';
import { useArchive } from '../hooks/useArchive';
import { useTeamBuilderContext } from '../hooks/useTeamBuilderLogic';
import { generateDemoMatch } from '../services/riot';
import * as api from '../services/api';
import { sortRankings, winRateOf } from '../services/api';
import type { PlayerRanking } from '../services/api';
import { computeDuoStats } from '../services/matchStats';
import { GroupGate } from './history/GroupGate';
import { PlayerManager } from './history/PlayerManager';
import { HelpSection } from './history/HelpSection';
import { MatchList } from './history/MatchList';
import { TournamentPanel } from './history/TournamentPanel';
import { GrassCalendar } from './history/GrassCalendar';
import { RankingModal } from './history/RankingModal';
import { SendToBuilderModal } from './history/SendToBuilderModal';

// 내전 기록 탭 루트 — 데이터 원본은 로컬 API 서버(SQLite), Riot 연동은 서버 프록시 경유
export const MatchHistory = () => {
    const archive = useArchive();
    const { handlers } = useTeamBuilderContext();
    const [subView, setSubView] = useState<'dashboard' | 'roster'>('dashboard');
    const [codeStatus, setCodeStatus] = useState('복사');
    const [rankings, setRankings] = useState<PlayerRanking[]>([]);
    const [rankMode, setRankMode] = useState<'games' | 'winrate' | 'duo'>('games');
    const [showRanking, setShowRanking] = useState(false);
    const [showSend, setShowSend] = useState(false);
    const [sendStatus, setSendStatus] = useState('');

    const groupId = archive.activeGroup?.id ?? null;
    const matchCount = archive.matches.length;

    // 순위(출전/승수)는 서버 SQL 집계 — 매치 수가 바뀌면 갱신
    useEffect(() => {
        if (!groupId) {
            setRankings([]);
            return;
        }
        api.getRankings(groupId).then(setRankings).catch(() => setRankings([]));
    }, [groupId, matchCount]);

    if (archive.serverOk === false) {
        return (
            <NoticeCard>
                <h3>서버에 연결할 수 없습니다</h3>
                <p>
                    {import.meta.env.DEV ? (
                        <>터미널에서 <code>npm run server</code>를 실행한 뒤 새로고침해 주세요. (개발 모드 안내)</>
                    ) : (
                        <>인터넷 연결을 확인한 뒤 새로고침해 주세요. 문제가 계속되면 잠시 후 다시 시도해 주세요.</>
                    )}
                </p>
            </NoticeCard>
        );
    }

    if (!archive.activeGroup) {
        return (
            <HistoryContainer>
                <GroupGate archive={archive} />
                <HelpSection />
            </HistoryContainer>
        );
    }
    const group = archive.activeGroup;
    const stats = archive.stats;

    /* --- 참가자 관리 서브 페이지 --- */
    if (subView === 'roster') {
        return (
            <HistoryContainer>
                <GroupBar>
                    <GroupInfo>
                        <h2>{group.name}</h2>
                        <span className="sub">참가자 & 롤 계정 관리</span>
                    </GroupInfo>
                    <SecondaryButton onClick={() => setSubView('dashboard')}>← 대시보드로</SecondaryButton>
                </GroupBar>
                <PlayerManager archive={archive} />
            </HistoryContainer>
        );
    }

    /* --- 대시보드 --- */

    const handleCopyCode = () => {
        navigator.clipboard.writeText(group.joinCode);
        setCodeStatus('복사됨!');
        setTimeout(() => setCodeStatus('복사'), 1500);
    };

    const handleSend = (names: string[]) => {
        handlers.importPlayers(names);
        setSendStatus(`${names.length}명을 팀 빌더에 추가했습니다. (팀 빌더 탭 확인)`);
        setTimeout(() => setSendStatus(''), 2500);
    };

    const handleDemo = () => {
        archive.importMatches([generateDemoMatch(group.id, archive.players, archive.accounts)]);
    };

    const top3 = sortRankings(rankings, rankMode === 'duo' ? 'games' : rankMode).slice(0, 3);
    const duoStats = computeDuoStats(archive.matches, archive.players);
    const duoTop3 = duoStats.slice(0, 3);

    return (
        <HistoryContainer>
            <GroupBar>
                <GroupInfo>
                    <h2>{group.name}</h2>
                    <code>{group.joinCode}</code>
                    <CompactButton onClick={handleCopyCode}>{codeStatus}</CompactButton>
                </GroupInfo>
                <SecondaryButton onClick={archive.closeGroup}>그룹 전환</SecondaryButton>
            </GroupBar>

            <SummaryGrid>
                <SideCol>
                    <StatCard>
                        <span className="label">총 내전 수</span>
                        <span className="value tabular">{stats?.totalMatches ?? 0}</span>
                    </StatCard>

                    <RankCard>
                        <RankHead>
                            <ToggleMini $active={rankMode === 'games'} onClick={() => setRankMode('games')}>출전</ToggleMini>
                            <ToggleMini $active={rankMode === 'winrate'} onClick={() => setRankMode('winrate')}>승률</ToggleMini>
                            <ToggleMini $active={rankMode === 'duo'} onClick={() => setRankMode('duo')} title="같은 팀으로 2판 이상 뛴 듀오의 승률 순위">듀오</ToggleMini>
                            <ArrowMore onClick={() => setShowRanking(true)} title="전체 순위 보기">전체 →</ArrowMore>
                        </RankHead>
                        {rankMode === 'duo' ? (
                            duoTop3.length === 0 ? (
                                <small className="empty">같은 팀 2판 이상 듀오가 아직 없습니다</small>
                            ) : (
                                duoTop3.map((d, i) => (
                                    <RankLine key={d.key}>
                                        <span className="rank">{i + 1}</span>
                                        <span className="name" title={`${d.aName} · ${d.bName} — ${d.games}판 ${d.wins}승`}>{d.aName}·{d.bName}</span>
                                        <span className="val tabular">{d.winRate}%</span>
                                    </RankLine>
                                ))
                            )
                        ) : top3.length === 0 ? (
                            <small className="empty">아직 기록이 없습니다</small>
                        ) : (
                            top3.map((r, i) => (
                                <RankLine key={r.playerId}>
                                    <span className="rank">{i + 1}</span>
                                    <span className="name">{r.displayName}</span>
                                    <span className="val tabular">
                                        {rankMode === 'games'
                                            ? `${r.games}회`
                                            : r.games === 0 ? '-' : `${winRateOf(r)}%`}
                                    </span>
                                </RankLine>
                            ))
                        )}
                    </RankCard>
                </SideCol>

                <GrassCard>
                    <GrassCalendar matches={archive.matches} title="최근 내전" />
                </GrassCard>
            </SummaryGrid>

            <RosterCard>
                <div className="info">
                    <strong>참가자 {archive.players.length}명</strong>
                    <small>등록 계정 {archive.accounts.length}개</small>
                    {sendStatus && <em>{sendStatus}</em>}
                </div>
                <div className="actions">
                    <CompactButton onClick={() => setSubView('roster')}>참가자 관리 →</CompactButton>
                    <CompactButton onClick={() => setShowSend(true)} disabled={archive.players.length === 0}>
                        팀 빌더로 보내기
                    </CompactButton>
                </div>
            </RosterCard>

            <TournamentPanel archive={archive} groupId={group.id} />

            <ActionsRow>
                <SecondaryButton onClick={handleDemo}>데모 내전 생성 (UI 확인용)</SecondaryButton>
            </ActionsRow>

            <MatchList archive={archive} />

            <HelpSection />

            {showRanking && (
                <RankingModal ranking={rankings} duos={duoStats} initialMode={rankMode} onClose={() => setShowRanking(false)} />
            )}
            {showSend && (
                <SendToBuilderModal
                    players={archive.players}
                    onSend={handleSend}
                    onClose={() => setShowSend(false)}
                />
            )}
        </HistoryContainer>
    );
};

const HistoryContainer = styled.div`
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    gap: 1rem;
`;

const NoticeCard = styled(Card)`
    display: flex;
    flex-direction: column;
    gap: 0.75rem;

    h3 { color: ${({ theme }) => theme.text}; font-size: 1.1rem; }
    p { color: ${({ theme }) => theme.placeholder}; font-size: 0.9rem; }
    code {
        color: ${({ theme }) => theme.accent};
        background: ${({ theme }) => theme.body};
        padding: 0.1rem 0.4rem;
        border-radius: var(--radius-sm);
    }
`;

const GroupBar = styled(Card)`
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
`;

const GroupInfo = styled.div`
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 0;

    h2 {
        font-size: 1.15rem;
        color: ${({ theme }) => theme.text};
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .sub {
        font-size: 0.85rem;
        color: ${({ theme }) => theme.placeholder};
    }

    code {
        font-size: 0.85rem;
        letter-spacing: 0.08em;
        color: ${({ theme }) => theme.accent};
        background: ${({ theme }) => theme.body};
        border: 1px solid ${({ theme }) => theme.cardBorder};
        border-radius: var(--radius-sm);
        padding: 0.2rem 0.5rem;
    }
`;

/* 좌: 총 내전 수 + 순위(토글) / 우: 잔디밭 가로 배치 */
const SummaryGrid = styled.div`
    display: grid;
    grid-template-columns: 210px 1fr;
    gap: 1rem;
    align-items: stretch;

    @media (max-width: 640px) {
        grid-template-columns: 1fr;
    }
`;

const SideCol = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
`;

const StatCard = styled(Card)`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.6rem 0.9rem;

    .label {
        font-size: 0.82rem;
        color: ${({ theme }) => theme.placeholder};
    }

    .value {
        font-size: 1.45rem;
        font-weight: 800;
        color: ${({ theme }) => theme.accent};
    }
`;

const RankCard = styled(Card)`
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.6rem 0.75rem;

    .empty {
        color: ${({ theme }) => theme.placeholder};
        font-size: 0.78rem;
    }
`;

const RankHead = styled.div`
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding-bottom: 0.35rem;
    border-bottom: 1px solid ${({ theme }) => theme.cardBorder};
`;

const ToggleMini = styled.button<{ $active?: boolean }>`
    padding: 0.15rem 0.5rem;
    border: 1px solid ${({ theme, $active }) => ($active ? theme.accent : theme.cardBorder)};
    border-radius: 999px;
    background: ${({ theme, $active }) => ($active ? theme.accentGradient : 'transparent')};
    color: ${({ theme, $active }) => ($active ? theme.accentText : theme.placeholder)};
    font-size: 0.72rem;
    font-weight: 700;
    cursor: pointer;
`;

const ArrowMore = styled.button`
    margin-left: auto;
    background: none;
    border: none;
    padding: 0;
    font-size: 0.75rem;
    font-weight: 700;
    color: ${({ theme }) => theme.accent};
    cursor: pointer;

    &:hover { text-decoration: underline; }
`;

const RankLine = styled.div`
    display: grid;
    grid-template-columns: 18px 1fr auto;
    gap: 0.4rem;
    align-items: center;
    font-size: 0.82rem;
    color: ${({ theme }) => theme.text};

    .rank { font-weight: 800; color: ${({ theme }) => theme.placeholder}; }
    .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .val { font-weight: 700; color: ${({ theme }) => theme.accent}; font-size: 0.78rem; }
`;

const GrassCard = styled(Card)`
    display: flex;
    align-items: center;
    padding: 0.75rem 1rem;
`;

const RosterCard = styled(Card)`
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    flex-wrap: wrap;

    .info {
        display: flex;
        align-items: baseline;
        gap: 0.6rem;
        color: ${({ theme }) => theme.text};

        small { color: ${({ theme }) => theme.placeholder}; }
        em {
            font-style: normal;
            font-size: 0.8rem;
            color: ${({ theme }) => theme.accent};
        }
    }

    .actions {
        display: flex;
        gap: 0.5rem;
    }
`;

const ActionsRow = styled.div`
    display: flex;
    gap: 0.75rem;

    button { flex: 1; }
`;
