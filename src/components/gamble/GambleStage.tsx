import { useEffect, useMemo, useState } from 'react';
import type * as React from 'react';
import styled, { css, keyframes } from 'styled-components';

/*
 * 도박장 무대 — 게임마다 다른 3D/애니메이션 연출.
 * 결과는 항상 서버가 먼저 정하고, 여기서는 그 결과에 "착지"하는 연출만 담당한다.
 *  - phase 'spin': 결과를 기다리며 무한 회전
 *  - phase 'land': 서버 결과 위로 감속하며 정지
 */

export interface SpinState {
    phase: 'spin' | 'land';
    result?: string;
    won?: boolean;
}

export type StageGame = 'coin' | 'dice' | 'roulette' | 'smite' | 'penta' | 'slot';

/** 게임별 착지 연출 시간(ms) — PointsTab이 메시지 표시 타이밍에 쓴다 */
export const LAND_MS: Record<StageGame, number> = {
    coin: 1000, dice: 1000, roulette: 1600, smite: 1300, penta: 1700, slot: 1900,
};

const SLOT_SYMBOLS = ['검', '룬', '별', '왕관', '포로'];
const SYM_H = 46;
const REEL_CYCLES = 8;

export const GambleStage = ({ game, spin, onSlotPull, busy, smiteSlot }: {
    game: StageGame;
    spin: SpinState | null;
    onSlotPull: () => void;
    busy: boolean;
    /** 강타 싸움은 타이밍 게임이라 전용 컴포넌트를 그대로 넣는다 */
    smiteSlot?: React.ReactNode;
}) => {
    switch (game) {
        case 'coin': return <CoinStage spin={spin} />;
        case 'dice': return <DiceStage spin={spin} />;
        case 'roulette': return <RouletteStage spin={spin} />;
        case 'smite': return <Stage>{smiteSlot}</Stage>;
        case 'penta': return <PentaStage spin={spin} />;
        case 'slot': return <SlotStage spin={spin} onPull={onSlotPull} busy={busy} />;
    }
};

/* ---------- 동전 ---------- */

/** 실물풍 금화 면 — 톱니 테두리·비드 링·엠보스 문양·스펙큘러 하이라이트 */
const CoinFaceSvg = ({ side }: { side: 'f' | 'b' }) => (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden>
        <defs>
            <radialGradient id={`cg-${side}`} cx="38%" cy="30%" r="78%">
                <stop offset="0%" stopColor="#FFF3C4" />
                <stop offset="45%" stopColor="#EFCE7A" />
                <stop offset="80%" stopColor="#C9A044" />
                <stop offset="100%" stopColor="#9A7526" />
            </radialGradient>
            <linearGradient id={`cr-${side}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F7E3A0" />
                <stop offset="100%" stopColor="#8A6D2F" />
            </linearGradient>
        </defs>
        {/* 림 + 톱니(밀링) */}
        <circle cx="50" cy="50" r="48" fill={`url(#cr-${side})`} />
        <circle cx="50" cy="50" r="47" fill="none" stroke="#6E5215" strokeWidth="1.6" strokeDasharray="1.6 1.8" opacity="0.7" />
        <circle cx="50" cy="50" r="43.5" fill={`url(#cg-${side})`} stroke="#B8913C" strokeWidth="1" />
        {/* 비드 링 */}
        <circle cx="50" cy="50" r="39" fill="none" stroke="#8A6D2F" strokeWidth="1.9" strokeDasharray="0.2 3.6" strokeLinecap="round" opacity="0.8" />
        {side === 'f' ? (
            <g>
                {/* 왕관 문양 (음각) */}
                <g transform="translate(35 16) scale(1.0)" stroke="#7A5C22" strokeWidth="2" fill="none" strokeLinejoin="round" strokeLinecap="round" opacity="0.85">
                    <path d="M3 19V8.5l6 4.2L15 4l6 8.5 6-4.2V19z" />
                    <path d="M3 15.6h24" />
                </g>
                <text x="50" y="72" textAnchor="middle" fontSize="26" fontWeight="900" fill="#FFEDB0" opacity="0.55">앞</text>
                <text x="50" y="70.8" textAnchor="middle" fontSize="26" fontWeight="900" fill="#7A5C22">앞</text>
                <circle cx="20" cy="52" r="1.6" fill="#8A6D2F" opacity="0.7" />
                <circle cx="80" cy="52" r="1.6" fill="#8A6D2F" opacity="0.7" />
            </g>
        ) : (
            <g>
                {/* 월계수 가지 (음각) */}
                <g stroke="#7A5C22" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.85">
                    <path d="M27 68 C 22 55, 24 40, 34 30" />
                    <path d="M73 68 C 78 55, 76 40, 66 30" />
                    <path d="M28 60 l -5 -3 M27 51 l -5 -1 M29 42 l -5 1 M33 34 l -4 3" />
                    <path d="M72 60 l 5 -3 M73 51 l 5 -1 M71 42 l 5 1 M67 34 l 4 3" />
                </g>
                <text x="50" y="60" textAnchor="middle" fontSize="24" fontWeight="900" fill="#FFEDB0" opacity="0.55">뒤</text>
                <text x="50" y="58.8" textAnchor="middle" fontSize="24" fontWeight="900" fill="#7A5C22">뒤</text>
            </g>
        )}
        {/* 스펙큘러 하이라이트 */}
        <ellipse cx="36" cy="25" rx="21" ry="9" fill="#FFFFFF" opacity="0.32" transform="rotate(-24 36 25)" />
    </svg>
);

const CoinStage = ({ spin }: { spin: SpinState | null }) => {
    const landing = spin?.phase === 'land';
    return (
        <Stage>
            <CoinWrap>
                <CoinFlight $fly={landing}>
                    <Coin $spin={spin?.phase === 'spin'} $land={landing ? (spin?.result === 'front' ? 'front' : 'back') : null}>
                        <span className="face f"><CoinFaceSvg side="f" /></span>
                        <span className="face b"><CoinFaceSvg side="b" /></span>
                    </Coin>
                </CoinFlight>
                <CoinShadow $fly={landing} />
            </CoinWrap>
        </Stage>
    );
};

const coinSpin = keyframes`from { transform: rotateX(0); } to { transform: rotateX(360deg); }`;
/* 회전은 강하게 감속 — 마지막 반 바퀴가 천천히 넘어간다 */
const coinLandFront = keyframes`from { transform: rotateX(0); } to { transform: rotateX(1440deg); }`;
const coinLandBack = keyframes`from { transform: rotateX(0); } to { transform: rotateX(1620deg); }`;
/* 포물선 비행 + 착지 미세 바운스 */
const coinFly = keyframes`
    0% { transform: translateY(0); animation-timing-function: cubic-bezier(0.16, 0.7, 0.3, 1); }
    42% { transform: translateY(-64px); animation-timing-function: cubic-bezier(0.6, 0, 0.85, 0.4); }
    80% { transform: translateY(0); animation-timing-function: cubic-bezier(0.2, 0.9, 0.4, 1); }
    90% { transform: translateY(-7px); animation-timing-function: cubic-bezier(0.55, 0, 0.8, 0.5); }
    100% { transform: translateY(0); }
`;
/* 그림자는 높이에 반비례해 작아지고 옅어진다 */
const coinShadowPulse = keyframes`
    0% { transform: scale(1); opacity: 1; }
    42% { transform: scale(0.55); opacity: 0.45; }
    80% { transform: scale(1); opacity: 1; }
    90% { transform: scale(0.9); opacity: 0.75; }
    100% { transform: scale(1); opacity: 1; }
`;

const CoinWrap = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    perspective: 600px;
`;

const CoinFlight = styled.div<{ $fly: boolean }>`
    ${({ $fly }) => $fly && css`animation: ${coinFly} 1.05s linear forwards;`}
`;

const CoinShadow = styled.div<{ $fly: boolean }>`
    width: 64px;
    height: 10px;
    border-radius: 50%;
    background: rgba(30, 34, 43, 0.25);
    filter: blur(4px);
    ${({ $fly }) => $fly && css`animation: ${coinShadowPulse} 1.05s linear forwards;`}
`;

const Coin = styled.div<{ $spin: boolean; $land: 'front' | 'back' | null }>`
    position: relative;
    width: 84px;
    height: 84px;
    transform-style: preserve-3d;

    ${({ $spin }) => $spin && css`animation: ${coinSpin} 0.28s linear infinite;`}
    ${({ $land }) => $land === 'front' && css`animation: ${coinLandFront} 1.05s cubic-bezier(0.16, 1, 0.3, 1) forwards;`}
    ${({ $land }) => $land === 'back' && css`animation: ${coinLandBack} 1.05s cubic-bezier(0.16, 1, 0.3, 1) forwards;`}

    /* 실물 금화 SVG 면 — 두께감은 면 뒤의 얇은 림 그림자로 표현 */
    .face {
        position: absolute;
        inset: 0;
        border-radius: 50%;
        backface-visibility: hidden;
        filter: drop-shadow(0 2px 3px rgba(60, 42, 10, 0.35));
    }
    .b { transform: rotateX(180deg); }
`;

/* ---------- 주사위 ---------- */

const FACE_ROT: Record<string, [number, number]> = {
    '1': [0, 0], '6': [0, 180], '3': [0, -90], '4': [0, 90], '5': [-90, 0], '2': [90, 0],
};

const DiceStage = ({ spin }: { spin: SpinState | null }) => {
    const land = spin?.phase === 'land' ? spin.result ?? '1' : null;
    const [rx, ry] = land ? FACE_ROT[land] ?? [0, 0] : [0, 0];
    return (
        <Stage>
            <DiceWrap>
                <Cube
                    $spin={spin?.phase === 'spin'}
                    style={land ? { transform: `rotateX(${1080 + rx}deg) rotateY(${1080 + ry}deg)` } : undefined}
                >
                    {(['1', '2', '3', '4', '5', '6'] as const).map(n => (
                        <span key={n} className={`face face-${n}`}>{n}</span>
                    ))}
                </Cube>
            </DiceWrap>
        </Stage>
    );
};

const tumble = keyframes`
    from { transform: rotateX(0) rotateY(0); }
    to { transform: rotateX(360deg) rotateY(720deg); }
`;

const DiceWrap = styled.div`
    perspective: 600px;
    padding: 14px;
`;

const Cube = styled.div<{ $spin: boolean }>`
    position: relative;
    width: 72px;
    height: 72px;
    transform-style: preserve-3d;
    transition: transform 1.05s cubic-bezier(0.16, 1, 0.3, 1);
    ${({ $spin }) => $spin && css`animation: ${tumble} 0.5s linear infinite; transition: none;`}

    .face {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.7rem;
        font-weight: 900;
        color: #1E222B;
        background: linear-gradient(145deg, #FAF6EC, #E3D9C4);
        border: 2px solid #CBC0A6;
        border-radius: 10px;
    }
    /* 각 면 배치 — FACE_ROT 매핑과 쌍 */
    .face-1 { transform: translateZ(36px); }
    .face-6 { transform: rotateY(180deg) translateZ(36px); }
    .face-3 { transform: rotateY(90deg) translateZ(36px); }
    .face-4 { transform: rotateY(-90deg) translateZ(36px); }
    .face-5 { transform: rotateX(90deg) translateZ(36px); }
    .face-2 { transform: rotateX(-90deg) translateZ(36px); }
`;

/* ---------- 룰렛 ---------- */

const SEG = 360 / 38;
/* 색은 웜 팔레트로: 세이지 그린 · 브릭 레드 · 차콜 */
const colorOf = (i: number) => (i === 0 || i === 19 ? '#4E8F7B' : i % 2 === 1 ? '#B5453C' : '#2B2E36');

/** 세그먼트 번호 라벨 — 0·00은 초록, 나머지는 1~36 */
const segLabel = (i: number) => (i === 0 ? '0' : i === 19 ? '00' : String(i < 19 ? i : i - 1));

const polar = (r: number, deg: number): [number, number] => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [70 + r * Math.cos(rad), 70 + r * Math.sin(rad)];
};

/** 실물풍 룰렛 휠 — 우드 림·금테·포켓·번호·금속 허브 */
const WheelSvg = () => {
    const segs = useMemo(() => Array.from({ length: 38 }, (_, i) => {
        const a0 = i * SEG;
        const a1 = (i + 1) * SEG;
        const [x0, y0] = polar(62, a0);
        const [x1, y1] = polar(62, a1);
        const [x2, y2] = polar(41, a1);
        const [x3, y3] = polar(41, a0);
        const mid = (a0 + a1) / 2;
        const [tx, ty] = polar(52.5, mid);
        return {
            d: `M ${x0.toFixed(2)} ${y0.toFixed(2)} A 62 62 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L ${x2.toFixed(2)} ${y2.toFixed(2)} A 41 41 0 0 0 ${x3.toFixed(2)} ${y3.toFixed(2)} Z`,
            fill: colorOf(i), label: segLabel(i), tx, ty, rot: mid,
        };
    }), []);

    return (
        <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden>
            <defs>
                <radialGradient id="rw-wood" cx="35%" cy="30%" r="80%">
                    <stop offset="0%" stopColor="#7A4E30" />
                    <stop offset="70%" stopColor="#5A3A26" />
                    <stop offset="100%" stopColor="#3E2818" />
                </radialGradient>
                <radialGradient id="rw-bowl" cx="45%" cy="40%" r="70%">
                    <stop offset="0%" stopColor="#33281C" />
                    <stop offset="100%" stopColor="#1E160E" />
                </radialGradient>
                <radialGradient id="rw-hub" cx="38%" cy="30%" r="75%">
                    <stop offset="0%" stopColor="#F7E3A0" />
                    <stop offset="60%" stopColor="#C9A55C" />
                    <stop offset="100%" stopColor="#8A6D2F" />
                </radialGradient>
            </defs>
            <circle cx="70" cy="70" r="69" fill="url(#rw-wood)" />
            <circle cx="70" cy="70" r="64" fill="none" stroke="#C9A55C" strokeWidth="1.6" />
            {segs.map((s, i) => <path key={i} d={s.d} fill={s.fill} stroke="#E8D9A8" strokeWidth="0.45" />)}
            {segs.map((s, i) => (
                <text key={`t${i}`} x={s.tx} y={s.ty} fontSize="4.6" fontWeight="700" fill="#F5EFE2"
                    textAnchor="middle" dominantBaseline="middle"
                    transform={`rotate(${s.rot} ${s.tx.toFixed(2)} ${s.ty.toFixed(2)})`}>{s.label}</text>
            ))}
            <circle cx="70" cy="70" r="41" fill="none" stroke="#C9A55C" strokeWidth="1.2" />
            <circle cx="70" cy="70" r="39.5" fill="url(#rw-bowl)" />
            {/* 금속 허브 + 십자 손잡이 */}
            {[0, 90].map(a => (
                <rect key={a} x="66.8" y="44" width="6.4" height="52" rx="3.2" fill="url(#rw-hub)"
                    transform={`rotate(${a + 45} 70 70)`} opacity="0.95" />
            ))}
            <circle cx="70" cy="70" r="13" fill="url(#rw-hub)" stroke="#8A6D2F" strokeWidth="1" />
            <circle cx="70" cy="70" r="4" fill="#F7E3A0" stroke="#8A6D2F" strokeWidth="1" />
            <ellipse cx="52" cy="42" rx="26" ry="10" fill="#FFFFFF" opacity="0.10" transform="rotate(-28 52 42)" />
        </svg>
    );
};

const RouletteStage = ({ spin }: { spin: SpinState | null }) => {
    // 착지 각도 — 결과 색의 세그먼트 하나를 골라 포인터(12시) 아래로 보낸다
    const [angle, setAngle] = useState(0);
    useEffect(() => {
        if (spin?.phase !== 'land') return;
        const want = spin.result === 'green' ? '#4E8F7B' : spin.result === 'red' ? '#B5453C' : '#2B2E36';
        const candidates = Array.from({ length: 38 }, (_, i) => i).filter(i => colorOf(i) === want);
        const idx = candidates[Math.floor(Math.random() * candidates.length)];
        const center = (idx + 0.5) * SEG;
        setAngle(1440 + (360 - center));
    }, [spin]);

    return (
        <Stage>
            <RouletteWrap>
                <div className="pointer" />
                <Wheel
                    $spin={spin?.phase === 'spin'}
                    style={spin?.phase === 'land' ? { transform: `rotate(${angle}deg)` } : undefined}
                >
                    <WheelSvg />
                </Wheel>
                {/* 볼 — 휠과 반대로 돌다가 포인터 아래 포켓에 안착 */}
                <BallOrbit $spin={spin?.phase === 'spin'} $land={spin?.phase === 'land'}>
                    <span className="ball" />
                </BallOrbit>
            </RouletteWrap>
        </Stage>
    );
};

const wheelSpin = keyframes`from { transform: rotate(0); } to { transform: rotate(360deg); }`;

const RouletteWrap = styled.div`
    position: relative;
    padding-top: 10px;

    .pointer {
        position: absolute;
        top: 2px;
        left: 50%;
        transform: translateX(-50%);
        width: 0; height: 0;
        border-left: 8px solid transparent;
        border-right: 8px solid transparent;
        border-top: 14px solid #C9A55C;
        z-index: 2;
        filter: drop-shadow(0 2px 2px rgba(30, 34, 43, 0.35));
    }
`;

const Wheel = styled.div<{ $spin: boolean }>`
    width: 148px;
    height: 148px;
    border-radius: 50%;
    filter: drop-shadow(0 10px 16px rgba(30, 34, 43, 0.35));
    transition: transform 1.6s cubic-bezier(0.12, 0.8, 0.2, 1);
    ${({ $spin }) => $spin && css`animation: ${wheelSpin} 0.4s linear infinite; transition: none;`}
`;

/* 볼 궤도 — 스핀 중엔 휠 반대 방향으로 돌고, 착지 시 감속하며 12시 포켓에 멈춘다 */
const ballLand = keyframes`
    from { transform: rotate(-900deg); }
    to { transform: rotate(0deg); }
`;

const BallOrbit = styled.div<{ $spin: boolean; $land: boolean }>`
    position: absolute;
    inset: 10px 0 0 0;
    width: 148px;
    height: 148px;
    pointer-events: none;
    z-index: 1;
    ${({ $spin }) => $spin && css`animation: ${wheelSpin} 0.55s linear infinite reverse;`}
    ${({ $land }) => $land && css`animation: ${ballLand} 1.6s cubic-bezier(0.15, 0.85, 0.25, 1) forwards;`}

    .ball {
        position: absolute;
        top: 22px;
        left: 50%;
        width: 9px;
        height: 9px;
        margin-left: -4.5px;
        border-radius: 50%;
        background: radial-gradient(circle at 35% 30%, #FFFFFF, #C8CBD4 75%);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    }
`;

/* ---------- 펜타킬 도전 ---------- */

const PentaStage = ({ spin }: { spin: SpinState | null }) => {
    const [count, setCount] = useState(0);
    const target = spin?.phase === 'land' ? (spin.won ? 5 : Number(spin.result ?? 0)) : 0;
    const won = spin?.phase === 'land' && spin.won;

    // 착지 시 킬 카운트가 하나씩 올라간다
    useEffect(() => {
        if (spin?.phase !== 'land') { setCount(0); return; }
        setCount(0);
        let n = 0;
        const t = setInterval(() => {
            n += 1;
            if (n > target) { clearInterval(t); return; }
            setCount(n);
        }, 260);
        return () => clearInterval(t);
    }, [spin, target]);

    return (
        <Stage>
            <PentaWrap $shaking={spin?.phase === 'spin'}>
                <div className="kills">
                    {['더블킬', '트리플킬', '쿼드라킬', '펜타킬'].map((label, i) => (
                        <span key={label} className={count >= i + 2 ? 'k on' : 'k'}>{label}</span>
                    ))}
                </div>
                <div className={won && count >= 5 ? 'big penta' : 'big'}>
                    {spin?.phase === 'spin' ? '한타 중…'
                        : spin?.phase === 'land' ? (won && count >= 5 ? 'PENTAKILL!' : `${count} KILL`)
                        : '진입 대기'}
                </div>
            </PentaWrap>
        </Stage>
    );
};

const shake = keyframes`
    0%, 100% { transform: translate(0, 0); }
    20% { transform: translate(-3px, 2px); }
    40% { transform: translate(3px, -2px); }
    60% { transform: translate(-2px, -2px); }
    80% { transform: translate(2px, 2px); }
`;

const pentaGlow = keyframes`
    0%, 100% { filter: drop-shadow(0 0 5px rgba(181, 69, 60, 0.45)); }
    50% { filter: drop-shadow(0 0 12px rgba(201, 165, 92, 0.6)); }
`;

const PentaWrap = styled.div<{ $shaking: boolean }>`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    ${({ $shaking }) => $shaking && css`animation: ${shake} 0.25s linear infinite;`}

    .kills { display: flex; gap: 0.45rem; }
    .k {
        font-size: 0.62rem;
        font-weight: 800;
        color: #8A8270;
        opacity: 0.4;
        transition: all 0.25s cubic-bezier(0.34, 1.4, 0.6, 1);
    }
    .k.on { opacity: 1; color: #B5453C; transform: scale(1.12); }

    .big {
        font-size: 1.5rem;
        font-weight: 900;
        letter-spacing: 0.06em;
        color: #1E222B;
    }
    .big.penta {
        background: linear-gradient(90deg, #B5453C, #C9A55C, #B5453C);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        animation: ${pentaGlow} 1.1s ease-in-out infinite;
    }
`;

/* ---------- 슬롯머신 (레버 포함) ---------- */

const SlotStage = ({ spin, onPull, busy }: { spin: SpinState | null; onPull: () => void; busy: boolean }) => {
    const [pulled, setPulled] = useState(false);
    const landSyms = spin?.phase === 'land' ? (spin.result ?? '').split('·') : null;

    const pull = () => {
        if (busy) return;
        setPulled(true);
        setTimeout(() => setPulled(false), 500);
        onPull();
    };

    /** 릴의 최종 오프셋 — 마지막 사이클에서 결과 심볼 위치로 */
    const offsetFor = (sym: string) => {
        const si = Math.max(0, SLOT_SYMBOLS.indexOf(sym));
        return -(((REEL_CYCLES - 1) * SLOT_SYMBOLS.length + si) * SYM_H);
    };

    return (
        <Stage>
            <SlotWrap>
                <div className="machine">
                    {[0, 1, 2].map(reel => (
                        <div key={reel} className="window">
                            <Reel
                                $spin={spin?.phase === 'spin'}
                                style={landSyms ? {
                                    transform: `translateY(${offsetFor(landSyms[reel] ?? SLOT_SYMBOLS[0])}px)`,
                                    transitionDuration: `${1.1 + reel * 0.35}s`,
                                } : undefined}
                            >
                                {Array.from({ length: REEL_CYCLES }, () => SLOT_SYMBOLS).flat().map((s, i) => (
                                    <span key={i} className="sym">{s}</span>
                                ))}
                            </Reel>
                        </div>
                    ))}
                </div>
                <Lever $pulled={pulled} onClick={pull} title={busy ? '결과 대기 중…' : '레버 당기기'}>
                    <div className="stick"><div className="knob" /></div>
                    <div className="base" />
                </Lever>
            </SlotWrap>
        </Stage>
    );
};

const reelScroll = keyframes`
    from { transform: translateY(0); }
    to { transform: translateY(-${SLOT_SYMBOLS.length * SYM_H}px); }
`;

const SlotWrap = styled.div`
    display: flex;
    align-items: center;
    gap: 0.9rem;

    .machine {
        display: flex;
        gap: 6px;
        padding: 10px;
        border-radius: 14px;
        background: linear-gradient(165deg, #F5EFE2, #E0D6BE);
        border: 1px solid #CBC0A6;
        box-shadow: inset 0 2px 3px rgba(255, 255, 255, 0.9), 0 12px 24px -12px rgba(30, 34, 43, 0.5);
    }
    .window {
        width: 52px;
        height: ${SYM_H}px;
        overflow: hidden;
        border-radius: 9px;
        background: #FBF8F1;
        border: 1px solid #C9A55C;
        box-shadow: inset 0 4px 7px rgba(30, 34, 43, 0.14), inset 0 -4px 7px rgba(30, 34, 43, 0.14);
    }
`;

const Reel = styled.div<{ $spin: boolean }>`
    display: flex;
    flex-direction: column;
    transition: transform 1.2s cubic-bezier(0.15, 0.85, 0.25, 1.02);
    ${({ $spin }) => $spin && css`animation: ${reelScroll} 0.22s linear infinite; transition: none; filter: blur(1.5px);`}

    .sym {
        height: ${SYM_H}px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.05rem;
        font-weight: 900;
        color: #1B1F27;
    }
`;

const Lever = styled.button<{ $pulled: boolean }>`
    position: relative;
    width: 40px;
    height: 86px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;

    .stick {
        position: absolute;
        bottom: 18px;
        left: 50%;
        width: 8px;
        height: 58px;
        margin-left: -4px;
        border-radius: 4px;
        background: linear-gradient(90deg, #B8AD93, #EFE8D6, #B8AD93);
        transform-origin: bottom center;
        transition: transform 0.24s cubic-bezier(0.34, 1.4, 0.6, 1);
        transform: ${({ $pulled }) => ($pulled ? 'rotateX(150deg)' : 'rotateX(0)')};
    }
    .knob {
        position: absolute;
        top: -14px;
        left: 50%;
        transform: translateX(-50%);
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: radial-gradient(circle at 32% 28%, #FBD9CE, #E08170 70%);
        box-shadow: 0 3px 6px rgba(30, 34, 43, 0.35);
    }
    .base {
        position: absolute;
        bottom: 6px;
        left: 50%;
        transform: translateX(-50%);
        width: 26px;
        height: 14px;
        border-radius: 5px 5px 8px 8px;
        background: #D8CFBA;
        border: 1px solid #B8AD93;
    }
    &:hover .knob { filter: brightness(1.15); }
`;

/* ---------- 공용 무대 ---------- */

/* 무대 — 참고 이미지의 밝은 타일 스튜디오. 다크 UI 속에서 유일하게 밝은 면이라 시선이 모인다 */
const Stage = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 150px;
    border-radius: var(--radius-md);
    background:
        linear-gradient(#E3DCC9 1px, transparent 1px),
        linear-gradient(90deg, #E3DCC9 1px, transparent 1px),
        linear-gradient(170deg, #F7F2E6, #EDE6D4);
    background-size: 30px 30px, 30px 30px, auto;
    border: 1px solid #D8CFBA;
    box-shadow: inset 0 2px 10px rgba(30, 34, 43, 0.06);
    overflow: hidden;
`;
