import React from 'react';
import { useTheme } from 'styled-components';
import { useTeamBuilderContext } from '../hooks/useTeamBuilderLogic';
import { TieredNamePoolContainer, TierRow, TierLabel, DraggableName } from '../App.styles';
import { TIER_KEYS } from '../constants';

export const TierPool = () => {
    const { tierLists, dragOverTarget, handlers } = useTeamBuilderContext();
    const theme = useTheme();

    return (
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
    );
};
