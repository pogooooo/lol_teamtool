import { useEffect, useState } from 'react';
import axios from 'axios';
import { CHAMPION_NAMES_KO } from './championNamesKo';

/*
 * 게임 에셋(챔피언/아이템 한글 이름) 로더.
 * 브라우저가 CDN에 직접 붙지 않고 로컬 API 서버 프록시(/api/assets/*)를 사용한다
 * — 네트워크/DNS/광고차단기 영향 제거. 이미지 URL도 같은 프록시를 쓴다 (GameIcons.tsx).
 * 서버·CDN이 모두 불가한 경우 내장 정적 맵(championNamesKo.ts)으로 동작한다.
 */

export interface GameAssets {
    champNames: Record<string, string>;
    /** 숫자 챔피언 ID → 영문 ID (밴 목록 아이콘용) */
    champKeys: Record<string, string>;
    itemNames: Record<string, string>;
    /** 룬/룬 스타일 ID → 한글 이름 */
    runeNames: Record<string, string>;
    /** 소환사 주문 ID → 한글 이름 */
    spellNames: Record<string, string>;
}

const baseAssets: GameAssets = { champNames: { ...CHAMPION_NAMES_KO }, champKeys: {}, itemNames: {}, runeNames: {}, spellNames: {} };
let memo: GameAssets = baseAssets;
let assetsPromise: Promise<GameAssets> | null = null;

const loadAssets = async (): Promise<GameAssets> => {
    const { data } = await axios.get<{
        version: string | null;
        champNames: Record<string, string>;
        champKeys: Record<string, string>;
        itemNames: Record<string, string>;
        runeNames: Record<string, string>;
        spellNames: Record<string, string>;
    }>('/api/assets/meta?v=2', { timeout: 15000 });
    return {
        champNames: { ...CHAMPION_NAMES_KO, ...data.champNames },
        champKeys: data.champKeys ?? {},
        itemNames: data.itemNames,
        runeNames: data.runeNames ?? {},
        spellNames: data.spellNames ?? {},
    };
};

/** 챔피언/아이템 한글 이름 맵. 서버 연결 전에는 내장 맵으로 동작한다. */
export const useGameAssets = (): GameAssets => {
    const [assets, setAssets] = useState<GameAssets>(memo);

    useEffect(() => {
        if (!assetsPromise) {
            assetsPromise = loadAssets()
                .then(loaded => { memo = loaded; return loaded; })
                .catch(() => memo);
        }
        assetsPromise.then(a => setAssets(a));
    }, []);

    return assets;
};
