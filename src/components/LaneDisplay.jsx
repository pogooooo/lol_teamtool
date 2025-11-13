import React from 'react';
import { useTeamBuilderContext } from '../hooks/useTeamBuilderLogic';
import {
    LanesContainer, Lane, LaneLabel, NameSlot, Operator, SwapButton, DraggableName
} from '../App.styles';
import { POSITIONS } from '../constants';

export const LaneDisplay = () => {
    const { lanes, dragOverTarget, handlers, lanesRef } = useTeamBuilderContext();

    return (
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
    );
};
