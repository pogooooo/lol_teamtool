import {useState, useEffect, useRef} from 'react';
import { POSITIONS, OPERATORS } from '../constants';
import constate from "constate";

const initialLanes = POSITIONS.reduce((acc, pos) => {
    acc[pos] = { name1: null, name2: null, operator: '=' };
    return acc;
}, {});

export const useTeamBuilderLogic = () => {
    const [theme, setTheme] = useState('dark');
    const [allPlayers, setAllPlayers] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [lanes, setLanes] = useState(initialLanes);
    const [dragOverTarget, setDragOverTarget] = useState(null);
    const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, targetName: null });
    const lanesRef = useRef(null);

    useEffect(() => {
        const handleClick = () => setContextMenu({ visible: false, x: 0, y: 0, targetName: null });
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light');

    const handleInputChange = (e) => setInputValue(e.target.value);

    const handleInputSubmit = (e) => {
        if (e.key === 'Enter' && e.target.value.trim() !== '') {
            const newNames = e.target.value.trim().split(/\s+/);
            setAllPlayers(prevPlayers => {
                const existingNames = prevPlayers.map(p => p.name);
                const newPlayers = newNames
                    .filter(name => !existingNames.includes(name))
                    .map(name => ({ name, tier: '중' }));
                return [...prevPlayers, ...newPlayers];
            });
            setInputValue('');
        }
    };

    const handleContextMenu = (e, name) => {
        e.preventDefault();
        setContextMenu({ visible: true, x: e.pageX, y: e.pageY, targetName: name });
    };

    const handleDeletePlayer = (nameToDelete) => {
        setAllPlayers(prev => prev.filter(p => p.name !== nameToDelete));
        setLanes(prev => {
            const newLanes = JSON.parse(JSON.stringify(prev));
            for (const pos in newLanes) {
                if (newLanes[pos].name1 === nameToDelete) newLanes[pos].name1 = null;
                if (newLanes[pos].name2 === nameToDelete) newLanes[pos].name2 = null;
            }
            return newLanes;
        });
    };

    const setPlayerTier = (name, tier) => {
        setAllPlayers(prev => prev.map(p => p.name === name ? { ...p, tier } : p));
    };

    const handleRandomizeSides = () => {
        if (Math.random() < 0.5) return;
        setLanes(prevLanes => {
            const newLanes = JSON.parse(JSON.stringify(prevLanes));
            for (const pos in newLanes) {
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

        const emptySlots = [];
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
            const newLanes = JSON.parse(JSON.stringify(prevLanes)); // 깊은 복사
            const { position, slot } = slotToFill;
            newLanes[position][slot] = playerToAssign.name;
            return newLanes;
        });
    };

    const onDragStart = (e, item) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", JSON.stringify(item));
    };

    const onDragOver = (e, target) => { e.preventDefault(); setDragOverTarget(target); };
    const onDragLeave = () => setDragOverTarget(null);

    const onDrop = (e, target) => {
        e.preventDefault();
        setDragOverTarget(null);
        const dragged = JSON.parse(e.dataTransfer.getData("text/plain"));

        if (target.type === 'pool') {
            if (dragged.origin.type === 'slot') {
                setLanes(prev => {
                    const newLanes = { ...prev };
                    newLanes[dragged.origin.position][dragged.origin.slot] = null;
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
                    setLanes(prev => {
                        const newLanes = JSON.parse(JSON.stringify(prev));
                        newLanes[position][slot] = draggedName;
                        newLanes[draggedOrigin.position][draggedOrigin.slot] = nameInTargetSlot;
                        return newLanes;
                    });
                } else {
                    setLanes(prev => ({ ...prev, [position]: { ...prev[position], [slot]: draggedName } }));
                    setPlayerTier(nameInTargetSlot, '중');
                }
            } else {
                if (draggedOrigin.type === 'slot') {
                    setLanes(prev => {
                        const newLanes = { ...prev };
                        newLanes[draggedOrigin.position][draggedOrigin.slot] = null;
                        newLanes[position][slot] = draggedName;
                        return newLanes;
                    });
                } else {
                    setLanes(prev => ({ ...prev, [position]: { ...prev[position], [slot]: draggedName } }));
                }
            }
        }
    };

    const handleOperatorClick = (position, event) => {
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

    const handleSwap = (position) => {
        setLanes(prev => {
            const currentLane = prev[position];
            const newOperator = currentLane.operator === '>' ? '<' : currentLane.operator === '<' ? '>' : '=';
            return { ...prev, [position]: { name1: currentLane.name2, name2: currentLane.name1, operator: newOperator } }
        });
    };

    const playersInLanes = Object.values(lanes).flatMap(l => [l.name1, l.name2]).filter(Boolean);
    const playersInPool = allPlayers.filter(p => !playersInLanes.includes(p.name));
    const findPlayer = (name) => allPlayers.find(p => p.name === name);

    const tierLists = {
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
        }
    };
};

export const [TeamBuilderProvider, useTeamBuilderContext] = constate(useTeamBuilderLogic);
