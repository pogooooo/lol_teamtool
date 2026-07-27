import styled from 'styled-components';
import { useTeamBuilderContext } from '../hooks/useTeamBuilderLogic';

/*
 * 최근 사용한 이름 목록 — 표 형식. 행마다 추가/삭제 버튼.
 * 넓은 화면에서는 팀 빌더 오른쪽 사이드 패널에, 좁은 화면에서는 입력창 아래에 표시된다.
 */
export const RecentNamesList = () => {
    const { recentNames, allPlayers, handlers } = useTeamBuilderContext();

    if (recentNames.length === 0) {
        return <EmptyHint>이름을 추가하면 여기에 기록되어 다음에 클릭 한 번으로 다시 쓸 수 있습니다.</EmptyHint>;
    }

    return (
        <Table>
            <Row className="head">
                <span className="nm">이름</span>
                <span className="c">추가</span>
                <span className="c">삭제</span>
            </Row>
            {recentNames.map(name => {
                const used = allPlayers.some(p => p.name === name);
                return (
                    <Row key={name} $used={used}>
                        <span className="nm" title={name}>{name}</span>
                        <button
                            className="add"
                            disabled={used}
                            onClick={() => handlers.importPlayers([name])}
                            title={used ? '이미 추가되어 있습니다' : '팀 빌더에 다시 추가'}
                        >
                            {used ? '사용 중' : '추가'}
                        </button>
                        <button
                            className="del"
                            onClick={() => handlers.removeRecentName(name)}
                            title="기록에서 삭제"
                        >
                            ✕
                        </button>
                    </Row>
                );
            })}
            <FootRow>
                <ClearButton onClick={handlers.clearRecentNames} title="최근 이름 기록 전체 삭제">
                    전체 삭제
                </ClearButton>
            </FootRow>
        </Table>
    );
};

const EmptyHint = styled.p`
    font-size: 0.75rem;
    line-height: 1.5;
    color: ${({ theme }) => theme.placeholder};
`;

const Table = styled.div`
    display: flex;
    flex-direction: column;
    border: 1px solid ${({ theme }) => theme.cardBorder};
    border-radius: var(--radius-md);
    overflow: hidden;
`;

const Row = styled.div<{ $used?: boolean }>`
    display: grid;
    grid-template-columns: 1fr 52px 34px;
    align-items: center;

    &:nth-child(even) { background: ${({ theme }) => theme.body}; }

    &.head {
        background: ${({ theme }) => theme.dragOver};
        font-size: 0.68rem;
        font-weight: 700;
        color: ${({ theme }) => theme.placeholder};

        .nm, .c { padding: 0.28rem 0.5rem; }
        .c { text-align: center; }
    }

    .nm {
        padding: 0.3rem 0.5rem;
        font-size: 0.8rem;
        font-weight: 600;
        color: ${({ theme }) => theme.text};
        opacity: ${({ $used }) => ($used ? 0.5 : 1)};
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .add {
        border: none;
        background: none;
        padding: 0.3rem 0.2rem;
        font-size: 0.72rem;
        font-weight: 700;
        color: ${({ theme }) => theme.accent};
        cursor: pointer;
        text-align: center;

        &:disabled { color: ${({ theme }) => theme.placeholder}; opacity: 0.55; cursor: default; }
        &:hover:not(:disabled) { text-decoration: underline; }
    }

    .del {
        border: none;
        background: none;
        padding: 0.3rem 0.2rem;
        font-size: 0.66rem;
        color: ${({ theme }) => theme.placeholder};
        cursor: pointer;
        text-align: center;

        &:hover { color: ${({ theme }) => theme.teamRed}; }
    }
`;

const FootRow = styled.div`
    display: flex;
    justify-content: flex-end;
    border-top: 1px solid ${({ theme }) => theme.cardBorder};
`;

const ClearButton = styled.button`
    border: none;
    background: none;
    font-size: 0.7rem;
    color: ${({ theme }) => theme.placeholder};
    cursor: pointer;
    padding: 0.3rem 0.55rem;

    &:hover { color: ${({ theme }) => theme.teamRed}; text-decoration: underline; }
`;
