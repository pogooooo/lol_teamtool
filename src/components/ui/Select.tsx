import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

/*
 * 커스텀 드롭다운 — 네이티브 <select> 대신 사용 (브라우저 기본 디자인 탈피).
 * 바깥 클릭 시 닫힘, 키보드(Escape) 지원.
 */

export interface SelectOption {
    value: string;
    label: string;
}

export const Select = ({ value, options, onChange, placeholder, disabled, title }: {
    value: string;
    options: SelectOption[];
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    title?: string;
}) => {
    const [open, setOpen] = useState(false);
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

    const selected = options.find(o => o.value === value);

    return (
        <Wrap ref={ref} title={title}>
            <Trigger
                type="button"
                onClick={() => !disabled && setOpen(o => !o)}
                $open={open}
                disabled={disabled}
            >
                <span className={selected ? 'label' : 'label ph'}>
                    {selected?.label ?? placeholder ?? '선택'}
                </span>
                <Arrow $open={open} aria-hidden>▾</Arrow>
            </Trigger>

            {open && (
                <Menu>
                    {options.map(option => (
                        <MenuItem
                            key={option.value}
                            type="button"
                            $active={option.value === value}
                            onClick={() => {
                                onChange(option.value);
                                setOpen(false);
                            }}
                        >
                            {option.label}
                        </MenuItem>
                    ))}
                </Menu>
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

    &:hover:not(:disabled) { border-color: ${({ theme }) => theme.placeholder}; }
    &:disabled { opacity: 0.5; cursor: default; }
`;

const Arrow = styled.span<{ $open?: boolean }>`
    flex-shrink: 0;
    font-size: 0.7rem;
    color: ${({ theme }) => theme.placeholder};
    transform: rotate(${({ $open }) => ($open ? 180 : 0)}deg);
    transition: transform 0.15s ease;
`;

const Menu = styled.div`
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    z-index: 100;
    background: ${({ theme }) => theme.contextMenu};
    border: 1px solid ${({ theme }) => theme.contextMenuBorder};
    border-radius: var(--radius-md);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
    padding: 0.25rem;
    max-height: 240px;
    overflow-y: auto;
`;

const MenuItem = styled.button<{ $active?: boolean }>`
    width: 100%;
    padding: 0.45rem 0.6rem;
    border: none;
    border-radius: var(--radius-sm);
    background: ${({ theme, $active }) => ($active ? theme.dragOver : 'transparent')};
    color: ${({ theme }) => theme.text};
    font-size: 0.85rem;
    font-weight: ${({ $active }) => ($active ? 700 : 400)};
    text-align: left;
    cursor: pointer;

    &:hover { background: ${({ theme }) => theme.dragOver}; }
`;
