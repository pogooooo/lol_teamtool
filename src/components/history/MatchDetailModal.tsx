import { useState } from 'react';
import styled from 'styled-components';
import { CompactButton, ModalContent, ModalOverlay } from '../../App.styles';
import type { MatchFullDetail } from '../../services/api';
import { useGameAssets } from '../../services/champions';
import {
    PARTICIPANT_CATEGORIES, fieldLabel, formatFieldValue,
} from '../../services/fieldLabels';
import type { DetailLang } from '../../services/fieldLabels';
import { ChampionIcon, RuneIcon } from './GameIcons';

/*
 * "상세정보 보기" — 저장된 원본 데이터 전체를 사용자 관점으로 표시한다.
 * 데이터는 하나도 빼지 않는다: 사전에 없는 필드는 원문으로, 분류 안 된 필드는 "기타"로.
 * 언어 토글(한국어/EN)로 필드명을 원문으로도 볼 수 있다.
 */

type Tab = 'info' | 'teams' | 'events' | 'players';

const LANG_KEY = 'lol_teamtool:detailLang';

interface TeamRaw {
    teamId?: number;
    win?: boolean;
    bans?: { championId: number; pickTurn: number }[];
    objectives?: Record<string, { first?: boolean; kills?: number }>;
    [key: string]: unknown;
}

const fmtFullDate = (ts: number, lang: DetailLang) =>
    new Date(ts).toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object';

/** 라벨 사전을 적용한 재귀 트리 (룬 등 중첩 구조용) */
const LabeledTree = ({ data, lang }: { data: unknown; lang: DetailLang }) => {
    if (!isPlainObject(data)) return <em>{String(data ?? '-')}</em>;
    const entries = Array.isArray(data)
        ? data.map((v, i) => [String(i + 1), v] as [string, unknown])
        : Object.entries(data);
    return (
        <KvGrid>
            {entries.map(([key, value]) =>
                isPlainObject(value) ? (
                    <Nested key={key} open>
                        <summary>{fieldLabel(key, lang)}</summary>
                        <LabeledTree data={value} lang={lang} />
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

export const MatchDetailModal = ({ detail, playerName, onClose }: {
    detail: MatchFullDetail;
    playerName: (playerId: string | null) => string | null;
    onClose: () => void;
}) => {
    const [lang, setLang] = useState<DetailLang>(() =>
        localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'ko');
    const [tab, setTab] = useState<Tab>('info');
    const [selected, setSelected] = useState(0);
    const { champNames, champKeys, runeNames } = useGameAssets();

    const changeLang = (next: DetailLang) => {
        setLang(next);
        localStorage.setItem(LANG_KEY, next);
    };

    const champLabel = (id: string) => champNames[id] ?? id;
    const info = detail.rawInfo;
    const teams = (info && Array.isArray((info as { teams?: unknown }).teams)
        ? (info as { teams: TeamRaw[] }).teams
        : null);
    const infoEntries = info
        ? Object.entries(info).filter(([k]) => k !== 'participants' && k !== 'teams')
        : null;
    const participant = detail.participants[selected];

    const TABS: { id: Tab; ko: string; en: string }[] = [
        { id: 'info', ko: '매치 정보', en: 'Match' },
        { id: 'teams', ko: '팀', en: 'Teams' },
        { id: 'events', ko: '로비 이벤트', en: 'Lobby' },
        { id: 'players', ko: '참가자 지표', en: 'Players' },
    ];

    /* --- 룬: 아이콘 이미지로 표시 (구조가 다르면 트리 폴백) --- */
    const renderRunes = (perksRaw: Record<string, unknown>) => {
        const styles = Array.isArray(perksRaw.styles) ? perksRaw.styles as {
            description?: string;
            style?: number;
            selections?: { perk?: number }[];
        }[] : [];
        const statPerks = isPlainObject(perksRaw.statPerks)
            ? perksRaw.statPerks as Record<string, number>
            : null;

        if (styles.length === 0) return <LabeledTree data={perksRaw} lang={lang} />;

        const runeName = (id?: number) =>
            id == null ? '-' : runeNames[String(id)] ?? `#${id}`;

        return (
            <RuneRows>
                {styles.map((style, i) => (
                    <RuneRow key={i}>
                        <span className="slot">
                            {fieldLabel(style.description ?? (i === 0 ? 'primaryStyle' : 'subStyle'), lang)}
                        </span>
                        {style.style != null && (
                            <RuneIcon runeId={style.style} name={runeName(style.style)} size={26} />
                        )}
                        <span className="sep" />
                        {(style.selections ?? []).map((sel, j) =>
                            sel.perk != null && (
                                <RuneIcon key={j} runeId={sel.perk} name={runeName(sel.perk)} size={24} />
                            ))}
                    </RuneRow>
                ))}
                {statPerks && (
                    <RuneRow>
                        <span className="slot">{fieldLabel('statPerks', lang)}</span>
                        {Object.entries(statPerks).map(([key, id]) => (
                            <RuneIcon
                                key={key}
                                runeId={id}
                                name={`${fieldLabel(key, lang)} · ${runeName(id)}`}
                                size={20}
                            />
                        ))}
                    </RuneRow>
                )}
            </RuneRows>
        );
    };

    /* --- 참가자 지표: 카테고리 분류 (누락 없음) --- */
    const renderPlayerStats = () => {
        const raw = participant?.raw;
        if (!raw) return <Notice>{lang === 'ko' ? '이 참가자의 저장된 원본 지표가 없습니다.' : 'No raw stats stored for this participant.'}</Notice>;

        const used = new Set<string>(['perks', 'challenges']);
        const sections: { title: string; rows: [string, unknown][] }[] = [];

        PARTICIPANT_CATEGORIES.forEach(cat => {
            const rows = cat.keys
                .filter(key => key in raw)
                .map(key => [key, raw[key]] as [string, unknown]);
            rows.forEach(([key]) => used.add(key));
            if (rows.length > 0) sections.push({ title: lang === 'ko' ? cat.ko : cat.en, rows });
        });

        // 분류 안 된 나머지 원시값 → "기타" (데이터 누락 방지)
        const leftovers = Object.entries(raw)
            .filter(([key, value]) => !used.has(key) && !isPlainObject(value));
        if (leftovers.length > 0) {
            sections.push({ title: lang === 'ko' ? '기타' : 'Others', rows: leftovers });
        }
        // 분류 안 된 중첩 객체도 표시
        const leftoverObjects = Object.entries(raw)
            .filter(([key, value]) => !used.has(key) && isPlainObject(value));

        return (
            <>
                {sections.map(section => (
                    <Section key={section.title}>
                        <h4>{section.title}</h4>
                        <KvGrid>
                            {section.rows.map(([key, value]) => (
                                <KvRow key={key}>
                                    <span className="k" title={key}>{fieldLabel(key, lang)}</span>
                                    <span className="v tabular">{formatFieldValue(key, value, lang)}</span>
                                </KvRow>
                            ))}
                        </KvGrid>
                    </Section>
                ))}

                {isPlainObject(raw.perks) && (
                    <Section>
                        <h4>{lang === 'ko' ? '룬' : 'Runes'}</h4>
                        {renderRunes(raw.perks)}
                    </Section>
                )}

                {isPlainObject(raw.challenges) && (
                    <Section>
                        <h4>{lang === 'ko' ? '파생 지표' : 'Challenges'}</h4>
                        <KvGrid>
                            {Object.entries(raw.challenges as Record<string, unknown>)
                                .filter(([, v]) => !isPlainObject(v))
                                .map(([key, value]) => (
                                    <KvRow key={key}>
                                        <span className="k" title={key}>{fieldLabel(key, lang)}</span>
                                        <span className="v tabular">{formatFieldValue(key, value, lang)}</span>
                                    </KvRow>
                                ))}
                        </KvGrid>
                    </Section>
                )}

                {leftoverObjects.map(([key, value]) => (
                    <Section key={key}>
                        <h4>{fieldLabel(key, lang)}</h4>
                        <LabeledTree data={value} lang={lang} />
                    </Section>
                ))}
            </>
        );
    };

    /* --- 팀 탭 --- */
    const renderTeams = () => {
        if (!teams) {
            return <Notice>{lang === 'ko' ? '팀 데이터가 없는 매치입니다.' : 'No team data for this match.'}</Notice>;
        }
        return teams.map((team, ti) => {
            const side = team.teamId === 100 ? 'blue' : 'red';
            const extras = Object.entries(team)
                .filter(([k, v]) => !['teamId', 'win', 'bans', 'objectives'].includes(k) && !isPlainObject(v));
            return (
                <Section key={ti}>
                    <TeamHead $side={side}>
                        <strong>{side === 'blue' ? (lang === 'ko' ? '블루팀' : 'Blue') : (lang === 'ko' ? '레드팀' : 'Red')}</strong>
                        <span>{team.win ? (lang === 'ko' ? '승리' : 'Win') : (lang === 'ko' ? '패배' : 'Loss')}</span>
                    </TeamHead>

                    {Array.isArray(team.bans) && team.bans.length > 0 && (
                        <>
                            <SubTitle>{fieldLabel('bans', lang)}</SubTitle>
                            <BanRow>
                                {team.bans.map((ban, i) => {
                                    if (ban.championId === -1) {
                                        return (
                                            <BanFallback key={i} title={lang === 'ko' ? '밴 없음' : 'No ban'}>—</BanFallback>
                                        );
                                    }
                                    // 매핑이 없어도 숫자 ID로 이미지 시도 (서버가 CommunityDragon에서 숫자 ID도 처리)
                                    const alias = champKeys[String(ban.championId)];
                                    const iconId = alias ?? String(ban.championId);
                                    const name = alias ? champLabel(alias) : `#${ban.championId}`;
                                    return <ChampionIcon key={i} championId={iconId} name={name} size={28} />;
                                })}
                            </BanRow>
                        </>
                    )}

                    {isPlainObject(team.objectives) && (
                        <>
                            <SubTitle>{fieldLabel('objectives', lang)}</SubTitle>
                            <ObjTable>
                                <div className="head">
                                    <span>{lang === 'ko' ? '항목' : 'Objective'}</span>
                                    <span>{lang === 'ko' ? '처치' : 'Kills'}</span>
                                    <span>{fieldLabel('first', lang)}</span>
                                </div>
                                {Object.entries(team.objectives).map(([key, obj]) => (
                                    <div className="row" key={key}>
                                        <span>{fieldLabel(key, lang)}</span>
                                        <span className="tabular">{obj?.kills ?? 0}</span>
                                        <span>{obj?.first ? '✓' : '-'}</span>
                                    </div>
                                ))}
                            </ObjTable>
                        </>
                    )}

                    {extras.length > 0 && (
                        <KvGrid>
                            {extras.map(([key, value]) => (
                                <KvRow key={key}>
                                    <span className="k" title={key}>{fieldLabel(key, lang)}</span>
                                    <span className="v tabular">{formatFieldValue(key, value, lang)}</span>
                                </KvRow>
                            ))}
                        </KvGrid>
                    )}
                </Section>
            );
        });
    };

    return (
        <ModalOverlay onClick={onClose}>
            <WideModal onClick={e => e.stopPropagation()}>
                <TopRow>
                    <h3>{lang === 'ko' ? '매치 상세정보' : 'Match Details'}</h3>
                    <RightControls>
                        <LangToggle $active={lang === 'ko'} onClick={() => changeLang('ko')}>한국어</LangToggle>
                        <LangToggle $active={lang === 'en'} onClick={() => changeLang('en')}>EN</LangToggle>
                        <CompactButton onClick={onClose}>{lang === 'ko' ? '닫기' : 'Close'}</CompactButton>
                    </RightControls>
                </TopRow>
                <Meta>
                    {fmtFullDate(detail.gameStart, lang)} · {Math.floor(detail.durationSec / 60)}
                    {lang === 'ko' ? '분 ' : 'm '}{detail.durationSec % 60}{lang === 'ko' ? '초' : 's'}
                    {detail.source === 'demo'
                        ? (lang === 'ko' ? ' · 모의 데이터' : ' · Simulated data')
                        : ` · ${detail.riotMatchId}`}
                </Meta>

                <TabRow>
                    {TABS.map(t => (
                        <TabBtn key={t.id} $active={tab === t.id} onClick={() => setTab(t.id)}>
                            {lang === 'ko' ? t.ko : t.en}
                        </TabBtn>
                    ))}
                </TabRow>

                {tab === 'info' && (
                    infoEntries ? (
                        <Section>
                            <KvGrid>
                                {infoEntries.map(([key, value]) =>
                                    isPlainObject(value) ? (
                                        <Nested key={key}>
                                            <summary>{fieldLabel(key, lang)}</summary>
                                            <LabeledTree data={value} lang={lang} />
                                        </Nested>
                                    ) : (
                                        <KvRow key={key}>
                                            <span className="k" title={key}>{fieldLabel(key, lang)}</span>
                                            <span className="v tabular">{formatFieldValue(key, value, lang)}</span>
                                        </KvRow>
                                    ))}
                            </KvGrid>
                        </Section>
                    ) : (
                        <Notice>{lang === 'ko' ? '원본 매치 정보가 없는 매치입니다.' : 'No raw match info for this match.'}</Notice>
                    )
                )}

                {tab === 'teams' && renderTeams()}

                {tab === 'events' && (
                    detail.lobbyEvents && detail.lobbyEvents.length > 0 ? (
                        <EventList>
                            {detail.lobbyEvents.map((ev, i) => (
                                <li key={i}>
                                    <span className="type">{fieldLabel(ev.eventType, lang)}</span>
                                    <span className="time">{ev.timestamp}</span>
                                    {ev.puuid && <span className="who">{ev.puuid.slice(0, 12)}…</span>}
                                </li>
                            ))}
                        </EventList>
                    ) : (
                        <Notice>{lang === 'ko' ? '로비 이벤트가 없습니다.' : 'No lobby events.'}</Notice>
                    )
                )}

                {tab === 'players' && (
                    <>
                        <PtTeamGroups>
                            {(['blue', 'red'] as const).map(side => (
                                <PtTeamGroup key={side} $side={side}>
                                    <span className="teamLabel">
                                        {side === 'blue'
                                            ? (lang === 'ko' ? '블루팀' : 'Blue')
                                            : (lang === 'ko' ? '레드팀' : 'Red')}
                                    </span>
                                    <div className="tabs">
                                        {detail.participants.map((pt, i) =>
                                            pt.side === side && (
                                                <PtTab
                                                    key={pt.puuid + pt.position}
                                                    $side={pt.side}
                                                    $active={i === selected}
                                                    onClick={() => setSelected(i)}
                                                    title={pt.riotId}
                                                >
                                                    {champLabel(pt.champion)} · {playerName(pt.playerId) ?? pt.riotId.split('#')[0]}
                                                </PtTab>
                                            ))}
                                    </div>
                                </PtTeamGroup>
                            ))}
                        </PtTeamGroups>
                        {renderPlayerStats()}
                    </>
                )}
            </WideModal>
        </ModalOverlay>
    );
};

const WideModal = styled(ModalContent)`
    width: min(780px, 95vw);
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

const Meta = styled.p`
    font-size: 0.82rem;
    color: ${({ theme }) => theme.placeholder};
    margin: 0.5rem 0 0.75rem !important;
`;

const TabRow = styled.div`
    display: flex;
    gap: 0.35rem;
    margin-bottom: 0.85rem;
`;

const TabBtn = styled.button<{ $active?: boolean }>`
    flex: 1;
    padding: 0.4rem;
    border: 1px solid ${({ theme, $active }) => ($active ? theme.accent : theme.cardBorder)};
    border-radius: var(--radius-md);
    background: ${({ theme, $active }) => ($active ? theme.accentGradient : 'transparent')};
    color: ${({ theme, $active }) => ($active ? theme.accentText : theme.placeholder)};
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
`;

const Section = styled.section`
    margin-bottom: 1rem;

    h4 {
        font-size: 0.88rem;
        color: ${({ theme }) => theme.accent};
        margin-bottom: 0.4rem;
    }
`;

const Notice = styled.p`
    font-size: 0.8rem;
    color: ${({ theme }) => theme.placeholder};
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
        max-width: 55%;
    }
`;

const Nested = styled.details`
    grid-column: 1 / -1;
    border: 1px solid ${({ theme }) => theme.cardBorder};
    border-radius: var(--radius-sm);
    padding: 0.3rem 0.5rem;

    summary {
        cursor: pointer;
        font-size: 0.78rem;
        font-weight: 700;
        color: ${({ theme }) => theme.text};
    }

    & > div { margin-top: 0.4rem; }
`;

const TeamHead = styled.div<{ $side: 'blue' | 'red' }>`
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    margin-bottom: 0.4rem;

    strong { color: ${({ theme, $side }) => ($side === 'blue' ? theme.teamBlue : theme.teamRed)}; }
    span { font-size: 0.78rem; color: ${({ theme }) => theme.placeholder}; }
`;

const SubTitle = styled.h5`
    font-size: 0.75rem;
    color: ${({ theme }) => theme.placeholder};
    margin: 0.4rem 0 0.25rem;
`;

const BanRow = styled.div`
    display: flex;
    gap: 0.3rem;
    flex-wrap: wrap;
`;

const BanFallback = styled.span`
    min-width: 28px;
    height: 28px;
    padding: 0 4px;
    border-radius: 50%;
    border: 1px solid ${({ theme }) => theme.cardBorder};
    background: ${({ theme }) => theme.dragOver};
    color: ${({ theme }) => theme.placeholder};
    font-size: 0.62rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
`;

const ObjTable = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;

    .head, .row {
        display: grid;
        grid-template-columns: 1fr 64px 48px;
        gap: 0.5rem;
        padding: 0.2rem 0.45rem;
        font-size: 0.76rem;
    }

    .head {
        color: ${({ theme }) => theme.placeholder};
        font-weight: 600;
    }

    .row {
        background: ${({ theme }) => theme.body};
        border-radius: var(--radius-sm);
        color: ${({ theme }) => theme.text};

        span:nth-child(2), span:nth-child(3) { text-align: right; }
    }
`;

const EventList = styled.ul`
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.78rem;
    color: ${({ theme }) => theme.text};

    li {
        display: flex;
        gap: 0.6rem;
        background: ${({ theme }) => theme.body};
        border-radius: var(--radius-sm);
        padding: 0.3rem 0.5rem;
    }

    .type { font-weight: 600; }
    .time, .who { color: ${({ theme }) => theme.placeholder}; }
`;

const PtTeamGroups = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-bottom: 0.75rem;
`;

const PtTeamGroup = styled.div<{ $side: 'blue' | 'red' }>`
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.4rem 0.5rem;
    border-radius: var(--radius-sm);
    background: ${({ theme, $side }) =>
        `color-mix(in srgb, ${$side === 'blue' ? theme.teamBlue : theme.teamRed} 7%, transparent)`};

    .teamLabel {
        flex-shrink: 0;
        width: 52px;
        padding-top: 0.3rem;
        font-size: 0.72rem;
        font-weight: 800;
        color: ${({ theme, $side }) => ($side === 'blue' ? theme.teamBlue : theme.teamRed)};
    }

    .tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 0.3rem;
    }
`;

const RuneRows = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
`;

const RuneRow = styled.div`
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.5rem;
    background: ${({ theme }) => theme.body};
    border-radius: var(--radius-sm);

    .slot {
        width: 64px;
        flex-shrink: 0;
        font-size: 0.72rem;
        font-weight: 700;
        color: ${({ theme }) => theme.placeholder};
    }

    .sep {
        width: 1px;
        height: 18px;
        background: ${({ theme }) => theme.cardBorder};
        margin: 0 0.2rem;
    }
`;

const PtTab = styled.button<{ $side: 'blue' | 'red'; $active?: boolean }>`
    padding: 0.25rem 0.55rem;
    font-size: 0.72rem;
    font-weight: 600;
    border-radius: var(--radius-sm);
    cursor: pointer;
    border: 1px solid ${({ theme, $side }) => ($side === 'blue' ? theme.teamBlue : theme.teamRed)};
    background: ${({ theme, $side, $active }) =>
        $active ? ($side === 'blue' ? theme.teamBlue : theme.teamRed) : 'transparent'};
    color: ${({ theme, $side, $active }) =>
        $active ? '#FFFFFF' : ($side === 'blue' ? theme.teamBlue : theme.teamRed)};
`;
