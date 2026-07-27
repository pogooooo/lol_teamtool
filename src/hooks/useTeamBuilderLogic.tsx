import { useState, useEffect, useRef } from 'react';
import type * as React from 'react';
import constate from 'constate';
import { POSITIONS, OPERATORS } from '../constants';
import type { DraggedItem, DragTarget, LanesState, Player, Position, SlotKey, Tier } from '../types';

const initialLanes: LanesState = POSITIONS.reduce((acc, pos) => {
    acc[pos] = { name1: null, name2: null, temps: [], operator: '=' };
    return acc;
}, {} as LanesState);

interface ContextMenuState {
    visible: boolean;
    x: number;
    y: number;
    targetName: string | null;
}

const cloneLanes = (lanes: LanesState): LanesState => JSON.parse(JSON.stringify(lanes)) as LanesState;

// 새로고침해도 팀 빌더 상태(테마/참가자/배치)가 유지되도록 localStorage에 저장한다
const BUILDER_STORAGE = 'lol_teamtool:builder:v1';

// 최근에 팀 빌더에 사용한 이름 기록 — 최신순, 최대 30명
const RECENT_KEY = 'lol_teamtool:recentNames:v1';
const RECENT_MAX = 30;

const loadRecentNames = (): string[] => {
    try {
        const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
        return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    } catch {
        return [];
    }
};

interface SavedBuilderState {
    theme?: 'light' | 'dark';
    allPlayers?: Player[];
    lanes?: Partial<LanesState>;
    captains?: string[];
}

const loadSavedState = (): SavedBuilderState => {
    try {
        return JSON.parse(localStorage.getItem(BUILDER_STORAGE) ?? '{}') as SavedBuilderState;
    } catch {
        return {};
    }
};

const saved = loadSavedState();

export const useTeamBuilderLogic = () => {
    const [theme, setTheme] = useState<'light' | 'dark'>(saved.theme === 'light' ? 'light' : 'dark');
    const [allPlayers, setAllPlayers] = useState<Player[]>(Array.isArray(saved.allPlayers) ? saved.allPlayers : []);
    const [inputValue, setInputValue] = useState('');
    // 저장본을 라인별로 병합하고, 구버전 단일 temp는 temps 배열로 마이그레이션한다
    const [lanes, setLanes] = useState<LanesState>(() => {
        const base = cloneLanes(initialLanes);
        if (saved.lanes) {
            for (const pos of POSITIONS) {
                const merged = { ...base[pos], ...(saved.lanes[pos] ?? {}) };
                merged.temps = Array.isArray(merged.temps)
                    ? merged.temps
                    : (merged.temp ? [merged.temp] : []);
                delete merged.temp;
                base[pos] = merged;
            }
        }
        return base;
    });

    // 팀장 표시 — 이름 더블클릭으로 토글, 글로우 효과로 표시 (아이콘 없음)
    const [captains, setCaptains] = useState<string[]>(Array.isArray(saved.captains) ? saved.captains : []);

    useEffect(() => {
        localStorage.setItem(BUILDER_STORAGE, JSON.stringify({ theme, allPlayers, lanes, captains }));
    }, [theme, allPlayers, lanes, captains]);

    const toggleCaptain = (name: string) =>
        setCaptains(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
    const isCaptain = (name: string) => captains.includes(name);
    const [recentNames, setRecentNames] = useState<string[]>(loadRecentNames);

    useEffect(() => {
        localStorage.setItem(RECENT_KEY, JSON.stringify(recentNames));
    }, [recentNames]);

    /** 이름 사용 기록 — 최신 사용을 앞으로 올린다 */
    const recordRecent = (names: string[]) => {
        const clean = names.map(n => n.trim()).filter(Boolean);
        if (clean.length === 0) return;
        setRecentNames(prev => [...clean, ...prev.filter(n => !clean.includes(n))].slice(0, RECENT_MAX));
    };

    const removeRecentName = (name: string) =>
        setRecentNames(prev => prev.filter(n => n !== name));

    const clearRecentNames = () => setRecentNames([]);

    const [dragOverTarget, setDragOverTarget] = useState<DragTarget | null>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, targetName: null });
    const lanesRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        const handleClick = () => setContextMenu({ visible: false, x: 0, y: 0, targetName: null });
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light');

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value);

    const handleInputSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && e.currentTarget.value.trim() !== '') {
            const newNames = e.currentTarget.value.trim().split(/\s+/);
            setAllPlayers(prevPlayers => {
                const existingNames = prevPlayers.map(p => p.name);
                const newPlayers: Player[] = newNames
                    .filter(name => !existingNames.includes(name))
                    .map(name => ({ name, tier: '중' }));
                return [...prevPlayers, ...newPlayers];
            });
            recordRecent(newNames);
            setInputValue('');
        }
    };

    /** 내전 기록 탭의 참가자 명단이나 최근 기록에서 팀 빌더 풀로 불러온다 */
    const importPlayers = (names: string[]) => {
        setAllPlayers(prev => {
            const existing = prev.map(p => p.name);
            const added: Player[] = names
                .filter(name => name.trim() !== '' && !existing.includes(name))
                .map(name => ({ name, tier: '중' }));
            return [...prev, ...added];
        });
        recordRecent(names);
    };

    const handleContextMenu = (e: React.MouseEvent, name: string) => {
        e.preventDefault();
        setContextMenu({ visible: true, x: e.pageX, y: e.pageY, targetName: name });
    };

    const handleDeletePlayer = (nameToDelete: string) => {
        setAllPlayers(prev => prev.filter(p => p.name !== nameToDelete));
        setCaptains(prev => prev.filter(n => n !== nameToDelete));
        setLanes(prev => {
            const newLanes = cloneLanes(prev);
            for (const pos of POSITIONS) {
                if (newLanes[pos].name1 === nameToDelete) newLanes[pos].name1 = null;
                if (newLanes[pos].name2 === nameToDelete) newLanes[pos].name2 = null;
                newLanes[pos].temps = (newLanes[pos].temps ?? []).filter(n => n !== nameToDelete);
            }
            return newLanes;
        });
    };

    const setPlayerTier = (name: string, tier: Tier | null) => {
        setAllPlayers(prev => prev.map(p => p.name === name ? { ...p, tier } : p));
    };

    const handleRandomizeSides = () => {
        if (Math.random() < 0.5) return;
        setLanes(prevLanes => {
            const newLanes = cloneLanes(prevLanes);
            for (const pos of POSITIONS) {
                const { name1, name2, temps, operator } = newLanes[pos];
                newLanes[pos] = {
                    name1: name2,
                    name2: name1,
                    temps, // 임시 슬롯은 진영과 무관하게 유지
                    operator: operator === '>' ? '<' : operator === '<' ? '>' : '=',
                };
            }
            return newLanes;
        });
    };

    const handleReset = () => {
        setLanes(initialLanes);
    };

    const handleRandomAssign = () => {
        const playersInLanes = Object.values(lanes)
            .flatMap(l => [l.name1, l.name2, ...(l.temps ?? [])])
            .filter(Boolean);
        const unassignedPlayers = allPlayers.filter(
            p => !playersInLanes.includes(p.name)
        );

        const emptySlots: { position: Position; slot: SlotKey }[] = [];
        POSITIONS.forEach(pos => {
            if (lanes[pos].name1 === null) {
                emptySlots.push({ position: pos, slot: 'name1' });
            }
            if (lanes[pos].name2 === null) {
                emptySlots.push({ position: pos, slot: 'name2' });
            }
        });

        if (unassignedPlayers.length === 0 || emptySlots.length === 0) {
            console.warn("배치할 플레이어 또는 빈 슬롯이 없습니다.");
            return;
        }

        const randomPlayerIndex = Math.floor(Math.random() * unassignedPlayers.length);
        const playerToAssign = unassignedPlayers[randomPlayerIndex];

        const randomSlotIndex = Math.floor(Math.random() * emptySlots.length);
        const slotToFill = emptySlots[randomSlotIndex];

        setLanes(prevLanes => {
            const newLanes = cloneLanes(prevLanes);
            const { position, slot } = slotToFill;
            newLanes[position][slot] = playerToAssign.name;
            return newLanes;
        });
    };

    const onDragStart = (e: React.DragEvent, item: DraggedItem) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", JSON.stringify(item));
    };

    const onDragOver = (e: React.DragEvent, target: DragTarget) => { e.preventDefault(); setDragOverTarget(target); };
    const onDragLeave = () => setDragOverTarget(null);

    /** 드래그 출발지에서 이름을 떼어낸다 (정식 슬롯은 비우고, 임시 슬롯은 배열에서 제거) */
    const detachFromOrigin = (lanesObj: LanesState, origin: DraggedItem['origin'], name: string) => {
        if (origin.type !== 'slot') return;
        const lane = lanesObj[origin.position];
        if (origin.slot === 'temp') lane.temps = (lane.temps ?? []).filter(n => n !== name);
        else lane[origin.slot] = null;
    };

    const onDrop = (e: React.DragEvent, target: DragTarget) => {
        e.preventDefault();
        setDragOverTarget(null);
        const dragged = JSON.parse(e.dataTransfer.getData("text/plain")) as DraggedItem;
        const { name: draggedName, origin: draggedOrigin } = dragged;

        if (target.type === 'pool') {
            if (draggedOrigin.type === 'slot') {
                setLanes(prev => {
                    const newLanes = cloneLanes(prev);
                    detachFromOrigin(newLanes, draggedOrigin, draggedName);
                    return newLanes;
                });
            }
            setPlayerTier(draggedName, target.tier);
            return;
        }

        if (target.type === 'slot') {
            const { position, slot } = target;

            // 임시 슬롯: 최대 3명 보관 — 출발지에서 떼어내고 배열에 추가 (가득 차면 무시)
            if (slot === 'temp') {
                setLanes(prev => {
                    const current = prev[position].temps ?? [];
                    if (!current.includes(draggedName) && current.length >= 3) return prev;
                    const newLanes = cloneLanes(prev);
                    detachFromOrigin(newLanes, draggedOrigin, draggedName);
                    const temps = newLanes[position].temps ?? [];
                    if (!temps.includes(draggedName)) temps.push(draggedName);
                    newLanes[position].temps = temps;
                    return newLanes;
                });
                return;
            }

            if (draggedOrigin.type === 'slot' && draggedOrigin.position === position && draggedOrigin.slot === slot) return;

            const nameInTargetSlot = lanes[position][slot];
            setLanes(prev => {
                const newLanes = cloneLanes(prev);
                detachFromOrigin(newLanes, draggedOrigin, draggedName);
                newLanes[position][slot] = draggedName;
                // 자리에 있던 사람 처리: 슬롯끼리는 맞교환, 임시 출신이면 그 임시 칸으로, 풀 출신이면 아래에서 풀로
                if (nameInTargetSlot && draggedOrigin.type === 'slot') {
                    if (draggedOrigin.slot === 'temp') {
                        const t = newLanes[draggedOrigin.position].temps ?? [];
                        if (!t.includes(nameInTargetSlot)) t.push(nameInTargetSlot);
                        newLanes[draggedOrigin.position].temps = t;
                    } else {
                        newLanes[draggedOrigin.position][draggedOrigin.slot] = nameInTargetSlot;
                    }
                }
                return newLanes;
            });
            if (nameInTargetSlot && draggedOrigin.type === 'pool') {
                setPlayerTier(nameInTargetSlot, '중');
            }
        }
    };

    const handleOperatorClick = (position: Position, event: React.MouseEvent) => {
        event.preventDefault();
        const currentOperator = lanes[position].operator;
        const currentIndex = OPERATORS.indexOf(currentOperator);
        let nextIndex;
        if (event.type === 'contextmenu') {
            nextIndex = (currentIndex + 1) % OPERATORS.length;
        } else {
            nextIndex = (currentIndex - 1 + OPERATORS.length) % OPERATORS.length;
        }
        setLanes(prev => ({ ...prev, [position]: { ...prev[position], operator: OPERATORS[nextIndex] } }));
    };

    const handleSwap = (position: Position) => {
        setLanes(prev => {
            const currentLane = prev[position];
            const newOperator = currentLane.operator === '>' ? '<' : currentLane.operator === '<' ? '>' : '=';
            return { ...prev, [position]: { name1: currentLane.name2, name2: currentLane.name1, temps: currentLane.temps, operator: newOperator } }
        });
    };

    const playersInLanes = Object.values(lanes).flatMap(l => [l.name1, l.name2, ...(l.temps ?? [])]).filter(Boolean);
    const playersInPool = allPlayers.filter(p => !playersInLanes.includes(p.name));
    const findPlayer = (name: string) => allPlayers.find(p => p.name === name);

    const tierLists: Record<Tier, Player[]> = {
        '상': playersInPool.filter(p => p.tier === '상'),
        '중': playersInPool.filter(p => p.tier === '중' || !p.tier),
        '하': playersInPool.filter(p => p.tier === '하'),
    };

    return {
        theme,
        toggleTheme,
        lanes,
        lanesRef,
        dragOverTarget,
        contextMenu,
        inputValue,
        tierLists,
        allPlayers,
        recentNames,
        handlers: {
            removeRecentName,
            clearRecentNames,
            toggleCaptain,
            isCaptain,
            handleInputChange,
            handleInputSubmit,
            handleContextMenu,
            handleDeletePlayer,
            setPlayerTier,
            handleRandomizeSides,
            handleReset,
            onDragStart,
            onDragOver,
            onDragLeave,
            onDrop,
            handleOperatorClick,
            handleSwap,
            findPlayer,
            handleRandomAssign,
            importPlayers,
        }
    };
};

export const [TeamBuilderProvider, useTeamBuilderContext] = constate(useTeamBuilderLogic);
