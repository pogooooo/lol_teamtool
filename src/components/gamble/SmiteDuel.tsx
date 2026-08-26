import { useEffect, useRef, useState } from 'react';
import styled, { css, keyframes } from 'styled-components';

/*
 * 강타 싸움 — 실제 타이밍 싸움.
 * 바론 체력 게이지가 줄어들다가 강타 사거리(초록 구간)에 들어오면 버튼을 눌러야 한다.
 * 구간 한가운데에 가까울수록 정확도가 높고, 그 정확도가 서버 승률에 반영된다.
 * (정확도를 조작해도 최대 승률 50% × 1.85배라 장기적으로는 손해 — 서버 기대값 유지)
 */

export interface SmiteResult {
    accuracy: number;
    /** 눌렀을 때 게이지 위치(0~1) — 결과 표시에 쓴다 */
    at: number;
}

const ZONE_CENTER = 0.24;   // 강타 적정 타이밍 (남은 체력 비율)
const ZONE_HALF = 0.13;     // 이 폭 안에 들어와야 강타 인정

export const SmiteDuel = ({ running, onSmite, lastResult, verdict }: {
    running: boolean;
    onSmite: (r: SmiteResult) => void;
    lastResult: SmiteResult | null;
    verdict: 'steal' | 'lost' | null;
}) => {
    const [hp, setHp] = useState(1);
    const raf = useRef(0);
    const startRef = useRef(0);
    const firedRef = useRef(false);

    // 게이지 진행 — 매 판 속도가 조금씩 달라져 외워서 누를 수 없게 한다
    const speedRef = useRef(1);

    useEffect(() => {
        if (!running) return;
        firedRef.current = false;
        speedRef.current = 0.85 + Math.random() * 0.5;
        startRef.current = performance.now();
        setHp(1);

        const tick = (now: number) => {
            const elapsed = (now - startRef.current) / 1000;
            const next = Math.max(0, 1 - elapsed * 0.42 * speedRef.current);
            setHp(next);
            if (next <= 0) {
                // 놓쳤다 — 정확도 0으로 자동 판정
                if (!firedRef.current) { firedRef.current = true; onSmite({ accuracy: 0, at: 0 }); }
                return;
            }
            raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [running]);

    const smite = () => {
        if (!running || firedRef.current) return;
        firedRef.current = true;
        cancelAnimationFrame(raf.current);
        const dist = Math.abs(hp - ZONE_CENTER);
        const accuracy = dist > ZONE_HALF ? 0 : 1 - dist / ZONE_HALF;
        onSmite({ accuracy, at: hp });
    };

    // 스페이스바로도 누를 수 있게 (진짜 강타처럼)
    useEffect(() => {
        if (!running) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.code === 'Space' || e.key === 'f' || e.key === 'F') { e.preventDefault(); smite(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    const shown = running ? hp : (lastResult?.at ?? 1);
    const acc = lastResult?.accuracy ?? 0;

    return (
        <Wrap>
            <BaronRow>
                <span className="label">바론 남은 체력</span>
                <span className="pct tabular">{Math.round(shown * 100)}%</span>
            </BaronRow>

            <Track onClick={smite} $active={running} title={running ? '초록 구간에서 클릭 (또는 스페이스)' : ''}>
                <div className="zone" style={{ left: `${(ZONE_CENTER - ZONE_HALF) * 100}%`, width: `${ZONE_HALF * 2 * 100}%` }}>
                    <span className="center" />
                </div>
                <Fill $w={shown} $inZone={Math.abs(shown - ZONE_CENTER) <= ZONE_HALF && running} />
                <Marker style={{ left: `${shown * 100}%` }} $hot={Math.abs(shown - ZONE_CENTER) <= ZONE_HALF && running} />
            </Track>

            <Status $verdict={verdict}>
                {running ? '체력이 초록 구간에 들어오면 강타!'
                    : verdict === 'steal' ? `강타 명중! 정확도 ${Math.round(acc * 100)}% — 바론은 내 것`
                    : verdict === 'lost' ? (acc === 0 ? '타이밍을 놓쳤습니다… 상대 정글이 가져갔습니다' : `정확도 ${Math.round(acc * 100)}% — 상대 강타가 아슬아슬하게 빨랐습니다`)
                    : '베팅 후 강타 싸움을 시작하세요'}
            </Status>

            <Hint>정확도가 높을수록 승률이 오릅니다 (최대 50%) · 배당 ×1.85 · 스페이스 / F 키 지원</Hint>
        </Wrap>
    );
};

const Wrap = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    width: min(100%, 420px);
    padding: 0.6rem;
`;

const BaronRow = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    .label { font-size: 0.7rem; color: #8A8270; }
    .pct { font-size: 0.95rem; font-weight: 800; color: #1E222B; }
`;

const Track = styled.div<{ $active: boolean }>`
    position: relative;
    height: 26px;
    border-radius: 6px;
    background: #EDE6D6;
    border: 1px solid #D8CFBA;
    overflow: hidden;
    cursor: ${({ $active }) => ($active ? 'pointer' : 'default')};

    .zone {
        position: absolute;
        top: 0;
        bottom: 0;
        background: rgba(127, 184, 154, 0.35);
        border-left: 1px solid rgba(78, 143, 123, 0.6);
        border-right: 1px solid rgba(78, 143, 123, 0.6);
        z-index: 1;
    }
    .center {
        position: absolute;
        left: 50%;
        top: 0;
        bottom: 0;
        width: 2px;
        background: rgba(78, 143, 123, 0.9);
    }
`;

const Fill = styled.div<{ $w: number; $inZone: boolean }>`
    position: absolute;
    inset: 0 auto 0 0;
    width: ${({ $w }) => $w * 100}%;
    background: ${({ $inZone }) => ($inZone
        ? 'linear-gradient(90deg, #4E8F7B, #7FB89A)'
        : 'linear-gradient(90deg, #B5453C, #E08170)')};
    transition: background 0.15s ease;
`;

const pulse = keyframes`
    0%, 100% { box-shadow: 0 0 5px 2px rgba(201, 165, 92, 0.6); }
    50% { box-shadow: 0 0 10px 4px rgba(201, 165, 92, 0.95); }
`;

const Marker = styled.div<{ $hot: boolean }>`
    position: absolute;
    top: -2px;
    bottom: -2px;
    width: 3px;
    margin-left: -1.5px;
    background: #C9A55C;
    z-index: 2;
    ${({ $hot }) => $hot && css`animation: ${pulse} 0.4s ease-in-out infinite;`}
`;

const Status = styled.div<{ $verdict: 'steal' | 'lost' | null }>`
    font-size: 0.78rem;
    font-weight: 700;
    min-height: 1.2em;
    color: ${({ $verdict }) => ($verdict === 'steal' ? '#4E8F7B' : $verdict === 'lost' ? '#B5453C' : '#6E6753')};
`;

const Hint = styled.div`
    font-size: 0.66rem;
    color: #8A8270;
    opacity: 0.9;
`;
