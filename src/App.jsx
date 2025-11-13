import React from 'react';
import { ThemeProvider } from 'styled-components';

import {
    GlobalStyle,
    lightTheme,
    darkTheme,
    AppContainer
} from './App.styles.js';

import ActionButtons from './components/ActionButtons.jsx';
import { useTeamBuilderContext } from './hooks/useTeamBuilderLogic.jsx';
import { AppHeader } from './components/AppHeader.jsx';
import { AppContextMenu } from './components/AppContextMenu.jsx';
import { TierPool } from './components/TierPool.jsx';
import { LaneDisplay } from './components/LaneDisplay.jsx';
import { PlayerInput } from './components/PlayerInput.jsx';

const App = () => {
    const { theme } = useTeamBuilderContext();
    const currentTheme = theme === 'light' ? lightTheme : darkTheme;

    return (
        <ThemeProvider theme={currentTheme}>
            <GlobalStyle />

            {/* 3. 컨텍스트 메뉴 컴포넌트 */}
            <AppContextMenu />

            <AppContainer>
                {/* 4. 헤더 컴포넌트 */}
                <AppHeader />

                {/* 5. 티어 풀 컴포넌트 */}
                <TierPool />

                {/* 6. 레인 컴포넌트 */}
                <LaneDisplay />

                {/* 7. 입력창 컴포넌트 */}
                <PlayerInput />
            </AppContainer>

            {/* 8. 액션 버튼 컴포넌트 (prop 전달 없음) */}
            <ActionButtons />
        </ThemeProvider>
    );
};

export default App;
