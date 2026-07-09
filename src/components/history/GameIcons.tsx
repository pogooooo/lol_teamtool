import { useState } from 'react';
import styled from 'styled-components';

/*
 * 챔피언 초상화 / 아이템 아이콘.
 * 이미지는 로컬 API 서버 프록시(/api/assets/*)에서 받는다 — 브라우저의 CDN 접속 문제와 무관.
 * 호버 시 한글 이름(title). 서버·CDN 모두 불가하면 텍스트 폴백.
 */

export const ChampionIcon = ({ championId, name, size = 32 }: {
    championId: string;
    name: string; // 한글 이름 (호버 텍스트)
    size?: number;
}) => {
    const [failed, setFailed] = useState(false);

    if (failed) {
        return <Fallback $size={size} title={name}>{name.slice(0, 1)}</Fallback>;
    }
    return (
        <Img
            $size={size}
            src={`/api/assets/champion/${encodeURIComponent(championId)}`}
            alt={name}
            title={name}
            onError={() => setFailed(true)}
        />
    );
};

export const ItemIcon = ({ itemId, name, size = 22 }: {
    itemId: number;
    name: string; // 한글 이름 (호버 텍스트)
    size?: number;
}) => {
    const [failed, setFailed] = useState(false);

    if (itemId === 0) return <EmptySlot $size={size} title="빈 슬롯" />;
    if (failed) {
        return <Fallback $size={size} $square title={name}>{'•'}</Fallback>;
    }
    return (
        <Img
            $size={size}
            $square
            src={`/api/assets/item/${itemId}`}
            alt={name}
            title={name}
            onError={() => setFailed(true)}
        />
    );
};

export const RuneIcon = ({ runeId, name, size = 24 }: {
    runeId: number;
    name: string; // 한글 이름 (호버 텍스트)
    size?: number;
}) => {
    const [failed, setFailed] = useState(false);

    if (failed) {
        return <Fallback $size={size} title={name}>{'◆'}</Fallback>;
    }
    return (
        <Img
            $size={size}
            src={`/api/assets/rune/${runeId}`}
            alt={name}
            title={name}
            onError={() => setFailed(true)}
        />
    );
};

export const SpellIcon = ({ spellId, name, size = 22 }: {
    spellId: number;
    name: string; // 한글 이름 (호버 텍스트)
    size?: number;
}) => {
    const [failed, setFailed] = useState(false);

    if (failed) {
        return <Fallback $size={size} $square title={name}>{'✦'}</Fallback>;
    }
    return (
        <Img
            $size={size}
            $square
            src={`/api/assets/spell/${spellId}`}
            alt={name}
            title={name}
            onError={() => setFailed(true)}
        />
    );
};

const Img = styled.img<{ $size: number; $square?: boolean }>`
    width: ${({ $size }) => $size}px;
    height: ${({ $size }) => $size}px;
    border-radius: ${({ $square }) => ($square ? '4px' : '50%')};
    border: 1px solid ${({ theme }) => theme.cardBorder};
    display: block;
`;

const Fallback = styled.span<{ $size: number; $square?: boolean }>`
    width: ${({ $size }) => $size}px;
    height: ${({ $size }) => $size}px;
    border-radius: ${({ $square }) => ($square ? '4px' : '50%')};
    border: 1px solid ${({ theme }) => theme.cardBorder};
    background: ${({ theme }) => theme.dragOver};
    color: ${({ theme }) => theme.text};
    font-size: ${({ $size }) => Math.max(10, Math.floor($size * 0.42))}px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
`;

const EmptySlot = styled.span<{ $size: number }>`
    width: ${({ $size }) => $size}px;
    height: ${({ $size }) => $size}px;
    border-radius: 4px;
    border: 1px dashed ${({ theme }) => theme.cardBorder};
    background: ${({ theme }) => theme.body};
    display: inline-block;
    flex-shrink: 0;
`;
