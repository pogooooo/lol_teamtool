import React, { useState } from 'react';
import html2canvas from 'html2canvas';
import { ActionButtonsContainer, ActionButtonStyled } from '../App.styles';

const ActionButtons = ({ captureRef, onRandomize, onReset }) => {
    const [copyStatus, setCopyStatus] = useState('복사');
    const [randomizeStatus, setRandomizeStatus] = useState('지정');
    const [resetStatus, setResetStatus] = useState('초기화');

    const captureAndCopy = () => {
        if (captureRef.current) {
            html2canvas(captureRef.current, {
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
        onRandomize();
        setRandomizeStatus('완료!');
        setTimeout(() => setRandomizeStatus('지정'), 1500);
    };

    const handleResetClick = () => {
        onReset();
        setResetStatus('완료!');
        setTimeout(() => setResetStatus('초기화'), 1500);
    };

    return (
        <ActionButtonsContainer>
            <ActionButtonStyled onClick={handleResetClick}>
                🔄 초기화 {resetStatus}
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
