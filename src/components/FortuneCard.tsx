import { useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { Card, PrimaryButton, TextField } from '../App.styles';
import { getFortune } from '../services/flavor';
import type { Fortune } from '../services/flavor';
import { useActiveGroupId } from '../hooks/useActiveGroupBadge';
import { useMyPlayer } from '../hooks/useMyPlayer';

/** 한국 시간 기준 오늘 날짜 — 운세는 자정(KST)에 바뀐다 */
const todayKst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

/*
 * 오늘의 운세 — 이름을 넣으면 롤 테마 운세가 나온다.
 * 이름+날짜로 결과가 정해져 있어 하루 동안 몇 번을 봐도 같은 운세가 나온다.
 * (그래야 "내 운세"라고 우길 수 있다)
 */
export const FortuneCard = () => {
    const groupId = useActiveGroupId();
    const me = useMyPlayer(groupId);
    const [name, setName] = useState(() => me?.displayName ?? '');
    const [fortune, setFortune] = useState<Fortune | null>(null);

    const draw = () => {
        const n = name.trim();
        if (!n) return;
        setFortune(getFortune(n, todayKst()));
    };

    return (
        <Box>
            <h3>오늘의 운세</h3>
            <p className="desc">
                이름을 넣으면 소환사의 협곡 기준 오늘 운세를 알려 드립니다.
                이름과 날짜로 정해지므로 하루 동안 결과는 바뀌지 않습니다. 닷지 여부는 본인 책임.
            </p>
            <Row>
                <TextField
                    placeholder="이름"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') draw(); }}
                />
                <PrimaryButton onClick={draw} disabled={!name.trim()}>운세 보기</PrimaryButton>
            </Row>

            {fortune && (
                <Result $color={fortune.gradeColor} key={`${name}-${fortune.grade}`}>
                    <div className="grade" style={{ color: fortune.gradeColor }}>{fortune.grade}</div>
                    <p className="text">{fortune.text}</p>
                    <div className="lucky">
                        <span><i>행운의 라인</i><b>{fortune.lane}</b></span>
                        <span><i>행운의 챔피언</i><b>{fortune.champ}</b></span>
                        <span><i>행운의 숫자</i><b>{fortune.number}</b></span>
                    </div>
                    <p className="advice">{fortune.advice}</p>
                </Result>
            )}
        </Box>
    );
};

const appear = keyframes`
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
`;

const Box = styled(Card)`
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
    input { flex: 1; min-width: 160px; }
`;

const Result = styled.div<{ $color: string }>`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.9rem 1rem;
    border-radius: var(--radius-md);
    background: ${({ theme }) => theme.body};
    border: 1px solid ${({ $color }) => $color};
    animation: ${appear} 0.35s ease;

    .grade {
        font-size: 1.3rem;
        font-weight: 900;
        letter-spacing: 0.05em;
    }
    .text {
        font-size: 0.92rem;
        line-height: 1.65;
        color: ${({ theme }) => theme.text};
    }
    .lucky {
        display: flex;
        gap: 1.2rem;
        flex-wrap: wrap;

        span { display: flex; flex-direction: column; gap: 0.1rem; }
        i { font-style: normal; font-size: 0.64rem; color: ${({ theme }) => theme.placeholder}; }
        b { font-size: 0.9rem; color: ${({ theme }) => theme.accent}; }
    }
    .advice {
        font-size: 0.74rem;
        color: ${({ theme }) => theme.placeholder};
        border-top: 1px dashed ${({ theme }) => theme.cardBorder};
        padding-top: 0.5rem;
    }
`;
