import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

/*
 * 커스텀 데이트피커 — 네이티브 <input type="date"> 대신 사용.
 * 값 형식은 'YYYY-MM-DD' (빈 문자열 = 미선택). 바깥 클릭/Escape로 닫힘.
 */

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const pad = (n: number) => String(n).padStart(2, '0');
const toValue = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

const parseValue = (value: string): { y: number; m: number; d: number } | null => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
};

export const DatePicker = ({ value, onChange, placeholder }: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}) => {
    const [open, setOpen] = useState(false);
    const today = new Date();
    const parsed = parseValue(value);
    const [viewY, setViewY] = useState(parsed?.y ?? today.getFullYear());
    const [viewM, setViewM] = useState(parsed?.m ?? today.getMonth());
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const openPicker = () => {
        const p = parseValue(value);
        setViewY(p?.y ?? today.getFullYear());
        setViewM(p?.m ?? today.getMonth());
        setOpen(o => !o);
    };

    const moveMonth = (delta: number) => {
        const next = new Date(viewY, viewM + delta, 1);
        setViewY(next.getFullYear());
        setViewM(next.getMonth());
    };

    // 달력 격자: 해당 월 1일의 요일부터 6주(42칸)
    const firstDay = new Date(viewY, viewM, 1).getDay();
    const gridStart = new Date(viewY, viewM, 1 - firstDay);
    const cells = Array.from({ length: 42 }, (_, i) => {
        const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
        return {
            date,
            inMonth: date.getMonth() === viewM,
            valueStr: toValue(date.getFullYear(), date.getMonth(), date.getDate()),
        };
    });
    const todayStr = toValue(today.getFullYear(), today.getMonth(), today.getDate());

    return (
        <Wrap ref={ref}>
            <Trigger type="button" onClick={openPicker} $open={open}>
                <span className={value ? 'label' : 'label ph'}>
                    {parsed ? `${parsed.y}. ${parsed.m + 1}. ${parsed.d}.` : placeholder ?? '날짜 선택'}
                </span>
                <span className="icon" aria-hidden>▾</span>
            </Trigger>

            {open && (
                <Popup>
                    <Head>
                        <NavBtn type="button" onClick={() => moveMonth(-1)}>‹</NavBtn>
                        <span className="ym">{viewY}년 {viewM + 1}월</span>
                        <NavBtn type="button" onClick={() => moveMonth(1)}>›</NavBtn>
                    </Head>

                    <WeekRow>
                        {WEEKDAYS.map((d, i) => (
                            <span key={d} className={i === 0 ? 'sun' : i === 6 ? 'sat' : ''}>{d}</span>
                        ))}
                    </WeekRow>

                    <DayGrid>
                        {cells.map(cell => (
                            <DayCell
                                key={cell.valueStr}
                                type="button"
                                $dim={!cell.inMonth}
                                $selected={cell.valueStr === value}
                                $today={cell.valueStr === todayStr}
                                onClick={() => {
                                    onChange(cell.valueStr);
                                    setOpen(false);
                                }}
                            >
                                {cell.date.getDate()}
                            </DayCell>
                        ))}
                    </DayGrid>

                    <Foot>
                        <FootBtn
                            type="button"
                            onClick={() => {
                                onChange(todayStr);
                                setOpen(false);
                            }}
                        >
                            오늘
                        </FootBtn>
                        <FootBtn
                            type="button"
                            onClick={() => {
                                onChange('');
                                setOpen(false);
                            }}
                        >
                            지우기
                        </FootBtn>
                    </Foot>
                </Popup>
            )}
        </Wrap>
    );
};

const Wrap = styled.div`
    position: relative;
    min-width: 0;
`;

const Trigger = styled.button<{ $open?: boolean }>`
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    padding: 0.5rem 0.75rem;
    font-size: 0.9rem;
    border: 1px solid ${({ theme, $open }) => ($open ? theme.accent : theme.cardBorder)};
    background: ${({ theme }) => theme.body};
    color: ${({ theme }) => theme.text};
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: border-color 0.15s ease;
    text-align: left;

    .label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .ph { color: ${({ theme }) => theme.placeholder}; }
    .icon {
        flex-shrink: 0;
        font-size: 0.7rem;
        color: ${({ theme }) => theme.placeholder};
    }

    &:hover { border-color: ${({ theme }) => theme.placeholder}; }
`;

const Popup = styled.div`
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 100;
    width: 248px;
    background: ${({ theme }) => theme.contextMenu};
    border: 1px solid ${({ theme }) => theme.contextMenuBorder};
    border-radius: var(--radius-md);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
    padding: 0.6rem;
`;

const Head = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;

    .ym {
        font-size: 0.85rem;
        font-weight: 700;
        color: ${({ theme }) => theme.text};
    }
`;

const NavBtn = styled.button`
    width: 24px;
    height: 24px;
    border: 1px solid ${({ theme }) => theme.cardBorder};
    border-radius: var(--radius-sm);
    background: none;
    color: ${({ theme }) => theme.text};
    cursor: pointer;
    line-height: 1;

    &:hover { background: ${({ theme }) => theme.dragOver}; }
`;

const WeekRow = styled.div`
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    margin-bottom: 0.25rem;

    span {
        text-align: center;
        font-size: 0.68rem;
        color: ${({ theme }) => theme.placeholder};
    }
    .sun { color: ${({ theme }) => theme.teamRed}; }
    .sat { color: ${({ theme }) => theme.teamBlue}; }
`;

const DayGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
`;

const DayCell = styled.button<{ $dim?: boolean; $selected?: boolean; $today?: boolean }>`
    aspect-ratio: 1;
    border: 1px solid ${({ theme, $today, $selected }) =>
        $selected ? 'transparent' : $today ? theme.accent : 'transparent'};
    border-radius: var(--radius-sm);
    background: ${({ theme, $selected }) => ($selected ? theme.accentGradient : 'transparent')};
    color: ${({ theme, $dim, $selected }) =>
        $selected ? theme.accentText : $dim ? theme.placeholder : theme.text};
    opacity: ${({ $dim, $selected }) => ($dim && !$selected ? 0.45 : 1)};
    font-size: 0.78rem;
    font-weight: ${({ $selected }) => ($selected ? 700 : 400)};
    cursor: pointer;

    &:hover { background: ${({ theme, $selected }) => ($selected ? theme.accentGradient : theme.dragOver)}; }
`;

const Foot = styled.div`
    display: flex;
    justify-content: space-between;
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid ${({ theme }) => theme.cardBorder};
`;

const FootBtn = styled.button`
    border: none;
    background: none;
    font-size: 0.75rem;
    font-weight: 600;
    color: ${({ theme }) => theme.accent};
    cursor: pointer;

    &:hover { text-decoration: underline; }
`;
