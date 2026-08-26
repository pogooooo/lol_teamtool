import { useState } from 'react';
import styled from 'styled-components';
import { useTeamBuilderContext } from '../hooks/useTeamBuilderLogic';
import { InputContainer, NameInput } from '../App.styles';
import { RecentNamesList } from './RecentNames';
import { matchesQuery } from '../services/hangul';

/*
 * 명단 추가 칸.
 * 그룹이 연결돼 있으면 등록된 참가자를 초성만으로 찾아 Enter로 바로 넣을 수 있고,
 * 그룹에 없는 사람은 예전처럼 이름을 그대로 쳐서 추가한다.
 */
export const PlayerInput = () => {
    const { inputValue, handlers, groupRoster, allPlayers } = useTeamBuilderContext();
    const [cursor, setCursor] = useState(0);
    const [focused, setFocused] = useState(false);

    const query = inputValue.trim();
    const inPool = new Set(allPlayers.map(p => p.name));
    const notAdded = groupRoster.filter(n => !inPool.has(n));
    // 검색어가 없으면 그룹 명단을 그대로 보여 준다 (누가 있는지 몰라도 고를 수 있게)
    const suggestions = (query || focused)
        ? notAdded.filter(n => matchesQuery(n, query)).slice(0, 8)
        : [];
    const remaining = notAdded.length;

    const pick = (name: string) => {
        handlers.importPlayers([name]);
        handlers.setInputValue('');
        setCursor(0);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (suggestions.length > 0) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => (c + 1) % suggestions.length); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => (c - 1 + suggestions.length) % suggestions.length); return; }
            if (e.key === 'Enter') { e.preventDefault(); pick(suggestions[Math.min(cursor, suggestions.length - 1)]); return; }
        }
        // 그룹에 없는 이름은 예전처럼 띄어쓰기로 여러 명을 한 번에 추가한다
        handlers.handleInputSubmit(e);
    };

    return (
        <InputContainer>
            <Row>
                <Box>
                    <NameInput
                        type="text"
                        placeholder={groupRoster.length
                            ? '이름 검색 (초성도 가능) 후 Enter · 그룹에 없으면 그대로 추가'
                            : '이름을 스페이스바로 구분하여 입력 후 Enter'}
                        value={inputValue}
                        onChange={(e) => { handlers.handleInputChange(e); setCursor(0); }}
                        onKeyDown={onKeyDown}
                        onFocus={() => setFocused(true)}
                        /* 목록의 항목을 누를 시간을 주고 닫는다 */
                        onBlur={() => setTimeout(() => setFocused(false), 150)}
                    />
                    {suggestions.length > 0 && (
                        <Suggest>
                            {suggestions.map((name, i) => (
                                <button
                                    key={name}
                                    className={i === Math.min(cursor, suggestions.length - 1) ? 'on' : ''}
                                    onMouseEnter={() => setCursor(i)}
                                    onClick={() => pick(name)}
                                >
                                    {name}
                                </button>
                            ))}
                        </Suggest>
                    )}
                </Box>
                {remaining > 0 && (
                    <AllButton
                        onClick={() => handlers.importGroupRoster()}
                        title="이 그룹에 등록된 참가자를 모두 명단에 넣습니다"
                    >
                        그룹 전체 {remaining}명
                    </AllButton>
                )}
            </Row>

            {/* 좁은 화면 전용 — 넓은 화면에서는 오른쪽 사이드 패널에 표시된다 */}
            <InlineRecent>
                <RecentNamesList />
            </InlineRecent>
        </InputContainer>
    );
};

const Row = styled.div`
    display: flex;
    gap: 0.4rem;
    /* 버튼이 입력칸과 같은 높이로 늘어나도록 stretch */
    align-items: stretch;
`;

const Box = styled.div`
    position: relative;
    flex: 1;
    min-width: 0;
`;

/*
 * 검색 결과 — 입력칸 "위"로 펼친다.
 * 입력칸이 화면 맨 아래에 있고 페이지 자체는 스크롤되지 않아서,
 * 아래로 열면 화면 밖으로 잘려 보이지 않는다.
 */
const Suggest = styled.div`
    position: absolute;
    z-index: 30;
    left: 0;
    right: 0;
    bottom: calc(100% + 4px);
    display: flex;
    flex-direction: column;
    max-height: 220px;
    overflow-y: auto;
    border-radius: var(--radius-md);
    border: 1px solid ${({ theme }) => theme.cardBorder};
    background: ${({ theme }) => theme.card};
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);

    button {
        text-align: left;
        padding: 0.4rem 0.6rem;
        border: none;
        background: transparent;
        color: ${({ theme }) => theme.text};
        font-size: 0.85rem;
        font-weight: 600;
        cursor: pointer;
        &.on { background: ${({ theme }) => theme.dragOver}; }
    }
`;

const AllButton = styled.button`
    flex-shrink: 0;
    /* 높이는 Row의 stretch가 입력칸에 맞춰 준다 — 여기서는 좌우 여백만 */
    padding: 0 1rem;
    border-radius: var(--radius-lg);
    border: 1px solid ${({ theme }) => theme.accent};
    background: transparent;
    color: ${({ theme }) => theme.accent};
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
    &:hover { background: ${({ theme }) => theme.dragOver}; }
`;

const InlineRecent = styled.div`
    margin-top: 0.4rem;

    /* 목록 안쪽이 이미 스크롤되므로 여기서 또 자르지 않는다 */
    @media (min-width: 1100px) {
        display: none;
    }
`;
