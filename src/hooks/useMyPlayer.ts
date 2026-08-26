import { useEffect, useState } from 'react';

/*
 * "이 그룹에서 나는 누구인가" 기록.
 * 같은 이름을 쓰는 사람이 여럿일 수 있으므로 그룹별로 내 참가자(playerId)를 저장해 둔다.
 * 앞으로 포인트·출석·베팅이 이 값을 기준으로 내 것을 구분한다.
 */

const KEY = (groupId: string) => `lol_teamtool:me:${groupId}`;
const EVENT = 'lol_teamtool:myplayer';

export interface MyPlayer {
    playerId: string;
    displayName: string;
}

export const getMyPlayer = (groupId: string): MyPlayer | null => {
    try {
        const raw = localStorage.getItem(KEY(groupId));
        return raw ? (JSON.parse(raw) as MyPlayer) : null;
    } catch {
        return null;
    }
};

export const setMyPlayer = (groupId: string, me: MyPlayer | null) => {
    if (me) localStorage.setItem(KEY(groupId), JSON.stringify(me));
    else localStorage.removeItem(KEY(groupId));
    window.dispatchEvent(new Event(EVENT));
};

/** 현재 그룹에서의 내 참가자 — 없으면 null */
export const useMyPlayer = (groupId: string | null): MyPlayer | null => {
    const [me, setMe] = useState<MyPlayer | null>(() => (groupId ? getMyPlayer(groupId) : null));

    useEffect(() => {
        const sync = () => setMe(groupId ? getMyPlayer(groupId) : null);
        sync();
        window.addEventListener(EVENT, sync);
        window.addEventListener('storage', sync);
        return () => {
            window.removeEventListener(EVENT, sync);
            window.removeEventListener('storage', sync);
        };
    }, [groupId]);

    return me;
};
