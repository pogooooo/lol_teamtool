import styled from 'styled-components';
import { useTeamBuilderContext } from '../hooks/useTeamBuilderLogic';
import { InputContainer, NameInput } from '../App.styles';
import { RecentNamesList } from './RecentNames';

export const PlayerInput = () => {
    const { inputValue, handlers } = useTeamBuilderContext();

    return (
        <InputContainer>
            <NameInput
                type="text"
                placeholder="이름을 스페이스바로 구분하여 입력 후 Enter"
                value={inputValue}
                onChange={handlers.handleInputChange}
                onKeyDown={handlers.handleInputSubmit}
            />

            {/* 좁은 화면 전용 — 넓은 화면에서는 오른쪽 사이드 패널에 표시된다 */}
            <InlineRecent>
                <RecentNamesList />
            </InlineRecent>
        </InputContainer>
    );
};

const InlineRecent = styled.div`
    margin-top: 0.4rem;
    max-height: 150px;
    overflow-y: auto;

    @media (min-width: 1100px) {
        display: none;
    }
`;
