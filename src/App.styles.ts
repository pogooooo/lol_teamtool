import styled, { createGlobalStyle, keyframes, css } from 'styled-components';
import type { DefaultTheme } from 'styled-components';
import type { Tier } from './types';
import { TIER_META } from './constants';

/*
 * 팔레트 정의는 DESIGN.md 참고.
 * 라이트: #F9F8F6 #EFE9E3 #D9CFC7 #C9B59C (+파생 잉크 #8A7D6B #8A7358 #3B352C)
 * 다크:   #222831 #393E46 #948979 #DFD0B8 (+파생 서피스 #4A515B #4F565F)
 */
export const lightTheme: DefaultTheme = {
    mode: 'light',
    body: '#F9F8F6',
    text: '#3B352C',
    card: '#EFE9E3',
    cardBorder: '#D9CFC7',
    placeholder: '#8A7D6B',
    dragOver: '#D9CFC7',
    nameBg: '#8A7358',
    nameText: '#F9F8F6',
    white: '#FFFFFF',
    contextMenu: '#F9F8F6',
    contextMenuBorder: '#D9CFC7',
    accent: '#8A7358',
    accentGradient: 'linear-gradient(135deg, #A99274 0%, #8A7358 100%)',
    accentText: '#F9F8F6',
    teamBlue: '#0077B6',
    teamRed: '#E63946',
    grass1: '#A9DFC1',
    grass2: '#52B788',
    grass3: '#1E7A54',
};

export const darkTheme: DefaultTheme = {
    mode: 'dark',
    body: '#222831',
    text: '#FFFFFF',
    card: '#393E46',
    cardBorder: '#4F565F',
    placeholder: '#FFFFFF',
    dragOver: '#4A515B',
    nameBg: '#DFD0B8',
    nameText: '#222831',
    white: '#FFFFFF',
    contextMenu: '#393E46',
    contextMenuBorder: '#4F565F',
    accent: '#DFD0B8',
    accentGradient: 'linear-gradient(135deg, #DFD0B8 0%, #948979 100%)',
    accentText: '#222831',
    teamBlue: '#4DA8DA',
    teamRed: '#F07178',
    grass1: '#3E7A5C',
    grass2: '#57B384',
    grass3: '#95E3B8',
};

export const GlobalStyle = createGlobalStyle`
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* 레이아웃 토큰: 팀 빌딩 화면이 스크롤 없이 100vh에 들어가도록 화면 높이에 따라 축소된다 (DESIGN.md 참고) */
    :root {
        --control-h: 40px;
        --section-gap: 1rem;
        --lane-gap: 0.75rem;
        --radius-lg: 12px;
        --radius-md: 8px;
        --radius-sm: 6px;
    }

    @media (max-height: 780px) {
        :root {
            --control-h: 36px;
            --section-gap: 0.625rem;
            --lane-gap: 0.5rem;
        }
    }

    body {
        background-color: ${({ theme }) => theme.body};
        color: ${({ theme }) => theme.text};
        /* 네이티브 위젯(셀렉트 드롭다운, 달력 팝업)이 테마를 따르게 한다 */
        color-scheme: ${({ theme }) => theme.mode};
        font-family: 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont,
            'Segoe UI', 'Malgun Gothic', 'Apple SD Gothic Neo', Roboto, 'Helvetica Neue', Arial, sans-serif;
        transition: background-color 0.2s ease, color 0.2s ease;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        font-size: 16px;
    }

    button, input, select {
        font-family: inherit;
    }

    /* 통계/스코어 숫자는 고정폭 숫자로 정렬 */
    code, .tabular {
        font-variant-numeric: tabular-nums;
    }
`;

export const PageWrapper = styled.div`
    display: flex;
    justify-content: center;
    align-items: flex-start;
    width: 100%;
    min-height: 100vh;
    gap: 20px;
`;

export const AdContainer = styled.div`
    width: 160px;
    min-width: 160px;
    flex-shrink: 0;
    position: sticky;
    top: 20px;

    @media (max-width: 1200px) {
        display: none;
    }
`;

export const AppContainer = styled.div<{ $fitViewport?: boolean }>`
    display: flex;
    flex-direction: column;
    height: ${({ $fitViewport }) => ($fitViewport ? '100vh' : 'auto')};
    min-height: 100vh;
    overflow: ${({ $fitViewport }) => ($fitViewport ? 'hidden' : 'visible')};
    padding: 1.25rem 2rem;
    gap: var(--section-gap);
    width: 100%;
    /* 세 탭(팀 빌더·내전 기록·경매) 가로 폭 통일 */
    max-width: 1200px;
`;

/* 팀 빌더 본문 + 오른쪽 최근 이름 패널 (좁은 화면에서는 패널 숨김 → 입력창 아래 인라인) */
export const BuilderLayout = styled.div`
    flex-grow: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr;
    gap: 1rem;

    .main {
        min-width: 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: var(--section-gap);
    }

    @media (min-width: 1100px) {
        grid-template-columns: 1fr 220px;
    }
`;

export const RecentSidePanel = styled.aside`
    display: none;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.8rem 0.9rem;
    background: ${({ theme }) => theme.card};
    border: 1px solid ${({ theme }) => theme.cardBorder};
    border-radius: var(--radius-lg);
    overflow-y: auto;
    min-height: 0;
    /* 오른쪽 열을 꽉 채워 빈 공간 없이 (목록이 짧아도 패널이 세로로 채워짐) */
    align-self: stretch;

    h4 {
        font-size: 0.85rem;
        color: ${({ theme }) => theme.text};
        padding-bottom: 0.4rem;
        border-bottom: 1px solid ${({ theme }) => theme.cardBorder};
    }

    @media (min-width: 1100px) {
        display: flex;
    }
`;

/* 탭 바 오른쪽에 인라인으로 들어간다 — 절대 위치로 띄우면 탭을 가리므로 금지 */
export const Header = styled.header`
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-left: 0.25rem;
    flex-shrink: 0;
`;

export const ThemeToggleButton = styled.button`
    background: ${({ theme }) => theme.card};
    color: ${({ theme }) => theme.text};
    border: 1px solid ${({ theme }) => theme.cardBorder};
    border-radius: 9999px;
    padding: 0.4rem 0.8rem;
    cursor: pointer;
    font-size: 0.78rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease-in-out;
    &:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
`;

/* --- 공용 UI (디자인 균일화, DESIGN.md 규칙 준수) --- */

export const Card = styled.div`
    background: ${({ theme }) => theme.card};
    border: 1px solid ${({ theme }) => theme.cardBorder};
    border-radius: var(--radius-lg);
    padding: 1rem;
`;

export const ButtonBase = styled.button`
    padding: 12px;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-weight: bold;
    font-size: 0.9rem;
    transition: all 0.2s;
`;

export const PrimaryButton = styled(ButtonBase)`
    background: ${({ theme }) => theme.accentGradient};
    color: ${({ theme }) => theme.accentText};
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);

    &:hover:not(:disabled) {
        transform: translateY(-2px);
        filter: brightness(1.08);
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.22);
    }

    &:active:not(:disabled) {
        transform: translateY(0);
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

export const SecondaryButton = styled(ButtonBase)`
    background-color: transparent;
    border: 1px solid ${({ theme }) => theme.placeholder};
    color: ${({ theme }) => theme.text};
    &:hover {
        background-color: ${({ theme }) => theme.dragOver};
    }
`;

const fadeIn = keyframes`
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
`;

export const ModalOverlay = styled.div`
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(8px);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999;
`;

export const ModalContent = styled.div`
    background: ${({ theme }) => theme.card};
    border: 1px solid ${({ theme }) => theme.cardBorder};
    padding: 2rem;
    border-radius: var(--radius-lg);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
    width: 340px;
    text-align: center;
    animation: ${fadeIn} 0.2s ease-out;

    h3 {
        margin: 1rem 0 0.5rem;
        color: ${({ theme }) => theme.text};
        font-size: 1.4rem;
    }

    p {
        color: ${({ theme }) => theme.placeholder};
        font-size: 0.95rem;
        margin-bottom: 2rem;
    }
`;

export const TabBar = styled.nav`
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: ${({ theme }) => theme.card};
    border: 1px solid ${({ theme }) => theme.cardBorder};
    border-radius: var(--radius-lg);
    padding: 0.375rem;
    flex-wrap: wrap;
`;

export const TabButton = styled.button<{ $active?: boolean }>`
    flex: 1;
    padding: 0.5rem;
    border: none;
    border-radius: var(--radius-md);
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    background: ${({ theme, $active }) => ($active ? theme.accentGradient : 'transparent')};
    color: ${({ theme, $active }) => ($active ? theme.accentText : theme.placeholder)};

    &:hover {
        color: ${({ theme, $active }) => ($active ? theme.accentText : theme.text)};
    }
`;

/* --- 팀 빌더 --- */

export const TieredNamePoolContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    background: ${({ theme }) => theme.card};
    border: 1px solid ${({ theme }) => theme.cardBorder};
    border-radius: var(--radius-lg);
    padding: 0.75rem;
`;

export const TierRow = styled.div<{ $isDragOver?: boolean }>`
    min-height: calc(var(--control-h) + 8px);
    border-radius: var(--radius-md);
    background-color: ${({ theme, $isDragOver }) => $isDragOver ? theme.dragOver : 'transparent'};
    transition: background-color 0.2s ease;
    padding: 0.25rem 0.5rem;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
`;

export const TierLabel = styled.h3<{ $tierColor?: string }>`
    color: ${({ $tierColor }) => $tierColor};
    font-size: 1.05rem;
    width: 40px;
    text-align: center;
`;

const captainGlow = keyframes`
    0%, 100% { box-shadow: 0 0 3px 0 rgba(255,214,102,0.55), 0 0 7px 1px rgba(255,190,60,0.3); }
    50% { box-shadow: 0 0 5px 1px rgba(255,214,102,0.7), 0 0 10px 2px rgba(255,190,60,0.42); }
`;

export const DraggableName = styled.div<{ $inSlot?: boolean; tier?: Tier | null; $captain?: boolean }>`
    background-color: ${({ theme }) => theme.white};
    color: #1B1F27;
    padding: 0 1rem;
    height: var(--control-h);
    border-radius: var(--radius-md);
    cursor: grab;
    user-select: none;
    font-weight: 600;
    font-size: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s ease;
    width: ${({ $inSlot }) => ($inSlot ? '100%' : 'auto')};
    min-width: 72px;
    position: relative;
    display: flex;
    gap: 5px;
    border: 3px solid ${({ tier }) => tier ? TIER_META[tier].color : 'transparent'};
    /* 팀장: 은은한 골드 글로우 + 이름 위에 왕관. 더블클릭으로 토글 */
    ${({ $captain }) => $captain
        ? css`
            animation: ${captainGlow} 1.8s ease-in-out infinite;
            /* 이름 위 왕관 — 단순한 SVG (이모지 대신, 귀엽고 통일된 모양) */
            &::before {
                content: '';
                position: absolute;
                top: -0.62em;
                left: 50%;
                transform: translateX(-50%);
                width: 1.3em;
                height: 1em;
                background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 22' fill='none' stroke='%23FFD060' stroke-width='2.2' stroke-linejoin='round' stroke-linecap='round'%3E%3Cpath d='M3 19V8.5l6 4.2L15 4l6 8.5 6-4.2V19z'/%3E%3Cpath d='M3 15.6h24'/%3E%3C/svg%3E") center / contain no-repeat;
                filter: drop-shadow(0 1px 1px rgba(0,0,0,0.3));
                pointer-events: none;
            }
        `
        : css`box-shadow: 0 1px 3px rgba(0,0,0,0.1);`}

    &:active {
        cursor: grabbing;
        transform: scale(0.95);
    }
`;

export const LanesContainer = styled.main`
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    /* 라인들을 간격 없이 하나의 블록으로 붙인다 (가운데 정렬) */
    justify-content: center;
    align-items: stretch;
    gap: 0;
`;

export const Lane = styled.div`
    display: grid;
    /* 임시 칸(마지막 열)은 3명이 한눈에 보이도록 넓게 잡는다 */
    grid-template-columns: 80px 1fr 40px 1fr 40px minmax(200px, 0.95fr);
    align-items: center;
    gap: 1rem;
    background: ${({ theme }) => theme.card};
    border: 1px solid ${({ theme }) => theme.cardBorder};
    padding: 0.5rem 1.25rem;
    width: 100%;

    /* 붙어 있는 라인들 — 사이 테두리는 겹치지 않게 하고 바깥 모서리만 둥글게 */
    border-radius: 0;
    border-top-width: 0;
    &:first-child {
        border-top-width: 1px;
        border-top-left-radius: var(--radius-lg);
        border-top-right-radius: var(--radius-lg);
    }
    &:last-child {
        border-bottom-left-radius: var(--radius-lg);
        border-bottom-right-radius: var(--radius-lg);
    }

    @media (max-width: 560px) {
        gap: 0.5rem;
        grid-template-columns: 52px 1fr 28px 1fr 28px 0.9fr;
    }
`;

/* 아이콘이 탭 맞춘 것처럼 전 라인 같은 세로줄에서 시작하도록 좌측 정렬 고정 */
export const LaneLabel = styled.span`
    font-weight: 600;
    color: ${({ theme }) => theme.placeholder};
    font-size: 1rem;
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0.45rem;
`;

export const NameSlot = styled.div<{ $isDragOver?: boolean }>`
    height: var(--control-h);
    background-color: ${({ theme, $isDragOver }) => $isDragOver ? theme.dragOver : theme.body};
    border-radius: var(--radius-md);
    display: flex;
    justify-content: center;
    align-items: center;
    transition: background-color 0.2s ease;
`;

/* 라인 옆 임시 대기 슬롯 — 최대 3명, 전원이 한눈에 보이도록 가로로 나란히 표시 */
export const TempSlot = styled(NameSlot)`
    height: var(--control-h);
    flex-wrap: nowrap;
    justify-content: flex-start;
    gap: 4px;
    padding: 3px 5px;
    overflow: hidden;
    border: 1px dashed ${({ theme }) => theme.cardBorder};
    background-color: ${({ theme, $isDragOver }) => $isDragOver ? theme.dragOver : 'transparent'};

    /* 3명이 균등하게 나눠 쓰고, 이름이 길면 말줄임 */
    > * {
        min-width: 0;
        flex: 0 1 auto;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .ph {
        width: 100%;
        text-align: center;
        font-size: 0.72rem;
        color: ${({ theme }) => theme.placeholder};
        opacity: 0.65;
        user-select: none;
    }
`;

export const Operator = styled.div`
    font-size: 1.5rem;
    font-weight: bold;
    cursor: pointer;
    user-select: none;
    color: ${({ theme }) => theme.placeholder};
    text-align: center;
    transition: color 0.2s ease;
    &:hover { color: ${({ theme }) => theme.text}; }
`;

export const SwapButton = styled.button`
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 1.4rem;
    color: ${({ theme }) => theme.placeholder};
    transition: transform 0.2s ease, color 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    &:hover { transform: rotate(180deg); color: ${({ theme }) => theme.text}; }
`;

export const InputContainer = styled.footer`
    padding-top: 0;
`;

export const NameInput = styled.input`
    width: 100%;
    padding: 0.75rem 1rem;
    font-size: 1.05rem;
    border: 1px solid ${({ theme }) => theme.cardBorder};
    background: ${({ theme }) => theme.card};
    color: ${({ theme }) => theme.text};
    border-radius: var(--radius-lg);
    outline: none;
    text-align: center;
    transition: all 0.2s ease;
    &::placeholder { color: ${({ theme }) => theme.placeholder}; }
    &:focus { border-color: ${({ theme }) => theme.accent}; }
`;

export const ContextMenuContainer = styled.div.attrs<{ x: number; y: number }>(props => ({
    style: { top: `${props.y}px`, left: `${props.x}px` },
}))`
    position: absolute;
    background-color: ${({ theme }) => theme.contextMenu};
    border: 1px solid ${({ theme }) => theme.contextMenuBorder};
    border-radius: var(--radius-md);
    padding: 0.5rem;
    z-index: 1000;
    box-shadow: 0 5px 15px rgba(0,0,0,0.2);
`;

export const ContextMenuItem = styled.button`
    width: 100%;
    background: none;
    border: none;
    color: ${({theme}) => theme.text};
    padding: 0.75rem 1rem;
    text-align: left;
    cursor: pointer;
    border-radius: var(--radius-sm);
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;

    &:hover {
        background-color: ${({theme}) => theme.dragOver};
    }
`;

export const ColorDot = styled.span<{ color?: string }>`
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background-color: ${({ color }) => color};
    border: 1px solid ${({ theme }) => theme.contextMenuBorder};
`;

export const ActionButtonsContainer = styled.div`
    position: fixed;
    bottom: 2rem;
    left: 2rem;
    z-index: 10;
    display: flex;
    flex-direction: column-reverse;
    gap: 0.75rem;
`;

export const ActionButtonStyled = styled.button`
    background: ${({ theme }) => theme.card};
    color: ${({ theme }) => theme.text};
    border: 1px solid ${({ theme }) => theme.cardBorder};
    border-radius: var(--radius-md);
    padding: 0.5rem 1rem;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);

    &:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0,0,0,0.15);
    }
`;

export const FooterBar = styled.div`
    position: fixed;
    bottom: 0.75rem;
    right: 1rem;
    z-index: 10;
    display: flex;
    gap: 0.75rem;
    font-size: 0.75rem;

    a {
        color: ${({ theme }) => theme.placeholder};
        text-decoration: none;

        &:hover {
            color: ${({ theme }) => theme.text};
            text-decoration: underline;
        }
    }
`;

export const TextField = styled.input`
    padding: 0.5rem 0.75rem;
    font-size: 0.9rem;
    border: 1px solid ${({ theme }) => theme.cardBorder};
    background: ${({ theme }) => theme.body};
    color: ${({ theme }) => theme.text};
    border-radius: var(--radius-md);
    outline: none;
    transition: border-color 0.2s ease;
    &::placeholder { color: ${({ theme }) => theme.placeholder}; }
    &:hover { border-color: ${({ theme }) => theme.placeholder}; }
    &:focus { border-color: ${({ theme }) => theme.accent}; }

`;

/* 드롭다운·날짜 선택은 커스텀 컴포넌트 사용: components/ui/Select.tsx, DatePicker.tsx */

export const CompactButton = styled.button`
    padding: 0.35rem 0.7rem;
    font-size: 0.8rem;
    font-weight: 600;
    background: transparent;
    border: 1px solid ${({ theme }) => theme.cardBorder};
    color: ${({ theme }) => theme.text};
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background-color 0.2s ease;
    &:hover { background-color: ${({ theme }) => theme.dragOver}; }
`;

const slideUp = keyframes`
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
`;

export const ChatSideContainer = styled.div`
    position: fixed;
    bottom: 100px;
    width: 300px;
    height: 400px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow: hidden;
    z-index: 5;
    pointer-events: none;
    mask-image: linear-gradient(to bottom, transparent, black 20%);

    &.left { left: 20px; }
    &.right { right: 20px; }
`;

export const ChatBubble = styled.div`
    background: ${({ theme }) => theme.mode === 'light' ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.5)'};
    backdrop-filter: blur(4px);
    padding: 8px 12px;
    border-radius: var(--radius-md);
    font-size: 0.85rem;
    color: ${({ theme }) => theme.text};
    animation: ${slideUp} 0.3s ease-out;
    border-left: 3px solid ${({ theme }) => theme.accent};
    max-width: 100%;
    word-break: break-all;

    .name {
        font-weight: bold;
        color: ${({ theme }) => theme.accent};
        margin-right: 5px;
    }
`;
