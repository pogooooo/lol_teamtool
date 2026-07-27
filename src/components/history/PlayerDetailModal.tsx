import { useState } from 'react';
import type { ReactNode } from 'react';
import styled from 'styled-components';
import { CompactButton, ModalContent, ModalOverlay, PrimaryButton } from '../../App.styles';
import type { PlayerProfile } from '../../services/api';
import { savePlayerComment } from '../../services/api';
import { fieldLabel, formatFieldValue, VALUE_LABELS_KO } from '../../services/fieldLabels';
import type { DetailLang } from '../../services/fieldLabels';
import { useGameAssets } from '../../services/champions';
import { ChampionIcon, RuneIcon, SpellIcon } from './GameIcons';

/*
 * 참가자 상세보기 — 등록된 모든 계정의 Riot 정보를 전 필드 출력한다:
 * Account/Summoner-V4/League-V4 + 챔피언 숙련도(Mastery-V4) 전체 +
 * 최근 경기 경향(챔피언/포지션/키스톤 룬/스펠 — Match-V5 집계, 전 계정 합산).
 */

const LANG_KEY = 'lol_teamtool:detailLang';

const tierKo = (tier: string, lang: DetailLang) =>
    lang === 'ko' ? VALUE_LABELS_KO[tier] ?? tier : tier;

const POS_KO: Record<string, string> = {
    TOP: '탑', JUNGLE: '정글', MIDDLE: '미드', BOTTOM: '원딜', UTILITY: '서포터', UNKNOWN: '기타',
};

export const PlayerDetailModal = ({ profile, onClose }: {
    profile: PlayerProfile;
    onClose: () => void;
}) => {
    const [lang, setLang] = useState<DetailLang>(() =>
        localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'ko');

    const changeLang = (next: DetailLang) => {
        setLang(next);
        localStorage.setItem(LANG_KEY, next);
    };

    const { champNames, champKeys, runeNames, spellNames } = useGameAssets();
    const { player, scrim, accounts, recent, aggregate } = profile;

    // 참가자 코멘트 (자유 메모) — 편집 후 저장
    const [comment, setComment] = useState(profile.comment ?? '');
    const [commentBusy, setCommentBusy] = useState(false);
    const [commentStatus, setCommentStatus] = useState('');
    const dirty = comment.trim() !== (profile.comment ?? '').trim();
    const saveComment = async () => {
        setCommentBusy(true);
        setCommentStatus('');
        try {
            await savePlayerComment(player.id, comment.trim());
            profile.comment = comment.trim(); // 모달 유지 중 재편집 기준값 갱신
            setCommentStatus(lang === 'ko' ? '저장됨' : 'Saved');
            setTimeout(() => setCommentStatus(''), 1500);
        } catch {
            setCommentStatus(lang === 'ko' ? '저장 실패' : 'Failed');
        }
        setCommentBusy(false);
    };
    const scrimRate = scrim.games === 0 ? null : Math.round((scrim.wins / scrim.games) * 100);
    const rankedTotal = aggregate.totalRankedWins + aggregate.totalRankedLosses;
    const rankedRate = rankedTotal === 0 ? null : Math.round((aggregate.totalRankedWins / rankedTotal) * 100);

    const champLabelOf = (englishId: string) => champNames[englishId] ?? englishId;
    const champByNumeric = (numericId: number) => {
        const alias = champKeys[String(numericId)];
        return { iconId: alias ?? String(numericId), name: alias ? champLabelOf(alias) : `#${numericId}` };
    };
    const posLabel = (pos: string) => (lang === 'ko' ? POS_KO[pos] ?? pos : pos);

    // 재귀 키-값 렌더러 (배열/중첩 객체 전부 표시 — 데이터 누락 없음)
    const renderKv = (data: Record<string, unknown> | unknown[]): ReactNode => {
        const entries = Array.isArray(data)
            ? data.map((v, i) => [String(i + 1), v] as [string, unknown])
            : Object.entries(data);
        return (
            <KvGrid>
                {entries.map(([key, value]) =>
                    value !== null && typeof value === 'object' ? (
                        <Nested key={key}>
                            <summary>{fieldLabel(key, lang)}{Array.isArray(value) ? ` [${value.length}]` : ''}</summary>
                            {renderKv(value as Record<string, unknown> | unknown[])}
                        </Nested>
                    ) : (
                        <KvRow key={key}>
                            <span className="k" title={key}>{fieldLabel(key, lang)}</span>
                            <span className="v tabular">{formatFieldValue(key, value, lang)}</span>
                        </KvRow>
                    ))}
            </KvGrid>
        );
    };

    return (
        <ModalOverlay onClick={onClose}>
            <WideModal onClick={e => e.stopPropagation()}>
                <TopRow>
                    <h3>{player.displayName}</h3>
                    <RightControls>
                        <LangToggle $active={lang === 'ko'} onClick={() => changeLang('ko')}>한국어</LangToggle>
                        <LangToggle $active={lang === 'en'} onClick={() => changeLang('en')}>EN</LangToggle>
                        <CompactButton onClick={onClose}>{lang === 'ko' ? '닫기' : 'Close'}</CompactButton>
                    </RightControls>
                </TopRow>

                {/* 합산 요약 (모든 계정 통합) */}
                <SummaryRow>
                    <SummaryBox>
                        <span className="label">{lang === 'ko' ? '내전' : 'Scrims'}</span>
                        <span className="value tabular">
                            {scrim.games === 0 ? '-' : `${scrim.games}${lang === 'ko' ? '판' : 'G'} · ${scrimRate}%`}
                        </span>
                        {scrim.games > 0 && (
                            <small className="tabular">{scrim.wins}{lang === 'ko' ? '승 ' : 'W '}{scrim.games - scrim.wins}{lang === 'ko' ? '패' : 'L'}</small>
                        )}
                    </SummaryBox>
                    <SummaryBox>
                        <span className="label">{lang === 'ko' ? '랭크 합산 (전 계정)' : 'Ranked (all accounts)'}</span>
                        <span className="value tabular">
                            {rankedTotal === 0 ? '-' : `${aggregate.totalRankedWins}${lang === 'ko' ? '승' : 'W'} ${aggregate.totalRankedLosses}${lang === 'ko' ? '패' : 'L'}`}
                        </span>
                        {rankedRate !== null && <small className="tabular">{lang === 'ko' ? '승률' : 'WR'} {rankedRate}%</small>}
                    </SummaryBox>
                    <SummaryBox>
                        <span className="label">{lang === 'ko' ? '최고 티어' : 'Peak tier'}</span>
                        <span className="value">
                            {aggregate.bestTier
                                ? `${tierKo(aggregate.bestTier.tier, lang)} ${aggregate.bestTier.rank}`
                                : '-'}
                        </span>
                        {aggregate.bestTier && (
                            <small>{aggregate.bestTier.leaguePoints}LP · {aggregate.bestTier.riotId}</small>
                        )}
                    </SummaryBox>
                    <SummaryBox>
                        <span className="label">{lang === 'ko' ? '계정 / 최고 레벨' : 'Accounts / Max level'}</span>
                        <span className="value tabular">
                            {aggregate.accountCount}{lang === 'ko' ? '개' : ''} · Lv.{aggregate.maxSummonerLevel || '-'}
                        </span>
                    </SummaryBox>
                </SummaryRow>

                {/* 참가자 코멘트 — 자유 메모 (한 사람 당 하나, 그룹 공용) */}
                <CommentSection>
                    <div className="head">
                        <SubTitle style={{ margin: 0 }}>{lang === 'ko' ? '코멘트' : 'Comment'}</SubTitle>
                        {commentStatus && <em className="status">{commentStatus}</em>}
                    </div>
                    <CommentArea
                        value={comment}
                        maxLength={1000}
                        placeholder={lang === 'ko'
                            ? '이 참가자에 대한 메모 (예: 주 라인, 챔피언 폭, 성향 등) — 그룹원이 함께 봅니다.'
                            : 'Notes about this player — visible to your group.'}
                        onChange={e => setComment(e.target.value)}
                    />
                    <div className="actions">
                        <PrimaryButton onClick={saveComment} disabled={commentBusy || !dirty}>
                            {commentBusy ? (lang === 'ko' ? '저장 중...' : 'Saving...') : (lang === 'ko' ? '코멘트 저장' : 'Save')}
                        </PrimaryButton>
                    </div>
                </CommentSection>

                {/* 최근 경기 경향 — Match-V5 최근 매치 집계 (전 계정 합산) */}
                {recent.sampleSize > 0 && (
                    <RecentSection>
                        <SubTitle>
                            {lang === 'ko'
                                ? `최근 경기 경향 — 최근 ${recent.sampleSize}판 · 전 계정 합산 (Match-V5 집계)`
                                : `Recent trends — last ${recent.sampleSize} games, all accounts (from Match-V5)`}
                        </SubTitle>
                        <RecentGrid>
                            <RecentBox>
                                <h5>{lang === 'ko' ? '챔피언' : 'Champions'}</h5>
                                {recent.champions.slice(0, 8).map(c => (
                                    <RecentLine key={c.champion}>
                                        <ChampionIcon championId={c.champion} name={champLabelOf(c.champion)} size={20} />
                                        <span className="name">{champLabelOf(c.champion)}</span>
                                        <span className="stat tabular">
                                            {c.games}{lang === 'ko' ? '판' : 'G'} · {Math.round((c.wins / c.games) * 100)}%
                                        </span>
                                    </RecentLine>
                                ))}
                            </RecentBox>
                            <RecentBox>
                                <h5>{lang === 'ko' ? '키스톤 룬' : 'Keystones'}</h5>
                                {recent.keystones.slice(0, 4).map(k => (
                                    <RecentLine key={k.perk}>
                                        <RuneIcon runeId={k.perk} name={runeNames[String(k.perk)] ?? `#${k.perk}`} size={20} />
                                        <span className="name">{runeNames[String(k.perk)] ?? `#${k.perk}`}</span>
                                        <span className="stat tabular">{k.games}{lang === 'ko' ? '판' : 'G'}</span>
                                    </RecentLine>
                                ))}
                                <h5>{lang === 'ko' ? '스펠 조합' : 'Spells'}</h5>
                                {recent.spells.slice(0, 4).map(s => (
                                    <RecentLine key={s.pair}>
                                        <span className="icons">
                                            {s.pair.split('/').map(id => (
                                                <SpellIcon key={id} spellId={Number(id)} name={spellNames[id] ?? `#${id}`} size={18} />
                                            ))}
                                        </span>
                                        <span className="name">
                                            {s.pair.split('/').map(id => spellNames[id] ?? `#${id}`).join(' + ')}
                                        </span>
                                        <span className="stat tabular">{s.games}{lang === 'ko' ? '판' : 'G'}</span>
                                    </RecentLine>
                                ))}
                                <h5>{lang === 'ko' ? '포지션' : 'Positions'}</h5>
                                <PosChips>
                                    {recent.positions.map(p => (
                                        <span key={p.position}>{posLabel(p.position)} {p.games}{lang === 'ko' ? '판' : 'G'}</span>
                                    ))}
                                </PosChips>
                            </RecentBox>
                        </RecentGrid>
                    </RecentSection>
                )}

                {accounts.length === 0 && (
                    <Notice>{lang === 'ko' ? '등록된 롤 계정이 없습니다. 참가자 관리에서 계정을 등록해 주세요.' : 'No Riot accounts registered.'}</Notice>
                )}

                {/* 계정별 전 필드 */}
                {accounts.map(acc => (
                    <AccountSection key={acc.id}>
                        <AccountHead>
                            <strong>{acc.gameName}#{acc.tagLine}</strong>
                            {acc.isPrimary && <em>★ {lang === 'ko' ? '대표' : 'Primary'}</em>}
                        </AccountHead>

                        {acc.error && <ErrorText>{acc.error}</ErrorText>}

                        <SubTitle>{lang === 'ko' ? '계정 (Account-V1)' : 'Account-V1'}</SubTitle>
                        {renderKv({ gameName: acc.gameName, tagLine: acc.tagLine, puuid: acc.puuid, isPrimary: acc.isPrimary })}

                        {acc.summoner && (
                            <>
                                <SubTitle>{lang === 'ko' ? '소환사 (Summoner-V4)' : 'Summoner-V4'}</SubTitle>
                                {renderKv(acc.summoner)}
                            </>
                        )}

                        {acc.leagues.length > 0 ? (
                            acc.leagues.map((entry, i) => (
                                <div key={i}>
                                    <SubTitle>
                                        {lang === 'ko' ? '랭크 (League-V4)' : 'League-V4'} — {formatFieldValue('queueType', entry.queueType, lang)}
                                    </SubTitle>
                                    {renderKv(entry)}
                                </div>
                            ))
                        ) : (
                            !acc.error && (
                                <Notice>{lang === 'ko' ? '랭크 기록이 없습니다 (언랭크).' : 'No ranked entries (unranked).'}</Notice>
                            )
                        )}

                        {acc.masteries.length > 0 && (
                            <>
                                <SubTitle>
                                    {lang === 'ko' ? '챔피언 숙련도 (Champion-Mastery-V4)' : 'Champion-Mastery-V4'}
                                    {acc.masteryScore != null && (
                                        <em> — {lang === 'ko' ? '총점' : 'Score'} {acc.masteryScore} · {acc.masteries.length}{lang === 'ko' ? '챔피언' : ' champs'}</em>
                                    )}
                                </SubTitle>
                                <MasteryList>
                                    {acc.masteries.map((raw, i) => {
                                        const m = raw as { championId?: number; championLevel?: number; championPoints?: number; lastPlayTime?: number };
                                        const champ = champByNumeric(m.championId ?? 0);
                                        return (
                                            <MasteryRow key={m.championId ?? i}>
                                                <ChampionIcon championId={champ.iconId} name={champ.name} size={22} />
                                                <span className="name">{champ.name}</span>
                                                <span className="lv tabular">Lv.{m.championLevel ?? '-'}</span>
                                                <span className="pts tabular">{(m.championPoints ?? 0).toLocaleString()}</span>
                                                <span className="last">
                                                    {m.lastPlayTime
                                                        ? new Date(m.lastPlayTime).toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US')
                                                        : '-'}
                                                </span>
                                            </MasteryRow>
                                        );
                                    })}
                                </MasteryList>
                                <Nested>
                                    <summary>{lang === 'ko' ? '숙련도 원본 데이터 (전 필드)' : 'Raw mastery data (all fields)'}</summary>
                                    {renderKv(acc.masteries)}
                                </Nested>
                            </>
                        )}
                    </AccountSection>
                ))}
            </WideModal>
        </ModalOverlay>
    );
};

const WideModal = styled(ModalContent)`
    width: min(760px, 95vw);
    max-height: 88vh;
    overflow-y: auto;
    text-align: left;

    h3 { margin: 0; font-size: 1.05rem; }
`;

const TopRow = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid ${({ theme }) => theme.cardBorder};
    margin-bottom: 0.75rem;
`;

const RightControls = styled.div`
    display: flex;
    align-items: center;
    gap: 0.35rem;
`;

const LangToggle = styled.button<{ $active?: boolean }>`
    padding: 0.2rem 0.55rem;
    border: 1px solid ${({ theme, $active }) => ($active ? theme.accent : theme.cardBorder)};
    border-radius: 999px;
    background: ${({ theme, $active }) => ($active ? theme.accentGradient : 'transparent')};
    color: ${({ theme, $active }) => ($active ? theme.accentText : theme.placeholder)};
    font-size: 0.72rem;
    font-weight: 700;
    cursor: pointer;
`;

const SummaryRow = styled.div`
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
    margin-bottom: 1rem;

    @media (max-width: 640px) {
        grid-template-columns: 1fr 1fr;
    }
`;

const SummaryBox = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    padding: 0.55rem 0.4rem;
    background: ${({ theme }) => theme.body};
    border-radius: var(--radius-md);
    text-align: center;

    .label { font-size: 0.7rem; color: ${({ theme }) => theme.placeholder}; }
    .value { font-size: 0.95rem; font-weight: 800; color: ${({ theme }) => theme.accent}; }
    small { font-size: 0.68rem; color: ${({ theme }) => theme.placeholder}; }
`;

const AccountSection = styled.section`
    margin-bottom: 1rem;
    padding: 0.6rem 0.7rem;
    border: 1px solid ${({ theme }) => theme.cardBorder};
    border-radius: var(--radius-md);
`;

const AccountHead = styled.div`
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    margin-bottom: 0.4rem;

    strong { color: ${({ theme }) => theme.text}; font-size: 0.95rem; }
    em {
        font-style: normal;
        font-size: 0.72rem;
        font-weight: 700;
        color: ${({ theme }) => theme.accent};
    }
`;

const SubTitle = styled.h5`
    font-size: 0.75rem;
    color: ${({ theme }) => theme.accent};
    margin: 0.5rem 0 0.25rem;

    em {
        font-style: normal;
        color: ${({ theme }) => theme.placeholder};
        font-weight: 600;
    }
`;

const CommentSection = styled.section`
    margin-bottom: 1rem;
    padding: 0.6rem 0.7rem;
    border: 1px solid ${({ theme }) => theme.cardBorder};
    border-radius: var(--radius-md);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    .head {
        display: flex;
        align-items: center;
        gap: 0.5rem;

        .status { font-style: normal; font-size: 0.75rem; color: ${({ theme }) => theme.accent}; font-weight: 700; }
    }

    .actions { display: flex; justify-content: flex-end; }
`;

const CommentArea = styled.textarea`
    width: 100%;
    min-height: 70px;
    resize: vertical;
    padding: 0.55rem 0.7rem;
    font-family: inherit;
    font-size: 0.88rem;
    line-height: 1.5;
    color: ${({ theme }) => theme.text};
    background: ${({ theme }) => theme.body};
    border: 1px solid ${({ theme }) => theme.cardBorder};
    border-radius: var(--radius-md);

    &::placeholder { color: ${({ theme }) => theme.placeholder}; }
    &:focus { outline: 1px solid ${({ theme }) => theme.accent}; }
`;

const RecentSection = styled.section`
    margin-bottom: 1rem;
    padding: 0.6rem 0.7rem;
    border: 1px solid ${({ theme }) => theme.cardBorder};
    border-radius: var(--radius-md);
`;

const RecentGrid = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;

    @media (max-width: 640px) {
        grid-template-columns: 1fr;
    }
`;

const RecentBox = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.25rem;

    h5 {
        font-size: 0.7rem;
        color: ${({ theme }) => theme.placeholder};
        margin: 0.3rem 0 0.1rem;
    }
`;

const RecentLine = styled.div`
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.2rem 0.4rem;
    background: ${({ theme }) => theme.body};
    border-radius: var(--radius-sm);
    font-size: 0.76rem;
    color: ${({ theme }) => theme.text};

    .icons { display: flex; gap: 2px; }
    .name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .stat {
        margin-left: auto;
        color: ${({ theme }) => theme.placeholder};
        font-weight: 600;
        flex-shrink: 0;
    }
`;

const PosChips = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;

    span {
        padding: 0.15rem 0.5rem;
        border: 1px solid ${({ theme }) => theme.cardBorder};
        border-radius: 999px;
        font-size: 0.72rem;
        color: ${({ theme }) => theme.text};
    }
`;

const MasteryList = styled.div`
    max-height: 240px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 0.3rem;
`;

const MasteryRow = styled.div`
    display: grid;
    grid-template-columns: 22px minmax(80px, 1fr) 48px 76px 84px;
    gap: 0.5rem;
    align-items: center;
    padding: 0.18rem 0.45rem;
    background: ${({ theme }) => theme.body};
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    color: ${({ theme }) => theme.text};

    .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lv { color: ${({ theme }) => theme.accent}; font-weight: 700; }
    .pts { text-align: right; font-weight: 600; }
    .last { text-align: right; color: ${({ theme }) => theme.placeholder}; font-size: 0.7rem; }
`;

const Notice = styled.p`
    font-size: 0.78rem;
    color: ${({ theme }) => theme.placeholder};
`;

const ErrorText = styled.p`
    font-size: 0.78rem;
    color: ${({ theme }) => theme.teamRed};
    margin-bottom: 0.3rem;
`;

const KvGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(225px, 1fr));
    gap: 0.15rem 0.6rem;
`;

const KvRow = styled.div`
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 0.76rem;
    padding: 0.18rem 0.45rem;
    background: ${({ theme }) => theme.body};
    border-radius: var(--radius-sm);
    min-width: 0;

    .k {
        color: ${({ theme }) => theme.placeholder};
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .v {
        color: ${({ theme }) => theme.text};
        font-weight: 600;
        text-align: right;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 58%;
    }
`;

const Nested = styled.details`
    grid-column: 1 / -1;
    border: 1px solid ${({ theme }) => theme.cardBorder};
    border-radius: var(--radius-sm);
    padding: 0.3rem 0.5rem;

    summary {
        cursor: pointer;
        font-size: 0.76rem;
        font-weight: 700;
        color: ${({ theme }) => theme.text};
    }

    & > div { margin-top: 0.3rem; }
`;
