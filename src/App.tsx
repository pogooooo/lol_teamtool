import { useEffect, useState } from 'react';
import { ThemeProvider } from 'styled-components';

import {
    GlobalStyle,
    lightTheme,
    darkTheme,
    AppContainer,
    PageWrapper,
    AdContainer,
    TabBar,
    TabButton,
    FooterBar
} from './App.styles';

import ActionButtons from './components/ActionButtons';
import { useTeamBuilderContext } from './hooks/useTeamBuilderLogic';
import { AppHeader } from './components/AppHeader';
import { AppContextMenu } from './components/AppContextMenu';
import { TierPool } from './components/TierPool';
import { LaneDisplay } from './components/LaneDisplay';
import { PlayerInput } from './components/PlayerInput';
import { AprilFoolsChat } from './components/AprilFoolsChat';
import { AdSense } from './components/AdSense';
import { MatchHistory } from './components/MatchHistory';
import { FeedbackModal } from './components/FeedbackModal';

// URL 분리: #/builder = 팀 빌더, #/records = 내전 기록 (해시 라우팅 — 새로고침해도 탭 유지, SPA라 전환 시 로딩 없음)
type View = 'builder' | 'history';
const viewFromHash = (): View => (window.location.hash.startsWith('#/records') ? 'history' : 'builder');

const App = () => {
    const { theme } = useTeamBuilderContext();
    const currentTheme = theme === 'light' ? lightTheme : darkTheme;
    const [view, setView] = useState<View>(viewFromHash);
    const [showFeedback, setShowFeedback] = useState(false);

    useEffect(() => {
        const onHashChange = () => setView(viewFromHash());
        window.addEventListener('hashchange', onHashChange);
        return () => window.removeEventListener('hashchange', onHashChange);
    }, []);

    // 부팅 스플래시 테마(index.html의 data-boot)는 마운트 후 제거 — 이후에는 앱 테마가 배경을 결정한다
    useEffect(() => {
        delete document.documentElement.dataset.boot;
    }, []);

    const go = (next: View) => {
        window.location.hash = next === 'history' ? '#/records' : '#/builder';
    };

    return (
        <ThemeProvider theme={currentTheme}>
            <GlobalStyle />
            <AppContextMenu />
            <AprilFoolsChat />

            <PageWrapper>
                <AdContainer>
                    <AdSense />
                </AdContainer>

                {/* 팀 빌딩 화면은 스크롤 없이 100vh 안에 들어가야 한다 (DESIGN.md) */}
                <AppContainer $fitViewport={view === 'builder'}>
                    <AppHeader />

                    <TabBar>
                        <TabButton
                            $active={view === 'builder'}
                            onClick={() => go('builder')}
                        >
                            팀 빌더
                        </TabButton>
                        <TabButton
                            $active={view === 'history'}
                            onClick={() => go('history')}
                        >
                            내전 기록
                        </TabButton>
                    </TabBar>

                    {view === 'builder' ? (
                        <>
                            <TierPool />
                            <LaneDisplay />
                            <PlayerInput />
                            <ActionButtons />
                        </>
                    ) : (
                        <MatchHistory />
                    )}
                </AppContainer>

                <AdContainer>
                    <AdSense />
                </AdContainer>
            </PageWrapper>

            <FooterBar>
                <a href="/guide.html">사용법 가이드</a>
                <a href="/privacy.html">개인정보처리방침</a>
                {/* mailto 대신 모달 → 서버 전송 (메일 앱 미설정 기기에서도 동작) */}
                <a href="#" onClick={e => { e.preventDefault(); setShowFeedback(true); }}>문의·건의</a>
            </FooterBar>

            {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
        </ThemeProvider>
    );
};

export default App;
