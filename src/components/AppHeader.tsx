import { useState } from 'react';
import styled from 'styled-components';
import { useTeamBuilderContext } from '../hooks/useTeamBuilderLogic';
import {
    Header,
    ThemeToggleButton,
    ModalOverlay,
    ModalContent,
    PrimaryButton,
    SecondaryButton
} from '../App.styles';

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
                            <SecondaryButton onClick={handleCancel}>닫기</SecondaryButton>
                            <PrimaryButton onClick={handleConfirm}>변경하기</PrimaryButton>
                        </ButtonGroup>
                    </ModalContent>
                </ModalOverlay>
            )}
        </Header>
    );
};

const ModalIcon = styled.div`
    font-size: 3rem;
    margin-bottom: 0.5rem;
`;

const ButtonGroup = styled.div`
    display: flex;
    gap: 12px;

    & > button {
        flex: 1;
    }
`;
