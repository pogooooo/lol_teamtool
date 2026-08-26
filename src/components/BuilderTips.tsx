import styled from 'styled-components';

/*
 * 직관적으로 보이지 않는 조작들을 짧게 안내 — 팀 빌더 사이드 패널의 남는 공간에 표시.
 */
export const BuilderTips = () => (
    <Wrap>
        <h4>간단 사용법</h4>
        <ul>
            <li><b>이름 더블클릭</b> → 팀장 지정·해제</li>
            <li><b>오른쪽 버튼 더블클릭</b> → 명단에서 제거</li>
            <li><b>이름 우클릭</b> → 점수 내역·기본 티어·점수 조절·팀장</li>
            <li><b>라인에서 우클릭</b> → 그 라인만 다른 티어로 지정</li>
            <li><b>참가자 관리</b> → 구글 시트·엑셀로 명단과 기본 티어를 한 번에 관리</li>
            <li><b>가운데 기호 클릭</b> → 전력 비교 <span className="mono">&gt; = &lt;</span> 변경</li>
            <li><b>⇆ 버튼</b> → 두 팀 좌우 교체</li>
            <li><b>희망 칸</b> → 카드를 끌어다 놓으면 그 라인 지망 (놓은 순서=순위, 클릭 해제). 자동 분배가 반영</li>
            <li>이름을 <b>드래그</b>해서 티어·라인에 배치</li>
        </ul>
    </Wrap>
);

const Wrap = styled.div`
    margin-top: 0.9rem;
    padding-top: 0.7rem;
    border-top: 1px solid ${({ theme }) => theme.cardBorder};

    h4 {
        font-size: 0.85rem;
        color: ${({ theme }) => theme.text};
        margin-bottom: 0.5rem;
        border-bottom: none;
        padding-bottom: 0;
    }

    ul {
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
    }

    li {
        font-size: 0.76rem;
        line-height: 1.45;
        color: ${({ theme }) => theme.placeholder};

        b { color: ${({ theme }) => theme.text}; font-weight: 700; }
        .mono { font-variant-numeric: tabular-nums; letter-spacing: 0.1em; }
    }
`;
