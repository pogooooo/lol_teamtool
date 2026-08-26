import styled, { keyframes } from 'styled-components';

const spin = keyframes`
    to { transform: rotate(360deg); }
`;

/** 진행 중 표시 — 버튼이나 상태 문구 옆에 붙이는 작은 회전 링 */
export const Spinner = styled.span<{ $size?: number }>`
    display: inline-block;
    width: ${({ $size }) => $size ?? 12}px;
    height: ${({ $size }) => $size ?? 12}px;
    border-radius: 50%;
    border: 2px solid currentColor;
    border-top-color: transparent;
    vertical-align: -2px;
    animation: ${spin} 0.7s linear infinite;
`;
