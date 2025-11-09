import React, { useState, useEffect, useRef } from 'react';
import styled, { createGlobalStyle, ThemeProvider } from 'styled-components';
import html2canvas from 'html2canvas';
// --- THEMES & TIERS --- //
const TIER_COLORS = {
    상: '#52B788', // Green
    중: '#0077B6', // Blue
    하: '#F7B801', // Yellow
};

const lightTheme = {
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

const darkTheme = {
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
const GlobalStyle = createGlobalStyle`
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
const AppContainer = styled.div`
    display: flex;
    flex-direction: column;
    height: 100vh;
    padding: 2rem;
    gap: 1.5rem;
    max-width: 800px;
    margin: 0 auto;
`;

const Header = styled.header`
    position: absolute;
    top: 1.5rem;
    right: 1.5rem;
    z-index: 10;
`;

const ThemeToggleButton = styled.button`
    background: ${({ theme }) => theme.card}; color: ${({ theme }) => theme.text}; border: 1px solid ${({ theme }) => theme.cardBorder}; border-radius: 9999px; padding: 0.5rem; cursor: pointer; font-size: 1.2rem; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease-in-out;
    &:hover { transform: scale(1.1); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
`;

const TieredNamePoolContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 1rem;
    background: ${({ theme }) => theme.card};
    border: 1px solid ${({ theme }) => theme.cardBorder};
    border-radius: 12px;
    padding: 1rem;
`;

const TierRow = styled.div`
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

const TierLabel = styled.h3`
    color: ${({ tierColor }) => tierColor};
    font-size: 1.1rem;
    width: 40px;
    text-align: center;
`;


const DraggableName = styled.div`
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

const LanesContainer = styled.main`
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 1.25rem;
`;

const Lane = styled.div`
    display: grid; grid-template-columns: 80px 1fr 40px 1fr 40px; align-items: center; gap: 1rem; background: ${({ theme }) => theme.card}; border: 1px solid ${({ theme }) => theme.cardBorder}; padding: 1rem 1.5rem; border-radius: 12px; width: 100%;
`;

const LaneLabel = styled.span`
    font-weight: 600; text-align: right; color: ${({ theme }) => theme.placeholder}; font-size: 1.125rem;
`;

const NameSlot = styled.div`
    height: 48px;
    background-color: ${({ theme, $isDragOver }) => $isDragOver ? theme.dragOver : theme.body};
    border-radius: 8px;
    display: flex;
    justify-content: center;
    align-items: center;
    transition: background-color 0.2s ease;
`;

const Operator = styled.div`
    font-size: 1.75rem; font-weight: bold; cursor: pointer; user-select: none; color: ${({ theme }) => theme.placeholder}; text-align: center; transition: color 0.2s ease;
    &:hover { color: ${({ theme }) => theme.text}; }
`;

const SwapButton = styled.button`
    background: transparent; border: none; cursor: pointer; font-size: 1.5rem; color: ${({ theme }) => theme.placeholder}; transition: transform 0.2s ease, color 0.2s ease; display: flex; align-items: center; justify-content: center;
    &:hover { transform: rotate(180deg); color: ${({ theme }) => theme.text}; }
`;

const InputContainer = styled.footer`
    padding-top: 1rem;
`;

const NameInput = styled.input`
    width: 100%; padding: 1rem; font-size: 1.2rem; border: 1px solid ${({ theme }) => theme.cardBorder}; background: ${({ theme }) => theme.card}; color: ${({ theme }) => theme.text}; border-radius: 12px; outline: none; text-align: center; transition: all 0.2s ease;
    &::placeholder { color: ${({ theme }) => theme.placeholder}; }
    &:focus { border-color: ${({ theme }) => theme.text}; }
`;

const ContextMenuContainer = styled.div.attrs(props => ({
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

const ContextMenuItem = styled.button`
    width: 100%;
    background: none;
    border: none;
    color: ${({ theme }) => theme.text};
    padding: 0.75rem 1rem;
    text-align: left;
    cursor: pointer;
    border-radius: 6px;
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;

    &:hover {
        background-color: ${({ theme }) => theme.dragOver};
    }

    &.delete {
        color: #E53E3E;
    }
`;

const ColorDot = styled.span`
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background-color: ${({ color }) => color};
    border: 1px solid ${({ theme }) => theme.contextMenuBorder};
`;

// --- ACTION BUTTONS COMPONENT (Easy to Remove) --- //
const ActionButtonsContainer = styled.div`
    position: fixed;
    bottom: 2rem;
    left: 2rem;
    z-index: 10;
    display: flex;
    flex-direction: column-reverse;
    gap: 0.75rem;
`;

const ActionButtonStyled = styled.button`
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

const ActionButtons = ({ captureRef, onRandomize, onReset }) => {
    const [copyStatus, setCopyStatus] = useState('복사');
    const [randomizeStatus, setRandomizeStatus] = useState('지정');
    const [resetStatus, setResetStatus] = useState('초기화');

    const captureAndCopy = () => {
        if (captureRef.current) {
            html2canvas(captureRef.current, {
                backgroundColor: null,
                useCORS: true,
            }).then(canvas => {
                canvas.toBlob(blob => {
                    navigator.clipboard.write([
                        new ClipboardItem({ 'image/png': blob })
                    ]);
                    setCopyStatus('완료!');
                    setTimeout(() => setCopyStatus('복사'), 2000);
                });
            });
        }
    };

    const handleRandomizeClick = () => {
        onRandomize();
        setRandomizeStatus('완료!');
        setTimeout(() => setRandomizeStatus('지정'), 1500);
    };

    const handleResetClick = () => {
        onReset();
        setResetStatus('완료!');
        setTimeout(() => setResetStatus('초기화'), 1500);
    };

    return (
        <ActionButtonsContainer>
            <ActionButtonStyled onClick={handleResetClick}>
                🔄 초기화 {resetStatus}
            </ActionButtonStyled>
            <ActionButtonStyled onClick={captureAndCopy}>
                🖼️ 팀 화면 {copyStatus}
            </ActionButtonStyled>
            <ActionButtonStyled onClick={handleRandomizeClick}>
                🎲 팀 위치 {randomizeStatus}
            </ActionButtonStyled>
        </ActionButtonsContainer>
    );
};


// --- APP COMPONENT --- //
const POSITIONS = ['탑', '정글', '미드', '원딜', '서포터'];
const OPERATORS = ['=', '>', '<'];
const TIER_ORDER = { '상': 1, '중': 2, '하': 3, default: 99 };

const App = () => {
    const [theme, setTheme] = useState('dark');
    const [allPlayers, setAllPlayers] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const lanesRef = useRef(null);

    const initialLanes = POSITIONS.reduce((acc, pos) => {
        acc[pos] = { name1: null, name2: null, operator: '=' };
        return acc;
    }, {});

    const [lanes, setLanes] = useState(initialLanes);
    const [dragOverTarget, setDragOverTarget] = useState(null);
    const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, targetName: null });

    useEffect(() => {
        const handleClick = () => setContextMenu({ visible: false, x: 0, y: 0, targetName: null });
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light');

    const handleInputChange = (e) => setInputValue(e.target.value);

    const handleInputSubmit = (e) => {
        if (e.key === 'Enter' && e.target.value.trim() !== '') {
            const newNames = e.target.value.trim().split(/\s+/);

            setAllPlayers(prevPlayers => {
                const existingNames = prevPlayers.map(p => p.name);
                const newPlayers = newNames
                    .filter(name => !existingNames.includes(name)) // 중복되지 않은 이름만 필터링
                    .map(name => ({ name, tier: '중' })); // 기본 등급 '중'으로 추가
                return [...prevPlayers, ...newPlayers];
            });

            setInputValue('');
        }
    };

    const handleContextMenu = (e, name) => {
        e.preventDefault();
        setContextMenu({ visible: true, x: e.pageX, y: e.pageY, targetName: name });
    };

    const handleDeletePlayer = (nameToDelete) => {
        setAllPlayers(prev => prev.filter(p => p.name !== nameToDelete));
        setLanes(prev => {
            const newLanes = JSON.parse(JSON.stringify(prev));
            for (const pos in newLanes) {
                if (newLanes[pos].name1 === nameToDelete) newLanes[pos].name1 = null;
                if (newLanes[pos].name2 === nameToDelete) newLanes[pos].name2 = null;
            }
            return newLanes;
        });
    };

    const setPlayerTier = (name, tier) => {
        setAllPlayers(prev => prev.map(p => p.name === name ? { ...p, tier } : p));
    };

    const handleRandomizeSides = () => {
        if (Math.random() < 0.5) return;

        setLanes(prevLanes => {
            const newLanes = JSON.parse(JSON.stringify(prevLanes));
            for (const pos in newLanes) {
                const { name1, name2, operator } = newLanes[pos];
                newLanes[pos] = {
                    name1: name2,
                    name2: name1,
                    operator: operator === '>' ? '<' : operator === '<' ? '>' : '=',
                };
            }
            return newLanes;
        });
    };

    const handleReset = () => {
        setLanes(initialLanes); // lanes 상태를 초기 상태로 되돌립니다.
    };

    const onDragStart = (e, item) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", JSON.stringify(item));
    };
    const onDragOver = (e, target) => { e.preventDefault(); setDragOverTarget(target); };
    const onDragLeave = () => setDragOverTarget(null);

    const onDrop = (e, target) => {
        e.preventDefault();
        setDragOverTarget(null);
        const dragged = JSON.parse(e.dataTransfer.getData("text/plain"));

        if (target.type === 'pool') {
            if (dragged.origin.type === 'slot') {
                setLanes(prev => {
                    const newLanes = { ...prev };
                    newLanes[dragged.origin.position][dragged.origin.slot] = null;
                    return newLanes;
                });
            }
            setPlayerTier(dragged.name, target.tier); // 드롭된 열의 등급으로 변경
            return;
        }

        if (target.type === 'slot') {
            const { position, slot } = target;
            const nameInTargetSlot = lanes[position][slot];
            const { name: draggedName, origin: draggedOrigin } = dragged;

            if (draggedOrigin.type === 'slot' && draggedOrigin.position === position && draggedOrigin.slot === slot) return;

            if (nameInTargetSlot) {
                if (draggedOrigin.type === 'slot') {
                    setLanes(prev => {
                        const newLanes = JSON.parse(JSON.stringify(prev));
                        newLanes[position][slot] = draggedName;
                        newLanes[draggedOrigin.position][draggedOrigin.slot] = nameInTargetSlot;
                        return newLanes;
                    });
                } else {
                    setLanes(prev => ({ ...prev, [position]: { ...prev[position], [slot]: draggedName } }));
                    setPlayerTier(nameInTargetSlot, '중'); // 튕겨난 플레이어는 '중' 등급으로
                }
            } else {
                if (draggedOrigin.type === 'slot') {
                    setLanes(prev => {
                        const newLanes = { ...prev };
                        newLanes[draggedOrigin.position][draggedOrigin.slot] = null;
                        newLanes[position][slot] = draggedName;
                        return newLanes;
                    });
                } else {
                    setLanes(prev => ({ ...prev, [position]: { ...prev[position], [slot]: draggedName } }));
                }
            }
        }
    };

    const handleOperatorClick = (position, event) => { event.preventDefault(); const currentOperator = lanes[position].operator; const currentIndex = OPERATORS.indexOf(currentOperator); let nextIndex; if(event.type === 'contextmenu') { nextIndex = (currentIndex + 1) % OPERATORS.length; } else { nextIndex = (currentIndex - 1 + OPERATORS.length) % OPERATORS.length; } setLanes(prev => ({ ...prev, [position]: {...prev[position], operator: OPERATORS[nextIndex]} })); };
    const handleSwap = (position) => { setLanes(prev => { const currentLane = prev[position]; const newOperator = currentLane.operator === '>' ? '<' : currentLane.operator === '<' ? '>' : '='; return { ...prev, [position]: { name1: currentLane.name2, name2: currentLane.name1, operator: newOperator } } }); };

    const playersInLanes = Object.values(lanes).flatMap(l => [l.name1, l.name2]).filter(Boolean);
    const playersInPool = allPlayers.filter(p => !playersInLanes.includes(p.name));

    const findPlayer = (name) => allPlayers.find(p => p.name === name);

    const tierLists = {
        '상': playersInPool.filter(p => p.tier === '상'),
        '중': playersInPool.filter(p => p.tier === '중' || !p.tier),
        '하': playersInPool.filter(p => p.tier === '하'),
    };

    return (
        <ThemeProvider theme={theme === 'light' ? lightTheme : darkTheme}>
            <GlobalStyle />
            {contextMenu.visible && (
                <ContextMenuContainer x={contextMenu.x} y={contextMenu.y}>
                    {Object.keys(TIER_COLORS).map(tier => (
                        <ContextMenuItem key={tier} onClick={() => setPlayerTier(contextMenu.targetName, tier)}>
                            <ColorDot color={theme[tier]} /> {tier}
                        </ContextMenuItem>
                    ))}
                    <ContextMenuItem onClick={() => setPlayerTier(contextMenu.targetName, null)}>
                        <span style={{width:'12px', marginRight:'0.5rem'}}>⚪</span> 등급 취소
                    </ContextMenuItem>
                    <ContextMenuItem className="delete" onClick={() => handleDeletePlayer(contextMenu.targetName)}>
                        <span style={{width:'12px', marginRight:'0.5rem'}}>🗑️</span> 삭제
                    </ContextMenuItem>
                </ContextMenuContainer>
            )}
            <AppContainer>
                <Header>
                    <ThemeToggleButton onClick={toggleTheme}>
                        {theme === 'light' ? '☀️' : '🌙'}
                    </ThemeToggleButton>
                </Header>

                <TieredNamePoolContainer>
                    {Object.keys(tierLists).map(tier => (
                        <TierRow
                            key={tier}
                            onDragOver={(e) => onDragOver(e, { type: 'pool', tier })}
                            onDragLeave={onDragLeave}
                            onDrop={(e) => onDrop(e, { type: 'pool', tier })}
                            $isDragOver={dragOverTarget?.type === 'pool' && dragOverTarget?.tier === tier}
                        >
                            <TierLabel tierColor={theme[tier]}>{tier}</TierLabel>
                            {tierLists[tier].map(player => (
                                <DraggableName
                                    key={player.name}
                                    draggable
                                    onDragStart={(e) => onDragStart(e, { name: player.name, origin: { type: 'pool' } })}
                                    onContextMenu={(e) => handleContextMenu(e, player.name)}
                                    tier={player.tier || (tier === '중' ? null : player.tier)}
                                    $inSlot={false}
                                >
                                    {player.name}
                                </DraggableName>
                            ))}
                        </TierRow>
                    ))}
                </TieredNamePoolContainer>

                <LanesContainer ref={lanesRef}>
                    {POSITIONS.map(pos => {
                        const laneData = lanes[pos];
                        return (
                            <Lane key={pos}>
                                <LaneLabel>{pos}</LaneLabel>
                                <NameSlot
                                    onDragOver={(e) => onDragOver(e, { type: 'slot', position: pos, slot: 'name1' })}
                                    onDragLeave={onDragLeave}
                                    onDrop={(e) => onDrop(e, { type: 'slot', position: pos, slot: 'name1' })}
                                    $isDragOver={dragOverTarget?.position === pos && dragOverTarget?.slot === 'name1'}
                                >
                                    {laneData.name1 && (
                                        <DraggableName
                                            draggable
                                            onDragStart={(e) => onDragStart(e, { name: laneData.name1, origin: { type: 'slot', position: pos, slot: 'name1' } })}
                                            onContextMenu={(e) => handleContextMenu(e, laneData.name1)}
                                            tier={findPlayer(laneData.name1)?.tier}
                                            $inSlot={true}
                                        >
                                            {laneData.name1}
                                        </DraggableName>
                                    )}
                                </NameSlot>
                                <Operator onClick={(e) => handleOperatorClick(pos, e)} onContextMenu={(e) => handleOperatorClick(pos, e)}>
                                    {laneData.operator}
                                </Operator>
                                <NameSlot
                                    onDragOver={(e) => onDragOver(e, { type: 'slot', position: pos, slot: 'name2' })}
                                    onDragLeave={onDragLeave}
                                    onDrop={(e) => onDrop(e, { type: 'slot', position: pos, slot: 'name2' })}
                                    $isDragOver={dragOverTarget?.position === pos && dragOverTarget?.slot === 'name2'}
                                >
                                    {laneData.name2 && (
                                        <DraggableName
                                            draggable
                                            onDragStart={(e) => onDragStart(e, { name: laneData.name2, origin: { type: 'slot', position: pos, slot: 'name2' } })}
                                            onContextMenu={(e) => handleContextMenu(e, laneData.name2)}
                                            tier={findPlayer(laneData.name2)?.tier}
                                            $inSlot={true}
                                        >
                                            {laneData.name2}
                                        </DraggableName>
                                    )}
                                </NameSlot>
                                <SwapButton onClick={() => handleSwap(pos)}>⇆</SwapButton>
                            </Lane>
                        )
                    })}
                </LanesContainer>

                <InputContainer>
                    <NameInput
                        type="text"
                        placeholder="이름을 스페이스바로 구분하여 입력 후 Enter"
                        value={inputValue}
                        onChange={handleInputChange}
                        onKeyDown={handleInputSubmit}
                    />
                </InputContainer>
            </AppContainer>

            <ActionButtons captureRef={lanesRef} onRandomize={handleRandomizeSides} onReset={handleReset} />
        </ThemeProvider>
    );
};

export default App;


