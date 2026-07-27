import { useState } from 'react';
import html2canvas from 'html2canvas';
import { ActionButtonsContainer, ActionButtonStyled } from '../App.styles';
import { useTeamBuilderContext } from '../hooks/useTeamBuilderLogic';

const ActionButtons = () => {
    const { handlers, lanesRef } = useTeamBuilderContext();
    const { handleRandomizeSides, handleReset, handleRandomAssign } = handlers;

    const [copyStatus, setCopyStatus] = useState('복사');
    const [randomizeStatus, setRandomizeStatus] = useState('지정');
    const [, setResetStatus] = useState('초기화');
    const [assignStatus, setAssignStatus] = useState('배치');

    const captureAndCopy = () => {
        if (lanesRef.current) {
            // 임시 대기 칸은 공유용 이미지에서 제외하고, 빠진 칸 폭만큼 이미지도 줄인다
            const el = lanesRef.current;
            const temp = el.querySelector('[data-capture-exclude]');
            const trim = temp ? Math.round(temp.getBoundingClientRect().width) + 16 : 0;
            const targetWidth = el.offsetWidth - trim;
            html2canvas(el, {
                backgroundColor: null,
                useCORS: true,
                width: targetWidth,
                onclone: (doc) => {
                    const root = doc.querySelector('[data-capture-root]') as HTMLElement | null;
                    if (root) root.style.width = `${targetWidth}px`;
                    doc.querySelectorAll('[data-capture-exclude]').forEach(node => node.remove());
                    doc.querySelectorAll('[data-lane-row]').forEach(node => {
                        (node as HTMLElement).style.gridTemplateColumns = '80px 1fr 40px 1fr 40px';
                    });
                },
            }).then(canvas => {
                canvas.toBlob(blob => {
                    if (!blob) return;
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
                1명 랜덤 {assignStatus}
            </ActionButtonStyled>
            <ActionButtonStyled onClick={handleResetClick}>
                초기화
            </ActionButtonStyled>
            <ActionButtonStyled onClick={captureAndCopy}>
                팀 화면 {copyStatus}
            </ActionButtonStyled>
            <ActionButtonStyled onClick={handleRandomizeClick}>
                팀 위치 {randomizeStatus}
            </ActionButtonStyled>
        </ActionButtonsContainer>
    );
};

export default ActionButtons;
