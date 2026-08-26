import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { useActiveGroupBadge, useActiveGroupId, setActiveGroup } from '../hooks/useActiveGroupBadge';
import { Header } from '../App.styles';
import * as api from '../services/api';
import type { Group } from '../types';
import { useMyPlayer, setMyPlayer } from '../hooks/useMyPlayer';
import type { GroupPlayer } from '../types';

/*
 * 상단 그룹 배지 — 클릭하면 내가 속한 그룹으로 전환하거나 오프라인(그룹 없이 사용)으로 바꿀 수 있다.
 * 그룹을 바꾸면 팀 빌더의 자동 티어·내전 기록·경매가 모두 그 그룹 기준으로 동작한다.
 */
export const AppHeader = () => {
    const groupName = useActiveGroupBadge();
    const groupId = useActiveGroupId();
    const me = useMyPlayer(groupId);
    const [open, setOpen] = useState(false);
    const [groups, setGroups] = useState<Group[] | null>(null);
    const ref = useRef<HTMLDivElement>(null);

    // 열릴 때 내 그룹 목록을 가져온다
    useEffect(() => {
        if (!open) return;
        api.listGroups().then(setGroups).catch(() => setGroups([]));
    }, [open]);

    // 선택된 그룹의 참가자 명단 — "나는 누구" 선택에 쓴다
    const [roster, setRoster] = useState<GroupPlayer[] | null>(null);
    useEffect(() => {
        if (!open || !groupId) { setRoster(null); return; }
        let stopped = false;
        api.getRoster(groupId)
            .then(r => { if (!stopped) setRoster(r.players); })
            .catch(() => { if (!stopped) setRoster([]); });
        return () => { stopped = true; };
    }, [open, groupId]);

    // 바깥 클릭 시 닫기
    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    const pick = (g: Group | null) => {
        setActiveGroup(g ? { id: g.id, name: g.name } : null);
        setOpen(false);
    };

    return (
        <Header>
            <Wrap ref={ref}>
                <GroupBadge
                    type="button"
                    title="클릭해서 그룹 전환 / 오프라인 전환"
                    $none={!groupName}
                    onClick={() => setOpen(o => !o)}
                >
                    {groupName ? `그룹 · ${groupName}` : '오프라인'}
                    {me && <b className="me">{me.displayName}</b>}
                    <i className="caret" aria-hidden>▾</i>
                </GroupBadge>

                {open && (
                    <Menu>
                        <div className="label">그룹 전환</div>
                        {groups === null ? (
                            <div className="empty">불러오는 중…</div>
                        ) : groups.length === 0 ? (
                            <div className="empty">참여 중인 그룹이 없습니다. 내전 기록 탭에서 만들거나 참여하세요.</div>
                        ) : (
                            groups.map(g => (
                                <button
                                    key={g.id}
                                    className={g.id === groupId ? 'item on' : 'item'}
                                    onClick={() => pick(g)}
                                >
                                    <span className="nm">{g.name}</span>
                                    <span className="code">{g.joinCode}</span>
                                </button>
                            ))
                        )}
                        <button className={groupId ? 'item' : 'item on'} onClick={() => pick(null)}>
                            <span className="nm">오프라인으로 사용</span>
                            <span className="code">그룹 없음</span>
                        </button>

                        {/* 이 그룹에서 내가 누구인지 — 브라우저에 저장되어 다음에도 유지된다 */}
                        {groupId && (
                            <>
                                <div className="label sep">이 그룹에서 나는</div>
                                {roster === null ? (
                                    <div className="empty">불러오는 중…</div>
                                ) : roster.length === 0 ? (
                                    <div className="empty">참가자가 없습니다. 내전 기록에서 먼저 추가하세요.</div>
                                ) : (
                                    roster.map(p => (
                                        <button
                                            key={p.id}
                                            className={me?.playerId === p.id ? 'item on' : 'item'}
                                            onClick={() => setMyPlayer(groupId, me?.playerId === p.id
                                                ? null
                                                : { playerId: p.id, displayName: p.displayName })}
                                            title={me?.playerId === p.id ? '다시 누르면 해제됩니다' : '나로 지정 (포인트·출석에 사용)'}
                                        >
                                            <span className="nm">{p.displayName}</span>
                                            {me?.playerId === p.id && <span className="code">나</span>}
                                        </button>
                                    ))
                                )}
                            </>
                        )}
                    </Menu>
                )}
            </Wrap>
        </Header>
    );
};

const Wrap = styled.div`
    position: relative;
`;

const GroupBadge = styled.button<{ $none?: boolean }>`
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.4rem 0.7rem;
    border-radius: 9999px;
    font-size: 0.78rem;
    font-weight: 700;
    max-width: 240px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
    color: ${({ theme, $none }) => ($none ? theme.placeholder : theme.text)};
    background: ${({ theme }) => theme.card};
    border: 1px solid ${({ theme, $none }) => ($none ? theme.cardBorder : theme.accent)};

    .caret { font-style: normal; font-size: 0.65rem; opacity: 0.7; }
    .me {
        padding: 0.05rem 0.35rem;
        border-radius: 999px;
        font-size: 0.66rem;
        background: ${({ theme }) => theme.accent};
        color: ${({ theme }) => theme.accentText};
    }
    &:hover { background: ${({ theme }) => theme.dragOver}; }
`;

const Menu = styled.div`
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 200;
    min-width: 220px;
    max-height: 300px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0.4rem;
    border-radius: var(--radius-md);
    background: ${({ theme }) => theme.contextMenu};
    border: 1px solid ${({ theme }) => theme.contextMenuBorder};
    box-shadow: 0 10px 26px rgba(0,0,0,0.35);

    .label {
        font-size: 0.68rem;
        font-weight: 800;
        color: ${({ theme }) => theme.placeholder};
        padding: 0.2rem 0.4rem 0.3rem;
    }
    .label.sep {
        margin-top: 0.35rem;
        padding-top: 0.45rem;
        border-top: 1px solid ${({ theme }) => theme.contextMenuBorder};
    }

    .empty {
        font-size: 0.74rem;
        color: ${({ theme }) => theme.placeholder};
        padding: 0.4rem;
        line-height: 1.5;
    }

    .item {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 0.5rem;
        width: 100%;
        border: none;
        background: none;
        color: ${({ theme }) => theme.text};
        font-size: 0.82rem;
        text-align: left;
        padding: 0.45rem 0.5rem;
        border-radius: var(--radius-sm);
        cursor: pointer;

        &:hover { background: ${({ theme }) => theme.dragOver}; }
        .nm { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .code { font-size: 0.68rem; color: ${({ theme }) => theme.placeholder}; flex-shrink: 0; }
    }

    .item.on {
        background: ${({ theme }) => theme.accentGradient};
        color: ${({ theme }) => theme.accentText};
        .code { color: ${({ theme }) => theme.accentText}; opacity: 0.8; }
    }
`;
