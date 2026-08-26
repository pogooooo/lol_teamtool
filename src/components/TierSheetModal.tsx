import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { ModalOverlay, ModalContent, CompactButton, TextField } from '../App.styles';
import { useTeamBuilderContext } from '../hooks/useTeamBuilderLogic';
import { useActiveGroupId } from '../hooks/useActiveGroupBadge';
import * as api from '../services/api';
import { errorMessage } from '../services/api';
import * as sheet from '../services/tierSheet';
import { Spinner } from './ui/Spinner';

/*
 * 참가자 티어 시트 관리 창.
 *
 * 그룹의 참가자 명단·기본/라인별 티어를 표 하나로 주고받는다.
 * 시트에서 가져온 내용은 그룹(참가자 관리)에만 반영되며, 팀 빌더 명단은 건드리지 않는다.
 */
export const TierSheetModal = ({ onClose, onApplied }: { onClose: () => void; onApplied?: () => void }) => {
    const { handlers, allPlayers } = useTeamBuilderContext();
    const groupId = useActiveGroupId();
    const fileRef = useRef<HTMLInputElement>(null);
    const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
    /** 진행 중 작업 문구 — 값이 있으면 로딩 중이라는 뜻 (버튼도 함께 잠근다) */
    const [busy, setBusy] = useState<string | null>(null);

    /* 구글 시트 연동 — 주소는 그룹에 저장되므로 그룹원 누구나 같은 시트를 쓴다 */
    const [sheetUrl, setSheetUrl] = useState('');
    const [linked, setLinked] = useState<string | null>(null);
    /** 서비스 계정 — 시트를 이 계정에 공유하면 비공개 시트도 읽고 쓸 수 있다 */
    const [robot, setRobot] = useState<{ ready: boolean; email: string | null }>({ ready: false, email: null });

    useEffect(() => {
        api.getSheetAccount().then(setRobot).catch(() => { /* 미설정이면 공개 링크 안내로 대체 */ });
    }, []);

    useEffect(() => {
        if (!groupId) return;
        let stopped = false;
        api.getSheet(groupId)
            .then(r => { if (!stopped) { setLinked(r.url); setSheetUrl(r.url ?? ''); } })
            .catch(() => { /* 연결 전이면 빈칸으로 둔다 */ });
        return () => { stopped = true; };
    }, [groupId]);

    /**
     * 읽어 온 표를 반영한다.
     * 그룹이 있으면 참가자 명단·티어(서버)에만 저장한다 — 팀 빌더 명단은 그대로 둔다.
     */
    const applyRows = async (rows: sheet.SheetRow[], unknown: string[], from: string) => {
        if (rows.length === 0) {
            setMsg({ kind: 'err', text: '읽을 수 있는 내용이 없습니다. 첫 줄에 "이름·기본 티어" 항목이 있는 표인지 확인해 주세요.' });
            return;
        }
        const tail = unknown.length ? ` · 인식하지 못한 표기: ${unknown.slice(0, 5).join(', ')}` : '';

        if (!groupId) {
            handlers.applySheetRows(rows);
            setMsg({ kind: 'ok', text: `${from} ${rows.length}명을 반영했습니다.${tail}` });
            return;
        }
        try {
            const r = await api.importTiers(groupId, rows, { fromSheet: from === '시트에서' });
            // 그룹 데이터가 바뀌었으니 티어를 새로 불러온다 (팀 빌더 명단에는 사람을 추가하지 않는다)
            handlers.refreshTiers();
            onApplied?.();
            setMsg({
                kind: 'ok',
                text: `${from} ${r.updated}명의 티어를 반영했습니다.`
                    + (r.added ? ` 새 참가자 ${r.added}명이 등록되었습니다.` : '')
                    + tail,
            });
        } catch (e) {
            setMsg({ kind: 'err', text: errorMessage(e) });
        }
    };

    const applyCsv = async (csv: string, from: string) => {
        const { rows, unknown } = sheet.parseSheetCsv(csv);
        await applyRows(rows, unknown, from);
    };

    /** 시트 연결 (주소가 비어 있으면 해제) */
    const linkSheet = async () => {
        if (!groupId || busy) return;
        setBusy(sheetUrl.trim() ? '시트를 연결하는 중' : '연결을 해제하는 중');
        setMsg(null);
        try {
            const r = await api.setSheet(groupId, sheetUrl.trim());
            setLinked(r.url);
            if (r.csv) await applyCsv(r.csv, '시트에서');
            else setMsg({ kind: 'ok', text: '시트 연결을 해제했습니다.' });
        } catch (e) {
            setMsg({ kind: 'err', text: errorMessage(e) });
        }
        setBusy(null);
    };

    /** 시트에서 가져오기 */
    const pullSheet = async () => {
        if (!groupId || busy) return;
        setBusy('시트에서 가져오는 중');
        setMsg(null);
        try {
            const r = await api.getSheet(groupId);
            if (r.csv) await applyCsv(r.csv, '시트에서');
            else setMsg({ kind: 'err', text: r.error ?? '시트를 읽지 못했습니다. 잠시 후 다시 시도해 주세요.' });
        } catch (e) {
            setMsg({ kind: 'err', text: errorMessage(e) });
        }
        setBusy(null);
    };

    /** 시트로 내보내기 — 참가자 전원을 표 서식·티어 색과 함께 쓴다 */
    const pushSheet = async () => {
        if (!groupId || busy) return;
        setBusy('시트로 내보내는 중');
        setMsg(null);
        try {
            const values = sheet.toGrid(handlers.sheetRows());
            const r = await api.pushSheet(groupId, values, sheet.TIER_CHOICES, sheet.TIER_COLORS);
            setMsg({ kind: 'ok', text: `참가자 ${r.rows}명을 시트에 내보냈습니다. 시트에서 바로 이어서 편집할 수 있어요.` });
        } catch (e) {
            setMsg({ kind: 'err', text: errorMessage(e) });
        }
        setBusy(null);
    };

    const stamp = new Date().toISOString().slice(0, 10);

    const exportFile = (kind: 'xlsx' | 'csv') => {
        const mine = handlers.sheetRows();
        const rows = mine.length ? mine : sheet.SAMPLE_ROWS;
        const blob = kind === 'xlsx' ? sheet.buildWorkbook(rows) : sheet.buildCsv(rows);
        sheet.download(blob, `팀툴-참가자티어-${stamp}.${kind}`);
    };

    const importFile = async (file: File) => {
        if (busy) return;
        setBusy('파일을 반영하는 중');
        setMsg(null);
        try {
            const { rows, unknown } = await sheet.parseSheetFile(file);
            await applyRows(rows, unknown, '파일에서');
        } catch {
            setMsg({ kind: 'err', text: '파일을 읽지 못했습니다. 엑셀(.xlsx)이나 CSV 파일인지 확인해 주세요.' });
        }
        setBusy(null);
    };

    return (
        <ModalOverlay onClick={onClose}>
            <Box onClick={e => e.stopPropagation()}>
                <div className="head">
                    <h3>참가자 티어 시트</h3>
                    <CompactButton onClick={onClose}>닫기</CompactButton>
                </div>

                <p>
                    그룹 참가자와 티어를 표 하나로 관리하세요. 구글 시트를 연결해 두면
                    <b> 참가자 데이터와 시트가 자동으로 맞춰지고</b>, 필요할 때 아래 버튼으로 직접
                    가져오거나 내보낼 수도 있습니다. 표에 새 이름을 적으면 참가자로 자동 등록됩니다.
                </p>

                <Table>
                    <thead><tr>{sheet.SHEET_HEADERS.map(h => <th key={h}>{h}</th>)}</tr></thead>
                    <tbody>
                        <tr><td>홍길동</td><td>플래티넘 2</td><td>다이아 4</td><td /><td /><td /><td>골드 1</td><td /></tr>
                        <tr><td>김철수</td><td>골드 3</td><td /><td>플래티넘 4</td><td /><td /><td /><td>1.5</td></tr>
                        <tr><td>이영희</td><td>자동</td><td /><td /><td>에메랄드 2</td><td>다이아 3</td><td /><td /></tr>
                    </tbody>
                </Table>

                <ul>
                    <li><b>기본 티어</b> — <b>자동</b>이면 등록된 롤 계정의 랭크(솔로랭크 우선)를 그대로 사용합니다.</li>
                    <li><b>라인 칸</b> — 특정 라인만 실력이 다를 때 지정합니다. 비워 두면 기본 티어를 따릅니다.</li>
                    <li><b>점수 조절</b> — 계산된 점수에 더해지는 보정값입니다. (예: 1.5, -2)</li>
                    <li>티어는 <b>플래티넘 2 · 플2 · P2</b> 어떤 표기로 적어도 인식되고, 마스터 이상도 1~4로 나눌 수 있습니다.</li>
                </ul>

                <Linked>
                    <div className="head">
                        <b>구글 시트 연동</b>
                        <em className={linked ? 'on' : ''}>{linked ? '연결됨' : '연결 전'}</em>
                    </div>
                    {groupId ? (
                        <>
                            <div className="row">
                                <TextField
                                    placeholder="구글 시트 주소를 붙여 넣으세요"
                                    value={sheetUrl}
                                    onChange={e => setSheetUrl(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') void linkSheet(); }}
                                />
                                <CompactButton onClick={() => void linkSheet()} disabled={!!busy}>
                                    {sheetUrl.trim() ? '연결' : '해제'}
                                </CompactButton>
                                <CompactButton onClick={() => void pullSheet()} disabled={!!busy || !linked}>
                                    시트에서 가져오기
                                </CompactButton>
                                <CompactButton
                                    onClick={() => void pushSheet()}
                                    disabled={!!busy || !linked || !robot.ready}
                                    title={robot.ready
                                        ? '참가자 전원을 표 서식·티어 색과 함께 시트에 정리합니다'
                                        : '시트 쓰기가 준비되지 않았습니다'}
                                >
                                    시트로 내보내기
                                </CompactButton>
                            </div>
                            <p className="hint">
                                {robot.email ? (
                                    <>
                                        시트 <b>공유</b> 목록에 아래 계정을 <b>편집자</b>로 추가한 뒤, 시트 주소를 붙여 넣고 연결하세요.
                                        <Robot
                                            onClick={() => void navigator.clipboard?.writeText(robot.email ?? '')}
                                            title="누르면 복사됩니다"
                                        >
                                            {robot.email}
                                        </Robot>
                                    </>
                                ) : (
                                    <>시트를 <b>링크가 있는 모든 사용자(뷰어)</b>로 공유한 뒤 주소를 붙여 넣으세요.</>
                                )}
                                <br />
                                연결하면 <b>자동으로 동기화됩니다</b> — 시트를 고치면 잠시 후(최대 30초) 참가자 티어에
                                반영되고, 팀툴에서 참가자를 추가·수정하면 시트에 바로 기록됩니다.
                                <b> 시트에서 가져오기</b>·<b>시트로 내보내기</b>는 기다리지 않고 즉시 맞추는 버튼입니다.
                            </p>
                        </>
                    ) : (
                        <p className="hint">내전 기록에서 그룹을 선택하면 시트를 연결할 수 있습니다.</p>
                    )}
                </Linked>

                <Actions>
                    <button className="hi" onClick={() => fileRef.current?.click()} disabled={!!busy}>파일 불러오기</button>
                    <button onClick={() => exportFile('xlsx')}>
                        {groupId || allPlayers.length ? '엑셀로 내려받기' : '예시 양식 내려받기'}
                    </button>
                    <button onClick={() => exportFile('csv')}>CSV 내려받기</button>
                    <input
                        ref={fileRef}
                        type="file"
                        accept=".xlsx,.csv,text/csv"
                        hidden
                        onChange={e => {
                            const f = e.target.files?.[0];
                            e.target.value = '';
                            if (f) void importFile(f);
                        }}
                    />
                </Actions>

                {busy ? (
                    <Working><Spinner $size={13} /> {busy}…</Working>
                ) : msg && (
                    <Msg $err={msg.kind === 'err'}>{msg.text}</Msg>
                )}
            </Box>
        </ModalOverlay>
    );
};

const Box = styled(ModalContent)`
    width: min(640px, 94vw);
    max-height: 86vh;
    overflow-y: auto;
    text-align: left;

    .head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.6rem;

        h3 { margin: 0; font-size: 1.15rem; }
    }

    p {
        font-size: 0.84rem;
        line-height: 1.6;
        color: ${({ theme }) => theme.placeholder};
        margin-bottom: 0.6rem;
        b { color: ${({ theme }) => theme.text}; }
    }

    ul { padding-left: 1.1rem; margin: 0.6rem 0; }
    li {
        font-size: 0.8rem;
        line-height: 1.6;
        color: ${({ theme }) => theme.placeholder};
        b { color: ${({ theme }) => theme.text}; }
    }
`;

const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-size: 0.74rem;

    th, td {
        padding: 0.25rem 0.35rem;
        border: 1px solid ${({ theme }) => theme.cardBorder};
        text-align: center;
        color: ${({ theme }) => theme.text};
        white-space: nowrap;
    }
    th { background: ${({ theme }) => theme.body}; font-weight: 700; }
    td:first-child { text-align: left; }
`;

/* 구글 시트 연결 영역 */
const Linked = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.6rem;
    margin-bottom: 0.7rem;
    border-radius: var(--radius-md);
    border: 1px solid ${({ theme }) => theme.cardBorder};
    background: ${({ theme }) => theme.body};

    .head { display: flex; align-items: center; gap: 0.4rem; font-size: 0.86rem; color: ${({ theme }) => theme.text}; }
    .head em {
        font-style: normal;
        font-size: 0.68rem;
        font-weight: 800;
        padding: 0.05rem 0.4rem;
        border-radius: 999px;
        background: ${({ theme }) => theme.cardBorder};
        color: ${({ theme }) => theme.placeholder};
    }
    .head em.on { background: ${({ theme }) => theme.accent}; color: ${({ theme }) => theme.accentText}; }

    .row { display: flex; flex-wrap: wrap; gap: 0.35rem; input { flex: 1; min-width: 180px; } }
    .hint { font-size: 0.74rem; margin: 0; }
`;

/* 서비스 계정 이메일 — 눌러서 복사 */
const Robot = styled.button`
    display: inline-block;
    margin-left: 0.3rem;
    padding: 0.05rem 0.35rem;
    border-radius: 4px;
    border: 1px solid ${({ theme }) => theme.cardBorder};
    background: ${({ theme }) => theme.card};
    color: ${({ theme }) => theme.accent};
    font-size: 0.7rem;
    font-weight: 700;
    cursor: pointer;
    word-break: break-all;
`;

const Actions = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;

    button {
        padding: 0.4rem 0.8rem;
        border: 1px solid ${({ theme }) => theme.cardBorder};
        border-radius: var(--radius-md);
        background: transparent;
        color: ${({ theme }) => theme.text};
        font-size: 0.8rem;
        font-weight: 700;
        cursor: pointer;
        &:hover:not(:disabled) { background: ${({ theme }) => theme.dragOver}; }
        &:disabled { opacity: 0.5; cursor: default; }
    }
    .hi {
        border-color: transparent;
        background: ${({ theme }) => theme.accentGradient};
        color: ${({ theme }) => theme.accentText};
    }
`;

const Msg = styled.p<{ $err: boolean }>`
    margin-top: 0.6rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: ${({ $err, theme }) => ($err ? theme.teamRed : theme.accent)} !important;
`;

/* 진행 중 — 스피너와 함께 지금 하는 일을 보여 준다 */
const Working = styled.p`
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin-top: 0.6rem;
    font-size: 0.8rem;
    font-weight: 700;
    color: ${({ theme }) => theme.accent} !important;
`;
