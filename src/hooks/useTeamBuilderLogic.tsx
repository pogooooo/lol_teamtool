import { useState, useEffect, useRef } from 'react';
import type * as React from 'react';
import constate from 'constate';
import { POSITIONS, OPERATORS } from '../constants';
import type { DraggedItem, DragTarget, LanesState, Player, Position, SlotKey, Tier } from '../types';

const initialLanes: LanesState = POSITIONS.reduce((acc, pos) => {
    acc[pos] = { name1: null, name2: null, operator: '=' };
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

interface SavedBuilderState {
    theme?: 'light' | 'dark';
    allPlayers?: Player[];
    lanes?: Partial<LanesState>;
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
    const [lanes, setLanes] = useState<LanesState>(saved.lanes ? { ...cloneLanes(initialLanes), ...saved.lanes } : initialLanes);

    useEffect(() => {
        localStorage.setItem(BUILDER_STORAGE, JSON.stringify({ theme, allPlayers, lanes }));
    }, [theme, allPlayers, lanes]);
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
            setInputValue('');
        }
    };

    /** 내전 기록 탭의 참가자 명단을 팀 빌더 풀로 불러온다 */
    const importPlayers = (names: string[]) => {
        setAllPlayers(prev => {
            const existing = prev.map(p => p.name);
            const added: Player[] = names
                .filter(name => name.trim() !== '' && !existing.includes(name))
                .map(name => ({ name, tier: '중' }));
            return [...prev, ...added];
        });
    };

    const handleContextMenu = (e: React.MouseEvent, name: string) => {
        e.preventDefault();
        setContextMenu({ visible: true, x: e.pageX, y: e.pageY, targetName: name });
    };

    const handleDeletePlayer = (nameToDelete: string) => {
        setAllPlayers(prev => prev.filter(p => p.name !== nameToDelete));
        setLanes(prev => {
            const newLanes = cloneLanes(prev);
            for (const pos of POSITIONS) {
                if (newLanes[pos].name1 === nameToDelete) newLanes[pos].name1 = null;
                if (newLanes[pos].name2 === nameToDelete) newLanes[pos].name2 = null;
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
                const { name1, name2, operator } = newLanes[pos];
                newLanes[pos] = {
                    name1: name2,
                    name2: name1,
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
            .flatMap(l => [l.name1, l.name2])
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

    const onDrop = (e: React.DragEvent, target: DragTarget) => {
        e.preventDefault();
        setDragOverTarget(null);
        const dragged = JSON.parse(e.dataTransfer.getData("text/plain")) as DraggedItem;

        if (target.type === 'pool') {
            if (dragged.origin.type === 'slot') {
                const { position, slot } = dragged.origin;
                setLanes(prev => {
                    const newLanes = { ...prev };
                    newLanes[position][slot] = null;
                    return newLanes;
                });
            }
            setPlayerTier(dragged.name, target.tier);
            return;
        }

        if (target.type === 'slot') {
            const { position, slot } = target;
            const nameInTargetSlot = lanes[position][slot];
            const { name: draggedName, origin: draggedOrigin } = dragged;

            if (draggedOrigin.type === 'slot' && draggedOrigin.position === position && draggedOrigin.slot === slot) return;

            if (nameInTargetSlot) {
                if (draggedOrigin.type === 'slot') {
                    const { position: originPos, slot: originSlot } = draggedOrigin;
                    setLanes(prev => {
                        const newLanes = cloneLanes(prev);
                        newLanes[position][slot] = draggedName;
                        newLanes[originPos][originSlot] = nameInTargetSlot;
                        return newLanes;
                    });
                } else {
                    setLanes(prev => ({ ...prev, [position]: { ...prev[position], [slot]: draggedName } }));
                    setPlayerTier(nameInTargetSlot, '중');
                }
            } else {
                if (draggedOrigin.type === 'slot') {
                    const { position: originPos, slot: originSlot } = draggedOrigin;
                    setLanes(prev => {
                        const newLanes = { ...prev };
                        newLanes[originPos][originSlot] = null;
                        newLanes[position][slot] = draggedName;
                        return newLanes;
                    });
                } else {
                    setLanes(prev => ({ ...prev, [position]: { ...prev[position], [slot]: draggedName } }));
                }
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
            return { ...prev, [position]: { name1: currentLane.name2, name2: currentLane.name1, operator: newOperator } }
        });
    };

    const playersInLanes = Object.values(lanes).flatMap(l => [l.name1, l.name2]).filter(Boolean);
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
        handlers: {
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
