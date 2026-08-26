import { useState } from 'react';
import styled from 'styled-components';
import { Card, CompactButton, TextField } from '../../App.styles';
import type { Archive } from '../../hooks/useArchive';
import type { GroupPlayer } from '../../types';
import * as api from '../../services/api';
import { errorMessage } from '../../services/api';
import type { PlayerProfile } from '../../services/api';
import { PlayerDetailModal } from './PlayerDetailModal';
import { TierSheetModal } from '../TierSheetModal';
import { useMyPlayer } from '../../hooks/useMyPlayer';
import { POSITIONS, RANK_OPTIONS, TIER_META, parseRank } from '../../constants';
import { BASE_POS } from '../../hooks/useTeamBuilderLogic';
import { Spinner } from '../ui/Spinner';
import type { MyPlayer } from '../../hooks/useMyPlayer';

// 참가자 명단 + 참가자별 롤 계정(여러 개) 등록 (PLANNING.md 6.2)
// 팀 빌더로 보내기는 대시보드(MatchHistory)에서 참가자 선택 모달로 제공된다.
export const PlayerManager = ({ archive }: { archive: Archive }) => {
    const [newName, setNewName] = useState('');
    const [profile, setProfile] = useState<PlayerProfile | null>(null);
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const [profileError, setProfileError] = useState('');
    const [showSheet, setShowSheet] = useState(false);
    const me = useMyPlayer(archive.activeGroup?.id ?? null);

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
                {/* 표 한 장으로 그룹 전체(참가자 추가 + 기본 티어)를 관리한다 */}
                <CompactButton
                    onClick={() => setShowSheet(true)}
                    disabled={!archive.activeGroup}
                    title="구글 시트나 엑셀로 참가자와 기본 티어를 한 번에 관리합니다"
                >
                    구글 시트·엑셀
                </CompactButton>
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
                            me={me}
                            laneTiers={archive.laneTiers}
                        />
                    ))}
                </PlayerListContainer>
            )}

            {profile && <PlayerDetailModal profile={profile} onClose={() => setProfile(null)} />}
            {showSheet && (
                <TierSheetModal
                    onClose={() => setShowSheet(false)}
                    onApplied={() => { void archive.refresh(); }}
                />
            )}
        </ManagerCard>
    );
};

const PlayerRow = ({ player, archive, onShowProfile, profileLoading, me, laneTiers }: {
    player: GroupPlayer;
    archive: Archive;
    onShowProfile: () => void;
    profileLoading: boolean;
    me: MyPlayer | null;
    laneTiers: Archive['laneTiers'];
}) => {
    const [riotId, setRiotId] = useState('');
    const [verifying, setVerifying] = useState(false);
    const [error, setError] = useState('');
    const [tierLoading, setTierLoading] = useState(false);

    // 롤 랭크를 조회해 기본 티어로 저장 — "기본 지정이 안 된 사람"을 버튼 한 번으로 채운다
    const handleFetchTier = async () => {
        if (tierLoading) return;
        setTierLoading(true);
        setError('');
        try {
            await api.fetchPlayerTier(player.id);
            await archive.refresh();
        } catch (e) {
            setError(errorMessage(e));
        }
        setTierLoading(false);
    };
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

    const isMe = me?.playerId === player.id;

    return (
        <Row>
            <RowHead>
                <strong className="nm">{player.displayName}</strong>
                {isMe && <MeTag title="이 그룹에서 내 캐릭터로 지정됨">나</MeTag>}
                <span className="spacer" />
                <CompactButton
                    onClick={handleFetchTier}
                    disabled={tierLoading}
                    title="등록된 롤 계정에서 최고 솔랭(없으면 자랭)을 조회해 기본 티어로 저장합니다"
                >
                    {tierLoading ? <><Spinner $size={10} /> 조회 중</> : '롤 티어 가져오기'}
                </CompactButton>
                <CompactButton onClick={onShowProfile} disabled={profileLoading}>
                    {profileLoading ? <><Spinner $size={10} /> 조회 중</> : '상세보기'}
                </CompactButton>
                <RemoveButton title="참가자 삭제" onClick={() => archive.removePlayer(player.id)}>✕</RemoveButton>
            </RowHead>

            {/*
              * 기본 티어는 롤 최고 솔랭(없으면 자랭)이 자동으로 들어간다. 여기서 지정하면 그 값을 덮어쓴다.
              * 같은 사람도 라인마다 실력이 다르므로 라인별로 따로 지정할 수 있다.
              */}
            <LaneTierRow>
                <span className="cap">기본 · 라인별</span>
                {[BASE_POS, ...POSITIONS].map(pos => {
                    const raw = laneTiers.find(t => t.playerId === player.id && t.position === pos)?.tier ?? '';
                    const rank = parseRank(raw);
                    return (
                        <LaneField key={pos} $color={rank ? TIER_META[rank.tier].color : null} $base={pos === BASE_POS}>
                            <span className="lb">{pos}</span>
                            <span className="pick">
                                <b>{rank ? rank.short : '-'}</b>
                                <select
                                    value={raw}
                                    onChange={e => archive.setLaneTier(player.id, pos, e.target.value || null)}
                                    title={pos === BASE_POS
                                        ? `${player.displayName}의 기본 티어 — 비워 두면 롤 솔랭(없으면 자랭)을 씁니다`
                                        : `${player.displayName}의 ${pos} 랭크 — 비워 두면 기본 티어를 씁니다`}
                                >
                                    <option value="">{pos === BASE_POS ? '자동(솔랭)' : '기본값'}</option>
                                    {RANK_OPTIONS.map(o => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>
                            </span>
                        </LaneField>
                    );
                })}
            </LaneTierRow>

            <AccountCol>
                <span className="cap">롤 계정</span>
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
                        {verifying ? '검증 중...' : '등록'}
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
    gap: 0.5rem;
    display: flex;
    flex-direction: column;
`;

const Row = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.7rem 0.8rem;
    border-radius: var(--radius-md);
    background: ${({ theme }) => theme.body};
    border: 1px solid ${({ theme }) => theme.cardBorder};

    /* 각 줄 앞의 작은 설명 라벨 */
    .cap {
        font-size: 0.66rem;
        font-weight: 700;
        color: ${({ theme }) => theme.placeholder};
        min-width: 4.6rem;
    }
`;

const RowHead = styled.div`
    display: flex;
    align-items: center;
    gap: 0.4rem;

    .nm { font-size: 0.95rem; color: ${({ theme }) => theme.text}; }
    .spacer { flex: 1; }
`;

/* 라인별 랭크 — 티어 색을 그대로 입혀 한눈에 구분되게 */
const LaneTierRow = styled.div`
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex-wrap: wrap;
`;

const LaneField = styled.label<{ $color: string | null; $base?: boolean }>`
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.16rem 0.3rem 0.16rem 0.4rem;
    border-radius: 999px;
    background: ${({ theme }) => theme.card};
    border: 1.5px solid ${({ $color, theme }) => $color ?? theme.cardBorder};
    /* 기본 티어는 나머지 라인의 바탕이 되는 값이라 살짝 강조한다 */
    ${({ $base, theme }) => ($base ? `background: ${theme.body}; box-shadow: inset 0 0 0 1px ${theme.cardBorder};` : '')}

    .lb {
        font-size: 0.66rem;
        font-weight: 700;
        color: ${({ theme }) => theme.placeholder};
    }

    /* 실제 select는 투명하게 덮어 두고, 보이는 값은 색이 들어간 b 태그가 담당한다 */
    .pick {
        position: relative;
        display: inline-flex;
        align-items: center;
        min-width: 2.4rem;
        justify-content: center;
    }
    b {
        font-size: 0.78rem;
        font-weight: 800;
        color: ${({ $color, theme }) => $color ?? theme.placeholder};
    }
    select {
        position: absolute;
        inset: 0;
        width: 100%;
        opacity: 0;
        cursor: pointer;
        font-family: inherit;
    }
    &:hover { filter: brightness(1.15); }
`;

const ProfileError = styled.p`
    font-size: 0.8rem;
    color: ${({ theme }) => theme.teamRed};
`;

const AccountCol = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
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

/* 이 그룹에서 나로 지정된 참가자 표시 */
const MeTag = styled.span`
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    font-size: 0.66rem;
    font-weight: 800;
    color: ${({ theme }) => theme.accentText};
    background: ${({ theme }) => theme.accent};
    flex-shrink: 0;
`;

const RemoveButton = styled(IconButton)`
    color: ${({ theme }) => theme.placeholder};
    &:hover { color: ${({ theme }) => theme.teamRed}; }
`;
