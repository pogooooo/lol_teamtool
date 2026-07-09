import styled, { createGlobalStyle, keyframes } from 'styled-components';
import type { DefaultTheme } from 'styled-components';
import type { Tier } from './types';

export const TIER_COLORS = {
    상: '#52B788',
    중: '#0077B6',
    하: '#F7B801',
};

/*
 * 팔레트 정의는 DESIGN.md 참고.
 * 라이트: #F8FAFC #D9EAFD #BCCCDC #9AA6B2 (+파생 잉크 #6B7A89 #4A5764 #2B3644)
 * 다크:   #352F44 #5C5470 #B9B4C7 #FAF0E6 (+파생 서피스 #453D57)
 */
export const lightTheme: DefaultTheme = {
    mode: 'light',
    body: '#F8FAFC',
    text: '#2B3644',
    card: '#D9EAFD',
    cardBorder: '#BCCCDC',
    placeholder: '#6B7A89',
    dragOver: '#BCCCDC',
    nameBg: '#4A5764',
    nameText: '#F8FAFC',
    contextMenu: '#F8FAFC',
    contextMenuBorder: '#BCCCDC',
    accent: '#4A5764',
    accentGradient: 'linear-gradient(135deg, #6B7A89 0%, #4A5764 100%)',
    accentText: '#F8FAFC',
    teamBlue: '#0077B6',
    teamRed: '#E63946',
    grass1: '#A9DFC1',
    grass2: '#52B788',
    grass3: '#1E7A54',
    ...TIER_COLORS
};

export const darkTheme: DefaultTheme = {
    mode: 'dark',
    body: '#352F44',
    text: '#FAF0E6',
    card: '#453D57',
    cardBorder: '#5C5470',
    placeholder: '#B9B4C7',
    dragOver: '#5C5470',
    nameBg: '#FAF0E6',
    nameText: '#352F44',
    contextMenu: '#453D57',
    contextMenuBorder: '#5C5470',
    accent: '#B9B4C7',
    accentGradient: 'linear-gradient(135deg, #FAF0E6 0%, #B9B4C7 100%)',
    accentText: '#352F44',
    teamBlue: '#4DA8DA',
    teamRed: '#F07178',
    grass1: '#3E7A5C',
    grass2: '#57B384',
    grass3: '#95E3B8',
    ...TIER_COLORS
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
    max-width: 800px;
`;

export const Header = styled.header`
    position: absolute;
    top: 1.5rem;
    right: 1.5rem;
    z-index: 10;
`;

export const ThemeToggleButton = styled.button`
    background: ${({ theme }) => theme.card};
    color: ${({ theme }) => theme.text};
    border: 1px solid ${({ theme }) => theme.cardBorder};
    border-radius: 9999px;
    padding: 0.5rem;
    cursor: pointer;
    font-size: 1.2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease-in-out;
    &:hover { transform: scale(1.1); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
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
    gap: 0.5rem;
    background: ${({ theme }) => theme.card};
    border: 1px solid ${({ theme }) => theme.cardBorder};
    border-radius: var(--radius-lg);
    padding: 0.375rem;
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

export const DraggableName = styled.div<{ $inSlot?: boolean; tier?: Tier | null }>`
    background-color: ${({ theme }) => theme.nameBg};
    color: ${({ theme }) => theme.nameText};
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
    transition: all 0.2s ease;
    width: ${({ $inSlot }) => ($inSlot ? '100%' : 'auto')};
    min-width: 72px;
    border: 3px solid ${({ theme, tier }) => tier ? theme[tier] : 'transparent'};
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);

    &:active {
        cursor: grabbing;
        transform: scale(0.95);
    }
`;

export const LanesContainer = styled.main`
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: var(--lane-gap);
`;

export const Lane = styled.div`
    display: grid;
    grid-template-columns: 80px 1fr 40px 1fr 40px;
    align-items: center;
    gap: 1rem;
    background: ${({ theme }) => theme.card};
    border: 1px solid ${({ theme }) => theme.cardBorder};
    padding: 0.5rem 1.25rem;
    border-radius: var(--radius-lg);
    width: 100%;
`;

export const LaneLabel = styled.span`
    font-weight: 600;
    text-align: right;
    color: ${({ theme }) => theme.placeholder};
    font-size: 1rem;
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
