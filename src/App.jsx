import React from 'react';
import { ThemeProvider } from 'styled-components';

import {
    GlobalStyle,
    lightTheme,
    darkTheme,
    AppContainer,
    PageWrapper,
    AdContainer
} from './App.styles.js';

import ActionButtons from './components/ActionButtons.jsx';
import { useTeamBuilderContext } from './hooks/useTeamBuilderLogic.jsx';
import { AppHeader } from './components/AppHeader.jsx';
import { AppContextMenu } from './components/AppContextMenu.jsx';
import { TierPool } from './components/TierPool.jsx';
import { LaneDisplay } from './components/LaneDisplay.jsx';
import { PlayerInput } from './components/PlayerInput.jsx';
import { AprilFoolsChat } from "./components/AprilFoolsChat.jsx";
import { AdSense } from "./components/AdSense.jsx";

const App = () => {
    const { theme } = useTeamBuilderContext();
    const currentTheme = theme === 'light' ? lightTheme : darkTheme;

    return (
        <ThemeProvider theme={currentTheme}>
            <GlobalStyle />
            <AppContextMenu />
            <AprilFoolsChat />

            <PageWrapper>
                <AdContainer>
                    <AdSense adSlot="왼쪽_광고_슬롯_아이디" />
                </AdContainer>

                <AppContainer>
                    <AppHeader />
                    <TierPool />
                    <LaneDisplay />
                    <PlayerInput />
                    <ActionButtons />
                </AppContainer>

                <AdContainer>
                    <AdSense adSlot="오른쪽_광고_슬롯_아이디" />
                </AdContainer>
            </PageWrapper>
        </ThemeProvider>
    );
};

export default App;
