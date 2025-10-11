import React, { useState } from 'react';
import styled, { createGlobalStyle, ThemeProvider } from 'styled-components';

// --- THEMES --- //
const lightTheme = {
    body: '#F8F9FA',
    text: '#212529',
    card: '#FFFFFF',
    cardBorder: '#E9ECEF',
    placeholder: '#6C757D',
    dragOver: '#F1F3F5',
    nameBg: '#495057',
    nameText: '#FFFFFF',
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
};

// --- GLOBAL STYLES --- //
const GlobalStyle = createGlobalStyle`
    *, *::before, *::after {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
    }
    body {
        background-color: ${({ theme }) => theme.body};
        color: ${({ theme }) => theme.text};
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        transition: background-color 0.3s ease, color 0.3s ease;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
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
`;

const ThemeToggleButton = styled.button`
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

    &:hover {
        transform: scale(1.1);
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
`;

const NamePoolContainer = styled.div`
    background: ${({ theme }) => theme.card};
    border: 1px solid ${({ theme }) => theme.cardBorder};
    border-radius: 12px;
    padding: 1rem;
    min-height: 80px;
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 0.75rem;
    transition: background-color 0.2s ease;
    background-color: ${({ theme, $isDragOver }) => $isDragOver ? theme.dragOver : theme.card};
`;

const DraggableName = styled.div`
    background-color: ${({ theme }) => theme.nameBg};
    color: ${({ theme }) => theme.nameText};
    padding: 0 1rem;
    height: 48px;
    border-radius: 8px;
    cursor: grab;
    user-select: none;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s ease;
    width: ${({ $inSlot }) => ($inSlot ? '100%' : 'auto')};

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
    gap: 1rem;
`;

const Lane = styled.div`
    display: grid;
    grid-template-columns: 60px 1fr 40px 1fr 40px;
    align-items: center;
    gap: 0.75rem;
    background: ${({ theme }) => theme.card};
    border: 1px solid ${({ theme }) => theme.cardBorder};
    padding: 1rem 1.5rem;
    border-radius: 12px;
    width: 100%;
`;

const LaneLabel = styled.span`
    font-weight: 600;
    text-align: right;
    margin-right: 10px;
    color: ${({ theme }) => theme.placeholder};
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
    font-size: 1.5rem;
    font-weight: bold;
    cursor: pointer;
    user-select: none;
    color: ${({ theme }) => theme.placeholder};
    text-align: center;
    transition: color 0.2s ease;
    &:hover {
        color: ${({ theme }) => theme.text};
    }
`;

const SwapButton = styled.button`
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 1.5rem;
    color: ${({ theme }) => theme.placeholder};
    transition: transform 0.2s ease, color 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
        transform: rotate(180deg);
        color: ${({ theme }) => theme.text};
    }
`;


const InputContainer = styled.footer`
    padding-top: 1rem;
`;

const NameInput = styled.input`
    width: 100%;
    padding: 1rem;
    font-size: 1.1rem;
    border: 1px solid ${({ theme }) => theme.cardBorder};
    background: ${({ theme }) => theme.card};
    color: ${({ theme }) => theme.text};
    border-radius: 12px;
    outline: none;
    text-align: center;
    transition: all 0.2s ease;

    &::placeholder {
        color: ${({ theme }) => theme.placeholder};
    }

    &:focus {
        border-color: ${({ theme }) => theme.text};
    }
`;

// --- APP COMPONENT --- //
const POSITIONS = ['탑', '정글', '미드', '원딜', '서포터'];
const OPERATORS = ['=', '>', '<'];

const App = () => {
    const [theme, setTheme] = useState('light');
    const [names, setNames] = useState([]);
    const [inputValue, setInputValue] = useState('');

    const initialLanes = POSITIONS.reduce((acc, pos) => {
        acc[pos] = { name1: null, name2: null, operator: '=' };
        return acc;
    }, {});

    const [lanes, setLanes] = useState(initialLanes);
    const [dragOverTarget, setDragOverTarget] = useState(null);

    const toggleTheme = () => {
        setTheme(theme === 'light' ? 'dark' : 'light');
    };

    const handleInputChange = (e) => {
        setInputValue(e.target.value);
    };

    const handleInputSubmit = (e) => {
        if (e.key === 'Enter' && e.target.value.trim() !== '') {
            const newNames = e.target.value.trim().split(/\s+/);
            setNames(newNames);
            setLanes(initialLanes);
            setInputValue('');
        }
    };

    const onDragStart = (e, item) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", JSON.stringify(item));
    };

    const onDragOver = (e, target) => {
        e.preventDefault();
        setDragOverTarget(target);
    };

    const onDragLeave = () => {
        setDragOverTarget(null);
    }

    const onDrop = (e, target) => {
        e.preventDefault();
        setDragOverTarget(null);
        const dragged = JSON.parse(e.dataTransfer.getData("text/plain"));

        if (target.type === 'pool') {
            if(dragged.origin.type === 'slot') {
                setLanes(prev => {
                    const newLanes = {...prev};
                    newLanes[dragged.origin.position][dragged.origin.slot] = null;
                    return newLanes;
                });
                setNames(prev => [...prev, dragged.name]);
            }
            return;
        }

        if (target.type === 'slot') {
            const { position, slot } = target;
            const nameInTargetSlot = lanes[position][slot];
            const { name: draggedName, origin: draggedOrigin } = dragged;

            if (draggedOrigin.type === 'slot' && draggedOrigin.position === position && draggedOrigin.slot === slot) {
                return; // 자기 자신 위에 드롭하는 것 방지
            }

            // Case 1: 드롭 대상 슬롯에 이미 이름이 있는 경우 (SWAP)
            if (nameInTargetSlot) {
                if (draggedOrigin.type === 'slot') { // 슬롯 -> 슬롯
                    setLanes(prev => {
                        const newLanes = JSON.parse(JSON.stringify(prev));
                        newLanes[position][slot] = draggedName;
                        newLanes[draggedOrigin.position][draggedOrigin.slot] = nameInTargetSlot;
                        return newLanes;
                    });
                } else { // 풀 -> 슬롯
                    setLanes(prev => ({...prev, [position]: {...prev[position], [slot]: draggedName }}));
                    setNames(prev => [...prev.filter(n => n !== draggedName), nameInTargetSlot]);
                }
            }
            // Case 2: 드롭 대상 슬롯이 비어있는 경우 (MOVE)
            else {
                if (draggedOrigin.type === 'slot') { // 슬롯 -> 빈 슬롯
                    setLanes(prev => {
                        const newLanes = {...prev};
                        newLanes[draggedOrigin.position][draggedOrigin.slot] = null;
                        newLanes[position][slot] = draggedName;
                        return newLanes;
                    });
                } else { // 풀 -> 빈 슬롯
                    setLanes(prev => ({...prev, [position]: {...prev[position], [slot]: draggedName }}));
                    setNames(prev => prev.filter(n => n !== draggedName));
                }
            }
        }
    };

    const handleOperatorClick = (position, event) => {
        event.preventDefault();
        const currentOperator = lanes[position].operator;
        const currentIndex = OPERATORS.indexOf(currentOperator);
        let nextIndex;

        if(event.type === 'contextmenu') { // 우클릭
            nextIndex = (currentIndex + 1) % OPERATORS.length;
        } else { // 좌클릭
            nextIndex = (currentIndex - 1 + OPERATORS.length) % OPERATORS.length;
        }

        setLanes(prev => ({
            ...prev,
            [position]: {...prev[position], operator: OPERATORS[nextIndex]}
        }));
    };

    const handleSwap = (position) => {
        setLanes(prev => {
            const currentLane = prev[position];
            const newOperator = currentLane.operator === '>' ? '<' : currentLane.operator === '<' ? '>' : '=';
            return { ...prev, [position]: {
                    name1: currentLane.name2,
                    name2: currentLane.name1,
                    operator: newOperator
                }
            }
        });
    };

    return (
        <ThemeProvider theme={theme === 'light' ? lightTheme : darkTheme}>
            <GlobalStyle />
            <AppContainer>
                <Header>
                    <ThemeToggleButton onClick={toggleTheme}>
                        {theme === 'light' ? '🌙' : '☀️'}
                    </ThemeToggleButton>
                </Header>

                <NamePoolContainer
                    onDragOver={(e) => onDragOver(e, { type: 'pool' })}
                    onDragLeave={onDragLeave}
                    onDrop={(e) => onDrop(e, { type: 'pool' })}
                    $isDragOver={dragOverTarget?.type === 'pool'}
                >
                    {names.map(name => (
                        <DraggableName
                            key={name}
                            draggable
                            onDragStart={(e) => onDragStart(e, { name, origin: { type: 'pool' } })}
                            $inSlot={false}
                        >
                            {name}
                        </DraggableName>
                    ))}
                </NamePoolContainer>

                <LanesContainer>
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
                                            $inSlot={true}
                                        >
                                            {laneData.name1}
                                        </DraggableName>
                                    )}
                                </NameSlot>
                                <Operator
                                    onClick={(e) => handleOperatorClick(pos, e)}
                                    onContextMenu={(e) => handleOperatorClick(pos, e)}
                                >
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
        </ThemeProvider>
    );
};

export default App;

