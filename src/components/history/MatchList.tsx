import { useState } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { Card, CompactButton } from '../../App.styles';
import { computeDuoStats } from '../../services/matchStats';
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
    const [partnerId, setPartnerId] = useState('');
    const [pairMode, setPairMode] = useState<'same' | 'vs'>('same');
    const [champion, setChampion] = useState('');
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
            // 챔피언 필터: 참가자가 선택돼 있으면 "그 참가자가 그 챔피언을 한 판"
            if (champion && pt.champion !== champion) return false;
            // 듀오/맞대결 필터: 두 번째 참가자가 같은 판에 있고 관계(같은 팀/상대 팀)가 일치해야 한다
            if (partnerId) {
                const pp = m.participants.find(p => p.playerId === partnerId);
                if (!pp) return false;
                if (pairMode === 'same' && pp.side !== pt.side) return false;
                if (pairMode === 'vs' && pp.side === pt.side) return false;
            }
        } else if (champion && !m.participants.some(p => p.champion === champion)) {
            // 참가자 미선택 시: "누구든 그 챔피언이 나온 판"
            return false;
        }
        return true;
    });

    /* --- 검색 결과 요약 (전체 필터 기준 승률) ---
     * 참가자 선택 → 그 참가자 기준 승률
     * 챔피언만 선택 → 그 챔피언 기준 승률 (블라인드 픽 미러전 대비 등장 인스턴스 단위 집계)
     * 둘 다 없음 → 블루팀 승률 참고 표시
     */
    let summaryGames = filtered.length;
    let summaryWins = 0;
    if (playerId) {
        summaryWins = filtered.filter(m => m.participants.find(p => p.playerId === playerId)?.side === m.winningSide).length;
    } else if (champion) {
        const instances = filtered.flatMap(m =>
            m.participants.filter(p => p.champion === champion).map(p => p.side === m.winningSide));
        summaryGames = instances.length;
        summaryWins = instances.filter(Boolean).length;
    } else {
        summaryWins = filtered.filter(m => m.winningSide === 'blue').length;
    }
    const summaryRate = summaryGames === 0 ? 0 : Math.round((summaryWins / summaryGames) * 100);
    const showRate = Boolean(playerId || champion); // 승/패/승률 배지를 보여줄 조건

    const nameById = (id: string) => archive.players.find(p => p.id === id)?.displayName ?? '?';
    const conditionText = [
        playerId && nameById(playerId),
        partnerId && `${pairMode === 'same' ? '+' : 'vs'} ${nameById(partnerId)}`,
        champion && champLabel(champion),
        result !== 'all' && (result === 'win' ? '승리한 판' : '패배한 판'),
    ].filter(Boolean).join(' · ');

    /* 챔피언 옵션: 기록에 실제로 등장한 챔피언만 (참가자 선택 시 그 참가자의 픽으로 좁힌다) */
    const champMap = new Map<string, string>();
    archive.matches.forEach(m => m.participants.forEach(pt => {
        if (!playerId || pt.playerId === playerId) champMap.set(pt.champion, champLabel(pt.champion));
    }));
    const champOptions = [...champMap.entries()]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label));

    /* 듀오 승률 랭킹 (전체 기록 기준) — 우측 여백 패널에 표시 */
    const duoStats = computeDuoStats(archive.matches, archive.players);

    const hasFilter = Boolean(from || to || playerId || partnerId || champion || result !== 'all');
    const resetFilters = () => {
        setFrom(''); setTo(''); setPlayerId(''); setResult('all');
        setPartnerId(''); setPairMode('same'); setChampion(''); setPage(1);
    };

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
            <HeadRow>
                <h3>내전 목록</h3>
                <CountChip className="tabular">{filtered.length}판</CountChip>
            </HeadRow>

            <FilterBar>
                <DatePicker value={from} onChange={v => { setFrom(v); setPage(1); }} placeholder="시작일" />
                <DatePicker value={to} onChange={v => { setTo(v); setPage(1); }} placeholder="종료일" />
                <Select
                    value={playerId}
                    onChange={v => {
                        setPlayerId(v);
                        setResult('all');
                        setChampion('');
                        if (!v || v === partnerId) setPartnerId('');
                        setPage(1);
                    }}
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
                <Select
                    value={partnerId}
                    onChange={v => { setPartnerId(v); setPage(1); }}
                    disabled={!playerId}
                    title={playerId ? '함께 검색할 두 번째 참가자' : '참가자를 먼저 선택하세요'}
                    options={[
                        { value: '', label: '함께한 참가자' },
                        ...archive.players.filter(p => p.id !== playerId).map(p => ({ value: p.id, label: p.displayName })),
                    ]}
                />
                <Select
                    value={pairMode}
                    onChange={v => { setPairMode(v as 'same' | 'vs'); setPage(1); }}
                    disabled={!partnerId}
                    title={partnerId ? '' : '함께한 참가자를 먼저 선택하세요'}
                    options={[
                        { value: 'same', label: '같은 팀으로' },
                        { value: 'vs', label: '상대 팀으로' },
                    ]}
                />
                <Select
                    value={champion}
                    onChange={v => { setChampion(v); setPage(1); }}
                    title={playerId ? '선택한 참가자가 플레이한 챔피언' : '누구든 이 챔피언이 나온 판'}
                    options={[{ value: '', label: '챔피언 전체' }, ...champOptions]}
                />
                <ResetButton onClick={resetFilters} disabled={!hasFilter}>필터 초기화</ResetButton>
            </FilterBar>

            {archive.matches.length > 0 && (
                <SummaryBar>
                    <b className="tabular">{summaryGames}판</b>
                    {showRate ? (
                        summaryGames > 0 && (
                            <>
                                <span className="tabular win">{summaryWins}승</span>
                                <span className="tabular lose">{summaryGames - summaryWins}패</span>
                                <RateBadge $good={summaryRate >= 50} className="tabular">승률 {summaryRate}%</RateBadge>
                            </>
                        )
                    ) : (
                        summaryGames > 0 && (
                            <span className="hint tabular">블루팀 승률 {summaryRate}%</span>
                        )
                    )}
                    {conditionText && <span className="cond">{conditionText}</span>}
                </SummaryBar>
            )}

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
                                <MatchRow $expanded={expanded} $side={m.winningSide} onClick={() => setExpandedId(expanded ? null : m.id)}>
                                    <MetaCol>
                                        <WinBadge $side={m.winningSide}>
                                            {m.winningSide === 'blue' ? '블루 승' : '레드 승'}
                                        </WinBadge>
                                        <span className="sub">{fmtDate(m.gameStart)} · {Math.floor(m.durationSec / 60)}분</span>
                                        {m.source === 'demo' && <DemoBadge>모의</DemoBadge>}
                                    </MetaCol>

                                    <TeamPicks $side="blue">
                                        {blue.map(pt => (
                                            <Pick key={pt.puuid + pt.position} $won={m.winningSide === 'blue'}>
                                                <IconRing $side="blue" $won={m.winningSide === 'blue'}>
                                                    <ChampionIcon championId={pt.champion} name={champLabel(pt.champion)} size={30} />
                                                </IconRing>
                                                <span className="nick">{nickOf(pt)}</span>
                                            </Pick>
                                        ))}
                                    </TeamPicks>

                                    <ScoreCol className="tabular" aria-label="킬 스코어">
                                        <b className={m.winningSide === 'blue' ? 'win blue' : 'blue'}>{blueKills}</b>
                                        <span className="sep">:</span>
                                        <b className={m.winningSide === 'red' ? 'win red' : 'red'}>{redKills}</b>
                                    </ScoreCol>

                                    <TeamPicks $side="red">
                                        {red.map(pt => (
                                            <Pick key={pt.puuid + pt.position} $won={m.winningSide === 'red'}>
                                                <IconRing $side="red" $won={m.winningSide === 'red'}>
                                                    <ChampionIcon championId={pt.champion} name={champLabel(pt.champion)} size={30} />
                                                </IconRing>
                                                <span className="nick">{nickOf(pt)}</span>
                                            </Pick>
                                        ))}
                                    </TeamPicks>

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

            {/* 초와이드 화면 전용 사이드 패널 — 본문(800px)·광고(±560px) 바깥 여백을 활용한다 */}
            {createPortal(
                <>
                    <SideFloat $pos="left">
                        <h4>검색 결과</h4>
                        <BigStat className="tabular">{summaryGames}<small>판</small></BigStat>
                        {showRate && summaryGames > 0 && (
                            <>
                                <SideLine>
                                    <span className="tabular win">{summaryWins}승</span>
                                    <span className="tabular lose">{summaryGames - summaryWins}패</span>
                                </SideLine>
                                <RateBadge $good={summaryRate >= 50} className="tabular">승률 {summaryRate}%</RateBadge>
                            </>
                        )}
                        <p className="cond">{conditionText || '필터를 선택하면 조건별 승률이 표시됩니다.'}</p>
                    </SideFloat>
                    <SideFloat $pos="right">
                        <h4>듀오 승률 랭킹</h4>
                        {duoStats.length === 0 ? (
                            <p className="cond">같은 팀으로 2판 이상 뛴 듀오가 생기면 표시됩니다.</p>
                        ) : (
                            duoStats.slice(0, 10).map((d, i) => (
                                <DuoLine key={d.key}>
                                    <span className="rank tabular">{i + 1}</span>
                                    <span className="names">{d.aName} · {d.bName}</span>
                                    <span className="rate tabular">{d.winRate}%</span>
                                    <small className="tabular">{d.games}판</small>
                                </DuoLine>
                            ))
                        )}
                    </SideFloat>
                </>,
                document.body,
            )}
        </ListCard>
    );
};

const ListCard = styled(Card)`
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-height: 320px;
`;

const HeadRow = styled.div`
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid ${({ theme }) => theme.cardBorder};

    h3 {
        font-size: 1.1rem;
        color: ${({ theme }) => theme.text};
    }
`;

const CountChip = styled.span`
    padding: 0.1rem 0.55rem;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 700;
    color: ${({ theme }) => theme.accent};
    background: ${({ theme }) => theme.body};
    border: 1px solid ${({ theme }) => theme.cardBorder};
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

const ResetButton = styled.button`
    padding: 0.4rem 0.6rem;
    border: 1px solid ${({ theme }) => theme.cardBorder};
    border-radius: var(--radius-md);
    background: transparent;
    color: ${({ theme }) => theme.placeholder};
    font-size: 0.8rem;
    cursor: pointer;

    &:hover:not(:disabled) { background: ${({ theme }) => theme.dragOver}; color: ${({ theme }) => theme.text}; }
    &:disabled { opacity: 0.4; cursor: default; }
`;

/* 필터 결과 요약 — 조건이 걸린 전체 검색 결과의 승률을 항상 보여준다 */
const SummaryBar = styled.div`
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
    padding: 0.45rem 0.7rem;
    border-radius: var(--radius-md);
    background: ${({ theme }) => theme.body};
    border: 1px solid ${({ theme }) => theme.cardBorder};
    font-size: 0.82rem;
    color: ${({ theme }) => theme.text};

    b { font-size: 0.95rem; }
    .win { color: ${({ theme }) => theme.teamBlue}; font-weight: 700; }
    .lose { color: ${({ theme }) => theme.teamRed}; font-weight: 700; }
    .hint { color: ${({ theme }) => theme.placeholder}; }
    .cond {
        margin-left: auto;
        font-size: 0.75rem;
        color: ${({ theme }) => theme.placeholder};
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
`;

const RateBadge = styled.span<{ $good: boolean }>`
    padding: 0.12rem 0.55rem;
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 800;
    color: #FFFFFF;
    background: ${({ theme, $good }) => ($good ? theme.teamBlue : theme.teamRed)};
`;

/* 본문 밖 좌우 여백의 플로팅 패널 — 광고(중앙 ±573px)와 겹치지 않도록 1640px 이상에서만 노출 */
const SideFloat = styled.aside<{ $pos: 'left' | 'right' }>`
    display: none;
    position: fixed;
    top: 96px;
    ${({ $pos }) => ($pos === 'left' ? 'right: calc(50% + 592px);' : 'left: calc(50% + 592px);')}
    width: 212px;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.8rem 0.9rem;
    border-radius: var(--radius-lg);
    background: ${({ theme }) => theme.card};
    border: 1px solid ${({ theme }) => theme.cardBorder};

    h4 {
        font-size: 0.85rem;
        color: ${({ theme }) => theme.text};
        padding-bottom: 0.4rem;
        border-bottom: 1px solid ${({ theme }) => theme.cardBorder};
    }

    .cond { font-size: 0.75rem; color: ${({ theme }) => theme.placeholder}; line-height: 1.5; }
    .win { color: ${({ theme }) => theme.teamBlue}; font-weight: 700; }
    .lose { color: ${({ theme }) => theme.teamRed}; font-weight: 700; }

    @media (min-width: 1640px) {
        display: flex;
    }
`;

const BigStat = styled.span`
    font-size: 1.8rem;
    font-weight: 800;
    color: ${({ theme }) => theme.accent};

    small { font-size: 0.85rem; font-weight: 600; margin-left: 2px; color: ${({ theme }) => theme.placeholder}; }
`;

const SideLine = styled.div`
    display: flex;
    gap: 0.6rem;
    font-size: 0.85rem;
`;

const DuoLine = styled.div`
    display: grid;
    grid-template-columns: 16px 1fr auto auto;
    gap: 0.35rem;
    align-items: baseline;
    font-size: 0.78rem;
    color: ${({ theme }) => theme.text};

    .rank { font-weight: 800; color: ${({ theme }) => theme.placeholder}; }
    .names { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rate { font-weight: 800; color: ${({ theme }) => theme.accent}; }
    small { color: ${({ theme }) => theme.placeholder}; font-size: 0.68rem; }
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

/* 승리 팀 방향에서 팀 색이 번지는 그라데이션 카드 — 호버 시 살짝 떠오른다 */
const RowWrap = styled.div<{ $side: TeamSide }>`
    border: 1px solid ${({ theme }) => theme.cardBorder};
    border-radius: var(--radius-lg);
    overflow: hidden;
    transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;

    &:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.14);
        border-color: ${({ theme, $side }) =>
            `color-mix(in srgb, ${$side === 'blue' ? theme.teamBlue : theme.teamRed} 45%, ${theme.cardBorder})`};
    }
`;

const MatchRow = styled.button<{ $expanded?: boolean; $side: TeamSide }>`
    width: 100%;
    display: grid;
    grid-template-columns: 92px 1fr auto 1fr 16px;
    gap: 0.6rem;
    align-items: center;
    padding: 0.7rem 0.8rem;
    border: none;
    color: ${({ theme }) => theme.text};
    cursor: pointer;
    text-align: left;
    background: ${({ theme, $expanded, $side }) => {
        const color = $side === 'blue' ? theme.teamBlue : theme.teamRed;
        const base = $expanded ? theme.dragOver : theme.body;
        const dir = $side === 'blue' ? '90deg' : '270deg';
        return `linear-gradient(${dir}, color-mix(in srgb, ${color} 13%, ${base}) 0%, ${base} 50%)`;
    }};

    @media (max-width: 640px) {
        grid-template-columns: 70px 1fr auto 1fr;
        gap: 0.35rem;
        padding: 0.55rem 0.55rem;
    }
`;

const MetaCol = styled.span`
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;

    .sub { font-size: 0.72rem; color: ${({ theme }) => theme.placeholder}; }
`;

/* 중앙 킬 스코어 — 승리 팀 숫자만 선명하게 */
const ScoreCol = styled.span`
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
    padding: 0 0.3rem;
    font-size: 1.4rem;

    .sep { color: ${({ theme }) => theme.placeholder}; font-size: 0.9rem; }
    b { font-weight: 800; opacity: 0.45; }
    b.blue { color: ${({ theme }) => theme.teamBlue}; }
    b.red { color: ${({ theme }) => theme.teamRed}; }
    b.win { opacity: 1; }

    @media (max-width: 640px) {
        font-size: 1.05rem;
    }
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

/* 팀별 가로 아바타 스택 — 양 팀 픽이 중앙 스코어를 향해 정렬된다 */
const TeamPicks = styled.span<{ $side: TeamSide }>`
    display: flex;
    justify-content: ${({ $side }) => ($side === 'blue' ? 'flex-end' : 'flex-start')};
    gap: 0.4rem;
    min-width: 0;
    overflow: hidden;

    @media (max-width: 640px) {
        gap: 2px;

        /* 모바일은 아이콘만 축소 표시 */
        img, span[title] { width: 24px; height: 24px; }
        .nick { display: none; }
    }
`;

/* 챔피언 + 닉네임 세로 배치 — 패배 팀은 살짝 흐리게. 공간이 좁으면 잘리는 대신 줄어든다 */
const Pick = styled.span<{ $won: boolean }>`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    flex: 0 1 54px;
    min-width: 38px;
    opacity: ${({ $won }) => ($won ? 1 : 0.68)};

    .nick {
        width: 100%;
        font-size: 0.67rem;
        font-weight: ${({ $won }) => ($won ? 600 : 500)};
        color: ${({ theme }) => theme.text};
        text-align: center;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
`;

/* 승리 팀 챔피언에 팀 색 링 — 링이 레이아웃 안에 포함되도록 padding 방식 (box-shadow는 overflow에 잘림) */
const IconRing = styled.span<{ $side: TeamSide; $won: boolean }>`
    display: inline-flex;
    padding: 2px;
    border-radius: 50%;
    line-height: 0;
    background: ${({ theme, $side, $won }) =>
        $won ? ($side === 'blue' ? theme.teamBlue : theme.teamRed) : 'transparent'};
`;

const Chevron = styled.span`
    color: ${({ theme }) => theme.placeholder};
    font-size: 0.7rem;
    text-align: center;

    @media (max-width: 640px) {
        display: none;
    }
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
