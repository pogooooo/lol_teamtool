/*
 * 한글 초성 검색.
 * "ㅎㅈ"만 쳐도 "현정"이 걸리게 한다 — 내전 참가자는 이름이 짧아 초성이 가장 빠른 검색 수단이다.
 */

const CHO = [
    'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
    'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;
/** 한 초성이 담당하는 글자 수 (중성 21 × 종성 28) */
const CHO_SPAN = 588;

/** 문자열의 초성만 뽑는다. 한글이 아닌 글자는 그대로 둔다 */
export const initials = (text: string): string =>
    Array.from(text).map(ch => {
        const code = ch.charCodeAt(0);
        if (code < HANGUL_START || code > HANGUL_END) return ch;
        return CHO[Math.floor((code - HANGUL_START) / CHO_SPAN)];
    }).join('');

/** 검색어가 초성으로만 이루어졌는지 (ㄱ~ㅎ) */
const isChoseong = (text: string) => /^[ㄱ-ㅎ]+$/.test(text);

/**
 * 이름이 검색어에 걸리는지.
 *  · 초성만 입력했으면 이름의 초성과 맞춰 본다 ("ㅎㅈ" → 현정)
 *  · 아니면 글자 그대로 포함되는지 본다 (대소문자 무시)
 */
export const matchesQuery = (name: string, query: string): boolean => {
    const q = query.trim();
    if (!q) return true;
    if (isChoseong(q)) return initials(name).includes(q);
    return name.toLowerCase().includes(q.toLowerCase()) || initials(name).includes(q);
};
