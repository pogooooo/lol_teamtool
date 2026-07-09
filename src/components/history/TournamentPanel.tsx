import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { Card, CompactButton, PrimaryButton, TextField } from '../../App.styles';
import { Select } from '../ui/Select';
import * as api from '../../services/api';
import { errorMessage } from '../../services/api';
import type { TournamentCode } from '../../services/api';
import type { Archive } from '../../hooks/useArchive';

const PICK_LABELS: Record<string, string> = {
    TOURNAMENT_DRAFT: '토너먼트 드래프트',
    DRAFT_MODE: '일반 드래프트',
    BLIND_PICK: '블라인드 픽',
    ALL_RANDOM: '올 랜덤',
};

const MAP_LABELS: Record<string, string> = {
    SUMMONERS_RIFT: '소환사의 협곡',
    HOWLING_ABYSS: '칼바람 나락',
};

const fmtDate = (ts: number) =>
    new Date(ts).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

// 토너먼트 코드 발급/관리 — 결과·로비 이벤트는 내전 목록의 상세정보에서 확인
export const TournamentPanel = ({ archive, groupId }: { archive: Archive; groupId: string }) => {
    const [codes, setCodes] = useState<TournamentCode[]>([]);
    const [pickType, setPickType] = useState('TOURNAMENT_DRAFT');
    const [mapType, setMapType] = useState('SUMMONERS_RIFT');
    const [metadata, setMetadata] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState('');

    useEffect(() => {
        api.getTournament(groupId)
            .then(data => setCodes(data.codes))
            .catch(e => setError(errorMessage(e)));
    }, [groupId]);

    const handleCreate = async () => {
        if (busy) return;
        setBusy(true);
        setError('');
        try {
            setCodes(await api.createTournamentCodes(groupId, { pickType, mapType, metadata: metadata.trim() }));
            setMetadata('');
        } catch (e) {
            setError(errorMessage(e));
        }
        setBusy(false);
    };

    const handleCopy = (code: string) => {
        navigator.clipboard.writeText(code);
        setCopied(code);
        setTimeout(() => setCopied(''), 1500);
    };

    const handleDelete = async (code: string) => {
        try {
            await api.deleteTournamentCode(code);
            setCodes(prev => prev.filter(c => c.code !== code));
        } catch (e) {
            setError(errorMessage(e));
        }
    };

    return (
        <PanelCard>
            <HeaderRow>
                <h3>토너먼트 코드</h3>
                <TestBadge>테스트</TestBadge>
            </HeaderRow>

            <Notice>
                지금은 <strong>테스트 기간</strong>이라 여기서 발급되는 코드는 실제 게임에서 사용할 수 없습니다.
                정식 오픈 후에는 이 코드를 롤 클라이언트 로비에 입력하면 내전 방이 만들어지고,
                경기가 끝나면 결과가 자동으로 기록됩니다.
            </Notice>

            <ControlsRow>
                <Select
                    value={pickType}
                    onChange={setPickType}
                    title="픽 방식"
                    options={Object.entries(PICK_LABELS).map(([value, label]) => ({ value, label }))}
                />
                <Select
                    value={mapType}
                    onChange={setMapType}
                    title="맵"
                    options={Object.entries(MAP_LABELS).map(([value, label]) => ({ value, label }))}
                />
                <TextField
                    placeholder="메모 (선택 — 예: 7월 2주차 내전)"
                    value={metadata}
                    onChange={e => setMetadata(e.target.value)}
                    title="코드에 함께 저장되는 메모"
                />
                <PrimaryButton
                    onClick={handleCreate}
                    disabled={!archive.riotReady || busy}
                    title={archive.riotReady ? '' : '서버 설정이 필요합니다'}
                >
                    {busy ? '발급 중...' : '코드 발급'}
                </PrimaryButton>
            </ControlsRow>

            {error && <ErrorText>{error}</ErrorText>}

            {codes.length > 0 && (
                <CodeRows>
                    {codes.map(c => (
                        <CodeRow key={c.code}>
                            <code>{c.code}</code>
                            <span className="meta">
                                {PICK_LABELS[c.pickType] ?? c.pickType} · {MAP_LABELS[c.mapType] ?? c.mapType} · {fmtDate(c.createdAt)}
                                {c.metadata && <em> · {c.metadata}</em>}
                            </span>
                            <CompactButton onClick={() => handleCopy(c.code)}>
                                {copied === c.code ? '복사됨!' : '복사'}
                            </CompactButton>
                            <CompactButton onClick={() => handleDelete(c.code)} title="코드 삭제 (기록은 유지)">
                                삭제
                            </CompactButton>
                        </CodeRow>
                    ))}
                </CodeRows>
            )}
        </PanelCard>
    );
};

const PanelCard = styled(Card)`
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
`;

const HeaderRow = styled.div`
    display: flex;
    align-items: center;
    gap: 0.5rem;

    h3 {
        font-size: 1.1rem;
        color: ${({ theme }) => theme.text};
    }
`;

const TestBadge = styled.span`
    padding: 0.1rem 0.5rem;
    border-radius: var(--radius-sm);
    font-size: 0.72rem;
    font-weight: 700;
    color: ${({ theme }) => theme.accentText};
    background: ${({ theme }) => theme.accent};
`;

const Notice = styled.p`
    font-size: 0.82rem;
    color: ${({ theme }) => theme.placeholder};

    strong { color: ${({ theme }) => theme.text}; }
`;

const ControlsRow = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr 1.4fr 1fr;
    gap: 0.5rem;

    @media (max-width: 700px) {
        grid-template-columns: 1fr 1fr;
    }
`;

const ErrorText = styled.p`
    font-size: 0.8rem;
    color: ${({ theme }) => theme.teamRed};
`;

const CodeRows = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
`;

const CodeRow = styled.div`
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    border: 1px solid ${({ theme }) => theme.cardBorder};
    border-radius: var(--radius-md);
    padding: 0.5rem 0.6rem;

    code {
        font-size: 0.85rem;
        letter-spacing: 0.04em;
        color: ${({ theme }) => theme.accent};
        background: ${({ theme }) => theme.body};
        border-radius: var(--radius-sm);
        padding: 0.2rem 0.5rem;
    }

    .meta {
        font-size: 0.75rem;
        color: ${({ theme }) => theme.placeholder};
        margin-right: auto;

        em {
            font-style: normal;
            color: ${({ theme }) => theme.accent};
        }
    }
`;
