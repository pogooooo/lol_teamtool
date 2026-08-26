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
        if (!lanesRef.current) return;
        const el = lanesRef.current;

        /*
         * 캡처 대상은 팀 구성판 자체다.
         * 바깥 컨테이너는 남는 세로 공간을 차지하도록 늘어나 있어서, 그걸 찍으면
         * 위아래에 빈 공간이 잔뜩 붙은 이상한 비율로 나온다.
         */
        const board = el.querySelector<HTMLElement>('[data-capture-board]') ?? el;

        /*
         * 희망 라인 열은 공유용 이미지에서 제외한다.
         * 맨 오른쪽 "열"이므로 그 열 너비(+간격)만큼 캡처 폭을 줄이고,
         * clone에서는 그리드 열 자체를 없앤다.
         */
        const style = getComputedStyle(board);
        const cols = style.gridTemplateColumns.split(' ').filter(Boolean);
        const gap = parseFloat(style.columnGap) || 0;
        const lastColWidth = cols.length > 1 ? parseFloat(cols[cols.length - 1]) || 0 : 0;
        const trimmedCols = cols.slice(0, -1).join(' ');

        const rect = board.getBoundingClientRect();
        const targetWidth = Math.ceil(rect.width - lastColWidth - gap);
        const targetHeight = Math.ceil(rect.height);

        html2canvas(board, {
            /*
             * 배경을 투명하게 두면 붙여넣는 곳(카톡 흰 배경 등)에 따라 화면과 전혀 다르게 보인다.
             * 앱 배경색을 그대로 깔아 화면과 같은 그림이 나오게 한다.
             */
            backgroundColor: '#222831',
            useCORS: true,
            scale: 2,
            width: targetWidth,
            height: targetHeight,
            onclone: (doc) => {
                // 바깥 컨테이너가 늘어나 캡처 영역을 밀지 않도록 붙여 둔다
                const root = doc.querySelector('[data-capture-root]') as HTMLElement | null;
                if (root) {
                    root.style.justifyContent = 'flex-start';
                    root.style.flexGrow = '0';
                    root.style.height = 'auto';
                }
                // 희망 열을 그리드에서 통째로 걷어낸다 (빈 열이 남지 않도록)
                const clonedBoard = doc.querySelector('[data-capture-board]') as HTMLElement | null;
                if (clonedBoard) {
                    if (trimmedCols) clonedBoard.style.gridTemplateColumns = trimmedCols;
                    clonedBoard.style.width = `${targetWidth}px`;
                }
                doc.querySelectorAll('[data-capture-exclude]').forEach(node => node.remove());
                /*
                 * 테두리 장식의 파티클 레이어(안개·눈·꽃잎·번개·팩맨)는 html2canvas가
                 * 마스크·블러를 재현하지 못해 화면과 다른 얼룩으로 찍힌다. 캡처에서는 걷어낸다.
                 */
                doc.querySelectorAll('[data-fx]').forEach(node => node.remove());
                doc.querySelectorAll('[data-capture-root] *').forEach(node => {
                    const n = node as HTMLElement;
                    // 애니메이션 정지 + GSAP이 남긴 인라인 트랜스폼 초기화 (중간 프레임이 찍히지 않도록)
                    n.style.animation = 'none';
                    n.style.transition = 'none';
                    if (n.style.transform) n.style.transform = '';
                });
                /*
                 * 팀장 표시는 화면에서 box-shadow 글로우 + 가상요소 왕관인데,
                 * html2canvas는 둘 다 그리지 못한다. 캡처본에서는 금색 테두리와
                 * 진짜 글자 왕관으로 바꿔 그린다.
                 */
                doc.querySelectorAll('[data-captain]').forEach(node => {
                    const card = node as HTMLElement;
                    card.style.border = '2px solid #FFD060';
                    card.style.boxShadow = 'none';
                    const crown = doc.createElement('span');
                    crown.textContent = '♛';
                    crown.style.cssText =
                        'position:absolute;top:0;right:3px;font-size:11px;line-height:1.2;color:#B8860B;';
                    card.appendChild(crown);
                });
            },
        }).then(canvas => {
            canvas.toBlob(async blob => {
                if (!blob) throw new Error('이미지를 만들지 못했습니다.');
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                setCopyStatus('완료!');
                setTimeout(() => setCopyStatus('복사'), 2000);
            });
        }).catch(() => {
            // 캡처·클립보드 실패를 조용히 삼키면 사용자가 원인을 알 수 없다
            setCopyStatus('실패');
            setTimeout(() => setCopyStatus('복사'), 2000);
        });
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
