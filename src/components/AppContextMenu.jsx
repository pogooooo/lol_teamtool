import React from 'react';
import { useTheme } from 'styled-components';
import { useTeamBuilderContext } from '../hooks/useTeamBuilderLogic';
import { ContextMenuContainer, ContextMenuItem, ColorDot } from '../App.styles';
import { TIER_KEYS } from '../constants';

export const AppContextMenu = () => {
    const { contextMenu, handlers } = useTeamBuilderContext();
    const theme = useTheme();

    if (!contextMenu.visible) return null;

    return (
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
    );
};
