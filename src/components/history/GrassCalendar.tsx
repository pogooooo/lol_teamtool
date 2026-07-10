import { useState } from 'react';
import styled from 'styled-components';
import type { MatchRecord } from '../../types';

/*
 * 최근 내전 잔디밭 — 최근 1년 데이터를 26주 창으로 보여주고 ‹ › 로 좌우 이동한다.
 * 판수가 많을수록 진한 초록(grass1→3 토큰). 호버 시 날짜·판수 표시.
 */

const TOTAL_WEEKS = 52;
const VIEW_WEEKS = 26;
const DAY_MS = 86400000;

const dateKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

export const GrassCalendar = ({ matches, title }: { matches: MatchRecord[]; title: string }) => {
    // offset = 창을 과거로 몇 주 밀었는지 (0 = 최신 26주)
    const [offset, setOffset] = useState(0);
    const maxOffset = TOTAL_WEEKS - VIEW_WEEKS;

    const counts = new Map<string, number>();
    matches.forEach(m => {
        const key = dateKey(new Date(m.gameStart));
        counts.set(key, (counts.get(key) ?? 0) + 1);
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thisSunday = new Date(today.getTime() - today.getDay() * DAY_MS);
    // 보이는 창의 시작 일요일
    const windowStart = new Date(thisSunday.getTime() - (VIEW_WEEKS - 1 + offset) * 7 * DAY_MS);

    const weeks: { key: string; label: string; count: number; future: boolean }[][] = [];
    for (let w = 0; w < VIEW_WEEKS; w++) {
        const col = [];
        for (let d = 0; d < 7; d++) {
            const date = new Date(windowStart.getTime() + (w * 7 + d) * DAY_MS);
            const count = counts.get(dateKey(date)) ?? 0;
            col.push({
                key: dateKey(date),
                label: `${date.getMonth() + 1}월 ${date.getDate()}일 · ${count}판`,
                count,
                future: date.getTime() > today.getTime(),
            });
        }
        weeks.push(col);
    }

    const monthLabel = `${windowStart.getMonth() + 1}월 ~ ${
        offset === 0 ? '현재' : `${new Date(windowStart.getTime() + VIEW_WEEKS * 7 * DAY_MS - DAY_MS).getMonth() + 1}월`}`;

    const level = (count: number) => (count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : 3);

    return (
        <Wrap>
            {/* 제목·기간·이동 버튼을 한 줄에 — 잔디가 면적을 최대로 쓰도록 */}
            <HeadRow>
                <span className="title">{title}</span>
                <span className="range">{monthLabel}</span>
                <NavButton
                    onClick={() => setOffset(Math.min(maxOffset, offset + VIEW_WEEKS))}
                    disabled={offset >= maxOffset}
                    title="과거로"
                >
                    ‹
                </NavButton>
                <NavButton
                    onClick={() => setOffset(Math.max(0, offset - VIEW_WEEKS))}
                    disabled={offset === 0}
                    title="최근으로"
                >
                    ›
                </NavButton>
            </HeadRow>

            <Grid>
                {weeks.flat().map(c => (
                    <Cell
                        key={c.key}
                        $level={c.future ? -1 : level(c.count)}
                        title={c.future ? undefined : c.label}
                    />
                ))}
            </Grid>
        </Wrap>
    );
};

const Wrap = styled.div`
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
`;

const HeadRow = styled.div`
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.4rem;

    .title {
        font-size: 0.82rem;
        color: ${({ theme }) => theme.placeholder};
        font-weight: 600;
    }

    .range {
        margin-left: auto;
        font-size: 0.72rem;
        color: ${({ theme }) => theme.placeholder};
    }
`;

const NavButton = styled.button`
    background: none;
    border: 1px solid ${({ theme }) => theme.cardBorder};
    border-radius: var(--radius-sm);
    color: ${({ theme }) => theme.text};
    width: 22px;
    height: 22px;
    line-height: 1;
    cursor: pointer;

    &:hover:not(:disabled) { background: ${({ theme }) => theme.dragOver}; }
    &:disabled { opacity: 0.35; cursor: default; }
`;

/* 카드 가로폭을 가득 채우도록 26주 컬럼을 1fr로 늘린다 — 셀은 aspect-ratio로 정사각형 유지 */
const Grid = styled.div`
    width: 100%;
    display: grid;
    grid-template-columns: repeat(${VIEW_WEEKS}, 1fr);
    grid-template-rows: repeat(7, auto);
    grid-auto-flow: column;
    gap: clamp(2px, 0.3vw, 4px);
`;

const Cell = styled.span<{ $level: number }>`
    width: 100%;
    aspect-ratio: 1 / 1;
    min-width: 0;
    border-radius: 22%;
    transition: transform 0.1s ease;

    &:hover { transform: scale(1.25); }
    background: ${({ theme, $level }) => {
        switch ($level) {
            case -1: return 'transparent';
            case 0: return theme.dragOver;
            case 1: return theme.grass1;
            case 2: return theme.grass2;
            default: return theme.grass3;
        }
    }};
`;

