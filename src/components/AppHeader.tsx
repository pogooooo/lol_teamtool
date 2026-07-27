import styled from 'styled-components';
import { useActiveGroupBadge } from '../hooks/useActiveGroupBadge';
import { Header } from '../App.styles';

export const AppHeader = () => {
    const groupName = useActiveGroupBadge();

    return (
        <Header>
            {/* 현재 선택된 내전 기록 그룹 — 모든 탭에서 보인다 */}
            <GroupBadge title="현재 선택된 내전 기록 그룹" $none={!groupName}>
                {groupName ? `그룹 · ${groupName}` : '그룹 미선택'}
            </GroupBadge>
        </Header>
    );
};

const GroupBadge = styled.span<{ $none?: boolean }>`
    padding: 0.4rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.78rem;
    font-weight: 700;
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: ${({ theme, $none }) => ($none ? theme.placeholder : theme.text)};
    background: ${({ theme }) => theme.card};
    border: 1px solid ${({ theme, $none }) => ($none ? theme.cardBorder : theme.accent)};
`;
