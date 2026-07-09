import { useState } from 'react';
import styled from 'styled-components';
import { Card, CompactButton, TextField } from '../../App.styles';
import type { Archive } from '../../hooks/useArchive';
import type { GroupPlayer } from '../../types';
import * as api from '../../services/api';
import { errorMessage } from '../../services/api';
import type { PlayerProfile } from '../../services/api';
import { PlayerDetailModal } from './PlayerDetailModal';

// 참가자 명단 + 참가자별 롤 계정(여러 개) 등록 (PLANNING.md 6.2)
// 팀 빌더로 보내기는 대시보드(MatchHistory)에서 참가자 선택 모달로 제공된다.
export const PlayerManager = ({ archive }: { archive: Archive }) => {
    const [newName, setNewName] = useState('');
    const [profile, setProfile] = useState<PlayerProfile | null>(null);
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const [profileError, setProfileError] = useState('');

    const handleAdd = () => {
        archive.addPlayer(newName);
        setNewName('');
    };

    // 상세보기 — 등록 계정 전체의 Riot 정보(소환사/랭크)를 실시간 조회
    const handleShowProfile = async (playerId: string) => {
        if (loadingId) return;
        setLoadingId(playerId);
        setProfileError('');
        try {
            setProfile(await api.getPlayerProfile(playerId));
        } catch (e) {
            setProfileError(errorMessage(e));
        }
        setLoadingId(null);
    };

    return (
        <ManagerCard>
            <HeaderRow>
                <h3>참가자 & 롤 계정</h3>
            </HeaderRow>

            <AddRow>
                <TextField
                    placeholder="참가자 이름 추가"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                />
                <CompactButton onClick={handleAdd} disabled={!newName.trim()}>추가</CompactButton>
            </AddRow>

            {profileError && <ProfileError>{profileError}</ProfileError>}

            {archive.players.length === 0 ? (
                <Empty>참가자를 추가하고, 각자의 롤 계정(Riot ID)을 등록해 주세요. 계정은 여러 개(본계/부계) 등록할 수 있습니다.</Empty>
            ) : (
                <PlayerListContainer>
                    {archive.players.map(player => (
                        <PlayerRow
                            key={player.id}
                            player={player}
                            archive={archive}
                            onShowProfile={() => handleShowProfile(player.id)}
                            profileLoading={loadingId === player.id}
                        />
                    ))}
                </PlayerListContainer>
            )}

            {profile && <PlayerDetailModal profile={profile} onClose={() => setProfile(null)} />}
        </ManagerCard>
    );
};

const PlayerRow = ({ player, archive, onShowProfile, profileLoading }: {
    player: GroupPlayer;
    archive: Archive;
    onShowProfile: () => void;
    profileLoading: boolean;
}) => {
    const [riotId, setRiotId] = useState('');
    const [verifying, setVerifying] = useState(false);
    const [error, setError] = useState('');
    const accounts = archive.accounts.filter(a => a.playerId === player.id);

    // 계정 등록 시 서버가 Riot Account-V1으로 실존 여부를 검증하고 puuid를 저장한다
    const handleAddAccount = async () => {
        const raw = riotId.trim();
        if (!raw || verifying) return;
        const [gameName, tagLine = 'KR1'] = raw.split('#');
        if (!gameName.trim()) return;
        setVerifying(true);
        setError('');
        const result = await archive.addAccount(player.id, gameName, tagLine);
        setVerifying(false);
        if (!result.ok) {
            setError(result.error);
            return;
        }
        setRiotId('');
    };

    return (
        <Row>
            <NameCol>
                <strong>{player.displayName}</strong>
                <RemoveButton title="참가자 삭제" onClick={() => archive.removePlayer(player.id)}>✕</RemoveButton>
                <CompactButton onClick={onShowProfile} disabled={profileLoading}>
                    {profileLoading ? '조회 중...' : '상세보기'}
                </CompactButton>
            </NameCol>

            <AccountCol>
                {accounts.map(acc => (
                    <AccountChip key={acc.id} $primary={acc.isPrimary}>
                        <StarButton
                            title={acc.isPrimary ? '대표 계정' : '대표 계정으로 지정'}
                            onClick={() => archive.setPrimaryAccount(acc.id)}
                        >
                            {acc.isPrimary ? '★' : '☆'}
                        </StarButton>
                        {acc.gameName}#{acc.tagLine}
                        <RemoveButton title="계정 삭제" onClick={() => archive.removeAccount(acc.id)}>✕</RemoveButton>
                    </AccountChip>
                ))}
                <AccountAdd>
                    <TextField
                        placeholder="게임명#태그"
                        value={riotId}
                        onChange={e => setRiotId(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleAddAccount(); }}
                    />
                    <CompactButton onClick={handleAddAccount} disabled={!riotId.trim() || verifying}>
                        {verifying ? '검증 중...' : '계정 등록'}
                    </CompactButton>
                </AccountAdd>
                {error && <AccountError>{error}</AccountError>}
            </AccountCol>
        </Row>
    );
};

const ManagerCard = styled(Card)`
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
`;

const HeaderRow = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;

    h3 {
        font-size: 1.1rem;
        color: ${({ theme }) => theme.text};
    }
`;

const AddRow = styled.div`
    display: flex;
    gap: 0.5rem;

    input { flex: 1; }
`;

const Empty = styled.p`
    font-size: 0.85rem;
    color: ${({ theme }) => theme.placeholder};
`;

const PlayerListContainer = styled.div`
    display: flex;
    flex-direction: column;
`;

const Row = styled.div`
    display: grid;
    grid-template-columns: 140px 1fr;
    gap: 0.75rem;
    align-items: start;
    padding: 0.6rem 0;
    border-top: 1px solid ${({ theme }) => theme.cardBorder};

    @media (max-width: 640px) {
        grid-template-columns: 1fr;
    }
`;

const NameCol = styled.div`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    color: ${({ theme }) => theme.text};
`;

const ProfileError = styled.p`
    font-size: 0.8rem;
    color: ${({ theme }) => theme.teamRed};
`;

const AccountCol = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
`;

const AccountChip = styled.span<{ $primary?: boolean }>`
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.25rem 0.5rem;
    font-size: 0.8rem;
    color: ${({ theme }) => theme.text};
    background: ${({ theme }) => theme.body};
    border: 1px solid ${({ theme, $primary }) => ($primary ? theme.accent : theme.cardBorder)};
    border-radius: var(--radius-sm);
`;

const AccountAdd = styled.span`
    display: inline-flex;
    gap: 0.4rem;

    input {
        width: 150px;
        padding: 0.3rem 0.5rem;
        font-size: 0.8rem;
    }
`;

const AccountError = styled.p`
    width: 100%;
    font-size: 0.78rem;
    color: ${({ theme }) => theme.teamRed};
`;

const IconButton = styled.button`
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    font-size: 0.8rem;
    line-height: 1;
`;

const StarButton = styled(IconButton)`
    color: ${({ theme }) => theme.accent};
`;

const RemoveButton = styled(IconButton)`
    color: ${({ theme }) => theme.placeholder};
    &:hover { color: ${({ theme }) => theme.teamRed}; }
`;
