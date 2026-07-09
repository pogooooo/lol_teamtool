import { useState } from 'react';
import styled from 'styled-components';
import {
    Card, ModalContent, ModalOverlay, PrimaryButton, SecondaryButton, TextField,
} from '../../App.styles';
import type { Archive } from '../../hooks/useArchive';
import type { Group } from '../../types';

// 활성 그룹이 없을 때: 그룹 생성 / 코드 참여 / 내 그룹 선택·삭제
export const GroupGate = ({ archive }: { archive: Archive }) => {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [createError, setCreateError] = useState('');
    const [joinError, setJoinError] = useState('');
    const [leaveTarget, setLeaveTarget] = useState<Group | null>(null);
    const [leaveError, setLeaveError] = useState('');

    const handleCreate = async () => {
        const result = await archive.createGroup(name);
        if (!result.ok) {
            setCreateError(result.error);
            return;
        }
        setName('');
        setCreateError('');
    };

    const handleJoin = async () => {
        const result = await archive.joinGroup(code);
        if (!result.ok) {
            setJoinError(result.error);
            return;
        }
        setCode('');
        setJoinError('');
    };

    const handleLeave = async () => {
        if (!leaveTarget) return;
        const result = await archive.leaveGroup(leaveTarget.id);
        if (!result.ok) {
            setLeaveError(result.error);
            return;
        }
        setLeaveTarget(null);
        setLeaveError('');
    };

    return (
        <GateContainer>
            <GateGrid>
                <GateCard>
                    <h3>새 그룹 만들기</h3>
                    <p>내전을 함께하는 모임 단위로 기록이 분리됩니다.</p>
                    <TextField
                        placeholder="그룹 이름 (예: 금요 내전팟)"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
                    />
                    <PrimaryButton onClick={handleCreate} disabled={!name.trim()}>그룹 만들기</PrimaryButton>
                    {createError && <ErrorText>{createError}</ErrorText>}
                </GateCard>

                <GateCard>
                    <h3>참여 코드로 입장</h3>
                    <p>그룹장에게 받은 8자리 코드를 입력하세요.</p>
                    <TextField
                        placeholder="예: AB12CD34"
                        value={code}
                        onChange={e => setCode(e.target.value.toUpperCase())}
                        onKeyDown={e => { if (e.key === 'Enter') handleJoin(); }}
                    />
                    <SecondaryButton onClick={handleJoin} disabled={!code.trim()}>참여하기</SecondaryButton>
                    {joinError && <ErrorText>{joinError}</ErrorText>}
                </GateCard>
            </GateGrid>

            {archive.groups.length > 0 && (
                <GateCard>
                    <h3>내 그룹</h3>
                    <GroupList>
                        {archive.groups.map(g => (
                            <GroupItem key={g.id}>
                                <GroupButton onClick={() => archive.selectGroup(g.id)}>
                                    <strong>{g.name}</strong>
                                    <span>{g.joinCode}</span>
                                </GroupButton>
                                <DeleteButton
                                    title="그룹 나가기"
                                    onClick={() => { setLeaveTarget(g); setLeaveError(''); }}
                                >
                                    ✕
                                </DeleteButton>
                            </GroupItem>
                        ))}
                    </GroupList>
                </GateCard>
            )}

            <Notice>
                그룹·기록 데이터는 서버에 저장됩니다.
                참여 코드만 공유하면 친구들도 어느 기기에서든 같은 그룹의 기록을 함께 볼 수 있습니다.
            </Notice>

            {leaveTarget && (
                <ModalOverlay onClick={() => setLeaveTarget(null)}>
                    <ModalContent onClick={e => e.stopPropagation()}>
                        <h3>그룹 나가기</h3>
                        <p>
                            "{leaveTarget.name}" 그룹을 내 목록에서 나갑니다.
                            참여 코드로 다시 들어올 수 있지만, <strong>마지막 멤버가 나가면
                            그룹의 참가자·계정·내전 기록이 모두 삭제</strong>됩니다.
                        </p>
                        <ButtonRow>
                            <SecondaryButton onClick={() => setLeaveTarget(null)}>취소</SecondaryButton>
                            <PrimaryButton onClick={handleLeave}>나가기</PrimaryButton>
                        </ButtonRow>
                        {leaveError && <ErrorText>{leaveError}</ErrorText>}
                    </ModalContent>
                </ModalOverlay>
            )}
        </GateContainer>
    );
};

const GateContainer = styled.div`
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    gap: 1rem;
`;

const GateGrid = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;

    @media (max-width: 640px) {
        grid-template-columns: 1fr;
    }
`;

const GateCard = styled(Card)`
    display: flex;
    flex-direction: column;
    gap: 0.75rem;

    h3 {
        font-size: 1.1rem;
        color: ${({ theme }) => theme.text};
    }

    p {
        font-size: 0.85rem;
        color: ${({ theme }) => theme.placeholder};
    }
`;

const ErrorText = styled.p`
    color: ${({ theme }) => theme.teamRed};
    font-size: 0.8rem;
`;

const GroupList = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
`;

const GroupItem = styled.div`
    display: flex;
    align-items: stretch;
`;

const GroupButton = styled.button`
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
    padding: 0.6rem 0.9rem;
    background: ${({ theme }) => theme.body};
    border: 1px solid ${({ theme }) => theme.cardBorder};
    border-right: none;
    border-radius: var(--radius-md) 0 0 var(--radius-md);
    color: ${({ theme }) => theme.text};
    cursor: pointer;
    transition: background-color 0.2s ease;

    span {
        font-size: 0.75rem;
        color: ${({ theme }) => theme.placeholder};
        letter-spacing: 0.08em;
    }

    &:hover { background-color: ${({ theme }) => theme.dragOver}; }
`;

const DeleteButton = styled.button`
    padding: 0 0.6rem;
    background: ${({ theme }) => theme.body};
    border: 1px solid ${({ theme }) => theme.cardBorder};
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
    color: ${({ theme }) => theme.placeholder};
    cursor: pointer;
    transition: color 0.2s ease, background-color 0.2s ease;

    &:hover {
        color: ${({ theme }) => theme.teamRed};
        background-color: ${({ theme }) => theme.dragOver};
    }
`;

const ButtonRow = styled.div`
    display: flex;
    gap: 12px;

    & > button { flex: 1; }
`;

const Notice = styled.p`
    font-size: 0.8rem;
    color: ${({ theme }) => theme.placeholder};
    text-align: center;
`;
