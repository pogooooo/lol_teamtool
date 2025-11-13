import React, { useRef } from 'react';
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
    ColorDot
} from './App.styles.js';

import { POSITIONS, TIER_KEYS } from './constants.jsx';
import ActionButtons from './components/ActionButtons.jsx';
import { useTeamBuilderLogic } from './hooks/useTeamBuilderLogic.jsx';


const App = () => {
    const {
        theme,
        toggleTheme,
        lanes,
        dragOverTarget,
        contextMenu,
        inputValue,
        tierLists,
        handlers
    } = useTeamBuilderLogic();

    const lanesRef = useRef(null); // DOM ref는 컴포넌트에 유지합니다.

    return (
        <ThemeProvider theme={theme === 'light' ? lightTheme : darkTheme}>
            <GlobalStyle />
            {contextMenu.visible && (
                <ContextMenuContainer x={contextMenu.x} y={contextMenu.y}>
                    {TIER_KEYS.map(tier => (
                        <ContextMenuItem key={tier} onClick={() => handlers.setPlayerTier(contextMenu.targetName, tier)}>
                            <ColorDot color={theme[tier]} /> {tier}
                        </ContextMenuItem>
                    ))}
                    <ContextMenuItem onClick={() => handlers.setPlayerTier(contextMenu.targetName, null)}>
                        <span style={{ width: '12px', marginRight: '0.5rem' }}>⚪</span> 등급 취소
                    </ContextMenuItem>
                    <ContextMenuItem className="delete" onClick={() => handlers.handleDeletePlayer(contextMenu.targetName)}>
                        <span style={{ width: '12px', marginRight: '0.5rem' }}>🗑️</span> 삭제
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
                    {TIER_KEYS.map(tier => (
                        <TierRow
                            key={tier}
                            onDragOver={(e) => handlers.onDragOver(e, { type: 'pool', tier })}
                            onDragLeave={handlers.onDragLeave}
                            onDrop={(e) => handlers.onDrop(e, { type: 'pool', tier })}
                            $isDragOver={dragOverTarget?.type === 'pool' && dragOverTarget?.tier === tier}
                        >
                            <TierLabel tierColor={theme[tier]}>{tier}</TierLabel>
                            {tierLists[tier].map(player => (
                                <DraggableName
                                    key={player.name}
                                    draggable
                                    onDragStart={(e) => handlers.onDragStart(e, { name: player.name, origin: { type: 'pool' } })}
                                    onContextMenu={(e) => handlers.handleContextMenu(e, player.name)}
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
                                    onDragOver={(e) => handlers.onDragOver(e, { type: 'slot', position: pos, slot: 'name1' })}
                                    onDragLeave={handlers.onDragLeave}
                                    onDrop={(e) => handlers.onDrop(e, { type: 'slot', position: pos, slot: 'name1' })}
                                    $isDragOver={dragOverTarget?.position === pos && dragOverTarget?.slot === 'name1'}
                                >
                                    {laneData.name1 && (
                                        <DraggableName
                                            draggable
                                            onDragStart={(e) => handlers.onDragStart(e, {
                                                name: laneData.name1,
                                                origin: { type: 'slot', position: pos, slot: 'name1' }
                                            })}
                                            onContextMenu={(e) => handlers.handleContextMenu(e, laneData.name1)}
                                            tier={handlers.findPlayer(laneData.name1)?.tier}
                                            $inSlot={true}
                                        >
                                            {laneData.name1}
                                        </DraggableName>
                                    )}
                                </NameSlot>
                                <Operator onClick={(e) => handlers.handleOperatorClick(pos, e)}
                                          onContextMenu={(e) => handlers.handleOperatorClick(pos, e)}>
                                    {laneData.operator}
                                </Operator>
                                <NameSlot
                                    onDragOver={(e) => handlers.onDragOver(e, { type: 'slot', position: pos, slot: 'name2' })}
                                    onDragLeave={handlers.onDragLeave}
                                    onDrop={(e) => handlers.onDrop(e, { type: 'slot', position: pos, slot: 'name2' })}
                                    $isDragOver={dragOverTarget?.position === pos && dragOverTarget?.slot === 'name2'}
                                >
                                    {laneData.name2 && (
                                        <DraggableName
                                            draggable
                                            onDragStart={(e) => handlers.onDragStart(e, {
                                                name: laneData.name2,
                                                origin: { type: 'slot', position: pos, slot: 'name2' }
                                            })}
                                            onContextMenu={(e) => handlers.handleContextMenu(e, laneData.name2)}
                                            tier={handlers.findPlayer(laneData.name2)?.tier}
                                            $inSlot={true}
                                        >
                                            {laneData.name2}
                                        </DraggableName>
                                    )}
                                </NameSlot>
                                <SwapButton onClick={() => handlers.handleSwap(pos)}>⇆</SwapButton>
                            </Lane>
                        )
                    })}
                </LanesContainer>

                <InputContainer>
                    <NameInput
                        type="text"
                        placeholder="이름을 스페이스바로 구분하여 입력 후 Enter"
                        value={inputValue}
                        onChange={handlers.handleInputChange}
                        onKeyDown={handlers.handleInputSubmit}
                    />
                </InputContainer>
            </AppContainer>

            <ActionButtons
                captureRef={lanesRef}
                onRandomize={handlers.handleRandomizeSides}
                onReset={handlers.handleReset}
            />
        </ThemeProvider>
    );
};

export default App;
