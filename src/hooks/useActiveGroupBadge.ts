import { useEffect, useState } from 'react';

/*
 * 현재 선택된 내전 기록 그룹 이름을 모든 화면(헤더)에서 보여주기 위한 공유 저장소.
 * useArchive 인스턴스는 탭마다 따로 뜨므로, 이름을 localStorage + 이벤트로 동기화한다.
 */

const NAME_KEY = 'lol_teamtool:activeGroupName';
const EVENT = 'lol_teamtool:groupbadge';

export const setActiveGroupBadge = (name: string | null) => {
    if (name) localStorage.setItem(NAME_KEY, name);
    else localStorage.removeItem(NAME_KEY);
    window.dispatchEvent(new Event(EVENT));
};

export const useActiveGroupBadge = (): string | null => {
    const [name, setName] = useState<string | null>(() => localStorage.getItem(NAME_KEY));

    useEffect(() => {
        const sync = () => setName(localStorage.getItem(NAME_KEY));
        window.addEventListener(EVENT, sync);
        window.addEventListener('storage', sync); // 다른 브라우저 탭과도 동기화
        return () => {
            window.removeEventListener(EVENT, sync);
            window.removeEventListener('storage', sync);
        };
    }, []);

    return name;
};
