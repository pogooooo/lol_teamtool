import { useState } from 'react';
import styled from 'styled-components';
import { useTeamBuilderContext, BASE_POS } from '../hooks/useTeamBuilderLogic';
import { ContextMenuContainer } from '../App.styles';
import { TIERS, TIER_META, APEX_TIERS, RANK_OPTIONS, parseRank } from '../constants';
import type { Position, Tier } from '../types';
import { TierEmblem } from './ui/TierEmblem';
import { fmtScore, fmtSigned } from '../services/ratings';

const DIVISIONS = ['IV', 'III', 'II', 'I'];
const DIV_NUM: Record<string, string> = { IV: '4', III: '3', II: '2', I: '1' };
/** 점수 미세 조절 폭 */
const STEPS = [-1, -0.5, 0.5, 1];

/*
 * 이름 우클릭 메뉴.
 *  · 최종 점수와 "얼마나 직접 조절했는지"를 위에 먼저 보여준다.
 *  · 기본 티어는 전체/이 라인 두 가지로 지정할 수 있다 (라인에 배치된 카드에서만 라인 선택 가능).
 */
export const AppContextMenu = () => {
    const { contextMenu, handlers } = useTeamBuilderContext();
    const position = contextMenu.position;
    const [picked, setPicked] = useState<{ key: string; scope: 'base' | 'lane' } | null>(null);

    const targetName = contextMenu.targetName;
    if (!contextMenu.visible || targetName === null) return null;

    // 라인에서 우클릭했으면 그 라인 점수를, 아니면 대표 점수를 보여준다
    const parts = handlers.scorePartsOf(targetName, position);

    /*
     * 지금 이 카드의 티어를 실제로 정하고 있는 쪽을 기본 선택으로 둔다.
     * 그 라인에 따로 지정해 둔 값이 있으면 그걸, 없으면 전체 기본 티어를 고치게 된다.
     */
    const menuKey = `${targetName}|${position ?? ''}`;
    const defaultScope: 'base' | 'lane' =
        position && handlers.assignedRank(targetName, position) ? 'lane' : 'base';
    const scope = picked?.key === menuKey ? picked.scope : defaultScope;
    const setScope = (s: 'base' | 'lane') => setPicked({ key: menuKey, scope: s });
    const laneScope = scope === 'lane' && position !== null;
    const slot: Position | typeof BASE_POS = laneScope && position ? position : BASE_POS;

    /** 지금 그 자리에 지정돼 있는 값 (자동 추정값은 제외) */
    const assigned = parseRank(handlers.assignedRank(targetName, laneScope ? position : null));
    const pick = (tier: Tier, division: string | null) => {
        const value = RANK_OPTIONS.find(o => o.tier === tier && o.division === division)?.value;
        if (value) handlers.setLaneRank(targetName, slot, value);
    };

    const mul = (v: number) => `×${v.toFixed(2)}`;

    return (
        <Menu x={contextMenu.x} y={contextMenu.y} onClick={e => e.stopPropagation()}>
            <Head>
                <b className="nm">{targetName}</b>
                <span className="total tabular">{fmtScore(parts.total)}</span>
            </Head>

            {/* 점수 내역 — 어떤 근거로 이 점수가 나왔는지 그대로 펼친다 */}
            <Detail>
                <div className="row">
                    <span>기본 티어</span>
                    <b>{parts.tier
                        // 마스터 이상은 디비전이 없다
                        ? `${TIER_META[parts.tier].label}${!APEX_TIERS.includes(parts.tier) && parts.division ? ` ${DIV_NUM[parts.division] ?? ''}` : ''}`
                        : '없음'}
                        <i className="src">{parts.source}</i></b>
                </div>
                <div className="row"><span>티어 점수</span><b className="tabular">{fmtScore(parts.base)}</b></div>
                <div className="row"><span>최근 30일 활동</span><b className="tabular">{fmtSigned(parts.activity)}</b></div>
                <div className="row"><span>최근 승률</span><b className="tabular">{fmtSigned(parts.form)}</b></div>
                <div className="row"><span>표본 보정</span><b className="tabular">{fmtSigned(parts.sample)}</b></div>
                {position && (
                    <>
                        <div className="row"><span>{position} 가중치</span><b className="tabular">{mul(parts.laneMul)}</b></div>
                        <div className="row"><span>내전 라인 숙련도</span><b className="tabular">{mul(parts.profMul)}</b></div>
                        <div className="row"><span>희망 라인</span><b className="tabular">{mul(parts.wishMul)}</b></div>
                    </>
                )}
                <div className="row sum"><span>자동 계산</span><b className="tabular">{fmtScore(parts.auto)}</b></div>
                <div className={parts.adjust ? 'row sum adj' : 'row sum'}>
                    <span>직접 조절</span><b className="tabular">{fmtSigned(parts.adjust)}</b>
                </div>
            </Detail>

            {/* 세부 점수 조절 — 자동 계산값에 더하고 뺀다 */}
            <Steps>
                {STEPS.map(d => (
                    <button key={d} onClick={() => handlers.adjustScore(targetName, d)}>
                        {d > 0 ? `+${d}` : `−${Math.abs(d)}`}
                    </button>
                ))}
                <button
                    className="reset"
                    disabled={!parts.adjust}
                    onClick={() => handlers.resetScoreAdjust(targetName)}
                >초기화</button>
            </Steps>

            {/* 기본 티어 지정 — 지정하면 라이엇 랭크 대신 이 값이 기준이 된다 */}
            <Section>
                <div className="cap">
                    <span>기본 티어 지정</span>
                    {position && (
                        <ScopeTabs>
                            <button className={scope === 'base' ? 'on' : ''} onClick={() => setScope('base')}>전체</button>
                            <button className={scope === 'lane' ? 'on' : ''} onClick={() => setScope('lane')}>{position}</button>
                        </ScopeTabs>
                    )}
                </div>

                <TierGrid>
                    {TIERS.map(tier => (
                        <button
                            key={tier}
                            className={assigned?.tier === tier ? 'on' : ''}
                            style={{ borderColor: assigned?.tier === tier ? TIER_META[tier].color : undefined }}
                            onClick={() => pick(tier, APEX_TIERS.includes(tier) ? null : (assigned?.division ?? 'II'))}
                        >
                            <TierEmblem tier={tier} size={16} />
                            <span style={{ color: TIER_META[tier].color }}>{TIER_META[tier].label}</span>
                        </button>
                    ))}
                </TierGrid>

                <DivRow>
                    {DIVISIONS.map(d => (
                        <button
                            key={d}
                            className={assigned?.division === d ? 'on' : ''}
                            disabled={!assigned || APEX_TIERS.includes(assigned.tier)}
                            onClick={() => assigned && pick(assigned.tier, d)}
                        >{DIV_NUM[d]}</button>
                    ))}
                    <button
                        className="auto"
                        disabled={!assigned}
                        onClick={() => handlers.setLaneRank(targetName, slot, null)}
                        title={laneScope ? '이 라인 지정을 지우고 전체 기본 티어를 씁니다' : '지정을 지우고 롤 솔랭(없으면 자랭) 티어를 씁니다'}
                    >{laneScope ? '기본값' : '자동'}</button>
                </DivRow>
            </Section>

            <Foot>
                <button onClick={() => { handlers.toggleCaptain(targetName); handlers.closeContextMenu(); }}>
                    ♛ {handlers.isCaptain(targetName) ? '팀장 해제' : '팀장 지정'}
                </button>
                <button className="delete" onClick={() => { handlers.handleDeletePlayer(targetName); handlers.closeContextMenu(); }}>✕ 삭제</button>
            </Foot>
        </Menu>
    );
};

const Menu = styled(ContextMenuContainer)`
    width: 232px;
    max-height: 86vh;
    overflow-y: auto;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
`;

const Head = styled.div`
    display: flex;
    align-items: baseline;
    gap: 0.4rem;

    .nm {
        font-size: 0.9rem;
        color: ${({ theme }) => theme.text};
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .total {
        margin-left: auto;
        font-size: 1.05rem;
        font-weight: 900;
        color: ${({ theme }) => theme.accent};
    }
`;

/* 점수 내역 — 항목별 가감을 그대로 나열한다 */
const Detail = styled.div`
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 0.35rem 0.4rem;
    border-radius: var(--radius-sm);
    background: ${({ theme }) => theme.body};

    .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.4rem;
        font-size: 0.68rem;
        color: ${({ theme }) => theme.placeholder};

        b { font-weight: 700; color: ${({ theme }) => theme.text}; }
    }
    .src {
        margin-left: 0.25rem;
        font-style: normal;
        font-size: 0.58rem;
        font-weight: 700;
        padding: 0 0.25rem;
        border-radius: 3px;
        background: ${({ theme }) => theme.cardBorder};
        color: ${({ theme }) => theme.placeholder};
    }
    .sum {
        margin-top: 2px;
        padding-top: 3px;
        border-top: 1px solid ${({ theme }) => theme.cardBorder};
        font-weight: 700;
    }
    .adj b { color: #FFC46B; }
`;

const Steps = styled.div`
    display: flex;
    gap: 3px;

    button {
        flex: 1;
        padding: 0.22rem 0;
        border: 1px solid ${({ theme }) => theme.cardBorder};
        border-radius: var(--radius-sm);
        background: transparent;
        color: ${({ theme }) => theme.text};
        font-size: 0.7rem;
        font-weight: 800;
        cursor: pointer;
        &:hover:not(:disabled) { background: ${({ theme }) => theme.dragOver}; }
        &:disabled { opacity: 0.3; cursor: default; }
    }
    .reset { flex: 1.4; color: ${({ theme }) => theme.accent}; font-size: 0.66rem; }
`;

const Section = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding-top: 0.4rem;
    border-top: 1px solid ${({ theme }) => theme.contextMenuBorder};

    .cap {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 0.66rem;
        font-weight: 700;
        color: ${({ theme }) => theme.placeholder};
    }
`;

/* 전체 기본 티어 / 이 라인 티어 중 어디에 적용할지 */
const ScopeTabs = styled.div`
    display: inline-flex;
    border: 1px solid ${({ theme }) => theme.cardBorder};
    border-radius: 999px;
    overflow: hidden;

    button {
        border: none;
        background: transparent;
        color: ${({ theme }) => theme.placeholder};
        font-size: 0.62rem;
        font-weight: 800;
        padding: 0.1rem 0.45rem;
        cursor: pointer;
        &.on { background: ${({ theme }) => theme.accent}; color: ${({ theme }) => theme.accentText}; }
    }
`;

const TierGrid = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px;

    button {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.16rem 0.2rem;
        border: 1px solid transparent;
        border-radius: var(--radius-sm);
        background: transparent;
        font-size: 0.68rem;
        font-weight: 700;
        cursor: pointer;
        text-align: left;
        overflow: hidden;
        white-space: nowrap;
        &:hover { background: ${({ theme }) => theme.dragOver}; }
        &.on { background: ${({ theme }) => theme.dragOver}; }
    }
`;

const DivRow = styled.div`
    display: flex;
    gap: 3px;

    button {
        flex: 1;
        padding: 0.18rem 0;
        border: 1px solid ${({ theme }) => theme.cardBorder};
        border-radius: var(--radius-sm);
        background: transparent;
        color: ${({ theme }) => theme.text};
        font-size: 0.7rem;
        font-weight: 800;
        cursor: pointer;
        &:hover:not(:disabled) { background: ${({ theme }) => theme.dragOver}; }
        &:disabled { opacity: 0.3; cursor: default; }
        &.on { background: ${({ theme }) => theme.accent}; color: ${({ theme }) => theme.accentText}; border-color: transparent; }
    }
    .auto { flex: 1.6; font-size: 0.66rem; color: ${({ theme }) => theme.accent}; }
`;

const Foot = styled.div`
    display: flex;
    gap: 3px;
    padding-top: 0.4rem;
    border-top: 1px solid ${({ theme }) => theme.contextMenuBorder};

    button {
        flex: 1;
        padding: 0.28rem 0;
        border: none;
        border-radius: var(--radius-sm);
        background: transparent;
        color: ${({ theme }) => theme.text};
        font-size: 0.72rem;
        font-weight: 700;
        cursor: pointer;
        &:hover { background: ${({ theme }) => theme.dragOver}; }
    }
    .delete { color: ${({ theme }) => theme.teamRed}; }
`;
