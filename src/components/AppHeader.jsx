import React from 'react';
import { useTeamBuilderContext } from '../hooks/useTeamBuilderLogic';
import { Header, ThemeToggleButton } from '../App.styles';

export const AppHeader = () => {
    const { theme, toggleTheme } = useTeamBuilderContext();
    return (
        <Header>
            <ThemeToggleButton onClick={toggleTheme}>
                {theme === 'light' ? '☀️' : '🌙'}
            </ThemeToggleButton>
        </Header>
    );
};
