import { useMemo, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { Card, CompactButton, PrimaryButton, TextField } from '../App.styles';
import { FortuneCard } from './FortuneCard';

/*
 * 사다리타기 — 참가자와 결과를 넣고 돌린다. 팀 배정·벌칙 정하기에 쓴다.
 * 가로줄은 무작위로 놓되 같은 높이에서 겹치지 않게 해 경로가 항상 유효하다.
 */

interface Rung { row: number; col: number } // col과 col+1을 잇는 가로줄

const buildRungs = (cols: number, rows: number): Rung[] => {
    const out: Rung[] = [];
    for (let row = 0; row < rows; row += 1) {
        let col = 0;
        while (col < cols - 1) {
            // 같은 행에서 인접 가로줄이 붙지 않도록 한 칸 건너뛴다
            if (Math.random() < 0.45) { out.push({ row, col }); col += 2; }
            else col += 1;
        }
    }
    return out;
};

/** 사다리를 따라 내려가 최종 도착 칸을 구한다 */
const trace = (start: number, rungs: Rung[], rows: number): number => {
    let col = start;
    for (let row = 0; row < rows; row += 1) {
        if (rungs.some(r => r.row === row && r.col === col)) col += 1;
        else if (rungs.some(r => r.row === row && r.col === col - 1)) col -= 1;
    }
    return col;
};

export const LadderTab = () => {
    const [namesText, setNamesText] = useState('');
    const [resultsText, setResultsText] = useState('');
    const [rungs, setRungs] = useState<Rung[] | null>(null);
    const [revealed, setRevealed] = useState<number[]>([]);

    const names = namesText.split(/[\s,]+/).filter(Boolean);
    const rows = 10;

    // 결과 칸은 참가자 수에 맞춘다 (모자라면 빈칸으로 채움)
    const results = useMemo(() => {
        const list = resultsText.split(/[\s,]+/).filter(Boolean);
        return Array.from({ length: names.length }, (_, i) => list[i] ?? `${i + 1}번`);
    }, [resultsText, names.length]);

    const start = () => {
        if (names.length < 2) return;
        setRungs(buildRungs(names.length, rows));
        setRevealed([]);
    };

    const reveal = (i: number) => {
        if (!rungs || revealed.includes(i)) return;
        setRevealed(prev => [...prev, i]);
    };

    const revealAll = () => {
        if (!rungs) return;
        setRevealed(names.map((_, i) => i));
    };

    const cols = names.length;
    const width = Math.max(cols * 80, 240);
    const height = rows * 34;

    return (
        <Wrap>
            <FortuneCard />

            <SetupCard>
                <h3>사다리타기</h3>
                <p className="desc">참가자와 결과를 스페이스로 구분해 입력하고 사다리를 만드세요. 이름을 누르면 경로가 하나씩 공개됩니다.</p>
                <Row>
                    <TextField placeholder="참가자 (예: 철수 영희 민수)" value={namesText} onChange={e => setNamesText(e.target.value)} />
                    <TextField placeholder="결과 (예: 1팀 2팀 벌칙)" value={resultsText} onChange={e => setResultsText(e.target.value)} />
                    <PrimaryButton onClick={start} disabled={names.length < 2}>사다리 만들기</PrimaryButton>
                    {rungs && <CompactButton onClick={revealAll}>전체 공개</CompactButton>}
                </Row>
            </SetupCard>

            {rungs && (
                <BoardCard>
                    <Names $cols={cols}>
                        {names.map((n, i) => (
                            <button key={n + i} className={revealed.includes(i) ? 'nm on' : 'nm'} onClick={() => reveal(i)}>
                                {n}
                            </button>
                        ))}
                    </Names>

                    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: '100%' }}>
                        {/* 세로 기둥 */}
                        {names.map((_, i) => (
                            <line key={`v${i}`}
                                x1={(i + 0.5) * (width / cols)} y1={0}
                                x2={(i + 0.5) * (width / cols)} y2={height}
                                stroke="#4F565F" strokeWidth="2" />
                        ))}
                        {/* 가로줄 */}
                        {rungs.map((r, i) => (
                            <line key={`h${i}`}
                                x1={(r.col + 0.5) * (width / cols)} y1={(r.row + 0.5) * (height / rows)}
                                x2={(r.col + 1.5) * (width / cols)} y2={(r.row + 0.5) * (height / rows)}
                                stroke="#4F565F" strokeWidth="2" />
                        ))}
                        {/* 공개된 경로 */}
                        {revealed.map(idx => (
                            <Path key={`p${idx}`}
                                d={pathOf(idx, rungs, rows, cols, width, height)}
                                stroke={COLORS[idx % COLORS.length]} />
                        ))}
                    </svg>

                    <Names $cols={cols}>
                        {results.map((r, i) => {
                            const owner = revealed.find(idx => trace(idx, rungs, rows) === i);
                            return (
                                <div key={r + i} className={owner !== undefined ? 'rs on' : 'rs'}>
                                    {r}
                                    {owner !== undefined && <em>{names[owner]}</em>}
                                </div>
                            );
                        })}
                    </Names>
                </BoardCard>
            )}
        </Wrap>
    );
};

const COLORS = ['#4DA8DA', '#F07178', '#5FE3A3', '#C99BFF', '#FFC46B', '#7CE0E0', '#FF9AC1', '#9BE86B'];

/** 시작 칸에서 도착까지의 꺾은선 경로를 만든다 */
const pathOf = (start: number, rungs: Rung[], rows: number, cols: number, w: number, h: number): string => {
    const cw = w / cols;
    const rh = h / rows;
    let col = start;
    let d = `M ${(col + 0.5) * cw} 0`;
    for (let row = 0; row < rows; row += 1) {
        const y = (row + 0.5) * rh;
        d += ` L ${(col + 0.5) * cw} ${y}`;
        if (rungs.some(r => r.row === row && r.col === col)) col += 1;
        else if (rungs.some(r => r.row === row && r.col === col - 1)) col -= 1;
        d += ` L ${(col + 0.5) * cw} ${y}`;
    }
    return `${d} L ${(col + 0.5) * cw} ${h}`;
};

const draw = keyframes`from { stroke-dashoffset: 1200; } to { stroke-dashoffset: 0; }`;

const Path = styled.path`
    fill: none;
    stroke-width: 3.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 1200;
    animation: ${draw} 0.9s ease forwards;
`;

const Wrap = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    flex-grow: 1;
`;

const SetupCard = styled(Card)`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    h3 { font-size: 1rem; color: ${({ theme }) => theme.text}; }
    .desc { font-size: 0.78rem; color: ${({ theme }) => theme.placeholder}; line-height: 1.5; }
`;

const Row = styled.div`
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    input { flex: 1; min-width: 180px; }
`;

const BoardCard = styled(Card)`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    overflow-x: auto;
`;

const Names = styled.div<{ $cols: number }>`
    display: grid;
    grid-template-columns: repeat(${({ $cols }) => $cols}, 1fr);
    width: ${({ $cols }) => Math.max($cols * 80, 240)}px;
    max-width: 100%;
    gap: 2px;

    .nm, .rs {
        padding: 0.3rem 0.2rem;
        border-radius: var(--radius-sm);
        font-size: 0.8rem;
        font-weight: 700;
        text-align: center;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        background: ${({ theme }) => theme.body};
        border: 1px solid ${({ theme }) => theme.cardBorder};
        color: ${({ theme }) => theme.text};
    }
    .nm { cursor: pointer; }
    .nm.on, .rs.on { border-color: ${({ theme }) => theme.accent}; }
    .rs em {
        display: block;
        font-style: normal;
        font-size: 0.66rem;
        color: ${({ theme }) => theme.accent};
    }
`;
