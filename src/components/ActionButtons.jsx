import React, { useState } from 'react';
import html2canvas from 'html2canvas';
import { ActionButtonsContainer, ActionButtonStyled } from '../App.styles';
import { useTeamBuilderContext } from '../hooks/useTeamBuilderLogic';

const ActionButtons = () => {
    const { handlers, lanesRef } = useTeamBuilderContext();
    const { handleRandomizeSides, handleReset, handleRandomAssign } = handlers;

    const [copyStatus, setCopyStatus] = useState('복사');
    const [randomizeStatus, setRandomizeStatus] = useState('지정');
    const [resetStatus, setResetStatus] = useState('초기화');
    const [assignStatus, setAssignStatus] = useState('배치');

    const captureAndCopy = () => {
        if (lanesRef.current) {
            html2canvas(lanesRef.current, {
                backgroundColor: null,
                useCORS: true,
            }).then(canvas => {
                canvas.toBlob(blob => {
                    navigator.clipboard.write([
                        new ClipboardItem({ 'image/png': blob })
                    ]);
                    setCopyStatus('완료!');
                    setTimeout(() => setCopyStatus('복사'), 2000);
                });
            });
        }
    };

    const handleRandomizeClick = () => {
        handleRandomizeSides();
        setRandomizeStatus('완료!');
        setTimeout(() => setRandomizeStatus('지정'), 1500);
    };

    const handleResetClick = () => {
        handleReset();
        setResetStatus('완료!');
        setTimeout(() => setResetStatus('초기화'), 1500);
    };

    const handleRandomAssignClick = () => {
        handleRandomAssign();
        setAssignStatus('완료!');
        setTimeout(() => setAssignStatus('배치'), 1500);
    };

    return (
        <ActionButtonsContainer>
            <ActionButtonStyled onClick={handleRandomAssignClick}>
                🧑‍ 1명 랜덤 {assignStatus}
            </ActionButtonStyled>
            <ActionButtonStyled onClick={handleResetClick}>
                🔄 초기화
            </ActionButtonStyled>
            <ActionButtonStyled onClick={captureAndCopy}>
                🖼️ 팀 화면 {copyStatus}
            </ActionButtonStyled>
            <ActionButtonStyled onClick={handleRandomizeClick}>
                🎲 팀 위치 {randomizeStatus}
            </ActionButtonStyled>
        </ActionButtonsContainer>
    );
};

export default ActionButtons;
