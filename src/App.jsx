import React, { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import { ThemeProvider } from 'styled-components';

import {
    GlobalStyle,
    lightTheme,
    darkTheme,
    TIER_COLORS,
    AppContainer,
    Header,
    ThemeToggleButton,
    TieredNamePoolContainer,
    TierRow,
    TierLabel,
    DraggableName,
    LanesContainer,
    Lane,
    LaneLabel,
    NameSlot,
    Operator,
    SwapButton,
    InputContainer,
    NameInput,
    ContextMenuContainer,
    ContextMenuItem,
    ColorDot,
    ActionButtonsContainer,
    ActionButtonStyled
} from './App.styles.js';

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
const OPERATORS = ['>', '>=', '=', '<=', '<'];

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
            <GlobalStyle/>
            {contextMenu.visible && (
                <ContextMenuContainer x={contextMenu.x} y={contextMenu.y}>
                    {Object.keys(TIER_COLORS).map(tier => (
                        <ContextMenuItem key={tier} onClick={() => setPlayerTier(contextMenu.targetName, tier)}>
                            <ColorDot color={theme[tier]}/> {tier}
                        </ContextMenuItem>
                    ))}
                    <ContextMenuItem onClick={() => setPlayerTier(contextMenu.targetName, null)}>
                        <span style={{width: '12px', marginRight: '0.5rem'}}>⚪</span> 등급 취소
                    </ContextMenuItem>
                    <ContextMenuItem className="delete" onClick={() => handleDeletePlayer(contextMenu.targetName)}>
                        <span style={{width: '12px', marginRight: '0.5rem'}}>🗑️</span> 삭제
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
                            onDragOver={(e) => onDragOver(e, {type: 'pool', tier})}
                            onDragLeave={onDragLeave}
                            onDrop={(e) => onDrop(e, {type: 'pool', tier})}
                            $isDragOver={dragOverTarget?.type === 'pool' && dragOverTarget?.tier === tier}
                        >
                            <TierLabel tierColor={theme[tier]}>{tier}</TierLabel>
                            {tierLists[tier].map(player => (
                                <DraggableName
                                    key={player.name}
                                    draggable
                                    onDragStart={(e) => onDragStart(e, {name: player.name, origin: {type: 'pool'}})}
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
                                    onDragOver={(e) => onDragOver(e, {type: 'slot', position: pos, slot: 'name1'})}
                                    onDragLeave={onDragLeave}
                                    onDrop={(e) => onDrop(e, {type: 'slot', position: pos, slot: 'name1'})}
                                    $isDragOver={dragOverTarget?.position === pos && dragOverTarget?.slot === 'name1'}
                                >
                                    {laneData.name1 && (
                                        <DraggableName
                                            draggable
                                            onDragStart={(e) => onDragStart(e, {
                                                name: laneData.name1,
                                                origin: {type: 'slot', position: pos, slot: 'name1'}
                                            })}
                                            onContextMenu={(e) => handleContextMenu(e, laneData.name1)}
                                            tier={findPlayer(laneData.name1)?.tier}
                                            $inSlot={true}
                                        >
                                            {laneData.name1}
                                        </DraggableName>
                                    )}
                                </NameSlot>
                                <Operator onClick={(e) => handleOperatorClick(pos, e)}
                                          onContextMenu={(e) => handleOperatorClick(pos, e)}>
                                    {laneData.operator}
                                </Operator>
                                <NameSlot
                                    onDragOver={(e) => onDragOver(e, {type: 'slot', position: pos, slot: 'name2'})}
                                    onDragLeave={onDragLeave}
                                    onDrop={(e) => onDrop(e, {type: 'slot', position: pos, slot: 'name2'})}
                                    $isDragOver={dragOverTarget?.position === pos && dragOverTarget?.slot === 'name2'}
                                >
                                    {laneData.name2 && (
                                        <DraggableName
                                            draggable
                                            onDragStart={(e) => onDragStart(e, {
                                                name: laneData.name2,
                                                origin: {type: 'slot', position: pos, slot: 'name2'}
                                            })}
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

            <ActionButtons captureRef={lanesRef} onRandomize={handleRandomizeSides} onReset={handleReset}/>
        </ThemeProvider>
    );
};

export default App;


