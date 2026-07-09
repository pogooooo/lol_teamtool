import { useState } from 'react';
import styled from 'styled-components';
import { Card, CompactButton } from '../../App.styles';
import { Select } from '../ui/Select';
import { DatePicker } from '../ui/DatePicker';
import type { Archive } from '../../hooks/useArchive';
import type { MatchParticipant, TeamSide } from '../../types';
import { sortByLane } from '../../constants';
import { useGameAssets } from '../../services/champions';
import * as api from '../../services/api';
import type { MatchFullDetail } from '../../services/api';
import { ChampionIcon, ItemIcon } from './GameIcons';
import { MatchDetailModal } from './MatchDetailModal';

const PAGE_SIZE = 10;

const fmtDate = (ts: number) =>
    new Date(ts).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });

const fmtFullDate = (ts: number) =>
    new Date(ts).toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const kdaRatio = (k: number, d: number, a: number) =>
    d === 0 ? 'Perfect' : `${((k + a) / d).toFixed(2)}:1`;

const teamKills = (participants: MatchParticipant[], side: TeamSide) =>
    participants.filter(pt => pt.side === side).reduce((sum, pt) => sum + pt.kills, 0);

// 내전 목록 — 접힌 행에서도 양 팀 픽(챔피언)·닉네임·킬 스코어가 보이고, 펼치면 상세 스코어보드
export const MatchList = ({ archive }: { archive: Archive }) => {
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [playerId, setPlayerId] = useState('');
    const [result, setResult] = useState<'all' | 'win' | 'lose'>('all');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [detail, setDetail] = useState<MatchFullDetail | null>(null);
    const [detailError, setDetailError] = useState('');
    const { champNames, itemNames } = useGameAssets();

    const champLabel = (champion: string) => champNames[champion] ?? champion;
    const itemLabel = (itemId: number) => itemNames[String(itemId)] ?? `아이템 ${itemId}`;

    const filtered = archive.matches.filter(m => {
        if (from && m.gameStart < new Date(from).getTime()) return false;
        if (to && m.gameStart > new Date(to).getTime() + 86399999) return false;
        if (playerId) {
            const pt = m.participants.find(p => p.playerId === playerId);
            if (!pt) return false;
            if (result === 'win' && pt.side !== m.winningSide) return false;
            if (result === 'lose' && pt.side === m.winningSide) return false;
        }
        return true;
    });

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    const playerName = (id: string | null) =>
        id ? archive.players.find(p => p.id === id)?.displayName ?? null : null;

    const nickOf = (pt: MatchParticipant) =>
        playerName(pt.playerId) ?? pt.riotId.split('#')[0];

    const handleDelete = async (matchId: string) => {
        await archive.deleteMatch(matchId);
        if (expandedId === matchId) setExpandedId(null);
    };

    // 저장된 원본 데이터 전체 조회 (정식 API 전환 후에는 콜백+Match-V5로 받은 전 필드가 여기에 표시된다)
    const handleShowDetail = async (matchId: string) => {
        setDetailError('');
        try {
            setDetail(await api.getMatchDetail(matchId));
        } catch (e) {
            setDetailError(api.errorMessage(e));
        }
    };

    const renderScoreboard = (participants: MatchParticipant[], side: TeamSide, won: boolean) => {
        const team = sortByLane(participants.filter(pt => pt.side === side));
        const totals = team.reduce(
            (acc, pt) => ({ kills: acc.kills + pt.kills, deaths: acc.deaths + pt.deaths, assists: acc.assists + pt.assists, gold: acc.gold + pt.gold }),
            { kills: 0, deaths: 0, assists: 0, gold: 0 },
        );
        return (
            <ScoreTeam key={side}>
                <ScoreHead $side={side}>
                    <strong>{won ? '승리' : '패배'}</strong>
                    <span>({side === 'blue' ? '블루팀' : '레드팀'})</span>
                    <small className="tabular">{totals.kills} / {totals.deaths} / {totals.assists} · {(totals.gold / 1000).toFixed(1)}k 골드</small>
                </ScoreHead>
                {team.map(pt => {
                    const name = playerName(pt.playerId);
                    return (
                        <PlayerLine key={pt.puuid + pt.position}>
                            <ChampCell title={champLabel(pt.champion)}>
                                <ChampionIcon championId={pt.champion} name={champLabel(pt.champion)} size={34} />
                                <LevelBadge>{pt.champLevel ?? '-'}</LevelBadge>
                            </ChampCell>
                            <NameCell>
                                <span className="main">{name ?? pt.riotId}</span>
                                <small>{pt.position} · {name ? pt.riotId : champLabel(pt.champion)}</small>
                            </NameCell>
                            <KdaCell className="tabular">
                                <span className="kda">{pt.kills} / <em>{pt.deaths}</em> / {pt.assists}</span>
                                <small>{kdaRatio(pt.kills, pt.deaths, pt.assists)}</small>
                            </KdaCell>
                            <StatCell className="opt tabular">
                                <span>{pt.damage != null ? `${(pt.damage / 1000).toFixed(1)}k` : '-'}</span>
                                <small>피해량</small>
                            </StatCell>
                            <StatCell className="tabular">
                                <span>{pt.cs}</span>
                                <small>CS</small>
                            </StatCell>
                            <StatCell className="opt tabular">
                                <span>{(pt.gold / 1000).toFixed(1)}k</span>
                                <small>골드</small>
                            </StatCell>
                            <StatCell className="opt tabular">
                                <span>{pt.visionScore}</span>
                                <small>시야</small>
                            </StatCell>
                            <ItemsCell>
                                {(pt.items ?? [0, 0, 0, 0, 0, 0, 0]).map((itemId, i) => (
                                    <ItemIcon key={i} itemId={itemId} name={itemLabel(itemId)} size={22} />
                                ))}
                            </ItemsCell>
                        </PlayerLine>
                    );
                })}
            </ScoreTeam>
        );
    };

    return (
        <ListCard>
            <h3>내전 목록</h3>

            <FilterBar>
                <DatePicker value={from} onChange={v => { setFrom(v); setPage(1); }} placeholder="시작일" />
                <DatePicker value={to} onChange={v => { setTo(v); setPage(1); }} placeholder="종료일" />
                <Select
                    value={playerId}
                    onChange={v => { setPlayerId(v); setResult('all'); setPage(1); }}
                    options={[
                        { value: '', label: '참가자 전체' },
                        ...archive.players.map(p => ({ value: p.id, label: p.displayName })),
                    ]}
                />
                <Select
                    value={result}
                    onChange={v => { setResult(v as 'all' | 'win' | 'lose'); setPage(1); }}
                    disabled={!playerId}
                    title={playerId ? '' : '참가자를 먼저 선택하세요'}
                    options={[
                        { value: 'all', label: '승패 전체' },
                        { value: 'win', label: '승리한 판' },
                        { value: 'lose', label: '패배한 판' },
                    ]}
                />
            </FilterBar>

            {filtered.length === 0 ? (
                <Empty>
                    {archive.matches.length === 0
                        ? '아직 기록된 내전이 없습니다. "데모 내전 생성"으로 화면을 미리 볼 수 있어요.'
                        : '조건에 맞는 내전이 없습니다.'}
                </Empty>
            ) : (
                <Rows>
                    {pageItems.map(m => {
                        const expanded = expandedId === m.id;
                        const blue = sortByLane(m.participants.filter(pt => pt.side === 'blue'));
                        const red = sortByLane(m.participants.filter(pt => pt.side === 'red'));
                        const blueKills = teamKills(m.participants, 'blue');
                        const redKills = teamKills(m.participants, 'red');
                        return (
                            <RowWrap key={m.id} $side={m.winningSide}>
                                <MatchRow $expanded={expanded} onClick={() => setExpandedId(expanded ? null : m.id)}>
                                    <ResultCol>
                                        <WinBadge $side={m.winningSide}>
                                            {m.winningSide === 'blue' ? '블루 승' : '레드 승'}
                                        </WinBadge>
                                        <ScoreLine className="tabular">
                                            <b className={m.winningSide === 'blue' ? 'win blue' : 'blue'}>{blueKills}</b>
                                            <span>:</span>
                                            <b className={m.winningSide === 'red' ? 'win red' : 'red'}>{redKills}</b>
                                        </ScoreLine>
                                        <span className="sub">{fmtDate(m.gameStart)} · {Math.floor(m.durationSec / 60)}분</span>
                                        {m.source === 'demo' && <DemoBadge>모의</DemoBadge>}
                                    </ResultCol>

                                    <TeamCol $side="blue" $won={m.winningSide === 'blue'}>
                                        {blue.map(pt => (
                                            <PickLine key={pt.puuid + pt.position}>
                                                <ChampionIcon championId={pt.champion} name={champLabel(pt.champion)} size={20} />
                                                <span className="nick">{nickOf(pt)}</span>
                                            </PickLine>
                                        ))}
                                    </TeamCol>
                                    <VsBadge aria-hidden>VS</VsBadge>
                                    <TeamCol $side="red" $won={m.winningSide === 'red'}>
                                        {red.map(pt => (
                                            <PickLine key={pt.puuid + pt.position}>
                                                <ChampionIcon championId={pt.champion} name={champLabel(pt.champion)} size={20} />
                                                <span className="nick">{nickOf(pt)}</span>
                                            </PickLine>
                                        ))}
                                    </TeamCol>

                                    <Chevron aria-hidden>{expanded ? '▲' : '▼'}</Chevron>
                                </MatchRow>

                                {expanded && (
                                    <Expansion>
                                        <MetaLine>
                                            {fmtFullDate(m.gameStart)} · {Math.floor(m.durationSec / 60)}분 {m.durationSec % 60}초
                                            {m.source === 'demo' ? ' · 모의 데이터' : ` · ${m.riotMatchId}`}
                                        </MetaLine>
                                        {renderScoreboard(m.participants, 'blue', m.winningSide === 'blue')}
                                        {renderScoreboard(m.participants, 'red', m.winningSide === 'red')}
                                        <ExpansionActions>
                                            {detailError && <span className="err">{detailError}</span>}
                                            <CompactButton onClick={() => handleShowDetail(m.id)}>상세정보 보기</CompactButton>
                                            <CompactButton onClick={() => handleDelete(m.id)}>기록 삭제</CompactButton>
                                        </ExpansionActions>
                                    </Expansion>
                                )}
                            </RowWrap>
                        );
                    })}
                </Rows>
            )}

            {filtered.length > PAGE_SIZE && (
                <Pager>
                    <CompactButton disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>‹ 이전</CompactButton>
                    <span className="tabular">{safePage} / {totalPages}</span>
                    <CompactButton disabled={safePage === totalPages} onClick={() => setPage(safePage + 1)}>다음 ›</CompactButton>
                </Pager>
            )}

            {detail && (
                <MatchDetailModal
                    detail={detail}
                    playerName={playerName}
                    onClose={() => setDetail(null)}
                />
            )}
        </ListCard>
    );
};

const ListCard = styled(Card)`
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-height: 320px;

    h3 {
        font-size: 1.1rem;
        color: ${({ theme }) => theme.text};
        padding-bottom: 0.5rem;
        border-bottom: 1px solid ${({ theme }) => theme.cardBorder};
    }
`;

const FilterBar = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr;
    gap: 0.4rem;

    /* 커스텀 셀렉트/데이트피커 트리거를 필터 크기에 맞춤 */
    button[type='button'] {
        font-size: 0.8rem;
    }

    @media (max-width: 640px) {
        grid-template-columns: 1fr 1fr;
    }
`;

const Empty = styled.div`
    flex-grow: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    text-align: center;
    color: ${({ theme }) => theme.placeholder};
    font-size: 0.85rem;
    padding: 1rem;
`;

const Rows = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
`;

/* 왼쪽 컬러 스트립 = 승리 팀 색 */
const RowWrap = styled.div<{ $side: TeamSide }>`
    border: 1px solid ${({ theme }) => theme.cardBorder};
    border-left: 4px solid ${({ theme, $side }) => ($side === 'blue' ? theme.teamBlue : theme.teamRed)};
    border-radius: var(--radius-md);
    overflow: hidden;
`;

const MatchRow = styled.button<{ $expanded?: boolean }>`
    width: 100%;
    display: grid;
    grid-template-columns: 92px 1fr 28px 1fr 16px;
    gap: 0.5rem;
    align-items: center;
    padding: 0.6rem 0.75rem;
    background: ${({ theme, $expanded }) => ($expanded ? theme.dragOver : theme.body)};
    border: none;
    color: ${({ theme }) => theme.text};
    cursor: pointer;
    text-align: left;
    transition: background-color 0.15s ease;

    &:hover { background: ${({ theme }) => theme.dragOver}; }
`;

const ResultCol = styled.span`
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;

    .sub { font-size: 0.72rem; color: ${({ theme }) => theme.placeholder}; }
`;

const ScoreLine = styled.span`
    display: flex;
    align-items: baseline;
    gap: 0.3rem;
    font-size: 1.15rem;

    span { color: ${({ theme }) => theme.placeholder}; font-size: 0.85rem; }
    b { font-weight: 800; opacity: 0.55; }
    b.blue { color: ${({ theme }) => theme.teamBlue}; }
    b.red { color: ${({ theme }) => theme.teamRed}; }
    b.win { opacity: 1; }
`;

const VsBadge = styled.span`
    align-self: center;
    text-align: center;
    font-size: 0.68rem;
    font-weight: 800;
    color: ${({ theme }) => theme.placeholder};
    letter-spacing: 0.05em;
`;

const WinBadge = styled.span<{ $side: TeamSide }>`
    padding: 0.08rem 0.4rem;
    border-radius: var(--radius-sm);
    font-size: 0.72rem;
    font-weight: 700;
    color: #FFFFFF;
    background: ${({ theme, $side }) => ($side === 'blue' ? theme.teamBlue : theme.teamRed)};
`;

const DemoBadge = styled.span`
    padding: 0.05rem 0.35rem;
    border-radius: var(--radius-sm);
    font-size: 0.65rem;
    font-weight: 600;
    color: ${({ theme }) => theme.placeholder};
    border: 1px dashed ${({ theme }) => theme.placeholder};
`;

/* 팀별 세로 픽 목록 (챔피언 + 닉네임) — 승리 팀은 팀 색으로 은은하게 강조 */
const TeamCol = styled.span<{ $side: TeamSide; $won?: boolean }>`
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    padding: 0.4rem 0.5rem;
    border-radius: var(--radius-sm);
    background: ${({ theme, $side, $won }) => {
        const color = $side === 'blue' ? theme.teamBlue : theme.teamRed;
        return `color-mix(in srgb, ${color} ${$won ? 13 : 6}%, transparent)`;
    }};
    border: 1px solid ${({ theme, $side, $won }) => {
        const color = $side === 'blue' ? theme.teamBlue : theme.teamRed;
        return $won ? `color-mix(in srgb, ${color} 45%, transparent)` : 'transparent';
    }};
`;

const PickLine = styled.span`
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;

    .nick {
        font-size: 0.76rem;
        font-weight: 500;
        color: ${({ theme }) => theme.text};
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
`;

const Chevron = styled.span`
    color: ${({ theme }) => theme.placeholder};
    font-size: 0.7rem;
    text-align: center;
`;

const Expansion = styled.div`
    padding: 0.75rem;
    border-top: 1px solid ${({ theme }) => theme.cardBorder};
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
`;

const MetaLine = styled.p`
    font-size: 0.78rem;
    color: ${({ theme }) => theme.placeholder};
`;

const ScoreTeam = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
`;

const ScoreHead = styled.div<{ $side: TeamSide }>`
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    font-size: 0.85rem;

    strong { color: ${({ theme, $side }) => ($side === 'blue' ? theme.teamBlue : theme.teamRed)}; }
    span { color: ${({ theme }) => theme.placeholder}; font-size: 0.75rem; }
    small { margin-left: auto; color: ${({ theme }) => theme.placeholder}; }
`;

const PlayerLine = styled.div`
    display: grid;
    grid-template-columns: 42px minmax(90px, 1.2fr) 88px 52px 42px 48px 40px auto;
    gap: 0.5rem;
    align-items: center;
    padding: 0.3rem 0.4rem;
    background: ${({ theme }) => theme.body};
    border-radius: var(--radius-sm);

    @media (max-width: 700px) {
        grid-template-columns: 42px minmax(80px, 1fr) 80px 40px auto;
        .opt { display: none; }
    }
`;

const ChampCell = styled.span`
    position: relative;
    width: 34px;
    height: 34px;
`;

const LevelBadge = styled.span`
    position: absolute;
    right: -4px;
    bottom: -4px;
    min-width: 15px;
    padding: 0 2px;
    border-radius: 7px;
    background: ${({ theme }) => theme.nameBg};
    color: ${({ theme }) => theme.nameText};
    font-size: 0.6rem;
    font-weight: 700;
    text-align: center;
    line-height: 1.5;
`;

const NameCell = styled.span`
    display: flex;
    flex-direction: column;
    min-width: 0;
    font-size: 0.82rem;
    color: ${({ theme }) => theme.text};

    .main {
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    small {
        color: ${({ theme }) => theme.placeholder};
        font-size: 0.7rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
`;

const KdaCell = styled.span`
    display: flex;
    flex-direction: column;
    align-items: center;
    font-size: 0.82rem;
    color: ${({ theme }) => theme.text};

    .kda { font-weight: 700; }
    em {
        font-style: normal;
        color: ${({ theme }) => theme.teamRed};
    }
    small { color: ${({ theme }) => theme.placeholder}; font-size: 0.7rem; }
`;

const StatCell = styled.span`
    display: flex;
    flex-direction: column;
    align-items: center;
    font-size: 0.78rem;
    color: ${({ theme }) => theme.text};

    small { color: ${({ theme }) => theme.placeholder}; font-size: 0.65rem; }
`;

const ItemsCell = styled.span`
    display: flex;
    gap: 2px;
    justify-content: flex-end;
`;

const ExpansionActions = styled.div`
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 0.5rem;

    .err {
        margin-right: auto;
        font-size: 0.75rem;
        color: ${({ theme }) => theme.teamRed};
    }
`;

const Pager = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.85rem;
    color: ${({ theme }) => theme.placeholder};
`;
