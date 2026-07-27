import { useEffect, useRef, useState } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { Card, CompactButton, PrimaryButton, SecondaryButton, TextField } from '../App.styles';
import { POSITIONS } from '../constants';
import type { Position } from '../types';
import { LaneIcon } from './ui/LaneIcon';
import { useArchive } from './../hooks/useArchive';
import { useAuction } from '../hooks/useAuction';
import type { AuctionState, AuctionTeam } from '../hooks/useAuction';
import * as api from '../services/api';

/*
 * 롤 경매 탭 — 호스트 진행형 경매 (사회자가 한 화면에서 입찰을 입력).
 * 참가자는 내전 기록 그룹에서 불러올 수 있고, 경매 상태는 그룹별로 저장된다.
 * 화면은 "경매 진행(개인 화면)"과 "팀 현황"을 같이 보거나 하나씩 볼 수 있다.
 */

type ViewMode = 'both' | 'auction' | 'teams';

/*
 * 편집 중에는 자유롭게 지우고 다시 쓸 수 있는 숫자 입력.
 * 값 확정(포커스 아웃/Enter) 시에만 범위를 보정한다 — 마지막 값만 유효하면 됨.
 */
const ClampInput = ({ value, min, max, step, onCommit }: {
    value: number;
    min: number;
    max: number;
    step?: number;
    onCommit: (v: number) => void;
}) => {
    const [text, setText] = useState<string | null>(null); // null = 편집 중 아님 (확정값 표시)

    const commit = () => {
        if (text == null) return;
        const v = Number(text);
        onCommit(text === '' || !Number.isFinite(v) ? value : Math.max(min, Math.min(max, Math.round(v))));
        setText(null);
    };

    return (
        <NumInput
            type="number"
            min={min}
            max={max}
            step={step}
            value={text ?? String(value)}
            onChange={e => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
    );
};

export const AuctionTab = () => {
    const archive = useArchive();
    const scope = archive.activeGroup?.id ?? 'standalone';
    const auction = useAuction(scope);
    const { state, remainingSec } = auction;

    const [nameInput, setNameInput] = useState('');
    const [startError, setStartError] = useState('');
    const [bidError, setBidError] = useState('');
    const [view, setView] = useState<ViewMode>('both');
    const [selectedId, setSelectedId] = useState<string | null>(null); // 클릭-이동용 선택 상태

    /* 실시간 관전/참여 — 진행자가 올린 그룹 경매 상태를 폴링해 보여준다 */
    const [watching, setWatching] = useState(false);
    const [remote, setRemote] = useState<AuctionState | null>(null);
    const [remoteAt, setRemoteAt] = useState<number | null>(null);
    const [, setWatchTick] = useState(0);
    const groupId = archive.activeGroup?.id ?? null;
    // 팀장 참여: 이 기기가 맡은 팀 (그룹별 localStorage 저장)
    const claimKey = groupId ? `lol_teamtool:auction:claim:${groupId}` : null;
    const [myTeamId, setMyTeamId] = useState<string | null>(() => claimKey ? localStorage.getItem(claimKey) : null);
    const [leaderMsg, setLeaderMsg] = useState('');
    const [acting, setActing] = useState(false); // 액션 요청 진행 중 — 같은 사람의 버튼 연타/중복 요청 방지
    const pullRef = useRef<() => void>(() => {});
    const lastResolvedRef = useRef<number | null>(null); // 같은 마감시각에 대해 종료 액션 중복 전송 방지
    const lastRevRef = useRef<number | null>(null);      // 조건부 폴링용 마지막으로 본 rev
    const remoteRef = useRef<AuctionState | null>(null); // 최신 원격 상태 (unchanged 응답 시 참조)
    const claimTeam = (teamId: string | null) => {
        setMyTeamId(teamId);
        if (!claimKey) return;
        if (teamId) localStorage.setItem(claimKey, teamId);
        else localStorage.removeItem(claimKey);
    };
    useEffect(() => {
        if (!watching || !groupId) return;
        let stopped = false;
        lastRevRef.current = null; // 감시 시작 시 첫 폴은 전체 상태를 받는다
        const pull = async () => {
            try {
                const res = await api.getAuctionSync(groupId, lastRevRef.current);
                if (stopped) return;
                let st = remoteRef.current;
                if (!res.unchanged) {
                    st = (res.state as AuctionState) ?? null;
                    remoteRef.current = st;
                    lastRevRef.current = res.rev;
                    setRemote(st);
                    setRemoteAt(res.updatedAt ?? null);
                }
                // 팀장 방식: 타이머가 만료되면 누구든 종료 액션을 보내 서버가 확정한다 (서버는 idempotent)
                const cur = st?.current;
                if (st?.settings?.controlMode === 'leader' && cur && cur.deadline != null
                    && Date.now() >= cur.deadline && lastResolvedRef.current !== cur.deadline) {
                    lastResolvedRef.current = cur.deadline;
                    try {
                        const after = await api.postAuctionAction(groupId, { type: 'resolve' });
                        if (!stopped) {
                            const a = (after.state as AuctionState) ?? null;
                            remoteRef.current = a; lastRevRef.current = after.rev; setRemote(a);
                        }
                    } catch { /* 다음 주기에 재시도 */ }
                }
            } catch { /* 일시 실패는 마지막 상태 유지 */ }
        };
        pullRef.current = pull;
        pull();
        // 팀장 제어 방식은 참여자도 빠르게 갱신돼야 하므로 짧게 폴링한다 (변경 없으면 rev로 초경량 응답)
        const rate = remote?.settings?.controlMode === 'leader' ? 300 : 1500;
        const poll = setInterval(pull, rate);
        const tick = setInterval(() => setWatchTick(t => t + 1), 250); // 타이머 표시 갱신
        return () => { stopped = true; clearInterval(poll); clearInterval(tick); };
    }, [watching, groupId, remote?.settings?.controlMode]);

    const leaders = state.players.filter(p => p.isLeader);
    const nameOf = (id: string) => auction.helpers.playerOf(id)?.name ?? '?';

    const handleAdd = () => {
        const names = nameInput.split(/[\s,]+/).filter(Boolean);
        if (names.length === 0) return;
        auction.addPlayers(names);
        setNameInput('');
    };

    const handleImport = () => {
        auction.addPlayers(archive.players.map(p => p.displayName));
    };

    const handleStart = async () => {
        setBidError('');
        if (state.settings.controlMode === 'leader') {
            if (!groupId) { setStartError('팀장 각자 제어 방식은 내전 기록 그룹을 먼저 선택해야 합니다.'); return; }
            const err = await auction.startLeader(groupId);
            if (err) { setStartError(err); return; }
            setStartError('');
            claimTeam(null);              // 이전 팀 선택 초기화
            lastResolvedRef.current = null;
            lastRevRef.current = null;
            remoteRef.current = null;
            setWatching(true);            // 생성자도 참여자로 진입 (진행자 없음)
        } else {
            setStartError(auction.start() ?? '');
        }
    };

    const handleBid = (teamId: string, amount: number) => {
        setBidError(auction.placeBid(teamId, amount) ?? '');
    };

    /* ---------- 실시간 관전 / 팀장 참여 ---------- */
    if (watching) {
        const s = remote;
        const isLeaderMode = s?.settings?.controlMode === 'leader';
        const running = Boolean(s && (s.phase === 'live' || s.phase === 'failed'));
        const myTeam = (s && myTeamId) ? s.teams.find(t => t.id === myTeamId) ?? null : null;
        const cur = s?.current ?? null;

        // 서버가 돌려준 최신 상태 + rev를 즉시 반영 (다음 폴은 조건부로 초경량)
        const applyActionResult = (after: { state: unknown; rev: number }) => {
            const a = (after.state as AuctionState) ?? null;
            remoteRef.current = a; lastRevRef.current = after.rev; setRemote(a);
        };

        const submitLeaderBid = async (amount: number) => {
            if (!cur || !myTeam || !groupId || acting) return;
            if (cur.eligibleTeamIds && !cur.eligibleTeamIds.includes(myTeam.id)) { setLeaderMsg('이 유찰 경매에는 참여할 수 없습니다.'); return; }
            const min = cur.highest ? cur.highest.amount + 1 : (cur.zeroAllowed ? 0 : 1);
            if (amount < min) { setLeaderMsg(`최소 ${min}pt 이상이어야 합니다.`); return; }
            if (amount > myTeam.points) { setLeaderMsg('남은 포인트가 부족합니다.'); return; }
            setActing(true);
            setLeaderMsg(`입찰 전송: ${amount}pt`);
            try {
                applyActionResult(await api.postAuctionAction(groupId, { type: 'bid', teamId: myTeam.id, amount, lotPlayerId: cur.playerId }));
            } catch { setLeaderMsg('전송 실패 — 다시 시도해 주세요.'); }
            finally { setActing(false); }
        };

        // 진행 액션(다음 대상 공개 / 즉시 종료) — 팀장 방식은 누구나 가능.
        // acting 가드로 같은 사람의 중복 클릭을 막고, 동시에 여러 명이 눌러도 서버 CAS가 한 번만 반영한다.
        const doAction = async (action: api.AuctionAction) => {
            if (!groupId || acting) return;
            setActing(true);
            try {
                applyActionResult(await api.postAuctionAction(groupId, action));
            } catch { /* 무시 — 다음 폴링에서 반영 */ }
            finally { setActing(false); }
        };

        const myFull = myTeam ? myTeam.members.length + 1 >= s!.settings.teamSize : false;
        const myLineBlk = Boolean(myTeam && s && lineLockBlocked(s, myTeam.id));
        const myBlocked = Boolean(cur?.eligibleTeamIds && myTeam && !cur.eligibleTeamIds.includes(myTeam.id)) || myLineBlk;

        return (
            <Wrap>
                <TopBar>
                    <PhaseBadge $failed={s?.phase === 'failed'} $done={s?.phase === 'done'}>
                        {!s || s.phase === 'setup' ? '대기 중'
                            : s.phase === 'failed' ? '유찰 라운드'
                            : s.phase === 'done' ? '경매 종료'
                            : `${s.round}바퀴 / ${s.settings.maxRounds}바퀴`}
                    </PhaseBadge>
                    <span className="info">
                        {isLeaderMode && myTeam ? `참여 중 · ${pOf(s!, myTeam.leaderId)?.name ?? '?'} 팀` : isLeaderMode ? '팀장 참여 대기' : '실시간 관전 중'}
                        {remoteAt ? ` · ${new Date(remoteAt).toLocaleTimeString('ko-KR')} 갱신` : ''}
                    </span>
                    {isLeaderMode && myTeam && <CompactButton onClick={() => claimTeam(null)}>팀 변경</CompactButton>}
                    <SecondaryButton onClick={() => { setWatching(false); setLeaderMsg(''); }}>{isLeaderMode ? '참여 종료' : '관전 종료'}</SecondaryButton>
                </TopBar>
                {!s || s.phase === 'setup' ? (
                    <SectionCard>
                        <Hint>
                            아직 공유된 경매가 없습니다. 같은 그룹의 진행자가 경매를 시작하면 이 화면에 실시간으로 표시됩니다.
                        </Hint>
                    </SectionCard>
                ) : (
                    <Board $view="both">
                        <QueueCol><QueuePanel s={s} /></QueueCol>
                        <AuctionCol>
                            <SpectatorTarget s={s} />

                            {/* 진행 제어 — 팀장 방식은 진행자가 없어 누구나 다음/종료를 누를 수 있다 */}
                            {isLeaderMode && running && (
                                <ControlRow>
                                    {cur ? (
                                        <CompactButton disabled={acting} onClick={() => doAction({ type: 'endNow' })}>즉시 종료 (낙찰/유찰 확정)</CompactButton>
                                    ) : (
                                        <PrimaryButton disabled={acting} onClick={() => doAction({ type: 'draw' })}>다음 대상 공개</PrimaryButton>
                                    )}
                                    <span className="hint">누구나 진행할 수 있습니다.</span>
                                </ControlRow>
                            )}

                            {/* 팀장 참여: 내 팀 선택 → 내 팀 입찰 컨트롤 */}
                            {isLeaderMode && running && !myTeam && (
                                <ClaimCard>
                                    <h4>내 팀 선택</h4>
                                    <div className="teams">
                                        {s.teams.map(t => (
                                            <button key={t.id} onClick={() => claimTeam(t.id)}>
                                                {pOf(s, t.leaderId)?.name ?? '?'} 팀 · {t.points}pt
                                            </button>
                                        ))}
                                    </div>
                                    <Hint>자기 팀을 고르면 입찰 버튼이 나타납니다. 관전만 하려면 그냥 두세요.</Hint>
                                </ClaimCard>
                            )}
                            {isLeaderMode && running && myTeam && (
                                <BidPanel>
                                    {cur ? (
                                        <BidRow
                                            label={`${pOf(s, myTeam.leaderId)?.name ?? '?'} 팀 (내 팀)`}
                                            points={myTeam.points}
                                            currentHigh={cur.highest?.amount ?? 0}
                                            winning={cur.highest?.teamId === myTeam.id}
                                            disabled={myFull || myBlocked || acting}
                                            reason={myFull ? '정원 마감' : myLineBlk ? '라인 중복' : myBlocked ? '참여 불가' : ''}
                                            onBid={submitLeaderBid}
                                        />
                                    ) : (
                                        <Hint>진행자가 다음 대상을 공개하기를 기다리는 중…</Hint>
                                    )}
                                    {leaderMsg && <Hint>{leaderMsg}</Hint>}
                                </BidPanel>
                            )}

                            <LogCard>
                                <h4>진행 기록</h4>
                                {s.log.length === 0
                                    ? <Hint>아직 기록이 없습니다.</Hint>
                                    : s.log.map((line, i) => <p key={i}>{line}</p>)}
                            </LogCard>
                        </AuctionCol>
                        <TeamsCol><TeamsPanel s={s} /></TeamsCol>
                    </Board>
                )}
            </Wrap>
        );
    }

    /* ---------- 설정 단계 ---------- */
    if (state.phase === 'setup') {
        return (
            <Wrap>
                {archive.activeGroup && (
                    <TopBar>
                        <span className="info">
                            같은 그룹({archive.activeGroup.name})에서 진행 중인 경매는 관전하거나, 팀장 제어 방식이면 자기 팀으로 참여할 수 있습니다.
                        </span>
                        <SecondaryButton onClick={() => setWatching(true)}>실시간 관전·참여</SecondaryButton>
                    </TopBar>
                )}
                <SectionCard>
                    <h3>경매 설정</h3>
                    <SettingsGrid>
                        <label>팀 수
                            <ClampInput min={2} max={10} value={state.settings.teamCount}
                                onCommit={v => auction.updateSettings({ teamCount: v })} />
                        </label>
                        <label>팀 인원 (팀장 포함)
                            <ClampInput min={2} max={6} value={state.settings.teamSize}
                                onCommit={v => auction.updateSettings({ teamSize: v })} />
                        </label>
                        <label>시작 포인트
                            <ClampInput min={100} max={100000} step={100} value={state.settings.startPoints}
                                onCommit={v => auction.updateSettings({ startPoints: v })} />
                        </label>
                        <label>유찰 전 바퀴 수
                            <ClampInput min={1} max={5} value={state.settings.maxRounds}
                                onCommit={v => auction.updateSettings({ maxRounds: v })} />
                        </label>
                        <label>타이머 방식
                            <ModeRow>
                                <ModeButton
                                    $active={state.settings.timerMode === 'fixed'}
                                    onClick={() => auction.updateSettings({ timerMode: 'fixed' })}
                                    title="대상 공개와 동시에 정해진 시간이 흐르고, 시간이 끝나면 최고가로 낙찰됩니다"
                                >
                                    정해진 시간
                                </ModeButton>
                                <ModeButton
                                    $active={state.settings.timerMode === 'afterBid'}
                                    onClick={() => auction.updateSettings({ timerMode: 'afterBid' })}
                                    title="시간 제한 없이 진행하다가, 입찰이 나오면 마지막 입찰 후 카운트다운으로 종료됩니다"
                                >
                                    입찰 후 카운트다운
                                </ModeButton>
                            </ModeRow>
                        </label>
                        {state.settings.timerMode === 'fixed' ? (
                            <label>경매 시간 (초)
                                <ClampInput min={5} max={300} value={state.settings.bidTimerSec}
                                    onCommit={v => auction.updateSettings({ bidTimerSec: v })} />
                            </label>
                        ) : (
                            <label>마지막 입찰 후 종료 (초)
                                <ClampInput min={3} max={120} value={state.settings.afterBidSec}
                                    onCommit={v => auction.updateSettings({ afterBidSec: v })} />
                            </label>
                        )}
                        <label className="wide">진행 방식
                            <ModeRow>
                                <ModeButton
                                    $active={state.settings.controlMode === 'central'}
                                    onClick={() => auction.updateSettings({ controlMode: 'central' })}
                                    title="사회자 한 화면에서 모든 팀의 입찰을 직접 입력합니다"
                                >
                                    중앙 제어 (사회자)
                                </ModeButton>
                                <ModeButton
                                    $active={state.settings.controlMode === 'leader'}
                                    onClick={() => auction.updateSettings({ controlMode: 'leader' })}
                                    title="진행자 없이 서버가 진행합니다. 생성자를 포함해 누구나 접속해 자기 팀 입찰과 '다음 대상 공개'를 할 수 있습니다. 같은 그룹을 선택해야 합니다."
                                >
                                    팀장 각자 제어
                                </ModeButton>
                            </ModeRow>
                        </label>
                        <label className="wide">라인 중복 금지
                            <ModeRow>
                                <ModeButton $active={!state.settings.lineLock} onClick={() => auction.updateSettings({ lineLock: false })}>
                                    사용 안 함
                                </ModeButton>
                                <ModeButton
                                    $active={state.settings.lineLock}
                                    onClick={() => auction.updateSettings({ lineLock: true })}
                                    title="이미 그 라인 선수를 보유한 팀은 같은 라인 선수에 입찰할 수 없습니다. (참가자 라인을 미리 지정해야 동작)"
                                >
                                    사용 (한 팀에 라인당 1명)
                                </ModeButton>
                            </ModeRow>
                        </label>
                        <label className="wide">경매 순서 공개
                            <ModeRow>
                                <ModeButton $active={!state.settings.showOrder} onClick={() => auction.updateSettings({ showOrder: false })}>
                                    숨김 (이름순)
                                </ModeButton>
                                <ModeButton
                                    $active={state.settings.showOrder}
                                    onClick={() => auction.updateSettings({ showOrder: true })}
                                    title="대기 목록에 실제 경매 순서를 번호로 표시합니다"
                                >
                                    순서 공개
                                </ModeButton>
                            </ModeRow>
                        </label>
                    </SettingsGrid>
                    {state.settings.controlMode === 'leader' && !archive.activeGroup && (
                        <ErrorText>팀장 각자 제어 방식은 내전 기록 그룹을 먼저 선택해야 합니다 (팀장들이 같은 그룹으로 접속).</ErrorText>
                    )}
                    {state.settings.controlMode === 'leader' && archive.activeGroup && (
                        <Hint>진행자 없이 서버가 진행합니다. "경매 시작"을 누르면 생성자도 곧바로 참여자가 되어 자기 팀을 고를 수 있고, 팀장들은 각자 같은 그룹({archive.activeGroup.name})을 선택해 "실시간 관전·참여"로 들어옵니다. 대상 공개·종료는 누구나 누를 수 있습니다.</Hint>
                    )}
                </SectionCard>

                <SectionCard>
                    <HeadRow>
                        <h3>참가자 <small>{state.players.length}명 · 팀장 {leaders.length}/{state.settings.teamCount}</small></h3>
                        {archive.activeGroup && (
                            <CompactButton onClick={handleImport} title={`"${archive.activeGroup.name}" 그룹 참가자 ${archive.players.length}명 불러오기`}>
                                내전 기록에서 불러오기
                            </CompactButton>
                        )}
                    </HeadRow>

                    <AddRow>
                        <TextField
                            placeholder="이름 입력 (스페이스/쉼표로 여러 명 한 번에)"
                            value={nameInput}
                            onChange={e => setNameInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                        />
                        <CompactButton onClick={handleAdd}>추가</CompactButton>
                    </AddRow>

                    {state.players.length === 0 ? (
                        <Hint>참가자를 추가한 뒤, 이름표를 원하는 라인 칸으로 드래그해서 라인을 지정하세요. (이름표를 클릭해 선택한 뒤 라인 칸을 클릭해도 됩니다) 라인은 유찰 배정에 사용됩니다.</Hint>
                    ) : (
                        <>
                            <Hint>이름표를 라인 칸으로 드래그하거나, 클릭해 선택한 뒤 라인 칸을 클릭하세요. "팀장" 버튼으로 팀장을 지정합니다.</Hint>
                            <LaneBoard>
                                {([null, ...POSITIONS] as (Position | null)[]).map(line => {
                                    const inZone = state.players.filter(p => p.line === line);
                                    return (
                                        <LaneZone
                                            key={line ?? 'none'}
                                            $drop={selectedId != null}
                                            onDragOver={e => e.preventDefault()}
                                            onDrop={e => {
                                                e.preventDefault();
                                                const id = e.dataTransfer.getData('text/plain');
                                                if (id) auction.setLine(id, line);
                                            }}
                                            onClick={() => {
                                                if (selectedId) {
                                                    auction.setLine(selectedId, line);
                                                    setSelectedId(null);
                                                }
                                            }}
                                        >
                                            <div className="zhead">
                                                {line && <LaneIcon line={line} size={13} />}
                                                {line ?? '라인 미지정'} <small className="tabular">{inZone.length}</small>
                                            </div>
                                            {inZone.map(p => (
                                                <DragChip
                                                    key={p.id}
                                                    $leader={p.isLeader}
                                                    $selected={selectedId === p.id}
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        setSelectedId(selectedId === p.id ? null : p.id);
                                                    }}
                                                >
                                                    <button
                                                        className="lead"
                                                        title={p.isLeader ? '팀장 해제' : '팀장으로 지정'}
                                                        onClick={e => { e.stopPropagation(); auction.toggleLeader(p.id); }}
                                                    >
                                                        팀장
                                                    </button>
                                                    {/* 드래그는 이름표에서만 시작 → 삭제/팀장 버튼 클릭이 드래그로 오인되지 않는다 */}
                                                    <span
                                                        className="name"
                                                        title={`${p.name} (드래그해서 라인 이동)`}
                                                        draggable
                                                        onDragStart={e => e.dataTransfer.setData('text/plain', p.id)}
                                                    >
                                                        {p.name}
                                                    </span>
                                                    <button
                                                        className="del"
                                                        title="참가자 제거"
                                                        onMouseDown={e => e.stopPropagation()}
                                                        onClick={e => { e.stopPropagation(); auction.removePlayer(p.id); }}
                                                    >
                                                        ✕
                                                    </button>
                                                </DragChip>
                                            ))}
                                            {inZone.length === 0 && <div className="empty">여기로 드래그</div>}
                                        </LaneZone>
                                    );
                                })}
                            </LaneBoard>
                        </>
                    )}

                    <StartRow>
                        <Hint>
                            경매 대상 {Math.max(0, state.players.length - leaders.length)}명 ·
                            팀 슬롯 {state.settings.teamCount * (state.settings.teamSize - 1)}자리
                        </Hint>
                        {state.players.length > 0 && <SecondaryButton onClick={auction.wipe}>전체 비우기</SecondaryButton>}
                        <PrimaryButton onClick={handleStart}>경매 시작</PrimaryButton>
                    </StartRow>
                    {startError && <ErrorText>{startError}</ErrorText>}
                </SectionCard>
            </Wrap>
        );
    }

    /* ---------- 진행 / 유찰 / 종료 ---------- */
    const cur = state.current;
    const curPlayer = cur ? auction.helpers.playerOf(cur.playerId) : null;
    const highestTeam = cur?.highest ? auction.helpers.teamLabel(cur.highest.teamId) : null;
    const phaseBadge = state.phase === 'failed' ? '유찰 라운드'
        : state.phase === 'done' ? '경매 종료'
        : `${state.round}바퀴 / ${state.settings.maxRounds}바퀴`;

    return (
        <Wrap>
            <TopBar>
                <PhaseBadge $failed={state.phase === 'failed'} $done={state.phase === 'done'}>{phaseBadge}</PhaseBadge>
                <span className="info">
                    대기 {state.queue.length + state.carry.length}명
                    {state.failedPool.length > 0 && ` · 유찰 대기 ${state.failedPool.length}명`}
                </span>
                <ViewToggle>
                    <ToggleMini $active={view === 'both'} onClick={() => setView('both')}>같이 보기</ToggleMini>
                    <ToggleMini $active={view === 'auction'} onClick={() => setView('auction')}>경매만</ToggleMini>
                    <ToggleMini $active={view === 'teams'} onClick={() => setView('teams')}>팀만</ToggleMini>
                </ViewToggle>
                <SecondaryButton onClick={auction.backToSetup} title="결과를 버리고 설정 화면으로 돌아갑니다">설정으로</SecondaryButton>
            </TopBar>

            <Board $view={view}>
                {view !== 'teams' && (
                    <QueueCol><QueuePanel s={state} /></QueueCol>
                )}
                {view !== 'teams' && (
                    <AuctionCol>
                        {state.phase === 'done' ? (
                            <TargetCard>
                                <h3>경매가 끝났습니다</h3>
                                {state.unassigned.length > 0 && (
                                    <Hint>미배정: {state.unassigned.map(nameOf).join(', ')}</Hint>
                                )}
                                <PrimaryButton onClick={auction.backToSetup}>새 경매 준비</PrimaryButton>
                            </TargetCard>
                        ) : cur && curPlayer ? (
                            <TargetCard>
                                <div className="who">
                                    <strong>{curPlayer.name}</strong>
                                    <LineBadge>
                                        {curPlayer.line && <LaneIcon line={curPlayer.line} size={13} />}
                                        {curPlayer.line ?? '라인 미지정'}
                                    </LineBadge>
                                    {cur.zeroAllowed && <ZeroBadge>0원 입찰 가능</ZeroBadge>}
                                </div>
                                {remainingSec != null ? (
                                    <>
                                        <Timer $urgent={remainingSec <= 5} className="tabular">{remainingSec}초</Timer>
                                        <TimerBar
                                            $pct={Math.min(100, (remainingSec / (state.settings.timerMode === 'fixed' ? state.settings.bidTimerSec : state.settings.afterBidSec)) * 100)}
                                            $urgent={remainingSec <= 5}
                                        />
                                    </>
                                ) : (
                                    <IdleTimer>첫 입찰을 기다리는 중 — 입찰하면 카운트다운이 시작됩니다</IdleTimer>
                                )}
                                <div className="highest tabular">
                                    {cur.highest ? <>현재 최고가 <b>{cur.highest.amount}pt</b> — {highestTeam}</> : '아직 입찰 없음'}
                                </div>
                                <CompactButton onClick={auction.endNow}>즉시 종료 (낙찰/유찰 확정)</CompactButton>
                            </TargetCard>
                        ) : (
                            <TargetCard>
                                {state.lastResult && <Result>{state.lastResult}</Result>}
                                <PrimaryButton onClick={() => { setBidError(''); auction.draw(); }}>
                                    {state.log.length <= 1 ? '첫 대상 공개' : '다음 대상 공개'}
                                </PrimaryButton>
                                <Hint>대상은 팀장을 제외한 참가자 중 랜덤으로 나옵니다.</Hint>
                            </TargetCard>
                        )}

                        {cur && (
                            <BidPanel>
                                {state.teams.map(team => {
                                    const full = auction.helpers.teamFull(team);
                                    const lineBlk = lineLockBlocked(state, team.id);
                                    const blocked = Boolean(cur.eligibleTeamIds && !cur.eligibleTeamIds.includes(team.id)) || lineBlk;
                                    return (
                                        <BidRow
                                            key={team.id}
                                            label={`${nameOf(team.leaderId)} 팀`}
                                            points={team.points}
                                            currentHigh={cur.highest?.amount ?? 0}
                                            winning={cur.highest?.teamId === team.id}
                                            disabled={full || blocked}
                                            reason={full ? '정원 마감' : lineBlk ? '라인 중복' : blocked ? '참여 불가' : ''}
                                            onBid={amount => handleBid(team.id, amount)}
                                        />
                                    );
                                })}
                                {bidError && <ErrorText>{bidError}</ErrorText>}
                            </BidPanel>
                        )}

                        <LogCard>
                            <h4>진행 기록</h4>
                            {state.log.length === 0
                                ? <Hint>아직 기록이 없습니다.</Hint>
                                : state.log.map((line, i) => <p key={i}>{line}</p>)}
                        </LogCard>
                    </AuctionCol>
                )}

                {view !== 'auction' && (
                    <TeamsCol $grid={view === 'teams'}><TeamsPanel s={state} /></TeamsCol>
                )}
            </Board>
        </Wrap>
    );
};

/* ---------- 공용 패널 (진행자 화면 + 관전 화면에서 같이 사용) ---------- */

const pOf = (s: AuctionState, id: string) => s.players.find(p => p.id === id);

/** 라인 중복 금지가 켜져 있고, 이 팀이 현재 대상의 라인을 이미 보유했으면 true (입찰 불가) */
const lineLockBlocked = (s: AuctionState, teamId: string): boolean => {
    if (!s.settings.lineLock || !s.current) return false;
    const line = pOf(s, s.current.playerId)?.line ?? null;
    if (!line) return false;
    const team = s.teams.find(t => t.id === teamId);
    if (!team) return false;
    return [team.leaderId, ...team.members.map(m => m.playerId)].some(id => pOf(s, id)?.line === line);
};

/* 남은 대상 목록 — 순서 공개 옵션이 켜지면 실제 경매 순서를 번호로 보여주고, 아니면 이름순(스포일러 방지) */
const QueuePanel = ({ s }: { s: AuctionState }) => {
    const showOrder = s.settings.showOrder;
    const picked = [...s.queue, ...s.carry]
        .map(id => pOf(s, id))
        .filter((p): p is NonNullable<ReturnType<typeof pOf>> => Boolean(p));
    const remaining = showOrder ? picked : [...picked].sort((a, b) => a.name.localeCompare(b.name));
    return (
        <SideCard>
            <h4>{showOrder ? '경매 순서' : '남은 대상'} <small className="tabular">{remaining.length}</small></h4>
            {remaining.length === 0 ? (
                <Hint>없음</Hint>
            ) : (
                remaining.map((p, i) => (
                    <QueueLine key={p.id}>
                        <span className="nm">{showOrder && <b className="ord tabular">{i + 1}</b>}{p.name}</span>
                        <small>{p.line && <LaneIcon line={p.line} size={11} />}{p.line ?? '-'}</small>
                    </QueueLine>
                ))
            )}
            {s.failedPool.length > 0 && (
                <>
                    <h4 className="sub">유찰 대기 <small className="tabular">{s.failedPool.length}</small></h4>
                    {s.failedPool.map(id => {
                        const p = pOf(s, id);
                        return p && (
                            <QueueLine key={id}>
                                <span className="nm">{p.name}</span>
                                <small>{p.line && <LaneIcon line={p.line} size={11} />}{p.line ?? '-'}</small>
                            </QueueLine>
                        );
                    })}
                </>
            )}
        </SideCard>
    );
};

/* 팀 현황판 */
const TeamsPanel = ({ s }: { s: AuctionState }) => {
    const nameOf = (id: string) => pOf(s, id)?.name ?? '?';
    const lineOf = (id: string) => pOf(s, id)?.line ?? null;
    const isFull = (t: AuctionTeam) => t.members.length + 1 >= s.settings.teamSize;
    return (
        <>
            {s.teams.map(team => (
                <TeamCard key={team.id} $full={isFull(team)}>
                    <div className="head">
                        <strong>{nameOf(team.leaderId)} 팀</strong>
                        <span className="pt tabular">{team.points}pt</span>
                    </div>
                    <MemberLine>
                        <span className="line">
                            {lineOf(team.leaderId) && <LaneIcon line={lineOf(team.leaderId)!} size={11} />}
                            {lineOf(team.leaderId) ?? '-'}
                        </span>
                        <span className="nm">{nameOf(team.leaderId)}</span>
                        <span className="price">팀장</span>
                    </MemberLine>
                    {team.members.map(m => (
                        <MemberLine key={m.playerId}>
                            <span className="line">
                                {lineOf(m.playerId) && <LaneIcon line={lineOf(m.playerId)!} size={11} />}
                                {lineOf(m.playerId) ?? '-'}
                            </span>
                            <span className="nm">{nameOf(m.playerId)}</span>
                            <span className="price tabular">{m.price}pt</span>
                        </MemberLine>
                    ))}
                    {Array.from({ length: Math.max(0, s.settings.teamSize - 1 - team.members.length) }).map((_, i) => (
                        <EmptySlot key={i}>빈 자리</EmptySlot>
                    ))}
                </TeamCard>
            ))}
            {s.unassigned.length > 0 && (
                <PoolCard>
                    <p>미배정: {s.unassigned.map(id => pOf(s, id)?.name ?? '?').join(', ')}</p>
                </PoolCard>
            )}
        </>
    );
};

/* 관전용 현재 대상 카드 — 조작 버튼 없이 상태만 보여준다 */
const SpectatorTarget = ({ s }: { s: AuctionState }) => {
    if (s.phase === 'done') {
        return <TargetCard><h3>경매가 끝났습니다</h3></TargetCard>;
    }
    const cur = s.current;
    if (!cur) {
        return (
            <TargetCard>
                {s.lastResult && <Result>{s.lastResult}</Result>}
                <Hint>진행자가 다음 대상을 공개하기를 기다리는 중…</Hint>
            </TargetCard>
        );
    }
    const p = pOf(s, cur.playerId);
    const remain = cur.deadline != null ? Math.max(0, Math.ceil((cur.deadline - Date.now()) / 1000)) : null;
    const highestTeam = cur.highest
        ? `${pOf(s, s.teams.find(t => t.id === cur.highest?.teamId)?.leaderId ?? '')?.name ?? '?'} 팀`
        : null;
    return (
        <TargetCard>
            <div className="who">
                <strong>{p?.name ?? '?'}</strong>
                <LineBadge>
                    {p?.line && <LaneIcon line={p.line} size={13} />}
                    {p?.line ?? '라인 미지정'}
                </LineBadge>
                {cur.zeroAllowed && <ZeroBadge>0원 입찰 가능</ZeroBadge>}
            </div>
            {remain != null ? (
                <>
                    <Timer $urgent={remain <= 5} className="tabular">{remain}초</Timer>
                    <TimerBar
                        $pct={Math.min(100, (remain / (s.settings.timerMode === 'fixed' ? s.settings.bidTimerSec : s.settings.afterBidSec)) * 100)}
                        $urgent={remain <= 5}
                    />
                </>
            ) : (
                <IdleTimer>첫 입찰을 기다리는 중</IdleTimer>
            )}
            <div className="highest tabular">
                {cur.highest ? <>현재 최고가 <b>{cur.highest.amount}pt</b> — {highestTeam}</> : '아직 입찰 없음'}
            </div>
        </TargetCard>
    );
};

/*
 * 팀별 입찰 행 — 빠른 입찰 버튼은 "현재 최고가 + N"으로 입찰한다.
 * (현재가 0이면 +50 = 50pt. 이전엔 최소가(1) 기준이라 +50이 51이 되던 버그를 수정)
 */
const BidRow = ({ label, points, currentHigh, winning, disabled, reason, onBid }: {
    label: string;
    points: number;
    currentHigh: number; // 현재 최고 입찰가 (없으면 0)
    winning: boolean;
    disabled: boolean;
    reason: string;
    onBid: (amount: number) => void;
}) => {
    const [amount, setAmount] = useState('');

    const submit = () => {
        const v = Number(amount);
        if (!Number.isFinite(v)) return;
        onBid(v);
        setAmount('');
    };

    return (
        <BidRowWrap $disabled={disabled} $winning={winning}>
            <span className="team" title={reason}>{label}{winning && <em className="top">최고가</em>}</span>
            <span className="pt tabular">{points}pt</span>
            {[10, 50, 100].map(d => (
                <QuickButton
                    key={d}
                    disabled={disabled || currentHigh + d > points}
                    onClick={() => onBid(currentHigh + d)}
                    title={`${currentHigh + d}pt로 입찰`}
                >
                    +{d}
                </QuickButton>
            ))}
            <BidInput
                type="number"
                placeholder="직접 입력"
                value={amount}
                disabled={disabled}
                onChange={e => setAmount(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            />
            <CompactButton disabled={disabled || amount === ''} onClick={submit}>입찰</CompactButton>
        </BidRowWrap>
    );
};

/* ---------- 스타일 ---------- */

const Wrap = styled.div`
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    gap: 1rem;
`;

const SectionCard = styled(Card)`
    display: flex;
    flex-direction: column;
    gap: 0.75rem;

    h3 {
        font-size: 1.1rem;
        color: ${({ theme }) => theme.text};

        small { font-weight: 500; font-size: 0.8rem; color: ${({ theme }) => theme.placeholder}; margin-left: 0.4rem; }
    }
`;

const HeadRow = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
`;

const SettingsGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.6rem;

    label {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-size: 0.78rem;
        color: ${({ theme }) => theme.placeholder};
    }

    label.wide { grid-column: 1 / -1; }

    @media (max-width: 640px) {
        grid-template-columns: repeat(2, 1fr);
    }
`;

const NumInput = styled.input`
    padding: 0.45rem 0.6rem;
    font-size: 0.9rem;
    color: ${({ theme }) => theme.text};
    background: ${({ theme }) => theme.body};
    border: 1px solid ${({ theme }) => theme.cardBorder};
    border-radius: var(--radius-md);

    &:focus { outline: 1px solid ${({ theme }) => theme.accent}; }
`;

const AddRow = styled.div`
    display: flex;
    gap: 0.5rem;

    input { flex: 1; }
`;

/* 타이머 방식 토글 */
const ModeRow = styled.div`
    display: flex;
    gap: 0.3rem;
`;

const ModeButton = styled.button<{ $active?: boolean }>`
    flex: 1;
    padding: 0.45rem 0.3rem;
    border: 1px solid ${({ theme, $active }) => ($active ? theme.accent : theme.cardBorder)};
    border-radius: var(--radius-md);
    background: ${({ theme, $active }) => ($active ? theme.accentGradient : 'transparent')};
    color: ${({ theme, $active }) => ($active ? theme.accentText : theme.placeholder)};
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
`;

/* 라인 지정 보드 — 미지정 + 5개 라인 칸에 이름표를 드래그해 배치한다 */
const LaneBoard = styled.div`
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 0.4rem;

    @media (max-width: 860px) {
        grid-template-columns: repeat(3, 1fr);
    }
    @media (max-width: 560px) {
        grid-template-columns: repeat(2, 1fr);
    }
`;

const LaneZone = styled.div<{ $drop: boolean }>`
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    min-height: 120px;
    padding: 0.4rem;
    border-radius: var(--radius-md);
    background: ${({ theme }) => theme.body};
    border: 1px dashed ${({ theme, $drop }) => ($drop ? theme.accent : theme.cardBorder)};
    cursor: ${({ $drop }) => ($drop ? 'pointer' : 'default')};

    .zhead {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.78rem;
        font-weight: 700;
        color: ${({ theme }) => theme.text};
        padding-bottom: 0.25rem;
        border-bottom: 1px solid ${({ theme }) => theme.cardBorder};

        small { color: ${({ theme }) => theme.placeholder}; margin-left: auto; }
    }

    .empty {
        flex-grow: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.7rem;
        color: ${({ theme }) => theme.placeholder};
        opacity: 0.6;
    }
`;

const DragChip = styled.div<{ $leader: boolean; $selected: boolean }>`
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.2rem 0.25rem 0.2rem 0.35rem;
    border-radius: var(--radius-sm);
    background: ${({ theme }) => theme.card};
    border: 1px solid ${({ theme, $leader, $selected }) =>
        $selected ? theme.teamBlue : $leader ? theme.accent : theme.cardBorder};
    box-shadow: ${({ theme, $selected }) => ($selected ? `0 0 0 1px ${theme.teamBlue}` : 'none')};
    cursor: pointer;

    .lead {
        border: 1px solid ${({ theme, $leader }) => ($leader ? theme.accent : theme.cardBorder)};
        border-radius: 999px;
        background: ${({ theme, $leader }) => ($leader ? theme.accentGradient : 'transparent')};
        color: ${({ theme, $leader }) => ($leader ? theme.accentText : theme.placeholder)};
        font-size: 0.62rem;
        font-weight: 700;
        padding: 0.15rem 0.35rem;
        cursor: pointer;
        flex-shrink: 0;
    }

    .name {
        font-size: 0.8rem;
        color: ${({ theme }) => theme.text};
        font-weight: ${({ $leader }) => ($leader ? 700 : 500)};
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex-grow: 1;
        min-width: 0;
        cursor: grab;

        &:active { cursor: grabbing; }
    }

    /* 삭제 버튼 — 히트 영역을 넉넉히 (작아서 안 눌리던 문제 수정) */
    .del {
        border: none;
        background: none;
        color: ${({ theme }) => theme.placeholder};
        font-size: 0.92rem;
        line-height: 1;
        padding: 0.35rem 0.4rem;
        border-radius: var(--radius-sm);
        cursor: pointer;
        flex-shrink: 0;

        &:hover { color: ${({ theme }) => theme.teamRed}; background: ${({ theme }) => theme.dragOver}; }
    }
`;

const StartRow = styled.div`
    display: flex;
    align-items: center;
    gap: 0.6rem;

    span { margin-right: auto; }
    button:last-child { min-width: 140px; }
`;

const Hint = styled.span`
    font-size: 0.78rem;
    color: ${({ theme }) => theme.placeholder};
    line-height: 1.5;
`;

const ErrorText = styled.p`
    font-size: 0.8rem;
    color: ${({ theme }) => theme.teamRed};
`;

const TopBar = styled(Card)`
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.6rem 0.9rem;
    flex-wrap: wrap;

    .info { font-size: 0.8rem; color: ${({ theme }) => theme.placeholder}; margin-right: auto; }
`;

const PhaseBadge = styled.span<{ $failed?: boolean; $done?: boolean }>`
    padding: 0.15rem 0.6rem;
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 800;
    color: ${({ theme }) => theme.accentText};
    background: ${({ theme, $failed, $done }) =>
        $done ? theme.placeholder : $failed ? theme.teamRed : theme.accent};
`;

const ViewToggle = styled.div`
    display: flex;
    gap: 0.3rem;
`;

const ToggleMini = styled.button<{ $active?: boolean }>`
    padding: 0.2rem 0.6rem;
    border: 1px solid ${({ theme, $active }) => ($active ? theme.accent : theme.cardBorder)};
    border-radius: 999px;
    background: ${({ theme, $active }) => ($active ? theme.accentGradient : 'transparent')};
    color: ${({ theme, $active }) => ($active ? theme.accentText : theme.placeholder)};
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
`;

const Board = styled.div<{ $view: ViewMode }>`
    display: grid;
    grid-template-columns: ${({ $view }) =>
        $view === 'both' ? '230px 1.25fr 1fr' : $view === 'auction' ? '230px 1fr' : '1fr'};
    gap: 1rem;
    align-items: stretch;

    /* 한 화면에 담기 — 페이지 스크롤 대신 컬럼 내부 스크롤 */
    @media (min-width: 861px) {
        > * {
            max-height: calc(100vh - 235px);
            overflow-y: auto;
        }
    }

    @media (max-width: 860px) {
        grid-template-columns: 1fr;
    }
`;

const QueueCol = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
`;

const SideCard = styled(Card)`
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0.75rem;

    h4 {
        font-size: 0.85rem;
        color: ${({ theme }) => theme.text};
        padding-bottom: 0.3rem;
        border-bottom: 1px solid ${({ theme }) => theme.cardBorder};

        small { color: ${({ theme }) => theme.placeholder}; font-weight: 600; }

        &.sub { margin-top: 0.6rem; }
    }
`;

const QueueLine = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.4rem;
    font-size: 0.9rem;
    color: ${({ theme }) => theme.text};
    padding: 0.22rem 0.3rem;
    border-radius: var(--radius-sm);

    &:nth-child(even) { background: ${({ theme }) => theme.body}; }

    .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
    .ord {
        display: inline-block;
        min-width: 1.2em;
        margin-right: 0.35rem;
        color: ${({ theme }) => theme.accent};
        font-weight: 800;
    }
    small {
        display: inline-flex;
        align-items: center;
        gap: 0.2rem;
        color: ${({ theme }) => theme.placeholder};
        font-size: 0.75rem;
        flex-shrink: 0;
    }
`;

const AuctionCol = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
`;

/* 팀만 보기에서는 카드가 가로로 길지 않게 여러 팀을 한 줄에 배치한다 */
const TeamsCol = styled.div<{ $grid?: boolean }>`
    display: ${({ $grid }) => ($grid ? 'grid' : 'flex')};
    flex-direction: column;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    align-items: ${({ $grid }) => ($grid ? 'start' : 'stretch')};
    gap: 0.75rem;
    min-width: 0;
`;

const TargetCard = styled(Card)`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.7rem;
    padding: 1.5rem 1.25rem;
    text-align: center;

    .who {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        flex-wrap: wrap;
        justify-content: center;

        strong { font-size: 2.2rem; color: ${({ theme }) => theme.text}; letter-spacing: -0.02em; }
    }

    .highest {
        font-size: 1rem;
        color: ${({ theme }) => theme.placeholder};

        b { color: ${({ theme }) => theme.accent}; font-size: 1.35rem; }
    }

    h3 { color: ${({ theme }) => theme.text}; }
`;

/* 남은 시간 진행 바 — 줄어들수록 급박함이 눈에 보인다 */
const TimerBar = styled.div<{ $pct: number; $urgent: boolean }>`
    width: 100%;
    max-width: 340px;
    height: 8px;
    border-radius: 999px;
    background: ${({ theme }) => theme.dragOver};
    overflow: hidden;

    &::after {
        content: '';
        display: block;
        height: 100%;
        width: ${({ $pct }) => $pct}%;
        border-radius: 999px;
        background: ${({ theme, $urgent }) => ($urgent ? theme.teamRed : theme.accent)};
        transition: width 0.2s linear;
    }
`;

const LineBadge = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 0.28rem;
    padding: 0.18rem 0.6rem;
    border-radius: 999px;
    font-size: 0.82rem;
    font-weight: 700;
    color: ${({ theme }) => theme.accentText};
    background: ${({ theme }) => theme.accent};
`;

const ZeroBadge = styled.span`
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 700;
    color: #FFFFFF;
    background: ${({ theme }) => theme.teamRed};
`;

const pulse = keyframes`
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.08); }
`;

const Timer = styled.div<{ $urgent: boolean }>`
    font-size: 3.2rem;
    line-height: 1.1;
    font-weight: 800;
    color: ${({ theme, $urgent }) => ($urgent ? theme.teamRed : theme.text)};
    ${({ $urgent }) => $urgent && css`animation: ${pulse} 0.6s ease infinite;`}
`;

const IdleTimer = styled.div`
    padding: 0.5rem 0;
    font-size: 0.9rem;
    font-weight: 600;
    color: ${({ theme }) => theme.placeholder};
`;

const Result = styled.p`
    font-size: 1rem;
    font-weight: 700;
    color: ${({ theme }) => theme.accent};
`;

const BidPanel = styled(Card)`
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.75rem;
`;

/* 팀장 방식 진행 제어 (누구나 다음/종료) */
const ControlRow = styled(Card)`
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.7rem 0.9rem;
    flex-wrap: wrap;

    button { min-width: 150px; }
    .hint { font-size: 0.78rem; color: ${({ theme }) => theme.placeholder}; }
`;

/* 팀장 참여 시 내 팀 선택 카드 */
const ClaimCard = styled(Card)`
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 1rem;

    h4 { font-size: 0.95rem; color: ${({ theme }) => theme.text}; }

    .teams {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }

    .teams button {
        padding: 0.55rem 0.9rem;
        border: 1px solid ${({ theme }) => theme.accent};
        border-radius: var(--radius-md);
        background: ${({ theme }) => theme.body};
        color: ${({ theme }) => theme.text};
        font-size: 0.9rem;
        font-weight: 700;
        cursor: pointer;

        &:hover { background: ${({ theme }) => theme.accentGradient}; color: ${({ theme }) => theme.accentText}; }
    }
`;

const BidRowWrap = styled.div<{ $disabled: boolean; $winning: boolean }>`
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
    padding: 0.5rem 0.6rem;
    border-radius: var(--radius-md);
    background: ${({ theme, $winning }) =>
        $winning ? `color-mix(in srgb, ${theme.accent} 12%, ${theme.body})` : theme.body};
    border: 1px solid ${({ theme, $winning }) => ($winning ? theme.accent : 'transparent')};
    opacity: ${({ $disabled }) => ($disabled ? 0.45 : 1)};

    .team {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        font-size: 0.95rem;
        font-weight: 700;
        color: ${({ theme }) => theme.text};
        min-width: 96px;
        overflow: hidden;
        white-space: nowrap;

        .top {
            font-style: normal;
            font-size: 0.65rem;
            font-weight: 800;
            padding: 0.08rem 0.4rem;
            border-radius: 999px;
            color: ${({ theme }) => theme.accentText};
            background: ${({ theme }) => theme.accent};
        }
    }

    .pt {
        font-size: 0.85rem;
        font-weight: 700;
        color: ${({ theme }) => theme.accent};
        margin-right: auto;
    }
`;

const QuickButton = styled.button`
    padding: 0.35rem 0.65rem;
    border: 1px solid ${({ theme }) => theme.cardBorder};
    border-radius: var(--radius-sm);
    background: transparent;
    color: ${({ theme }) => theme.accent};
    font-size: 0.84rem;
    font-weight: 700;
    cursor: pointer;

    &:hover:not(:disabled) { background: ${({ theme }) => theme.dragOver}; }
    &:disabled { opacity: 0.4; cursor: default; }
`;

const BidInput = styled.input`
    width: 92px;
    padding: 0.35rem 0.5rem;
    font-size: 0.85rem;
    color: ${({ theme }) => theme.text};
    background: ${({ theme }) => theme.card};
    border: 1px solid ${({ theme }) => theme.cardBorder};
    border-radius: var(--radius-sm);

    &:focus { outline: 1px solid ${({ theme }) => theme.accent}; }
`;

const LogCard = styled(Card)`
    max-height: 220px;
    overflow-y: auto;
    padding: 0.75rem;

    h4 {
        font-size: 0.85rem;
        color: ${({ theme }) => theme.text};
        margin-bottom: 0.4rem;
    }

    p {
        font-size: 0.78rem;
        color: ${({ theme }) => theme.placeholder};
        line-height: 1.6;
    }
`;

const TeamCard = styled(Card)<{ $full: boolean }>`
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.75rem;
    border-color: ${({ theme, $full }) => ($full ? theme.accent : theme.cardBorder)};

    .head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-bottom: 0.4rem;
        border-bottom: 1px solid ${({ theme }) => theme.cardBorder};

        strong { color: ${({ theme }) => theme.text}; font-size: 1.08rem; }
        .pt { color: ${({ theme }) => theme.accent}; font-weight: 800; font-size: 1.05rem; }
    }
`;

const MemberLine = styled.div`
    display: grid;
    grid-template-columns: 56px 1fr auto;
    gap: 0.45rem;
    align-items: center;
    font-size: 0.92rem;
    color: ${({ theme }) => theme.text};
    padding: 0.15rem 0;

    .line {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.2rem;
        font-size: 0.72rem;
        font-weight: 700;
        padding: 0.14rem 0;
        border-radius: var(--radius-sm);
        color: ${({ theme }) => theme.placeholder};
        background: ${({ theme }) => theme.body};
        border: 1px solid ${({ theme }) => theme.cardBorder};
    }
    .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
    .price { font-size: 0.84rem; font-weight: 700; color: ${({ theme }) => theme.placeholder}; }
`;

const EmptySlot = styled.div`
    padding: 0.25rem 0.4rem;
    border: 1px dashed ${({ theme }) => theme.cardBorder};
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    color: ${({ theme }) => theme.placeholder};
    text-align: center;
`;

const PoolCard = styled(Card)`
    padding: 0.75rem;
    grid-column: 1 / -1; /* 팀 그리드에서는 전체 폭 사용 */

    p {
        font-size: 0.8rem;
        color: ${({ theme }) => theme.placeholder};
        line-height: 1.6;
    }
`;
