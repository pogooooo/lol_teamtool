import { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { Card, CompactButton, PrimaryButton, TextField } from '../App.styles';
import { useActiveGroupId, useActiveGroupBadge } from '../hooks/useActiveGroupBadge';
import { useMyPlayer } from '../hooks/useMyPlayer';
import * as pts from '../services/points';
import type { BetRound, MyPoints, RankRow, ShopItem } from '../services/points';
import { flavor } from '../services/flavor';
import { TreasureHunt } from './TreasureHunt';
import { NameFrame, BG_STYLES, decorate, FrameLayer, hasBgStyle } from './ui/NameFrame';
import { Toast } from './ui/Toast';
import { GambleStage, LAND_MS } from './gamble/GambleStage';
import type { SpinState } from './gamble/GambleStage';
import { SmiteDuel } from './gamble/SmiteDuel';
import type { SmiteResult } from './gamble/SmiteDuel';
import { winBurst } from './gamble/winBurst';
import { MINIGAMES_ENABLED, BETTING_ENABLED } from '../featureFlags';

/*
 * 포인트 탭 — 출석·도박·베팅·상점·순위.
 * 결과 알림은 화면을 밀어내지 않도록 하단 팝업(Toast)으로만 띄운다.
 */

type GameKey = 'coin' | 'dice' | 'roulette' | 'smite' | 'penta' | 'slot';

const GAME_TABS: { key: GameKey; label: string; hint: string }[] = [
    { key: 'coin', label: '동전', hint: '앞이냐 뒤냐, 반반의 정석 · ×1.95' },
    { key: 'roulette', label: '룰렛', hint: '빨강·검정 ×1.95, 초록은 ×17 대박' },
    { key: 'dice', label: '주사위', hint: '6분의 1을 뚫으면 ×5.5' },
    { key: 'smite', label: '강타 싸움', hint: '타이밍 게임 — 정확할수록 승률↑ (최대 50%) · ×1.85' },
    { key: 'penta', label: '펜타킬', hint: '성공률 2%… 하지만 ×45' },
    { key: 'slot', label: '슬롯', hint: '왕관 셋이 모이면 ×30 잭팟' },
];

export const PointsTab = () => {
    const groupId = useActiveGroupId();
    const groupName = useActiveGroupBadge();
    const me = useMyPlayer(groupId);

    const [ranking, setRanking] = useState<RankRow[]>([]);
    const [shop, setShop] = useState<ShopItem[]>([]);
    const [treasure, setTreasure] = useState<{ x: number; y: number } | null>(null);
    const [mine, setMine] = useState<MyPoints | null>(null);
    const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
    const [pin, setPin] = useState(() => (me ? pts.getPin(me.playerId) : ''));
    const [bet, setBet] = useState('100');
    const [game, setGame] = useState<GameKey>('coin');
    const [spinState, setSpinState] = useState<SpinState | null>(null);
    const [playing, setPlaying] = useState(false);
    const [shopTab, setShopTab] = useState<pts.ItemKind>('title');

    // 승리 파티클(GSAP)이 터질 무대 래퍼
    const stageWrapRef = useRef<HTMLDivElement>(null);

    // 강타 싸움 전용 상태
    const [smiteRunning, setSmiteRunning] = useState(false);
    const [smiteLast, setSmiteLast] = useState<SmiteResult | null>(null);
    const [smiteVerdict, setSmiteVerdict] = useState<'steal' | 'lost' | null>(null);

    // 관전자 베팅 판 — 서버에 저장돼 그룹 전원이 같은 판을 본다
    const [rounds, setRounds] = useState<BetRound[]>([]);
    const [betAmount, setBetAmount] = useState('200');
    const [newTitle, setNewTitle] = useState('');
    const [newChoices, setNewChoices] = useState('1팀, 2팀');

    const reload = useCallback(async () => {
        if (!groupId) return;
        try {
            const data = await pts.getGroupPoints(groupId);
            setRanking(data.ranking);
            setShop(data.shop);
            setTreasure(data.treasure);
        } catch { /* 목록 실패는 조용히 */ }
        if (me) {
            try { setMine(await pts.getMyPoints(me.playerId)); } catch { setMine(null); }
        } else {
            setMine(null);
        }
    }, [groupId, me]);

    const reloadRounds = useCallback(async () => {
        if (!groupId) { setRounds([]); return; }
        try { setRounds(await pts.listBetRounds(groupId)); } catch { setRounds([]); }
    }, [groupId]);

    useEffect(() => { reload(); }, [reload]);
    // 베팅 판은 여럿이 같이 보므로 8초마다 새로고침
    useEffect(() => {
        reloadRounds();
        const t = setInterval(reloadRounds, 8000);
        return () => clearInterval(t);
    }, [reloadRounds]);
    useEffect(() => { if (me) setPin(pts.getPin(me.playerId)); }, [me]);

    if (!groupId) {
        return <Notice>포인트는 내전 기록 그룹마다 따로 쌓입니다. 오른쪽 위에서 그룹을 먼저 선택해 주세요.</Notice>;
    }
    if (!me) {
        return (
            <Notice>
                오른쪽 위 그룹 메뉴에서 <b>“이 그룹에서 나는”</b> 항목으로 본인을 먼저 선택해 주세요.
                누가 포인트를 받는지 구분하는 데 사용합니다.
            </Notice>
        );
    }

    /** 행동 실행 — PIN을 저장하고 결과를 팝업으로 알린다 */
    const run = async (fn: () => Promise<string>) => {
        if (pin.trim().length < 4) { setToast({ text: 'PIN을 4자리 이상 입력해 주세요.', error: true }); return; }
        pts.savePin(me.playerId, pin.trim());
        try {
            setToast({ text: await fn() });
            await reload();
        } catch (e) {
            setToast({ text: pts.pointsError(e), error: true });
        }
    };

    /** 도박 — 서버가 결과를 정하는 동안 연출을 돌리고, 응답이 오면 그 결과로 착지시킨다 */
    const play = async (g: GameKey, pick: string) => {
        if (playing) return;
        if (pin.trim().length < 4) { setToast({ text: 'PIN을 4자리 이상 입력해 주세요.', error: true }); return; }
        pts.savePin(me.playerId, pin.trim());
        setPlaying(true);
        if (g !== 'smite') setSpinState({ phase: 'spin' });
        const started = Date.now();
        try {
            const r = await pts.gamble(me.playerId, g, pick, amount);
            if (g !== 'smite') {
                const minSpin = 600 - (Date.now() - started);
                if (minSpin > 0) await new Promise(res => setTimeout(res, minSpin));
                setSpinState({ phase: 'land', result: r.result, won: r.won });
                await new Promise(res => setTimeout(res, LAND_MS[g]));
            } else {
                setSmiteVerdict(r.result === 'steal' ? 'steal' : 'lost');
            }

            // 이겼으면 금화 파티클 (배당이 클수록 화려하게)
            if (r.won && r.payout > 0 && stageWrapRef.current) {
                winBurst(stageWrapRef.current, r.payout / Math.max(1, amount));
            }

            const sideKr = r.result === 'front' ? '앞면' : '뒷면';
            const text = g === 'coin' ? (r.won ? flavor.coinWin(sideKr, r.payout) : flavor.coinLose(sideKr))
                : g === 'dice' ? (r.won ? flavor.diceWin(r.result, r.payout) : flavor.diceLose(r.result))
                : g === 'roulette' ? (r.won ? flavor.rouletteWin(r.result, r.payout) : flavor.rouletteLose(r.result))
                : g === 'smite' ? (r.won ? flavor.smiteWin(r.payout) : flavor.smiteLose())
                : g === 'penta' ? (r.won ? flavor.pentaWin(r.payout) : flavor.pentaLose(r.result))
                : r.payout >= amount * 30 ? flavor.slotJackpot(r.result, r.payout)
                : r.won ? flavor.slotTriple(r.result, r.payout)
                : r.payout > 0 ? flavor.slotPair(r.result, r.payout)
                : flavor.slotLose(r.result);
            setToast({ text });
            await reload();
        } catch (e) {
            setSpinState(null);
            setToast({ text: pts.pointsError(e), error: true });
        } finally {
            setPlaying(false);
            setSmiteRunning(false);
        }
    };

    const switchGame = (g: GameKey) => {
        if (playing) return;
        setGame(g);
        setSpinState(null);
        setSmiteRunning(false);
        setSmiteVerdict(null);
        setSmiteLast(null);
    };

    const myRow = ranking.find(r => r.playerId === me.playerId);
    const owned = new Set(mine?.inventory ?? []);
    const amount = Math.max(0, Math.floor(Number(bet) || 0));
    const itemName = (id: string | null) => shop.find(s => s.id === id)?.name ?? id ?? '';

    const shopItems = shop.filter(s => s.kind === shopTab);
    const SHOP_TABS: { k: pts.ItemKind; label: string }[] = [
        { k: 'title', label: '칭호' }, { k: 'frame', label: '테두리' }, { k: 'bg', label: '배경' },
    ];

    const shopCard = (item: ShopItem) => {
        const has = owned.has(item.id);
        const equipped = (item.kind === 'title' ? mine?.title : item.kind === 'bg' ? mine?.bg : mine?.frame) === item.id;
        return (
            <ShopCard key={item.id} $equipped={equipped}>
                {item.kind === 'frame'
                    ? <NameFrame $frame={item.id} className="nm">{item.name}</NameFrame>
                    : item.kind === 'bg'
                    ? <BgPreview $bg={item.id}>{item.name}</BgPreview>
                    : <span className="nm">{item.name}</span>}
                <span className="ds">{item.desc}</span>
                {has ? (
                    <CompactButton onClick={() => run(async () => {
                        await pts.equipItem(me.playerId, item.kind, equipped ? null : item.id);
                        return equipped ? `${item.name} 해제` : `${item.name} 장착!`;
                    })}>{equipped ? '해제' : '장착'}</CompactButton>
                ) : (
                    <CompactButton onClick={() => run(async () => {
                        await pts.buyItem(me.playerId, item.id);
                        return `${item.name} 구매 완료! 바로 장착해 보세요.`;
                    })}>{item.price.toLocaleString()}P</CompactButton>
                )}
            </ShopCard>
        );
    };

    const STATUS_LABEL: Record<pts.RoundStatus, string> = {
        open: '베팅 중', locked: '마감', settled: '정산 완료', cancelled: '취소됨',
    };

    return (
        <Wrap>
            {/* 상단: 내 정보 + 잔액 + PIN */}
            <TopCard $frame={mine?.frame} $bg={mine?.bg}>
                <FrameLayer frame={mine?.frame} />
                <div className="who">
                    <span className="label">{groupName} · 나</span>
                    <span className="nameline">
                        {mine?.title && <Title>[{itemName(mine.title)}]</Title>}
                        <strong className="myname fx-text" data-text={me.displayName}>{me.displayName}</strong>
                    </span>
                </div>
                <div className="bal">
                    <span className="label">보유 포인트</span>
                    <b className="tabular">{(mine?.points ?? myRow?.points ?? 0).toLocaleString()}</b>
                </div>
                <PinBox>
                    <span className="label">PIN</span>
                    <TextField
                        type="password" value={pin} maxLength={12} placeholder="4자리 이상"
                        onChange={e => setPin(e.target.value)}
                        title="처음 입력한 PIN이 이 참가자의 비밀번호가 됩니다. 기기를 바꿔도 같은 PIN으로 이어서 씁니다."
                    />
                </PinBox>
                <PrimaryButton
                    className="checkin"
                    disabled={mine?.checkedToday}
                    onClick={() => run(async () => {
                        const r = await pts.checkin(me.playerId);
                        return flavor.checkin(r.streak, r.gained);
                    })}
                >
                    {mine?.checkedToday ? '오늘 출석 완료' : '출석 +100P'}
                </PrimaryButton>
            </TopCard>

            <Columns>
                {/* 왼쪽: 미니게임 — featureFlags.MINIGAMES_ENABLED 로 켜고 끈다 */}
                <Section>
                    <h3>포인트 미니게임</h3>
                    {!MINIGAMES_ENABLED ? (
                        <ComingSoon>
                            <b>준비 중입니다</b>
                            <span>모은 포인트로 즐길 미니게임을 다듬고 있습니다. 그동안 출석·내전 승리·보물찾기로 포인트를 모아 두세요.</span>
                        </ComingSoon>
                    ) : (
                    <>
                    <GameTabs>
                        {GAME_TABS.map(g => (
                            <button key={g.key} className={game === g.key ? 'on' : ''} onClick={() => switchGame(g.key)}>
                                {g.label}
                            </button>
                        ))}
                    </GameTabs>
                    <p className="desc">{GAME_TABS.find(g => g.key === game)?.hint}</p>

                    <StageWrap ref={stageWrapRef}>
                    <GambleStage
                        game={game}
                        spin={spinState}
                        busy={playing}
                        onSlotPull={() => play('slot', '')}
                        smiteSlot={
                            <SmiteDuel
                                running={smiteRunning}
                                lastResult={smiteLast}
                                verdict={smiteVerdict}
                                onSmite={(r) => { setSmiteLast(r); setSmiteRunning(false); play('smite', String(r.accuracy)); }}
                            />
                        }
                    />
                    </StageWrap>

                    <BetRow>
                        <TextField value={bet} onChange={e => setBet(e.target.value)} placeholder="베팅 포인트" disabled={playing} />
                        <span className="unit">P</span>
                        {[100, 500, 1000].map(v => (
                            <CompactButton key={v} disabled={playing} onClick={() => setBet(String(v))}>{v}</CompactButton>
                        ))}
                    </BetRow>

                    {game === 'coin' && (
                        <BtnRow>
                            <PlayButton disabled={playing} onClick={() => play('coin', 'front')}>앞면</PlayButton>
                            <PlayButton disabled={playing} onClick={() => play('coin', 'back')}>뒷면</PlayButton>
                        </BtnRow>
                    )}
                    {game === 'dice' && (
                        <BtnRow>
                            {[1, 2, 3, 4, 5, 6].map(n => (
                                <PlayButton key={n} disabled={playing} onClick={() => play('dice', String(n))}>{n}</PlayButton>
                            ))}
                        </BtnRow>
                    )}
                    {game === 'roulette' && (
                        <BtnRow>
                            <PlayButton $tone="#E0483D" disabled={playing} onClick={() => play('roulette', 'red')}>빨강 ×1.95</PlayButton>
                            <PlayButton $tone="#3A3F4A" disabled={playing} onClick={() => play('roulette', 'black')}>검정 ×1.95</PlayButton>
                            <PlayButton $tone="#2E9E5B" disabled={playing} onClick={() => play('roulette', 'green')}>초록 ×17</PlayButton>
                        </BtnRow>
                    )}
                    {game === 'smite' && (
                        <BtnRow>
                            <PlayButton
                                disabled={playing || smiteRunning}
                                onClick={() => { setSmiteVerdict(null); setSmiteLast(null); setSmiteRunning(true); }}
                            >
                                {smiteRunning ? '강타 타이밍!' : '바론 시작 (베팅 후 강타)'}
                            </PlayButton>
                        </BtnRow>
                    )}
                    {game === 'penta' && (
                        <BtnRow>
                            <PlayButton $tone="#B03648" disabled={playing} onClick={() => play('penta', 'go')}>한타 진입 (2% · ×45)</PlayButton>
                        </BtnRow>
                    )}
                    {game === 'slot' && <p className="desc">오른쪽 빨간 레버를 당기면 시작됩니다.</p>}
                    </>
                    )}
                </Section>

                {/* 오른쪽: 순위 + 베팅 — 왼쪽(미니게임) 높이를 넘지 않도록 슬롯 안에 가둔다 */}
                <SideSlot>
                <SideCol>
                    <Section>
                        <h3>포인트 순위</h3>
                        {ranking.length === 0 ? <p className="desc">아직 포인트를 모은 사람이 없습니다.</p> : (
                            <RankList>
                                {ranking.slice(0, 10).map((r, i) => (
                                    <RankRowLine key={r.playerId} $me={r.playerId === me.playerId} $frame={r.frame} $bg={r.bg}>
                                        <FrameLayer frame={r.frame} />
                                        <span className="no">{i + 1}</span>
                                        <span className="nmwrap">
                                            {r.title && <em>[{itemName(r.title)}]</em>}
                                            <b className="fx-text" data-text={r.displayName}>{r.displayName}</b>
                                        </span>
                                        <span className="pt tabular">{r.points.toLocaleString()}</span>
                                    </RankRowLine>
                                ))}
                            </RankList>
                        )}
                    </Section>

                    {BETTING_ENABLED && (
                    <Section>
                        <h3>관전자 베팅</h3>
                        <p className="desc">
                            누군가 판을 열면 그룹 전원이 같은 판을 보고 베팅합니다.
                            이긴 쪽이 진 쪽 판돈을 비율대로 나눠 갖고, 아무도 못 맞히면 전액 환불됩니다.
                        </p>

                        {/* 새 판 열기 */}
                        <BetSetup>
                            <TextField value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="판 이름 (예: 오늘 2경기)" />
                            <TextField value={newChoices} onChange={e => setNewChoices(e.target.value)} placeholder="선택지 (쉼표 구분)" />
                            <CompactButton onClick={() => run(async () => {
                                const cs = newChoices.split(/[,]+/).map(c => c.trim()).filter(Boolean);
                                await pts.createBetRound(groupId, me.playerId, newTitle.trim(), cs);
                                await reloadRounds();
                                setNewTitle('');
                                return `"${newTitle.trim()}" 판을 열었습니다. 이제 모두가 베팅할 수 있어요.`;
                            })}>판 열기</CompactButton>
                        </BetSetup>

                        {rounds.length === 0 && <p className="desc">아직 열린 판이 없습니다. 첫 판을 열어 보세요.</p>}

                        <RoundScroll>
                        {rounds.map(round => {
                            const pool = round.bets.filter(b => b.status !== 'refunded').reduce((s, b) => s + b.amount, 0);
                            const myBet = round.bets.find(b => b.playerId === me.playerId);
                            const isCreator = round.creatorId === me.playerId;
                            const active = round.status === 'open' || round.status === 'locked';
                            const totalOf = (c: string) => round.bets.filter(b => b.choice === c && b.status !== 'refunded').reduce((s, b) => s + b.amount, 0);
                            return (
                                <RoundCard key={round.id} $status={round.status}>
                                    <div className="head">
                                        <b className="title">{round.title}</b>
                                        <span className={`chip ${round.status}`}>
                                            {round.status === 'settled' ? `${round.winner} 승` : STATUS_LABEL[round.status]}
                                        </span>
                                        <span className="meta">판돈 {pool.toLocaleString()}P · {round.bets.length}명 · {round.creatorName ?? '?'} 개설</span>
                                    </div>

                                    {round.status === 'open' && !myBet && (
                                        <div className="betrow">
                                            <TextField value={betAmount} onChange={e => setBetAmount(e.target.value)} placeholder="금액" />
                                            {round.choices.map(c => (
                                                <PlayButton key={c} onClick={() => run(async () => {
                                                    await pts.betOnRound(round.id, me.playerId, c, Math.max(1, Math.floor(Number(betAmount) || 0)));
                                                    await reloadRounds();
                                                    return `"${round.title}" — ${c}에 ${Number(betAmount).toLocaleString()}P 베팅!`;
                                                })}>
                                                    {c} <i className="tabular">{totalOf(c).toLocaleString()}P</i>
                                                </PlayButton>
                                            ))}
                                        </div>
                                    )}
                                    {myBet && active && (
                                        <p className="mine">나는 <b>{myBet.choice}</b>에 {myBet.amount.toLocaleString()}P — 결과를 기다리는 중</p>
                                    )}

                                    {round.bets.length > 0 && (
                                        <BetList>
                                            {round.bets.map(b => (
                                                <li key={b.id} className={b.status}>
                                                    <span className="nm">{b.displayName ?? '?'}</span>
                                                    <span className="ch">{b.choice}</span>
                                                    <span className="am tabular">{b.amount.toLocaleString()}P</span>
                                                    <span className="st">{b.status === 'open' ? '' : b.status === 'won' ? '적중' : b.status === 'lost' ? '실패' : '환불'}</span>
                                                </li>
                                            ))}
                                        </BetList>
                                    )}

                                    {isCreator && active && (
                                        <SettleRow>
                                            <span className="lb">판 관리 (개설자)</span>
                                            <CompactButton onClick={() => run(async () => {
                                                await pts.roundAction(round.id, me.playerId, round.status === 'open' ? 'lock' : 'unlock');
                                                await reloadRounds();
                                                return round.status === 'open' ? '베팅을 마감했습니다.' : '베팅을 다시 열었습니다.';
                                            })}>{round.status === 'open' ? '마감' : '재개'}</CompactButton>
                                            {round.choices.map(c => (
                                                <CompactButton key={c} onClick={() => run(async () => {
                                                    const r = await pts.roundAction(round.id, me.playerId, 'settle', c);
                                                    await reloadRounds();
                                                    return `"${c}" 승리 정산 — ${r.winners ?? 0}명 적중, 판돈 ${(r.pool ?? 0).toLocaleString()}P 분배`;
                                                })}>{c} 승</CompactButton>
                                            ))}
                                            <CompactButton onClick={() => run(async () => {
                                                const r = await pts.roundAction(round.id, me.playerId, 'cancel');
                                                await reloadRounds();
                                                return `판 취소 — ${r.refunded ?? 0}명에게 전액 환불했습니다.`;
                                            })}>취소·환불</CompactButton>
                                        </SettleRow>
                                    )}
                                </RoundCard>
                            );
                        })}
                        </RoundScroll>
                    </Section>
                    )}
                </SideCol>
                </SideSlot>
            </Columns>

            {/* 상점 — 종류별 탭 + 스크롤 */}
            <Section>
                <ShopHead>
                    <h3>상점</h3>
                    {SHOP_TABS.map(t => (
                        <button key={t.k} className={shopTab === t.k ? 'on' : ''} onClick={() => setShopTab(t.k)}>
                            {t.label} <i className="tabular">{shop.filter(s => s.kind === t.k).length}</i>
                        </button>
                    ))}
                    <span className="hint">
                        {shopTab === 'title' ? '이름 옆에 붙는 한 줄'
                            : shopTab === 'frame' ? '순위표에서 내 줄 전체를 감싸는 테두리'
                            : '순위표에서 내 줄 전체의 배경'}
                    </span>
                </ShopHead>
                <ShopScroll><ShopGrid>{shopItems.map(shopCard)}</ShopGrid></ShopScroll>
            </Section>

            {treasure && (
                <TreasureHunt
                    spot={treasure}
                    disabled={false}
                    onFound={() => run(async () => {
                        const r = await pts.claimTreasure(me.playerId);
                        return flavor.treasure(r.gained);
                    })}
                />
            )}

            {toast && <Toast text={toast.text} error={toast.error} onDone={() => setToast(null)} />}
        </Wrap>
    );
};

const Wrap = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    flex-grow: 1;
`;

const Notice = styled(Card)`
    font-size: 0.9rem;
    line-height: 1.6;
    color: ${({ theme }) => theme.placeholder};
    b { color: ${({ theme }) => theme.text}; }
`;

/* 내 카드에도 구매한 테두리·배경이 그대로 적용된다 */
const TopCard = styled(Card)<{ $frame?: string | null; $bg?: string | null }>`
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
    padding: 0.7rem 1rem;
    border: 2px solid ${({ theme }) => theme.cardBorder};
    ${({ $frame, $bg }) => decorate($frame, $bg)}

    .label { display: block; font-size: 0.66rem; opacity: 0.8; }
    .who { display: flex; flex-direction: column; gap: 0.15rem; align-items: flex-start;
        .myname { font-size: 1.05rem; }
    }
    .bal { margin-left: auto; text-align: right;
        /* 배경 장식이 밝으면 크림색 강조가 묻히므로 배경이 정한 글자색을 그대로 쓴다 */
        b { font-size: 1.5rem; color: ${({ theme, $bg }) => (hasBgStyle($bg) ? 'inherit' : theme.accent)}; }
    }
    .checkin { padding: 0.5rem 0.9rem; font-size: 0.8rem; }
`;

/* 칭호 — 이름 앞에 [ ]로, 이름과 같은 크기 */
const Title = styled.span`
    font-size: 1.05rem;
    font-weight: 800;
    opacity: 0.9;
    white-space: nowrap;
`;

const PinBox = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    input { width: 110px; }
`;

/* 도박장(넓게) + 순위·베팅(좁게) 2열 — 빈 공간 없이 채운다 */
const Columns = styled.div`
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.6rem;
    align-items: start;

    @media (min-width: 900px) {
        grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
        /* 오른쪽 열이 행 높이를 늘리지 않도록(내용은 절대 배치) 늘려서 맞춘다 */
        align-items: stretch;
    }
`;

/*
 * 오른쪽 열 — 넓은 화면에서는 슬롯 안에 절대 배치해 그리드 행 높이에 기여하지 않는다.
 * 그래서 순위·베팅이 아무리 길어져도 왼쪽(미니게임) 높이를 절대 넘지 않는다.
 */
const SideSlot = styled.div`
    @media (min-width: 900px) {
        position: relative;
        /* 높이를 스스로 갖지 않는다 — 행 높이(=왼쪽 미니게임 높이)를 그대로 물려받는다 */
        min-height: 0;
    }
`;

const SideCol = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    min-height: 0;

    @media (min-width: 900px) {
        position: absolute;
        inset: 0;
        overflow-y: auto;
        padding-right: 4px;

        &::-webkit-scrollbar { width: 8px; }
        &::-webkit-scrollbar-thumb { background: ${({ theme }) => theme.cardBorder}; border-radius: 4px; }
    }
`;

/* 미니게임 준비 중 안내 */
const ComingSoon = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    align-items: center;
    justify-content: center;
    text-align: center;
    min-height: 260px;
    padding: 1.5rem 1rem;
    border-radius: var(--radius-md);
    background: ${({ theme }) => theme.body};
    border: 1px dashed ${({ theme }) => theme.cardBorder};

    b { font-size: 1rem; color: ${({ theme }) => theme.text}; }
    span { font-size: 0.78rem; line-height: 1.6; color: ${({ theme }) => theme.placeholder}; max-width: 24rem; }
`;

const Section = styled(Card)`
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    padding: 0.75rem;

    h3 { font-size: 0.95rem; color: ${({ theme }) => theme.text}; }
    .desc { font-size: 0.72rem; line-height: 1.45; color: ${({ theme }) => theme.placeholder}; }
`;

/* 무대 래퍼 — GSAP 파티클의 좌표 기준 */
const StageWrap = styled.div`
    position: relative;
    overflow: hidden;
    border-radius: var(--radius-md);
`;

const GameTabs = styled.div`
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;

    button {
        padding: 0.28rem 0.6rem;
        border-radius: 999px;
        border: 1px solid ${({ theme }) => theme.cardBorder};
        background: transparent;
        color: ${({ theme }) => theme.placeholder};
        font-size: 0.74rem;
        font-weight: 700;
        cursor: pointer;

        &:hover { color: ${({ theme }) => theme.text}; }
        &.on {
            background: ${({ theme }) => theme.accentGradient};
            color: ${({ theme }) => theme.accentText};
            border-color: transparent;
        }
    }
`;

const BetRow = styled.div`
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex-wrap: wrap;
    input { width: 110px; }
    .unit { font-size: 0.78rem; color: ${({ theme }) => theme.placeholder}; }
    .pool { margin-left: auto; font-size: 0.72rem; font-weight: 700; color: ${({ theme }) => theme.accent}; }
`;

const BetSetup = styled.div`
    display: flex;
    gap: 0.35rem;
    flex-wrap: wrap;
    input { flex: 1; min-width: 120px; }
    button { flex-shrink: 0; }
`;

/* 베팅 판 하나 — 상태에 따라 좌측 스트라이프 색이 바뀐다 */
const RoundCard = styled.div<{ $status: string }>`
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.55rem 0.65rem;
    border-radius: var(--radius-md);
    background: ${({ theme }) => theme.body};
    border: 1px solid ${({ theme }) => theme.cardBorder};
    border-left: 3px solid ${({ $status, theme }) =>
        $status === 'open' ? '#5FE3A3' : $status === 'locked' ? '#FFC46B'
        : $status === 'settled' ? theme.teamBlue : theme.cardBorder};
    opacity: ${({ $status }) => ($status === 'cancelled' ? 0.55 : 1)};

    .head {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        flex-wrap: wrap;
        .title { font-size: 0.86rem; color: ${({ theme }) => theme.text}; }
        .chip {
            padding: 0.05rem 0.5rem;
            border-radius: 999px;
            font-size: 0.62rem;
            font-weight: 800;
            &.open { background: rgba(95, 227, 163, 0.18); color: #5FE3A3; }
            &.locked { background: rgba(255, 196, 107, 0.18); color: #FFC46B; }
            &.settled { background: rgba(77, 168, 218, 0.18); color: ${({ theme }) => theme.teamBlue}; }
            &.cancelled { background: ${({ theme }) => theme.dragOver}; color: ${({ theme }) => theme.placeholder}; }
        }
        .meta { margin-left: auto; font-size: 0.64rem; color: ${({ theme }) => theme.placeholder}; }
    }

    .betrow {
        display: flex;
        gap: 0.3rem;
        flex-wrap: wrap;
        align-items: center;
        input { width: 90px; }
        button { flex: 1; min-width: 80px; }
        button i { font-style: normal; font-size: 0.64rem; opacity: 0.65; margin-left: 0.25rem; }
    }

    .mine {
        font-size: 0.74rem;
        color: ${({ theme }) => theme.placeholder};
        b { color: ${({ theme }) => theme.accent}; }
    }
`;

const BtnRow = styled.div`
    display: flex;
    gap: 0.3rem;
    flex-wrap: wrap;
    button { flex: 1; min-width: 42px; }
`;

const PlayButton = styled.button<{ $tone?: string }>`
    padding: 0.5rem 0.7rem;
    border: 1px solid ${({ $tone, theme }) => $tone ?? theme.cardBorder};
    background: ${({ $tone }) => ($tone ? `color-mix(in srgb, ${$tone} 30%, transparent)` : 'transparent')};
    color: ${({ theme }) => theme.text};
    border-radius: var(--radius-md);
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.12s ease, background-color 0.15s ease;

    &:hover:not(:disabled) { transform: translateY(-1px); background: ${({ theme }) => theme.dragOver}; }
    &:active:not(:disabled) { transform: translateY(0); }
    &:disabled { opacity: 0.45; cursor: not-allowed; }
`;

const RankList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 3px;
`;

/* 순위 한 줄 = 배경 장식 + 테두리 장식이 모두 적용되는 영역 */
const RankRowLine = styled.div<{ $me: boolean; $frame?: string | null; $bg?: string | null }>`
    display: grid;
    grid-template-columns: 20px 1fr auto;
    gap: 0.4rem;
    align-items: center;
    padding: 0.28rem 0.45rem;
    border: 2px solid transparent;
    border-radius: var(--radius-sm);
    font-size: 0.84rem;
    font-weight: 600;
    color: ${({ theme }) => theme.text};
    background: ${({ theme, $me }) => ($me ? theme.dragOver : 'transparent')};
    ${({ $frame, $bg }) => decorate($frame, $bg)}

    .no { font-weight: 800; opacity: 0.75; }
    .nmwrap {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        b { font-weight: 700; }
        em { font-style: normal; font-size: inherit; font-weight: 700; flex-shrink: 0;
            color: ${({ theme, $bg }) => (hasBgStyle($bg) ? 'inherit' : theme.accent)};
            opacity: ${({ $bg }) => (hasBgStyle($bg) ? 0.85 : 1)};
        }
    }
    .pt { font-weight: 800; color: ${({ theme, $bg }) => (hasBgStyle($bg) ? 'inherit' : theme.accent)}; }
`;

/* 베팅 판이 쌓여도 화면을 잡아먹지 않게 스크롤 */
const RoundScroll = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    max-height: 260px;
    overflow-y: auto;
    padding-right: 4px;

    &::-webkit-scrollbar { width: 8px; }
    &::-webkit-scrollbar-thumb { background: ${({ theme }) => theme.cardBorder}; border-radius: 4px; }
`;

const BetList = styled.ul`
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 1px;
    max-height: 130px;
    overflow-y: auto;

    li {
        display: grid;
        grid-template-columns: 1fr auto auto 34px;
        gap: 0.4rem;
        align-items: center;
        padding: 0.18rem 0.35rem;
        border-radius: var(--radius-sm);
        font-size: 0.74rem;
        color: ${({ theme }) => theme.text};
        &:nth-child(odd) { background: ${({ theme }) => theme.body}; }
        &.won .st { color: #5FE3A3; }
        &.lost .st { color: ${({ theme }) => theme.teamRed}; }
    }
    .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ch { font-weight: 700; color: ${({ theme }) => theme.accent}; }
    .st { font-size: 0.66rem; text-align: right; color: ${({ theme }) => theme.placeholder}; }
`;

const SettleRow = styled.div`
    display: flex;
    align-items: center;
    gap: 0.3rem;
    flex-wrap: wrap;
    padding-top: 0.35rem;
    border-top: 1px dashed ${({ theme }) => theme.cardBorder};

    .lb { font-size: 0.68rem; color: ${({ theme }) => theme.placeholder}; margin-right: auto; }
`;

const ShopHead = styled.div`
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex-wrap: wrap;

    h3 { margin-right: 0.3rem; }
    button {
        padding: 0.25rem 0.65rem;
        border-radius: 999px;
        border: 1px solid ${({ theme }) => theme.cardBorder};
        background: transparent;
        color: ${({ theme }) => theme.placeholder};
        font-size: 0.74rem;
        font-weight: 700;
        cursor: pointer;
        i { font-style: normal; opacity: 0.7; font-size: 0.66rem; }
        &.on { background: ${({ theme }) => theme.accentGradient}; color: ${({ theme }) => theme.accentText}; border-color: transparent; }
    }
    .hint { margin-left: auto; font-size: 0.68rem; color: ${({ theme }) => theme.placeholder}; }
`;

const ShopScroll = styled.div`
    max-height: 268px;
    overflow-y: auto;
    padding-right: 4px;

    &::-webkit-scrollbar { width: 8px; }
    &::-webkit-scrollbar-thumb { background: ${({ theme }) => theme.cardBorder}; border-radius: 4px; }
`;

const BgPreview = styled.div<{ $bg: string }>`
    align-self: stretch;
    padding: 0.3rem 0.45rem;
    border-radius: var(--radius-sm);
    font-size: 0.8rem;
    font-weight: 700;
    ${({ $bg }) => BG_STYLES[$bg] || ''}
`;

const ShopGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(142px, 1fr));
    gap: 0.4rem;
`;

const ShopCard = styled.div<{ $equipped?: boolean }>`
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.22rem;
    padding: 0.45rem 0.5rem;
    border-radius: var(--radius-md);
    background: ${({ theme }) => theme.body};
    border: 1px solid ${({ theme, $equipped }) => ($equipped ? theme.accent : theme.cardBorder)};

    .nm { font-size: 0.8rem; font-weight: 700; color: ${({ theme }) => theme.text}; }
    .ds { font-size: 0.62rem; color: ${({ theme }) => theme.placeholder}; line-height: 1.35; min-height: 1.7em; }
    button { align-self: stretch; }
`;
