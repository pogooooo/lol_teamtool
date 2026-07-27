import { useTeamBuilderContext } from '../hooks/useTeamBuilderLogic';
import {
    LanesContainer, Lane, LaneLabel, NameSlot, TempSlot, Operator, SwapButton, DraggableName
} from '../App.styles';
import { POSITIONS } from '../constants';
import type { Position } from '../types';
import { LaneIcon } from './ui/LaneIcon';

export const LaneDisplay = () => {
    const { lanes, dragOverTarget, handlers, lanesRef } = useTeamBuilderContext();

    const tempChip = (pos: Position, name: string) => (
        <DraggableName
            key={name}
            draggable
            onDragStart={(e) => handlers.onDragStart(e, {
                name,
                origin: { type: 'slot', position: pos, slot: 'temp' }
            })}
            onContextMenu={(e) => handlers.handleContextMenu(e, name)}
            onDoubleClick={() => handlers.toggleCaptain(name)}
            tier={handlers.findPlayer(name)?.tier}
            $captain={handlers.isCaptain(name)}
            $inSlot={true}
        >
            {name}
        </DraggableName>
    );

    return (
        <LanesContainer ref={lanesRef} data-capture-root>
            {POSITIONS.map(pos => {
                const laneData = lanes[pos];
                const temps = laneData.temps ?? [];
                return (
                    <Lane key={pos} data-lane-row>
                        <LaneLabel><LaneIcon line={pos} size={15} />{pos}</LaneLabel>
                        <NameSlot
                            onDragOver={(e) => handlers.onDragOver(e, { type: 'slot', position: pos, slot: 'name1' })}
                            onDragLeave={handlers.onDragLeave}
                            onDrop={(e) => handlers.onDrop(e, { type: 'slot', position: pos, slot: 'name1' })}
                            $isDragOver={dragOverTarget?.type === 'slot' && dragOverTarget.position === pos && dragOverTarget.slot === 'name1'}
                        >
                            {laneData.name1 && (
                                <DraggableName
                                    draggable
                                    onDragStart={(e) => handlers.onDragStart(e, {
                                        name: laneData.name1!,
                                        origin: { type: 'slot', position: pos, slot: 'name1' }
                                    })}
                                    onContextMenu={(e) => handlers.handleContextMenu(e, laneData.name1!)}
                                    onDoubleClick={() => handlers.toggleCaptain(laneData.name1!)}
                                    tier={handlers.findPlayer(laneData.name1)?.tier}
                                    $captain={handlers.isCaptain(laneData.name1)}
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
                            $isDragOver={dragOverTarget?.type === 'slot' && dragOverTarget.position === pos && dragOverTarget.slot === 'name2'}
                        >
                            {laneData.name2 && (
                                <DraggableName
                                    draggable
                                    onDragStart={(e) => handlers.onDragStart(e, {
                                        name: laneData.name2!,
                                        origin: { type: 'slot', position: pos, slot: 'name2' }
                                    })}
                                    onContextMenu={(e) => handlers.handleContextMenu(e, laneData.name2!)}
                                    onDoubleClick={() => handlers.toggleCaptain(laneData.name2!)}
                                    tier={handlers.findPlayer(laneData.name2)?.tier}
                                    $captain={handlers.isCaptain(laneData.name2)}
                                    $inSlot={true}
                                >
                                    {laneData.name2}
                                </DraggableName>
                            )}
                        </NameSlot>
                        <SwapButton onClick={() => handlers.handleSwap(pos)}>⇆</SwapButton>

                        {/* 임시 대기 — 최대 3명, 전원이 항상 보인다. 팀 화면 복사에서는 제외(data-capture-exclude) */}
                        <TempSlot
                            data-capture-exclude
                            onDragOver={(e) => handlers.onDragOver(e, { type: 'slot', position: pos, slot: 'temp' })}
                            onDragLeave={handlers.onDragLeave}
                            onDrop={(e) => handlers.onDrop(e, { type: 'slot', position: pos, slot: 'temp' })}
                            $isDragOver={dragOverTarget?.type === 'slot' && dragOverTarget.position === pos && dragOverTarget.slot === 'temp'}
                            title={temps.length >= 3 ? '임시 대기 가득 참 (최대 3명)' : '임시 대기 자리 — 팀 확정 전에 잠깐 놓아두세요 (최대 3명)'}
                        >
                            {temps.length === 0 ? (
                                <span className="ph">임시 (최대 3명)</span>
                            ) : (
                                temps.map(name => tempChip(pos, name))
                            )}
                        </TempSlot>
                    </Lane>
                )
            })}
        </LanesContainer>
    );
};
