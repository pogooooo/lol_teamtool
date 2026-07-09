import { useState } from 'react';
import styled from 'styled-components';
import { ModalContent, ModalOverlay, PrimaryButton, SecondaryButton } from '../../App.styles';
import type { GroupPlayer } from '../../types';

// 팀 빌더로 보낼 참가자 선택 모달 (기본 전체 선택)
export const SendToBuilderModal = ({ players, onSend, onClose }: {
    players: GroupPlayer[];
    onSend: (names: string[]) => void;
    onClose: () => void;
}) => {
    const [checked, setChecked] = useState<Set<string>>(new Set(players.map(p => p.id)));

    const toggle = (id: string) => {
        setChecked(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const allChecked = checked.size === players.length;
    const toggleAll = () =>
        setChecked(allChecked ? new Set() : new Set(players.map(p => p.id)));

    const handleSend = () => {
        onSend(players.filter(p => checked.has(p.id)).map(p => p.displayName));
        onClose();
    };

    return (
        <ModalOverlay onClick={onClose}>
            <SelectBox onClick={e => e.stopPropagation()}>
                <h3>팀 빌더로 보내기</h3>
                <p>보낼 참가자를 선택하세요.</p>

                <label className="all">
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                    전체 선택 ({checked.size}/{players.length})
                </label>

                <PlayerList>
                    {players.map(p => (
                        <label key={p.id}>
                            <input
                                type="checkbox"
                                checked={checked.has(p.id)}
                                onChange={() => toggle(p.id)}
                            />
                            {p.displayName}
                        </label>
                    ))}
                </PlayerList>

                <ButtonRow>
                    <SecondaryButton onClick={onClose}>취소</SecondaryButton>
                    <PrimaryButton onClick={handleSend} disabled={checked.size === 0}>
                        {checked.size}명 보내기
                    </PrimaryButton>
                </ButtonRow>
            </SelectBox>
        </ModalOverlay>
    );
};

const SelectBox = styled(ModalContent)`
    width: min(340px, 92vw);
    text-align: left;

    h3 { margin: 0 0 0.25rem; }
    p { margin-bottom: 1rem !important; }

    label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.9rem;
        color: ${({ theme }) => theme.text};
        cursor: pointer;
    }

    .all {
        padding-bottom: 0.5rem;
        border-bottom: 1px solid ${({ theme }) => theme.cardBorder};
        margin-bottom: 0.5rem;
        font-weight: 600;
    }
`;

const PlayerList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    max-height: 40vh;
    overflow-y: auto;
    margin-bottom: 1.25rem;
`;

const ButtonRow = styled.div`
    display: flex;
    gap: 12px;

    & > button { flex: 1; }
`;
