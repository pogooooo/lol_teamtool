import { useState } from 'react';
import styled from 'styled-components';

/*
 * 1px 보물찾기 — 화면 어딘가에 아주 작은 점이 하루에 하나 숨는다.
 * 위치는 서버가 그룹×날짜로 정하므로 같은 그룹 사람은 같은 자리를 찾는다.
 * 찾기 어렵지만 마우스를 가까이 가져가면 살짝 커져서 완전히 불가능하진 않다.
 */
export const TreasureHunt = ({ spot, disabled, onFound }: {
    spot: { x: number; y: number };
    disabled: boolean;
    onFound: () => void;
}) => {
    const [hot, setHot] = useState(false);

    if (disabled) return null;

    return (
        <Dot
            $x={spot.x}
            $y={spot.y}
            $hot={hot}
            title="?"
            aria-label="보물"
            onMouseEnter={() => setHot(true)}
            onMouseLeave={() => setHot(false)}
            onClick={onFound}
        />
    );
};

const Dot = styled.button<{ $x: number; $y: number; $hot: boolean }>`
    position: fixed;
    left: ${({ $x }) => $x * 100}vw;
    top: ${({ $y }) => $y * 100}vh;
    z-index: 60;
    padding: 0;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    background: ${({ $hot }) => ($hot ? '#FFD060' : 'rgba(255, 208, 96, 0.55)')};
    width: ${({ $hot }) => ($hot ? '14px' : '3px')};
    height: ${({ $hot }) => ($hot ? '14px' : '3px')};
    box-shadow: ${({ $hot }) => ($hot ? '0 0 10px 3px rgba(255,208,96,0.8)' : 'none')};
    transition: width 0.12s ease, height 0.12s ease, box-shadow 0.12s ease, background 0.12s ease;
`;
