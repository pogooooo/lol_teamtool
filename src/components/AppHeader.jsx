import React, { useState } from 'react';
import styled, { keyframes } from 'styled-components'; // 애니메이션 추가
import { useTeamBuilderContext } from '../hooks/useTeamBuilderLogic';
import { Header, ThemeToggleButton } from '../App.styles';

export const AppHeader = () => {
    const { theme, toggleTheme } = useTeamBuilderContext();
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleThemeClick = () => setIsModalOpen(true);
    const handleConfirm = () => {
        toggleTheme();
        setIsModalOpen(false);
    };
    const handleCancel = () => setIsModalOpen(false);

    return (
        <Header>
            <ThemeToggleButton onClick={handleThemeClick}>
                {theme === 'light' ? '☀️' : '🌙'}
            </ThemeToggleButton>

            {isModalOpen && (
                <ModalOverlay onClick={handleCancel}>
                    <ModalContent onClick={(e) => e.stopPropagation()}>
                        <ModalIcon>{theme === 'light' ? '🌙' : '☀️'}</ModalIcon>
                        <h3>테마 변경</h3>
                        <p>새로운 분위기로 전환하시겠습니까?</p>
                        <ButtonGroup>
                            <CancelButton onClick={handleCancel}>닫기</CancelButton>
                            <ConfirmButton onClick={handleConfirm}>변경하기</ConfirmButton>
                        </ButtonGroup>
                    </ModalContent>
                </ModalOverlay>
            )}
        </Header>
    );
};

// --- 모달 애니메이션 ---
const fadeIn = keyframes`
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
`;

// --- 스타일 컴포넌트 ---

const ModalOverlay = styled.div`
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(8px); /* 배경 흐림 효과 (트렌디) */
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999;
`;

const ModalContent = styled.div`
    background: ${({ theme }) => theme.card}; /* 앱의 카드 배경색 사용 */
    border: 1px solid ${({ theme }) => theme.cardBorder || '#C89B3C'}; /* 테두리 강조 */
    padding: 2rem;
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    width: 340px;
    text-align: center;
    animation: ${fadeIn} 0.2s ease-out;

    h3 {
        margin: 1rem 0 0.5rem;
        color: ${({ theme }) => theme.text};
        font-size: 1.4rem;
    }

    p {
        color: ${({ theme }) => theme.placeholder};
        font-size: 0.95rem;
        margin-bottom: 2rem;
    }
`;

const ModalIcon = styled.div`
    font-size: 3rem;
    margin-bottom: 0.5rem;
`;

const ButtonGroup = styled.div`
    display: flex;
    gap: 12px;
`;

const ButtonBase = styled.button`
    flex: 1;
    padding: 12px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: bold;
    font-size: 0.9rem;
    transition: all 0.2s;
`;

const CancelButton = styled(ButtonBase)`
    background-color: transparent;
    border: 1px solid ${({ theme }) => theme.placeholder};
    color: ${({ theme }) => theme.text};
    &:hover {
        background-color: rgba(255, 255, 255, 0.1);
    }
`;

const ConfirmButton = styled(ButtonBase)`
    /* 롤 느낌의 골드 그라데이션 */
    background: linear-gradient(135deg, #C89B3C 0%, #785A28 100%);
    color: #111;
    box-shadow: 0 4px 15px rgba(200, 155, 60, 0.3);
    
    &:hover {
        transform: translateY(-2px);
        filter: brightness(1.2);
        box-shadow: 0 6px 20px rgba(200, 155, 60, 0.4);
    }

    &:active {
        transform: translateY(0);
    }
`;
