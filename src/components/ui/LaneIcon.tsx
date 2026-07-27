import type { ReactElement } from 'react';
import type { Position } from '../../types';

/*
 * 라인(포지션) 아이콘 — 롤 클라이언트의 포지션 아이콘을 단순화한 인라인 SVG.
 * currentColor를 쓰므로 어디에 넣어도 주변 글자색을 따라간다 (CDN·광고차단기 영향 없음).
 */

const PATHS: Record<Position, ReactElement> = {
    탑: (
        <>
            <path d="M2 2h9L8 5H5v3l-3 3V2z" />
            <path d="M8 8h6v6H8l2.5-2.5H8V8z" opacity="0.45" />
        </>
    ),
    정글: (
        <>
            <path d="M8 1C5.8 4 5.4 8 8 15c2.6-7 2.2-11 0-14z" />
            <path d="M3.2 3.8c1.9 1.9 3 4 3.6 7C4.5 9.2 3.4 6.8 3.2 3.8z" opacity="0.75" />
            <path d="M12.8 3.8c-1.9 1.9-3 4-3.6 7 2.3-1.6 3.4-4 3.6-7z" opacity="0.75" />
        </>
    ),
    미드: (
        <>
            <path d="M11.5 2H14v2.5L4.5 14H2v-2.5L11.5 2z" />
            <path d="M2 2h6L2 8V2z" opacity="0.45" />
            <path d="M14 14H8l6-6v6z" opacity="0.45" />
        </>
    ),
    원딜: (
        <>
            <path d="M14 14H5l3-3h3V8l3-3v9z" />
            <path d="M8 8H2V2h6L5.5 4.5H8V8z" opacity="0.45" />
        </>
    ),
    서포터: (
        <path d="M8 1.5l5.5 2v4.3c0 3.4-2.2 5.8-5.5 6.9-3.3-1.1-5.5-3.5-5.5-6.9V3.5l5.5-2zm0 2.1L4.5 4.9v2.9c0 2.4 1.4 4.1 3.5 5 2.1-.9 3.5-2.6 3.5-5V4.9L8 3.6z" />
    ),
};

export const LaneIcon = ({ line, size = 13 }: { line: Position; size?: number }) => (
    <svg
        viewBox="0 0 16 16"
        width={size}
        height={size}
        fill="currentColor"
        aria-hidden
        style={{ flexShrink: 0, display: 'block' }}
    >
        {/* 공통 배경 플레이트 — 아이콘마다 잉크 위치가 달라도(탑=좌상단, 원딜=우하단)
            같은 크기의 사각 토큰으로 보이게 해 세로 위치가 들쭉날쭉해 보이지 않게 한다 */}
        <rect x="0.5" y="0.5" width="15" height="15" rx="3.5" opacity="0.16" />
        {PATHS[line]}
    </svg>
);
