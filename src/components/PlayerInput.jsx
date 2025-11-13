import React from 'react';
import { useTeamBuilderContext } from '../hooks/useTeamBuilderLogic';
import { InputContainer, NameInput } from '../App.styles';

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
        </InputContainer>
    );
};
