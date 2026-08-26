import { useEffect, useMemo, useRef } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { gsap } from 'gsap';

// 개발 콘솔 디버깅용 (숨김 탭에서는 rAF가 멈춰 수동 틱이 필요할 때가 있다)
if (import.meta.env.DEV) (window as unknown as { gsap: typeof gsap }).gsap = gsap;

/*
 * 장식 시스템 v4 — 사용자 가이드라인 기반 전면 재작성.
 *
 * 원칙
 *  1) 테두리는 안쪽 배경을 채우지 않는다 (글자는 문맥 색을 그대로 상속).
 *  2) 화려한 연출은 CSS만으로는 한계가 있어 실제 DOM 레이어(FrameLayer)를 얹는다.
 *     날개·안개·팩맨·눈·꽃잎·번개·눈동자·칩이 전부 실제 요소다.
 *  3) 상점에서는 FrameLayer 없이 테두리만 보여 주고(간략), 실제 착용 시 전부 재생한다.
 *  4) 모서리 뱃지(글리프)는 전부 제거했다.
 *
 * 사용법
 *   <컨테이너 css={decorate(frame, bg)}>   // 테두리·글자 효과
 *     <FrameLayer frame={frame} />         // 화려한 레이어
 *     <span className="fx-text" data-text={name}>{name}</span>
 *   </컨테이너>
 */

/* ===================== 팔레트 ===================== */

/* 롤 실버/골드 엠블럼 색 */
const SILVER_LIGHT = '#E4EAF2';
const SILVER_MID = '#9FB0C4';
const GOLD_LIGHT = '#F0E6D2';
const GOLD_MID = '#C8AA6E';
const GOLD_DARK = '#8A6E32';

/* ===================== 공용 모션 ===================== */

const bgFlow = keyframes`
    from { background-position: 0% 50%; }
    to { background-position: 200% 50%; }
`;

/* 팩맨이 테두리를 한 바퀴 돈다 — 크기와 무관하게 % 로 이동 */
const pacRun = keyframes`
    0%   { left: 0%;   top: 0%;   transform: translate(-50%, -50%) rotate(0deg); }
    25%  { left: 100%; top: 0%;   transform: translate(-50%, -50%) rotate(0deg); }
    26%  { left: 100%; top: 0%;   transform: translate(-50%, -50%) rotate(90deg); }
    50%  { left: 100%; top: 100%; transform: translate(-50%, -50%) rotate(90deg); }
    51%  { left: 100%; top: 100%; transform: translate(-50%, -50%) rotate(180deg); }
    75%  { left: 0%;   top: 100%; transform: translate(-50%, -50%) rotate(180deg); }
    76%  { left: 0%;   top: 100%; transform: translate(-50%, -50%) rotate(270deg); }
    100% { left: 0%;   top: 0%;   transform: translate(-50%, -50%) rotate(270deg); }
`;

const pacChomp = keyframes`
    0%, 100% { clip-path: polygon(100% 22%, 50% 50%, 100% 78%, 100% 100%, 0 100%, 0 0, 100% 0); }
    50% { clip-path: polygon(100% 48%, 50% 50%, 100% 52%, 100% 100%, 0 100%, 0 0, 100% 0); }
`;

const emberFlicker = keyframes`
    0%, 100% { box-shadow: 0 0 8px 1px rgba(226, 88, 34, 0.65), inset 0 0 8px rgba(255, 140, 60, 0.35); }
    35% { box-shadow: 0 0 16px 4px rgba(255, 120, 40, 0.9), inset 0 0 12px rgba(255, 170, 80, 0.5); }
    70% { box-shadow: 0 0 10px 2px rgba(210, 70, 30, 0.75), inset 0 0 9px rgba(255, 150, 70, 0.4); }
`;

const frostShimmer = keyframes`
    0%, 100% { box-shadow: 0 0 8px 1px rgba(190, 230, 255, 0.55), inset 0 0 8px rgba(210, 240, 255, 0.3); }
    50% { box-shadow: 0 0 14px 3px rgba(220, 245, 255, 0.85), inset 0 0 12px rgba(235, 250, 255, 0.45); }
`;

const poroLick = keyframes`
    0%, 72%, 100% { transform: translateX(-50%) scaleY(0.15); opacity: 0; }
    76% { transform: translateX(-50%) scaleY(1.08); opacity: 1; }
    82% { transform: translateX(-50%) scaleY(0.9) rotate(-5deg); opacity: 1; }
    88% { transform: translateX(-50%) scaleY(1.02) rotate(4deg); opacity: 1; }
    94% { transform: translateX(-50%) scaleY(0.15); opacity: 0; }
`;

const neonTube = keyframes`
    0%, 100% { box-shadow: 0 0 6px 1px rgba(90, 200, 215, 0.9), 0 0 18px 5px rgba(90, 200, 215, 0.4), inset 0 0 7px rgba(90, 200, 215, 0.35); }
    4% { box-shadow: 0 0 2px 0 rgba(90, 200, 215, 0.2); }
    6% { box-shadow: 0 0 6px 1px rgba(90, 200, 215, 0.9), 0 0 18px 5px rgba(90, 200, 215, 0.4); }
    47% { box-shadow: 0 0 3px 0 rgba(90, 200, 215, 0.3); }
    49% { box-shadow: 0 0 6px 1px rgba(90, 200, 215, 0.9), 0 0 18px 5px rgba(90, 200, 215, 0.4); }
`;

const neonText = keyframes`
    0%, 100% { text-shadow: 0 0 4px #7FE4F0, 0 0 10px #5AC8D7, 0 0 20px #2AA8C0; }
    4% { text-shadow: none; opacity: 0.7; }
    6% { text-shadow: 0 0 4px #7FE4F0, 0 0 10px #5AC8D7, 0 0 20px #2AA8C0; }
    48% { text-shadow: 0 0 2px #7FE4F0; }
    50% { text-shadow: 0 0 4px #7FE4F0, 0 0 10px #5AC8D7, 0 0 20px #2AA8C0; }
`;

const boltBorder = keyframes`
    0%, 82%, 100% { box-shadow: 0 0 6px 0 rgba(142, 91, 255, 0.45); }
    85% { box-shadow: 0 0 14px 3px rgba(176, 123, 255, 0.95), inset 0 0 10px rgba(176, 123, 255, 0.5); }
    89% { box-shadow: 0 0 16px 4px rgba(200, 160, 255, 1), inset 0 0 12px rgba(200, 160, 255, 0.6); }
`;

/* 진짜 글리치 — 본체가 어긋나고 RGB 채널이 분리된다 */
const glitchSkew = keyframes`
    0%, 42%, 100% { transform: translate(0, 0) skewX(0deg); }
    44% { transform: translate(-3px, 1px) skewX(-8deg); }
    46% { transform: translate(3px, -1px) skewX(6deg); }
    48% { transform: translate(-2px, 0) skewX(0deg); }
    50% { transform: translate(0, 0) skewX(0deg); }
    86% { transform: translate(2px, -1px) skewX(4deg); }
    88% { transform: translate(0, 0) skewX(0deg); }
`;

const glitchSliceA = keyframes`
    0%, 100% { clip-path: inset(88% 0 0 0); transform: translate(-2px, 0); }
    20% { clip-path: inset(12% 0 72% 0); transform: translate(-3px, -1px); }
    40% { clip-path: inset(48% 0 34% 0); transform: translate(3px, 1px); }
    60% { clip-path: inset(72% 0 12% 0); transform: translate(-2px, 1px); }
    80% { clip-path: inset(28% 0 58% 0); transform: translate(2px, -1px); }
`;

const glitchSliceB = keyframes`
    0%, 100% { clip-path: inset(24% 0 62% 0); transform: translate(2px, 0); }
    20% { clip-path: inset(66% 0 18% 0); transform: translate(3px, 1px); }
    40% { clip-path: inset(8% 0 80% 0); transform: translate(-3px, -1px); }
    60% { clip-path: inset(40% 0 44% 0); transform: translate(2px, -1px); }
    80% { clip-path: inset(80% 0 6% 0); transform: translate(-2px, 1px); }
`;

const glitchBorder = keyframes`
    0%, 42%, 100% { box-shadow: -1px 0 0 0 rgba(0, 255, 255, 0.6), 1px 0 0 0 rgba(255, 0, 160, 0.6); }
    44% { box-shadow: -5px 2px 0 0 rgba(0, 255, 255, 0.9), 5px -2px 0 0 rgba(255, 0, 160, 0.9); }
    47% { box-shadow: 4px -2px 0 0 rgba(0, 255, 255, 0.9), -4px 2px 0 0 rgba(255, 0, 160, 0.9); }
    50% { box-shadow: -1px 0 0 0 rgba(0, 255, 255, 0.6), 1px 0 0 0 rgba(255, 0, 160, 0.6); }
`;

const eyeGlow = keyframes`
    0%, 88%, 100% { transform: scaleY(1); opacity: 0.9; }
    92% { transform: scaleY(0.08); opacity: 0.7; }
    96% { transform: scaleY(1); opacity: 0.9; }
`;

const eyeAura = keyframes`
    0%, 100% { opacity: 0.4; transform: scale(1); }
    50% { opacity: 0.75; transform: scale(1.2); }
`;

const chipSpin = keyframes`
    from { transform: rotateY(0deg); }
    to { transform: rotateY(360deg); }
`;

const goldSheen = keyframes`
    0%, 100% { box-shadow: 0 0 8px 0 rgba(200, 170, 110, 0.5); }
    50% { box-shadow: 0 0 18px 4px rgba(240, 230, 210, 0.75); }
`;

/* ===================== 테두리 스타일 (컨테이너에 적용) ===================== */

const FRAME_STYLES: Record<string, ReturnType<typeof css>> = {
    /* 실버 — 롤 실버 엠블럼 색 금속 테두리 */
    frame_silver: css`
        border-color: ${SILVER_MID};
        box-shadow: 0 0 0 1px rgba(228, 234, 242, 0.25), 0 0 10px -3px rgba(159, 176, 196, 0.7);
        transition: box-shadow 0.25s ease, border-color 0.25s ease;
        &:hover {
            border-color: ${SILVER_LIGHT};
            box-shadow: 0 0 0 1px rgba(228, 234, 242, 0.45), 0 0 16px -2px rgba(159, 176, 196, 0.95);
        }
    `,

    /* 골드 — 롤 골드 엠블럼 색 금속 테두리 */
    frame_gold: css`
        border-color: ${GOLD_MID};
        box-shadow: 0 0 0 1px rgba(240, 230, 210, 0.3), 0 0 12px -3px rgba(200, 170, 110, 0.8);
        animation: ${goldSheen} 3.6s ease-in-out infinite;
        transition: border-color 0.25s ease;
        &:hover { border-color: ${GOLD_LIGHT}; animation-duration: 1.6s; }
    `,

    /* 그림자 장막 — 회색 테두리 + 검은 안개 */
    frame_shadow: css`
        border-color: #8A8F98;
        box-shadow: 0 6px 18px -6px rgba(0, 0, 0, 0.85);
        &:hover { box-shadow: 0 10px 26px -6px rgba(0, 0, 0, 0.95); }
        &:hover .wisp { filter: blur(5px) brightness(0.4); }
    `,

    /* 픽셀 아트 — 도트 테두리 위를 팩맨이 돈다 */
    frame_pixel: css`
        border-radius: 0;
        border-style: dotted;
        border-width: 3px;
        border-color: #FFE066;
        image-rendering: pixelated;
        font-family: 'Courier New', monospace;
        &:hover .fx-pac { animation-duration: 2.2s; }
    `,

    /* 불꽃 — 붉은 테두리가 이글거리고 불티가 올라온다 */
    frame_fire: css`
        border-color: #E25822;
        animation: ${emberFlicker} 1.5s ease-in-out infinite;
        &:hover { animation-duration: 0.6s; }
        &:hover .ember { filter: brightness(1.5) saturate(1.3); }
    `,

    /* 서리 — 흰빛에 가까운 푸른 테두리 + 눈 */
    frame_ice: css`
        border-color: #CFEAFB;
        animation: ${frostShimmer} 3s ease-in-out infinite;
        &:hover { animation-duration: 1.2s; }
        &:hover .flake { filter: brightness(1.6); }
    `,

    /* 포로 — 복슬복슬한 흰 테두리 + 뿔 + 혓바닥 */
    frame_poro: css`
        border-radius: 999px;
        border-color: #FFFFFF;
        box-shadow: 0 0 8px rgba(255, 255, 255, 0.3);
        &:hover .poro-tongue { animation: none; transform: translateX(-50%) scaleY(1); opacity: 1; }
    `,

    /* 네온사인 — 글로우 튜브 테두리 + 글자도 네온 */
    frame_neon: css`
        border-radius: 8px;
        border-color: #5AC8D7;
        animation: ${neonTube} 5s linear infinite;

        .fx-text {
            color: #EAFDFF;
            animation: ${neonText} 5s linear infinite;
        }
        &:hover { animation: none; box-shadow: 0 0 10px 2px rgba(90, 200, 215, 1), 0 0 26px 8px rgba(90, 200, 215, 0.55), inset 0 0 10px rgba(90, 200, 215, 0.5); }
        &:hover .fx-text { animation: none; text-shadow: 0 0 6px #9FF0FA, 0 0 14px #5AC8D7, 0 0 28px #2AA8C0; }
    `,

    /* 바론 — 보라 테두리 + 보랏빛 오라 */
    frame_baron: css`
        border-color: #8E5BFF;
        box-shadow: inset 0 0 12px rgba(142, 91, 255, 0.35);
        &:hover .aura-puff { filter: blur(4px) brightness(1.4); }
        &:hover .aura-base { opacity: 1; }
    `,

    /* 부의 테두리 — 금빛 테두리에 카지노 칩 */
    frame_money: css`
        border-color: ${GOLD_MID};
        animation: ${goldSheen} 2.6s ease-in-out infinite;
        &:hover .fx-chip { animation-duration: 0.9s; }
    `,

    /* 벚꽃 — 얇은 분홍 테두리 + 흩날리는 꽃잎 */
    frame_sakura: css`
        border-color: #FFB7C9;
        box-shadow: 0 0 8px -2px rgba(255, 183, 201, 0.7);
        &:hover { box-shadow: 0 0 14px -2px rgba(255, 183, 201, 1); }
        &:hover .petal { filter: brightness(1.15) saturate(1.2); }
    `,

    /* 뇌전 — 보라 번개 테두리, 지직거림 */
    frame_lightning: css`
        border-color: #B07BFF;
        animation: ${boltBorder} 3.4s linear infinite;
        &:hover { animation-duration: 1.1s; }
    `,

    /* 글리치 — 테두리·글자 모두 진짜로 깨진다 */
    frame_glitch: css`
        border-color: #E14ECF;
        animation: ${glitchBorder} 3.2s steps(1) infinite;

        .fx-text {
            position: relative;
            animation: ${glitchSkew} 3.2s steps(1) infinite;

            &::before, &::after {
                content: attr(data-text);
                position: absolute;
                inset: 0;
                pointer-events: none;
                mix-blend-mode: screen;
            }
            &::before { color: #00FFFF; animation: ${glitchSliceA} 1.6s steps(2) infinite; }
            &::after { color: #FF00A0; animation: ${glitchSliceB} 1.9s steps(2) infinite; }
        }
        &:hover { animation-duration: 0.7s; }
        &:hover .fx-text { animation-duration: 0.7s; }
        &:hover .fx-text::before { animation-duration: 0.35s; }
        &:hover .fx-text::after { animation-duration: 0.42s; }
    `,

    /* 공허의 시선 — 어두운 보라, 위쪽에서 눈동자가 내려다본다 */
    frame_void: css`
        border-color: #4A2A75;
        box-shadow: inset 0 6px 14px -6px rgba(150, 90, 230, 0.6), 0 0 10px -3px rgba(74, 42, 117, 0.9);
        &:hover .fx-eye { transform: translateX(-50%) scale(1.25); }
        &:hover .fx-eye-glow { opacity: 0.95; }
    `,
};

/* ===================== 배경 장식 ===================== */

const magmaFlow = keyframes`
    0%, 100% { background-position: 0% 50%, 50% 50%, 0 0; opacity: 1; }
    50% { background-position: 40% 60%, 60% 40%, 0 0; opacity: 1; }
`;

export const BG_STYLES: Record<string, ReturnType<typeof css>> = {
    /* 협곡의 밤 — 깊은 남색 */
    bg_night: css`
        color: #EAF0FA;
        background:
            radial-gradient(50% 120% at 85% 0%, rgba(200, 214, 240, 0.16), transparent 55%),
            linear-gradient(120deg, #1E2436, #2A3450);
    `,
    /* 전장의 연기 — 잿빛 */
    bg_smoke: css`
        color: #ECEDEF;
        background:
            radial-gradient(70% 140% at 30% 30%, rgba(255, 255, 255, 0.08), transparent 60%),
            linear-gradient(140deg, #2B2E36, #1E2128);
    `,
    /* 골드 광산 — 금맥 광택 */
    bg_gold_mine: css`
        color: #F2E8CF;
        background:
            linear-gradient(115deg, transparent 40%, rgba(232, 206, 147, 0.22) 50%, transparent 60%),
            linear-gradient(140deg, #4A3A22, #32281A);
        background-size: 250% 100%, auto;
        animation: ${bgFlow} 7s linear infinite;
    `,
    /* 벚꽃길 — 해 질 녘 분홍 */
    bg_sakura_road: css`
        color: #3B2430;
        background:
            radial-gradient(60% 120% at 25% 20%, rgba(255, 200, 214, 0.9), transparent 62%),
            radial-gradient(50% 100% at 78% 80%, rgba(255, 170, 195, 0.7), transparent 60%),
            linear-gradient(120deg, #FBE3EA, #F3CBD8);
    `,
    /* 심해 — 빛이 닿지 않는 검푸른 바닷속 (수면에서 내려오는 광선) */
    bg_ocean: css`
        color: #DDEBF5;
        background:
            linear-gradient(102deg, transparent 18%, rgba(150, 220, 255, 0.10) 22%, transparent 27%),
            linear-gradient(96deg, transparent 52%, rgba(150, 220, 255, 0.08) 56%, transparent 61%),
            radial-gradient(80% 120% at 30% -10%, rgba(90, 180, 220, 0.25), transparent 60%),
            linear-gradient(160deg, #0A2A3D, #04141F 70%, #020A11);
    `,
    /* 용암 지대 — 갈라진 지각 사이로 마그마가 흐른다 */
    bg_lava: css`
        color: #FFE9E0;
        background:
            radial-gradient(60% 180% at 20% 110%, rgba(255, 140, 40, 0.55), transparent 55%),
            radial-gradient(50% 160% at 72% 120%, rgba(255, 90, 20, 0.5), transparent 55%),
            linear-gradient(160deg, #3A1108, #200A05);
        background-size: 160% 160%, 160% 160%, auto;
        animation: ${magmaFlow} 6s ease-in-out infinite;
        box-shadow: inset 0 -6px 14px -6px rgba(255, 120, 40, 0.7);
    `,
    /* 성운 — 보랏빛 우주 */
    bg_nebula: css`
        color: #EFE9F7;
        background:
            radial-gradient(1px 1px at 22% 32%, rgba(255, 255, 255, 0.8) 50%, transparent 51%),
            radial-gradient(1px 1px at 68% 62%, rgba(255, 255, 255, 0.6) 50%, transparent 51%),
            linear-gradient(140deg, #3A2E52, #241C36);
    `,
};

/* ===================== FrameLayer (GSAP 물리 기반 연출) ===================== */

const reducedMotion = () =>
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/*
 * 안개 — 실제 안개처럼 옆으로 천천히 흘러간다.
 * 각 덩이는 납작하게 눌린 채 저마다의 속도로 지나가고, 가장자리 마스크에서 자연히 옅어진다.
 */
const FogFx = () => {
    const ref = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        const host = ref.current;
        if (!host || reducedMotion()) return;
        const ctx = gsap.context(() => {
            Array.from(host.children).forEach((node, i) => {
                const wisp = node as HTMLElement;
                const w = () => (host.clientWidth || 120);
                gsap.timeline({ repeat: -1, repeatRefresh: true, delay: i * 2.3 })
                    .fromTo(wisp,
                        {
                            x: () => -w() * 0.5,
                            y: () => gsap.utils.random(-4, 8),
                            scaleX: () => gsap.utils.random(1.3, 2.1),
                            scaleY: () => gsap.utils.random(0.5, 0.9),
                            opacity: () => gsap.utils.random(0.55, 0.85),
                        },
                        {
                            x: () => w() * 1.2,
                            y: () => gsap.utils.random(-6, 6),
                            duration: () => gsap.utils.random(7, 13),
                            ease: 'none',
                        });
            });
        }, host);
        return () => ctx.revert();
    }, []);
    return (
        <EdgeFadeHost ref={ref} $axis="x" aria-hidden>
            <i className="wisp" /><i className="wisp" /><i className="wisp" />
        </EdgeFadeHost>
    );
};

/*
 * 눈 — 실제 눈송이처럼 좌우로 살랑이며 떨어진다.
 * 낙하(등속)와 흔들림(사인)을 분리해 크기·속도·진폭이 전부 제각각.
 */
const SnowFx = () => {
    const ref = useRef<HTMLSpanElement>(null);
    const flakes = useMemo(() => Array.from({ length: 7 }, () => ({
        left: 5 + Math.random() * 90,
        size: 2.5 + Math.random() * 2.5,
    })), []);
    useEffect(() => {
        const host = ref.current;
        if (!host || reducedMotion()) return;
        const ctx = gsap.context(() => {
            Array.from(host.children).forEach(node => {
                const f = node as HTMLElement;
                const h = () => (host.clientHeight || 40) + 16;
                gsap.fromTo(f, { y: -10 }, {
                    y: () => h(),
                    duration: () => gsap.utils.random(3.2, 6.5),
                    delay: () => gsap.utils.random(0, 3),
                    ease: 'none',
                    repeat: -1,
                    repeatRefresh: true,
                });
                gsap.to(f, {
                    x: () => gsap.utils.random(5, 13),
                    duration: () => gsap.utils.random(0.8, 1.5),
                    ease: 'sine.inOut',
                    yoyo: true,
                    repeat: -1,
                });
            });
        }, host);
        return () => ctx.revert();
    }, []);
    return (
        <EdgeFadeHost ref={ref} $axis="y" aria-hidden>
            {flakes.map((f, i) => (
                <i key={i} className="flake" style={{ left: `${f.left}%`, width: f.size, height: f.size }} />
            ))}
        </EdgeFadeHost>
    );
};

/*
 * 불티 — 실제 불티처럼 뜨겁게 솟았다가 흔들리며 사그라든다.
 * 초반에 빠르게 떠오르고(감속), 좌우로 요동치며, 밝기가 가늘게 떨린다.
 */
const EmberFx = () => {
    const ref = useRef<HTMLSpanElement>(null);
    const embers = useMemo(() => Array.from({ length: 6 }, () => ({
        left: 8 + Math.random() * 84,
        size: 3 + Math.random() * 2.5,
    })), []);
    useEffect(() => {
        const host = ref.current;
        if (!host || reducedMotion()) return;
        const ctx = gsap.context(() => {
            Array.from(host.children).forEach(node => {
                const e = node as HTMLElement;
                const h = () => (host.clientHeight || 40) + 14;
                gsap.fromTo(e, { y: 6, scale: 1 }, {
                    y: () => -h(),
                    scale: 0.25,
                    duration: () => gsap.utils.random(1.3, 2.4),
                    delay: () => gsap.utils.random(0, 1.6),
                    ease: 'power1.out',
                    repeat: -1,
                    repeatRefresh: true,
                });
                gsap.to(e, {
                    x: () => gsap.utils.random(-7, 7),
                    duration: () => gsap.utils.random(0.25, 0.5),
                    ease: 'sine.inOut',
                    yoyo: true,
                    repeat: -1,
                    repeatRefresh: true,
                });
                gsap.to(e, {
                    opacity: () => gsap.utils.random(0.5, 1),
                    duration: 0.12,
                    ease: 'none',
                    yoyo: true,
                    repeat: -1,
                });
            });
        }, host);
        return () => ctx.revert();
    }, []);
    return (
        <EdgeFadeHost ref={ref} $axis="y" aria-hidden>
            {embers.map((e, i) => (
                <i key={i} className="ember" style={{ left: `${e.left}%`, width: e.size, height: e.size }} />
            ))}
        </EdgeFadeHost>
    );
};

/*
 * 꽃잎 — 실제 벚꽃잎처럼 팔랑인다.
 * 넓게 흔들리는 진자 운동 + 지면과 나란히 뒤집히는 플러터 + 느린 낙하.
 */
const PetalFx = () => {
    const ref = useRef<HTMLSpanElement>(null);
    const petals = useMemo(() => Array.from({ length: 6 }, () => ({
        left: 4 + Math.random() * 88,
    })), []);
    useEffect(() => {
        const host = ref.current;
        if (!host || reducedMotion()) return;
        const ctx = gsap.context(() => {
            Array.from(host.children).forEach(node => {
                const pt = node as HTMLElement;
                const h = () => (host.clientHeight || 40) + 16;
                gsap.fromTo(pt, { y: -10, rotation: () => gsap.utils.random(0, 360) }, {
                    y: () => h(),
                    rotation: () => `+=${gsap.utils.random(120, 300)}`,
                    duration: () => gsap.utils.random(4, 7.5),
                    delay: () => gsap.utils.random(0, 3.5),
                    ease: 'none',
                    repeat: -1,
                    repeatRefresh: true,
                });
                gsap.to(pt, {
                    x: () => gsap.utils.random(10, 20),
                    duration: () => gsap.utils.random(0.9, 1.5),
                    ease: 'sine.inOut',
                    yoyo: true,
                    repeat: -1,
                });
                gsap.to(pt, {
                    scaleY: 0.35,
                    duration: () => gsap.utils.random(0.35, 0.6),
                    ease: 'sine.inOut',
                    yoyo: true,
                    repeat: -1,
                });
            });
        }, host);
        return () => ctx.revert();
    }, []);
    return (
        <EdgeFadeHost ref={ref} $axis="y" aria-hidden>
            {petals.map((f, i) => <i key={i} className="petal" style={{ left: `${f.left}%` }} />)}
        </EdgeFadeHost>
    );
};

/*
 * 번개 — 실제 낙뢰처럼 친다.
 * 매번 다른 위치에서 다른 지그재그 경로가 생성되고, 본줄기 + 가지가
 * 몇 번 되받아치듯(리턴 스트로크) 번쩍인 뒤 잔광을 남기고 사라진다.
 */
const BoltFx = () => {
    const ref = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        const host = ref.current;
        if (!host || reducedMotion()) return;
        const svg = host.querySelector('svg') as SVGSVGElement | null;
        const main = host.querySelector('.bolt-main') as SVGPolylineElement | null;
        const branch = host.querySelector('.bolt-branch') as SVGPolylineElement | null;
        const glow = host.querySelector('.bolt-glow') as HTMLElement | null;
        if (!svg || !main || !branch || !glow) return;

        let call: gsap.core.Tween | null = null;
        const strike = () => {
            const w = host.clientWidth || 120;
            const h = host.clientHeight || 34;
            svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

            // 본줄기 — 위에서 아래로, 계단식 지그재그
            let x = gsap.utils.random(w * 0.15, w * 0.85);
            let y = -3;
            const pts: string[] = [`${x},${y}`];
            const steps = 4 + Math.floor(Math.random() * 3);
            for (let i = 0; i < steps; i += 1) {
                x = gsap.utils.clamp(4, w - 4, x + gsap.utils.random(-w * 0.16, w * 0.16));
                y += (h + 6) / steps;
                pts.push(`${x},${y}`);
            }
            main.setAttribute('points', pts.join(' '));

            // 가지 — 본줄기 중간에서 짧게 갈라진다
            const [bx, by] = pts[Math.floor(pts.length / 2)].split(',').map(Number);
            const dir = Math.random() < 0.5 ? -1 : 1;
            branch.setAttribute('points', [
                `${bx},${by}`,
                `${bx + dir * gsap.utils.random(6, 14)},${by + gsap.utils.random(3, 7)}`,
                `${bx + dir * gsap.utils.random(12, 22)},${by + gsap.utils.random(8, 14)}`,
            ].join(' '));
            glow.style.left = `${(bx / w) * 100}%`;

            // 리턴 스트로크: 확 밝아졌다 → 살짝 죽었다 → 다시 번쩍 → 잔광
            gsap.timeline()
                .set([main, branch], { opacity: 0 })
                .to([main, branch], { opacity: 1, duration: 0.02 })
                .to([main, branch], { opacity: 0.25, duration: 0.05 })
                .to([main, branch], { opacity: 1, duration: 0.02 })
                .to([main, branch], { opacity: 0.15, duration: 0.06 })
                .to([main, branch], { opacity: 0.8, duration: 0.03 })
                .to([main, branch], { opacity: 0, duration: 0.22, ease: 'power2.out' });
            gsap.timeline()
                .set(glow, { opacity: 0 })
                .to(glow, { opacity: 0.85, duration: 0.04 })
                .to(glow, { opacity: 0, duration: 0.4, ease: 'power2.out' });

            call = gsap.delayedCall(gsap.utils.random(1.2, 3.6), strike);
        };
        call = gsap.delayedCall(gsap.utils.random(0.3, 1.2), strike);
        return () => { call?.kill(); gsap.killTweensOf([main, branch, glow]); };
    }, []);
    return (
        <BoltHost ref={ref} aria-hidden>
            <i className="bolt-glow" />
            <svg preserveAspectRatio="none">
                <polyline className="bolt-branch" fill="none" stroke="#C9A4FF" strokeWidth="1.1" strokeLinejoin="round" opacity="0" />
                <polyline className="bolt-main" fill="none" stroke="#E9DBFF" strokeWidth="1.7" strokeLinejoin="round" opacity="0" />
            </svg>
        </BoltHost>
    );
};

/*
 * 공허의 눈 — 실제 눈처럼 움직인다.
 * 동공이 이따금 빠르게 다른 곳을 향하고(단속 운동), 가끔 깜빡인다.
 */
const VoidEyeFx = () => {
    const ref = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        const host = ref.current;
        if (!host || reducedMotion()) return;
        const pupil = host.querySelector('.fx-pupil') as HTMLElement | null;
        if (!pupil) return;
        let call: gsap.core.Tween | null = null;
        const look = () => {
            gsap.to(pupil, {
                x: gsap.utils.random(-5, 5),
                y: gsap.utils.random(-1, 1.5),
                duration: 0.09,
                ease: 'power3.out',
            });
            call = gsap.delayedCall(gsap.utils.random(0.5, 2.4), look);
        };
        call = gsap.delayedCall(0.8, look);
        return () => { call?.kill(); gsap.killTweensOf(pupil); };
    }, []);
    return (
        <FxHost ref={ref} aria-hidden>
            <i className="fx-eye-glow" />
            <i className="fx-eye"><i className="fx-pupil" /></i>
        </FxHost>
    );
};

/*
 * 바론 오라 — 보랏빛 김이 바닥에서 피어올라 위에서 흩어진다.
 * 컨테이너 안(overflow hidden)에서만 일어나 이름 밖으로 새지 않는다.
 */
const AuraFx = () => {
    const ref = useRef<HTMLSpanElement>(null);
    const puffs = useMemo(() => Array.from({ length: 5 }, () => ({
        left: 8 + Math.random() * 80,
        size: 12 + Math.random() * 12,
    })), []);
    useEffect(() => {
        const host = ref.current;
        if (!host || reducedMotion()) return;
        const ctx = gsap.context(() => {
            host.querySelectorAll('.aura-puff').forEach(node => {
                const puff = node as HTMLElement;
                const h = () => (host.clientHeight || 40) + 24;
                gsap.fromTo(puff, { y: 10, scale: 0.6 }, {
                    y: () => -h(),
                    scale: () => gsap.utils.random(1.05, 1.4),
                    duration: () => gsap.utils.random(2.2, 4),
                    delay: () => gsap.utils.random(0, 2.4),
                    ease: 'sine.out',
                    repeat: -1,
                    repeatRefresh: true,
                });
                gsap.to(puff, {
                    x: () => gsap.utils.random(-6, 6),
                    duration: () => gsap.utils.random(0.9, 1.6),
                    ease: 'sine.inOut',
                    yoyo: true,
                    repeat: -1,
                });
            });
        }, host);
        return () => ctx.revert();
    }, []);
    return (
        <EdgeFadeHost ref={ref} $axis="y" aria-hidden>
            <i className="aura-base" />
            {puffs.map((f, i) => (
                <i key={i} className="aura-puff" style={{ left: `${f.left}%`, width: f.size, height: f.size }} />
            ))}
        </EdgeFadeHost>
    );
};

/*
 * 포로의 숨결 — 롤 포로처럼 귀엽게.
 * 흰 털뭉치가 테두리를 복슬복슬 감싸고, 위에는 작은 뿔 두 개,
 * 아래 가운데에서 분홍 혓바닥이 이따금 낼름거린다.
 */
const PoroFx = () => (
    <FxHost aria-hidden>
        <i className="poro-horn l" />
        <i className="poro-horn r" />
        <i className="poro-tongue" />
    </FxHost>
);

/**
 * 프레임별 추가 레이어.
 * 상점 미리보기에서는 렌더하지 않아 "간략한 테두리"만 보인다.
 */
export const FrameLayer = ({ frame }: { frame?: string | null }) => {
    if (!frame) return null;

    switch (frame) {
        case 'frame_shadow': return <FogFx />;
        case 'frame_pixel': return <FxHost aria-hidden><span className="fx-pac" /></FxHost>;
        case 'frame_fire': return <EmberFx />;
        case 'frame_ice': return <SnowFx />;
        case 'frame_poro': return <PoroFx />;
        case 'frame_baron': return <AuraFx />;
        case 'frame_money':
            return (
                <FxHost aria-hidden>
                    {[0, 1, 2].map(i => (
                        <i key={i} className="fx-chip" style={{
                            left: i === 0 ? '-6px' : i === 1 ? '50%' : 'auto',
                            right: i === 2 ? '-6px' : 'auto',
                            top: i === 1 ? '-8px' : '50%',
                            transform: i === 1 ? 'translateX(-50%)' : 'translateY(-50%)',
                            animationDelay: `${i * 0.4}s`,
                        }} />
                    ))}
                </FxHost>
            );
        case 'frame_sakura': return <PetalFx />;
        case 'frame_lightning': return <BoltFx />;
        case 'frame_void': return <VoidEyeFx />;
        default: return null;
    }
};

/* ===================== 레이어 스타일 ===================== */

/** 파티클이 가장자리에서 자연히 옅어지는 마스크 호스트 */
const EdgeFadeHost = styled.span.attrs({ 'data-fx': '' } as Record<string, string>)<{ $axis: 'x' | 'y' }>`
    position: absolute;
    inset: 0;
    overflow: hidden;
    border-radius: inherit;
    pointer-events: none;
    -webkit-mask-image: ${({ $axis }) => ($axis === 'x'
        ? 'linear-gradient(90deg, transparent, #000 16%, #000 84%, transparent)'
        : 'linear-gradient(180deg, transparent, #000 20%, #000 80%, transparent)')};
    mask-image: ${({ $axis }) => ($axis === 'x'
        ? 'linear-gradient(90deg, transparent, #000 16%, #000 84%, transparent)'
        : 'linear-gradient(180deg, transparent, #000 20%, #000 80%, transparent)')};

    .wisp {
        position: absolute;
        left: 0;
        top: 8%;
        width: 72%;
        height: 84%;
        border-radius: 50%;
        background: radial-gradient(50% 60% at 50% 50%, rgba(0, 0, 0, 0.92), rgba(0, 0, 0, 0) 70%);
        filter: blur(6px);
    }
    .flake {
        position: absolute;
        top: -8px;
        border-radius: 50%;
        background: #FFFFFF;
        box-shadow: 0 0 4px rgba(220, 245, 255, 0.9);
    }
    .ember {
        position: absolute;
        bottom: -4px;
        border-radius: 50%;
        background: radial-gradient(circle, #FFD9A0, #E25822 70%);
        box-shadow: 0 0 5px rgba(255, 140, 60, 0.9);
    }
    /* 바론 — 피어오르는 보라 김 + 바닥 발광 */
    .aura-puff {
        position: absolute;
        bottom: -8px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(164, 107, 255, 0.7), rgba(142, 91, 255, 0) 72%);
        filter: blur(4px);
    }
    .aura-base {
        position: absolute;
        left: 4%;
        right: 4%;
        bottom: -4px;
        height: 10px;
        border-radius: 50%;
        background: radial-gradient(50% 100% at 50% 100%, rgba(142, 91, 255, 0.55), transparent 75%);
        filter: blur(5px);
        opacity: 0.8;
        transition: opacity 0.25s ease;
    }

    .petal {
        position: absolute;
        top: -8px;
        width: 7px;
        height: 5px;
        border-radius: 62% 8% 62% 8%;
        background: linear-gradient(140deg, #FFD9E4, #FF9BB8);
        box-shadow: 0 0 3px rgba(255, 155, 184, 0.5);
    }
`;

/** 번개 호스트 — 살짝 위아래로 튀어나와 하늘에서 꽂히는 느낌 */
const BoltHost = styled.span.attrs({ 'data-fx': '' } as Record<string, string>)`
    position: absolute;
    inset: -5px -2px;
    pointer-events: none;
    overflow: visible;

    svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
    .bolt-main { filter: drop-shadow(0 0 4px #B07BFF) drop-shadow(0 0 10px #8E5BFF); }
    .bolt-branch { filter: drop-shadow(0 0 3px #8E5BFF); }
    .bolt-glow {
        position: absolute;
        top: -8px;
        width: 46px;
        height: 30px;
        margin-left: -23px;
        border-radius: 50%;
        background: radial-gradient(closest-side, rgba(176, 123, 255, 0.8), transparent 75%);
        filter: blur(6px);
        opacity: 0;
    }
`;

const FxHost = styled.span.attrs({ 'data-fx': '' } as Record<string, string>)`
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: visible;
    border-radius: inherit;

    /* 픽셀 — 팩맨 */
    .fx-pac {
        position: absolute;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #FFE066;
        box-shadow: 0 0 6px rgba(255, 224, 102, 0.8);
        animation: ${pacRun} 5s linear infinite, ${pacChomp} 0.3s steps(2) infinite;
        z-index: 2;
    }

    /* 포로 — 털뭉치·뿔·혓바닥 */
    .poro-horn {
        position: absolute;
        top: -10px;
        width: 7px;
        height: 11px;
        background: linear-gradient(180deg, #B9906B, #7E5A3C);
        border: 1px solid #5E4128;
        z-index: 2;
    }
    .poro-horn.l { left: 22%; border-radius: 90% 30% 40% 40%; transform: rotate(-14deg); }
    .poro-horn.r { right: 22%; border-radius: 30% 90% 40% 40%; transform: rotate(14deg); }
    .poro-tongue {
        position: absolute;
        bottom: -9px;
        left: 50%;
        width: 9px;
        height: 12px;
        transform-origin: top center;
        background: linear-gradient(180deg, #FF9FB4, #F06A8A);
        border: 1px solid #D94F72;
        border-radius: 3px 3px 60% 60%;
        animation: ${poroLick} 5.5s ease-in-out infinite;
        z-index: 2;

        &::after {
            content: '';
            position: absolute;
            left: 50%;
            top: 2px;
            bottom: 2px;
            width: 1px;
            background: rgba(217, 79, 114, 0.65);
        }
    }

    /* 부 — 카지노 칩 */
    .fx-chip {
        position: absolute;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: repeating-conic-gradient(${GOLD_LIGHT} 0deg 22deg, ${GOLD_DARK} 22deg 44deg);
        border: 2px solid ${GOLD_MID};
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5), inset 0 0 0 2px rgba(255, 255, 255, 0.35);
        animation: ${chipSpin} 2.4s linear infinite;
        z-index: 2;
    }

    /* 공허 — 눈동자 */
    .fx-eye {
        position: absolute;
        top: -5px;
        left: 50%;
        transform: translateX(-50%);
        width: 24px;
        height: 12px;
        border-radius: 50%;
        overflow: hidden;
        background: radial-gradient(circle at 50% 50%, #1A0B2E 0 100%);
        border: 1px solid rgba(164, 107, 255, 0.6);
        box-shadow: 0 0 10px rgba(164, 107, 255, 0.85);
        animation: ${eyeGlow} 5s ease-in-out infinite;
        transition: transform 0.25s ease;
        z-index: 2;
    }
    .fx-pupil {
        position: absolute;
        left: 50%;
        top: 50%;
        width: 9px;
        height: 9px;
        margin: -4.5px 0 0 -4.5px;
        border-radius: 50%;
        background: radial-gradient(circle at 42% 38%, #F0E4FF 0 22%, #A46BFF 24% 55%, #4A1F80 60% 100%);
        box-shadow: 0 0 5px rgba(164, 107, 255, 1);
    }
    .fx-eye-glow {
        position: absolute;
        top: -14px;
        left: 50%;
        transform: translateX(-50%);
        width: 54px;
        height: 26px;
        border-radius: 50%;
        background: radial-gradient(closest-side, rgba(164, 107, 255, 0.7), transparent 75%);
        filter: blur(5px);
        animation: ${eyeAura} 3s ease-in-out infinite;
        opacity: 0.6;
        transition: opacity 0.25s ease;
    }

    @media (prefers-reduced-motion: reduce) {
        * { animation: none !important; }
    }
`;

/** 날개는 컨테이너 바깥으로 나가므로 별도 호스트 */
/* ===================== 공개 API ===================== */

export const NameFrame = styled.span<{ $frame?: string | null }>`
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.1rem 0.5rem;
    border: 2px solid transparent;
    border-radius: var(--radius-sm);
    font-weight: 700;
    max-width: 100%;
    white-space: nowrap;

    ${({ $frame }) => ($frame && FRAME_STYLES[$frame]) || ''}
`;

export const hasFrameStyle = (id: string | null | undefined): boolean =>
    Boolean(id && FRAME_STYLES[id]);

/**
 * 배경 장식이 적용되는지 여부.
 * 배경마다 밝기가 달라 글자색을 스스로 정하므로, 강조 색(크림)을 쓰던 곳은
 * 배경이 있을 때 색을 상속해야 밝은 배경에서도 읽힌다.
 */
export const hasBgStyle = (id: string | null | undefined): boolean =>
    Boolean(id && BG_STYLES[id]);

/**
 * 컨테이너에 배경 장식 + 테두리 장식을 함께 입힌다.
 * 화려한 연출은 자식으로 <FrameLayer frame={...} /> 를 넣어야 재생된다.
 */
export const decorate = (frame?: string | null, bg?: string | null) => css`
    position: relative;
    ${(bg && BG_STYLES[bg]) || ''}
    ${(frame && FRAME_STYLES[frame]) || ''}
`;
