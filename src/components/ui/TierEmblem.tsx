import type { Tier } from '../../types';
import { TIER_META } from '../../constants';

/*
 * 티어 엠블럼 — 라이엇 공식 에셋이 아닌 자체 디자인(날개 + 보석 휘장).
 * 티어별로 색만 바꿔 통일된 실루엣을 유지한다. 인라인 SVG라 팀 화면 복사에도 함께 캡처된다.
 */
export const TierEmblem = ({ tier, size = 22 }: { tier: Tier; size?: number }) => {
    const { color, glow } = TIER_META[tier];
    return (
        <svg
            width={size * 1.3}
            height={size}
            viewBox="0 0 44 34"
            fill="none"
            aria-hidden
            style={{ display: 'block', flexShrink: 0 }}
        >
            {/* 좌우 날개 (깃털 실루엣) */}
            <path d="M22 22 L7 10 L11 14 L6 14 L13 18 L9 19 L22 26 Z" fill={color} opacity="0.92" />
            <path d="M22 22 L37 10 L33 14 L38 14 L31 18 L35 19 L22 26 Z" fill={color} opacity="0.92" />
            {/* 중앙 보석 (다이아몬드) */}
            <path d="M22 4 L29 14 L22 24 L15 14 Z" fill={glow} stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
            {/* 하이라이트 */}
            <path d="M22 4 L25.5 9 L22 14 L18.5 9 Z" fill="#FFFFFF" opacity="0.45" />
            <circle cx="22" cy="14" r="1.6" fill="#FFFFFF" opacity="0.85" />
        </svg>
    );
};
