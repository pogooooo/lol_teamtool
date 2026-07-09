import { useCallback, useEffect, useState } from 'react';
import type { Group, GroupPlayer, MatchRecord, RiotAccount } from '../types';
import * as api from '../services/api';
import type { GroupStats } from '../services/api';

const ACTIVE_KEY = 'lol_teamtool:activeGroupId';

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * 내전 기록 상태 — 데이터는 로컬 API 서버(SQLite)가 원본.
 * 요약 통계(내전 수/최다 출전/최근 내전)도 서버 집계(/stats)를 그대로 출력한다.
 */
export const useArchive = () => {
    const [serverOk, setServerOk] = useState<boolean | null>(null);
    const [riotReady, setRiotReady] = useState(false);
    const [groups, setGroups] = useState<Group[]>([]);
    const [activeGroupId, setActiveGroupId] = useState<string | null>(() => localStorage.getItem(ACTIVE_KEY));
    const [players, setPlayers] = useState<GroupPlayer[]>([]);
    const [accounts, setAccounts] = useState<RiotAccount[]>([]);
    const [matches, setMatches] = useState<MatchRecord[]>([]);
    const [stats, setStats] = useState<GroupStats | null>(null);

    const refreshGroups = useCallback(async () => {
        setGroups(await api.listGroups());
    }, []);

    const refreshGroupData = useCallback(async (groupId: string) => {
        const [roster, matchList, groupStats] = await Promise.all([
            api.getRoster(groupId),
            api.listMatches(groupId),
            api.getStats(groupId),
        ]);
        setPlayers(roster.players);
        setAccounts(roster.accounts);
        setMatches(matchList);
        setStats(groupStats);
    }, []);

    useEffect(() => {
        (async () => {
            try {
                const h = await api.health();
                setServerOk(h.ok);
                setRiotReady(h.riotKeyConfigured);
                await refreshGroups();
                if (activeGroupId) await refreshGroupData(activeGroupId);
            } catch {
                setServerOk(false);
            }
        })();
        // 초기 1회 로드
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const activate = (groupId: string | null) => {
        setActiveGroupId(groupId);
        if (groupId) localStorage.setItem(ACTIVE_KEY, groupId);
        else localStorage.removeItem(ACTIVE_KEY);
        if (groupId) refreshGroupData(groupId).catch(() => setServerOk(false));
        else {
            setPlayers([]);
            setAccounts([]);
            setMatches([]);
            setStats(null);
        }
    };

    const run = async (action: () => Promise<unknown>): Promise<ActionResult> => {
        try {
            await action();
            await refreshGroups();
            if (activeGroupId) await refreshGroupData(activeGroupId);
            return { ok: true };
        } catch (e) {
            return { ok: false, error: api.errorMessage(e) };
        }
    };

    const createGroup = async (name: string): Promise<ActionResult> => {
        try {
            const group = await api.createGroup(name);
            await refreshGroups();
            activate(group.id);
            return { ok: true };
        } catch (e) {
            return { ok: false, error: api.errorMessage(e) };
        }
    };

    const joinGroup = async (code: string): Promise<ActionResult> => {
        try {
            const group = await api.joinGroup(code);
            await refreshGroups();
            activate(group.id);
            return { ok: true };
        } catch (e) {
            return { ok: false, error: api.errorMessage(e) };
        }
    };

    /** 그룹 나가기 — 마지막 멤버가 나가면 서버가 그룹 데이터를 삭제한다 */
    const leaveGroup = async (groupId: string): Promise<ActionResult> => {
        try {
            await api.leaveGroup(groupId);
            if (activeGroupId === groupId) activate(null);
            await refreshGroups();
            return { ok: true };
        } catch (e) {
            return { ok: false, error: api.errorMessage(e) };
        }
    };

    const activeGroup = groups.find(g => g.id === activeGroupId) ?? null;

    return {
        serverOk,
        riotReady,
        groups,
        activeGroup,
        players,
        accounts,
        matches,
        stats,
        createGroup,
        joinGroup,
        leaveGroup,
        selectGroup: (groupId: string) => activate(groupId),
        closeGroup: () => activate(null),
        addPlayer: (displayName: string) =>
            run(() => activeGroupId ? api.addPlayer(activeGroupId, displayName) : Promise.resolve()),
        removePlayer: (playerId: string) => run(() => api.removePlayer(playerId)),
        addAccount: (playerId: string, gameName: string, tagLine: string) =>
            run(() => api.addAccount(playerId, gameName, tagLine)),
        removeAccount: (accountId: string) => run(() => api.removeAccount(accountId)),
        setPrimaryAccount: (accountId: string) => run(() => api.setPrimaryAccount(accountId)),
        importMatches: (records: MatchRecord[]) =>
            run(async () => {
                if (!activeGroupId) return;
                for (const record of records) await api.postMatch(activeGroupId, record);
            }),
        deleteMatch: (matchId: string) => run(() => api.deleteMatch(matchId)),
        /** 외부(토너먼트 패널 등)에서 수집 후 목록/통계를 다시 불러올 때 사용 */
        refresh: () =>
            activeGroupId ? refreshGroupData(activeGroupId).catch(() => setServerOk(false)) : Promise.resolve(),
    };
};

export type Archive = ReturnType<typeof useArchive>;
