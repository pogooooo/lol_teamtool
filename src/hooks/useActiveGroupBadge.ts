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

const ACTIVE_ID_KEY = 'lol_teamtool:activeGroupId';

/**
 * 그룹 전환 — id/name을 함께 바꾸고 전 화면에 알린다. null이면 오프라인(그룹 없이 사용).
 * useArchive는 마운트 시 이 값을 읽어 해당 그룹을 연다.
 */
export const setActiveGroup = (group: { id: string; name: string } | null) => {
    if (group) {
        localStorage.setItem(ACTIVE_ID_KEY, group.id);
        localStorage.setItem(NAME_KEY, group.name);
    } else {
        localStorage.removeItem(ACTIVE_ID_KEY);
        localStorage.removeItem(NAME_KEY);
    }
    window.dispatchEvent(new Event(EVENT));
};

/** 현재 선택된 그룹 ID — 팀 빌더처럼 useArchive 전체를 쓰지 않는 화면에서 가볍게 구독한다 */
export const useActiveGroupId = (): string | null => {
    const [id, setId] = useState<string | null>(() => localStorage.getItem(ACTIVE_ID_KEY));

    useEffect(() => {
        const sync = () => setId(localStorage.getItem(ACTIVE_ID_KEY));
        window.addEventListener(EVENT, sync);
        window.addEventListener('storage', sync);
        return () => {
            window.removeEventListener(EVENT, sync);
            window.removeEventListener('storage', sync);
        };
    }, []);

    return id;
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
