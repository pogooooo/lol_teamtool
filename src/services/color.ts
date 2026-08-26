/*
 * 색 계산 유틸.
 *
 * CSS의 color-mix()를 쓰면 편하지만, 팀 화면을 이미지로 복사할 때 쓰는 html2canvas가
 * 이 함수를 파싱하지 못해 캡처가 통째로 실패한다("unsupported color function").
 * 그래서 캡처 영역에 들어가는 색은 여기서 미리 계산해 rgb/rgba 문자열로 넘긴다.
 */

const parseHex = (hex: string): [number, number, number] => {
    const h = hex.replace('#', '').trim();
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    return [
        parseInt(full.slice(0, 2), 16),
        parseInt(full.slice(2, 4), 16),
        parseInt(full.slice(4, 6), 16),
    ];
};

/** hex 색에 투명도를 입힌 rgba 문자열 */
export const withAlpha = (hex: string, alpha: number): string => {
    const [r, g, b] = parseHex(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/** 두 hex 색을 섞는다 — ratio는 첫 번째 색의 비중(0~1) */
export const mixHex = (a: string, b: string, ratio: number): string => {
    const [r1, g1, b1] = parseHex(a);
    const [r2, g2, b2] = parseHex(b);
    const t = Math.max(0, Math.min(1, ratio));
    const mix = (x: number, y: number) => Math.round(x * t + y * (1 - t));
    return `rgb(${mix(r1, r2)}, ${mix(g1, g2)}, ${mix(b1, b2)})`;
};
