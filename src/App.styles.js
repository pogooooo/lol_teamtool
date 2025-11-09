import styled, { createGlobalStyle } from 'styled-components';

// --- THEMES & TIERS --- //
export const TIER_COLORS = {
    상: '#52B788', // Green
    중: '#0077B6', // Blue
    하: '#F7B801', // Yellow
};

export const lightTheme = {
    body: '#F8F9FA',
    text: '#212529',
    card: '#FFFFFF',
    cardBorder: '#E9ECEF',
    placeholder: '#6C757D',
    dragOver: '#F1F3F5',
    nameBg: '#495057',
    nameText: '#FFFFFF',
    contextMenu: '#FFFFFF',
    contextMenuBorder: '#DEE2E6',
    ...TIER_COLORS
};

export const darkTheme = {
    body: '#212529',
    text: '#F8F9FA',
    card: '#343A40',
    cardBorder: '#495057',
    placeholder: '#ADB5BD',
    dragOver: '#495057',
    nameBg: '#F8F9FA',
    nameText: '#212529',
    contextMenu: '#2C3238',
    contextMenuBorder: '#495057',
    ...TIER_COLORS
};


// --- GLOBAL STYLES --- //
export const GlobalStyle = createGlobalStyle`
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
        background-color: ${({ theme }) => theme.body};
        color: ${({ theme }) => theme.text};
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        transition: background-color 0.2s ease, color 0.2s ease;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        font-size: 16px;
    }
`;

// --- STYLED COMPONENTS --- //
export const AppContainer = styled.div`
    display: flex;
    flex-direction: column;
    height: 100vh;
    padding: 2rem;
    gap: 1.5rem;
    max-width: 800px;
    margin: 0 auto;
`;

export const Header = styled.header`
    position: absolute;
    top: 1.5rem;
    right: 1.5rem;
    z-index: 10;
`;

export const ThemeToggleButton = styled.button`
    background: ${({ theme }) => theme.card}; color: ${({ theme }) => theme.text}; border: 1px solid ${({ theme }) => theme.cardBorder}; border-radius: 9999px; padding: 0.5rem; cursor: pointer; font-size: 1.2rem; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease-in-out;
    &:hover { transform: scale(1.1); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
`;

export const TieredNamePoolContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 1rem;
    background: ${({ theme }) => theme.card};
    border: 1px solid ${({ theme }) => theme.cardBorder};
    border-radius: 12px;
    padding: 1rem;
`;

export const TierRow = styled.div`
    min-height: 52px;
    border-radius: 8px;
    background-color: ${({ theme, $isDragOver }) => $isDragOver ? theme.dragOver : 'transparent'};
    transition: background-color 0.2s ease;
    padding: 0.5rem;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
`;

export const TierLabel = styled.h3`
    color: ${({ tierColor }) => tierColor};
    font-size: 1.1rem;
    width: 40px;
    text-align: center;
`;


export const DraggableName = styled.div`
    background-color: ${({ theme }) => theme.nameBg};
    color: ${({ theme }) => theme.nameText};
    padding: 0 1rem;
    height: 48px;
    border-radius: 8px;
    cursor: grab;
    user-select: none;
    font-weight: 600;
    font-size: 1.1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    width: ${({ $inSlot }) => ($inSlot ? '100%' : 'auto')};
    min-width: 80px;
    
    /* html2canvas가 인식할 수 있도록 box-shadow 대신 border 사용 */
    border: 4px solid ${({ theme, tier }) => tier ? theme[tier] : 'transparent'};
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
    gap: 1.25rem;
`;

export const Lane = styled.div`
    display: grid; grid-template-columns: 80px 1fr 40px 1fr 40px; align-items: center; gap: 1rem; background: ${({ theme }) => theme.card}; border: 1px solid ${({ theme }) => theme.cardBorder}; padding: 1rem 1.5rem; border-radius: 12px; width: 100%;
`;

export const LaneLabel = styled.span`
    font-weight: 600; text-align: right; color: ${({ theme }) => theme.placeholder}; font-size: 1.125rem;
`;

export const NameSlot = styled.div`
    height: 48px;
    background-color: ${({ theme, $isDragOver }) => $isDragOver ? theme.dragOver : theme.body};
    border-radius: 8px;
    display: flex;
    justify-content: center;
    align-items: center;
    transition: background-color 0.2s ease;
`;

export const Operator = styled.div`
    font-size: 1.75rem; font-weight: bold; cursor: pointer; user-select: none; color: ${({ theme }) => theme.placeholder}; text-align: center; transition: color 0.2s ease;
    &:hover { color: ${({ theme }) => theme.text}; }
`;

export const SwapButton = styled.button`
    background: transparent; border: none; cursor: pointer; font-size: 1.5rem; color: ${({ theme }) => theme.placeholder}; transition: transform 0.2s ease, color 0.2s ease; display: flex; align-items: center; justify-content: center;
    &:hover { transform: rotate(180deg); color: ${({ theme }) => theme.text}; }
`;

export const InputContainer = styled.footer`
    padding-top: 1rem;
`;

export const NameInput = styled.input`
    width: 100%; padding: 1rem; font-size: 1.2rem; border: 1px solid ${({ theme }) => theme.cardBorder}; background: ${({ theme }) => theme.card}; color: ${({ theme }) => theme.text}; border-radius: 12px; outline: none; text-align: center; transition: all 0.2s ease;
    &::placeholder { color: ${({ theme }) => theme.placeholder}; }
    &:focus { border-color: ${({ theme }) => theme.text}; }
`;

export const ContextMenuContainer = styled.div.attrs(props => ({
    style: { top: `${props.y}px`, left: `${props.x}px` },
}))`
    position: absolute;
    background-color: ${({ theme }) => theme.contextMenu};
    border: 1px solid ${({ theme }) => theme.contextMenuBorder};
    border-radius: 8px;
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
    border-radius: 6px;
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;

    &:hover {
        background-color: ${({theme}) => theme.dragOver};
    }

`;

export const ColorDot = styled.span`
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background-color: ${({ color }) => color};
    border: 1px solid ${({ theme }) => theme.contextMenuBorder};
`;

// --- ACTION BUTTONS STYLES --- //
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
    border-radius: 8px;
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
