import { useEffect } from 'react';
import styled, { keyframes } from 'styled-components';

/*
 * 결과 알림 팝업 — 화면 흐름을 밀어내지 않도록 고정 위치에 떠 있다가 사라진다.
 * (인라인 배너로 두면 누를 때마다 레이아웃이 흔들려 눈이 피로해진다)
 */
export const Toast = ({ text, error, onDone, duration = 3200 }: {
    text: string;
    error?: boolean;
    onDone: () => void;
    duration?: number;
}) => {
    useEffect(() => {
        const t = setTimeout(onDone, duration);
        return () => clearTimeout(t);
    }, [text, duration, onDone]);

    return (
        <Box $error={Boolean(error)} onClick={onDone} role="status">
            {text}
        </Box>
    );
};

const pop = keyframes`
    from { opacity: 0; transform: translate(-50%, 14px) scale(0.96); }
    to { opacity: 1; transform: translate(-50%, 0) scale(1); }
`;

const Box = styled.div<{ $error: boolean }>`
    position: fixed;
    left: 50%;
    bottom: 26px;
    z-index: 3000;
    max-width: min(560px, 92vw);
    padding: 0.7rem 1.1rem;
    border-radius: 999px;
    font-size: 0.88rem;
    font-weight: 700;
    text-align: center;
    cursor: pointer;
    color: ${({ theme, $error }) => ($error ? theme.teamRed : theme.text)};
    background: ${({ theme }) => theme.card};
    border: 1px solid ${({ theme, $error }) => ($error ? theme.teamRed : theme.accent)};
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
    animation: ${pop} 0.22s ease-out;
`;
